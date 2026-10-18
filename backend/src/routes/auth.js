import { Router } from 'express';
import { config } from '../config.js';
import { issueToken, hashPassword, requireAuth, verifyPassword } from '../lib/auth.js';
import { redirectUri as calendarRedirectUri } from '../lib/calendar.js';
import { ensureWorkspaceForUser } from '../lib/context.js';
import { acceptInvitation, describeInvitation, findInvitation, findPendingInvitationForEmail } from '../lib/invitations.js';
import {
  authorizationUrl,
  consumeState,
  exchangeCode,
  fetchIdentity,
  googleSignInConfigured,
  identityRedirectUri,
  publicOrigin,
} from '../lib/googleIdentity.js';
import { createUser, findUserByEmail, toPublicUser } from '../lib/store.js';
import { validateLogin } from '../lib/validate.js';

const router = Router();

/**
 * Accounts are created with Google, not with a password: one identity per person, a
 * verified email, and no password reset to build or leak. Kept as an explicit refusal
 * rather than a 404 so an old client shows the real reason.
 */
router.post('/signup', (req, res) => {
  res.status(410).json({
    error: 'Accounts are created with Google. Use "Continue with Google" to sign up.',
    code: 'google_only',
  });
});

/**
 * What this deployment will send Google, so a redirect_uri_mismatch can be fixed without
 * guessing. Public on purpose: it is not a secret, and the person hitting the error is
 * usually the one who needs it.
 */
router.get('/google-info', (req, res) => {
  res.json({
    configured: googleSignInConfigured(),
    origin: publicOrigin(),
    signInRedirectUri: identityRedirectUri(),
    calendarRedirectUri: calendarRedirectUri(),
    message:
      'Both of these must be listed, character for character, under "Authorised redirect URIs" on the Google OAuth client.',
  });
});

/**
 * Whether the sign-in page should offer instant logins, and for which roles.
 *
 * Reports only that they are available and which account each button signs into — never a
 * password. Answers 404 when INSTANT_LOGIN is off, so a normal deployment has no such
 * endpoint at all.
 */
router.get('/instant-login', async (req, res) => {
  if (!config.instantLogin.enabled) {
    return res.status(404).json({ error: 'Instant login is not enabled on this deployment' });
  }

  const { INSTANT_ROLES, findInstantUser } = await import('../lib/instantLogins.js');

  const roles = [];

  for (const definition of INSTANT_ROLES) {
    const found = await findInstantUser(definition.role);

    if (found) {
      roles.push({
        role: definition.role,
        label: definition.label,
        summary: definition.summary,
        name: found.user.name,
        email: found.user.email,
      });
    }
  }

  const admin = await findUserByEmail(config.instantLogin.adminEmail);

  if (roles.length === 0 && !admin) {
    return res.status(404).json({ error: 'No instant-login accounts have been created yet' });
  }

  return res.json({
    available: true,
    roles,
    systemAdmin: admin ? { email: admin.email, name: admin.name } : null,
  });
});

/**
 * One click, no password. With a `role`, signs into that role's demo account in the shared
 * Instant Demo workspace; without one, into the configured system administrator.
 */
router.post('/instant-login', async (req, res) => {
  if (!config.instantLogin.enabled) {
    return res.status(404).json({ error: 'Instant login is not enabled on this deployment' });
  }

  const role = String(req.body?.role ?? '').trim();

  if (role) {
    const { findInstantUser } = await import('../lib/instantLogins.js');
    const found = await findInstantUser(role);

    if (!found) {
      return res.status(404).json({ error: `No instant-login account for role "${role}"` });
    }

    return res.json({ token: issueToken(found.user), user: toPublicUser(found.user) });
  }

  const admin = await findUserByEmail(config.instantLogin.adminEmail);

  if (!admin) {
    return res.status(404).json({ error: 'The bootstrap administrator has not been created yet' });
  }

  return res.json({ token: issueToken(admin), user: toPublicUser(admin) });
});

/**
 * The invitation behind a link. Public on purpose: the token in the URL is the only thing
 * that identifies the person, and it reveals just the workspace, the level and the role they
 * were invited with — never another member's data.
 */
router.get('/invitation', async (req, res) => {
  const { invitation, error } = await findInvitation(String(req.query.token ?? ''));

  if (error) return res.status(404).json({ error });

  const described = await describeInvitation(invitation);

  return res.json({
    invitation: described,
    hasAccount: Boolean(await findUserByEmail(invitation.email)),
  });
});

