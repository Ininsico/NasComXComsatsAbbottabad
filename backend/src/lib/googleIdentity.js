import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

/**
 * "Sign in with Google", for identity rather than calendar access.
 *
 * Same OAuth client as the calendar integration, different redirect URI and scope, so the
 * two never interfere. The flow is a plain browser redirect: the SPA sends the user to
 * /api/auth/google, Google comes back to the callback, and the callback hands the browser
 * a normal session token. Registration and sign-in are the same path — an unknown verified
 * address is a new account, and `ensureWorkspaceForUser` gives it its own workspace.
 *
 * The token is returned in the URL fragment, which the browser never sends to a server, so
 * it cannot leak into an access log or a Referer header.
 */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPE = 'openid email profile';

/** Issued states, checked and dropped on the way back. Bounded by its own TTL. */
const issued = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

export function googleSignInConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function publicOrigin() {
  return (process.env.PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
}

export function identityRedirectUri() {
  return (
    process.env.GOOGLE_IDENTITY_REDIRECT_URI ||
    `${publicOrigin()}/api/auth/google/callback`
  );
}

export function authorizationUrl() {
  const state = randomUUID();

  for (const [key, at] of issued) {
    if (Date.now() - at > STATE_TTL_MS) issued.delete(key);
  }

  issued.set(state, Date.now());

  const url = new URL(AUTH_ENDPOINT);

  url.searchParams.set('client_id', config.google.clientId);
  url.searchParams.set('redirect_uri', identityRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  // Let the user pick an account instead of silently reusing the last one.
  url.searchParams.set('prompt', 'select_account');

  return { url: url.toString(), state };
}

/** One use only: a replayed state is refused, and old ones expire. */
export function consumeState(state) {
  if (!state || !issued.has(state)) return false;

  const at = issued.get(state);
  issued.delete(state);

  return Date.now() - at <= STATE_TTL_MS;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: identityRedirectUri(),
    grant_type: 'authorization_code',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'nascon-crm/1.0',
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `token exchange failed (${response.status})`);
  }

  return payload;
}

export async function fetchIdentity(accessToken) {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'nascon-crm/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Google userinfo answered ${response.status}`);
  }

  return payload;
}
