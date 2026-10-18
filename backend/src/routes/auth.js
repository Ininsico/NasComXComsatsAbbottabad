import { Router } from 'express';
import { issueToken, requireAuth, verifyPassword } from '../lib/auth.js';
import { redirectUri as calendarRedirectUri } from '../lib/calendar.js';
import { ensureWorkspaceForUser } from '../lib/context.js';
import { readDemoSeed } from '../lib/demoAccounts.js';
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
 * The demo sign-in buttons.
 *
 * Only answers when `npm run demo:seed` has actually created the accounts, and it is the
 * credentials that are returned — so this exists for a demo deployment and stays silent on
 * one that never ran the seed.
 */
router.get('/demo-accounts', async (req, res) => {
  const seed = await readDemoSeed();

  if (!seed) {
    return res.status(404).json({ error: 'No demo accounts on this deployment' });
  }

  return res.json({
    seededAt: seed.seededAt,
    accounts: seed.accounts.map((account) => ({
      key: account.key,
      label: account.label,
      summary: account.summary,
      name: account.name,
      email: account.email,
      password: account.password,
    })),
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

    // Registration and sign-in are the same path: the first time we see an address, it
    // gets its own workspace as Owner, with default settings — so a new customer lands on
    // their own pipeline rather than someone else's.
    const { workspace } = await ensureWorkspaceForUser(user, {
      workspaceName: created ? `${user.name}'s workspace` : undefined,
    });

    return back({ token: issueToken(user), created: created ? '1' : '0', workspace: workspace.name });
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