/**
 * Accepting an invitation. A first-time person signs up here — which is the point of the
 * email: the account is born inside the inviting workspace with the invited level and role,
 * so they never see an empty workspace of their own. An existing account must prove itself
 * with its password; a Google-only account is told to continue with Google, which accepts
 * the invitation in the same pass.
 */
router.post('/accept-invite', async (req, res) => {
  const token = String(req.body?.token ?? '');
  const { invitation, error } = await findInvitation(token);

  if (error) return res.status(404).json({ error });

  let user = await findUserByEmail(invitation.email);

  if (!user) {
    const name = String(req.body?.name ?? '').trim();
    const password = String(req.body?.password ?? '');
    const errors = {};

    if (name.length < 2) errors.name = 'Enter your full name';
    if (password.length < 8) errors.password = 'Use at least 8 characters';

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    }

    user = await createUser({
      name,
      email: invitation.email,
      passwordHash: await hashPassword(password),
      role: 'user',
    });
  } else if (user.passwordHash) {
    if (!verifyPassword(String(req.body?.password ?? ''), user.passwordHash)) {
      return res.status(401).json({
        error: `${invitation.email} already has an account. Enter its password to accept the invitation.`,
        fields: { password: 'Wrong password' },
      });
    }
  } else {
    return res.status(409).json({
      error: `${invitation.email} signs in with Google. Continue with Google and the invitation is accepted automatically.`,
      code: 'google_only',
    });
  }

  const accepted = await acceptInvitation({ token, user });

  if (accepted.error) return res.status(409).json({ error: accepted.error });

  return res.json({
    token: issueToken(user),
    user: toPublicUser(user),
    workspace: (await describeInvitation(invitation)).workspaceName,
  });
});

/** Step one of the Google flow: send the browser to Google's consent screen. */
router.get('/google', (req, res) => {
  if (!googleSignInConfigured()) {
    return res.status(503).json({
      error: 'Google sign-in is not configured on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)',
    });
  }

  const { url } = authorizationUrl();

  return res.redirect(url);
});

/**
 * Step two: Google returns here. The token is handed back in the URL fragment, which the
 * browser never sends to a server, so it cannot leak into a log or a Referer header.
 */
router.get('/google/callback', async (req, res) => {
  const origin = publicOrigin();
  const back = (params) => res.redirect(`${origin}/auth/google#${new URLSearchParams(params).toString()}`);
  const fail = (reason) => back({ error: reason });

  if (req.query.error) {
    return fail(String(req.query.error_description ?? req.query.error));
  }

  const state = String(req.query.state ?? '');

  // Single use and short lived, so a replayed or guessed callback cannot mint a session.
  if (!consumeState(state)) {
    return fail('That sign-in request expired. Try again.');
  }

  try {
    const tokens = await exchangeCode(String(req.query.code ?? ''));
    const identity = await fetchIdentity(tokens.access_token);

    if (!identity?.email) return fail('Google did not return an email address');
    if (identity.email_verified === false) return fail('That Google address is not verified');

    let user = await findUserByEmail(identity.email);
    let created = false;

    if (!user) {
      user = await createUser({
        name: identity.name || identity.email.split('@')[0],
        email: identity.email,
        passwordHash: null,
        role: 'user',
      });

      created = true;
    }

    // An invitation waiting for this address wins over a fresh workspace: the person who
    // invited them already decided the workspace, level and role. Without one, a first-time
    // address gets its own workspace as Owner so a new customer lands on their own pipeline.
    const pending = await findPendingInvitationForEmail(identity.email);

    if (pending) {
      const accepted = await acceptInvitation({ token: pending.token, user });

      if (!accepted.error) {
        const invited = await describeInvitation(pending);

        return back({
          token: issueToken(user),
          created: created ? '1' : '0',
          invited: '1',
          workspace: invited.workspaceName,
        });
      }
    }

    const { workspace } = await ensureWorkspaceForUser(user, {
      workspaceName: created ? `${user.name}'s workspace` : undefined,
    });

    return back({ token: issueToken(user), created: created ? '1' : '0', invited: '0', workspace: workspace.name });
  } catch (error) {
    console.error(`[auth:google] ${error.message}`);
    return fail(error.message);
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const errors = validateLogin({ email, password });

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
  }

  const user = await findUserByEmail(email);
  // A Google-created account has no password hash, so it can never match here.
  const passwordMatches = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  return res.json({
    token: issueToken(user),
    user: toPublicUser(user),
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
