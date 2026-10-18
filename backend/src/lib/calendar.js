import { randomUUID } from 'node:crypto';
import { db } from './db.js';

/**
 * Google Calendar, OAuth 2.0.
 *
 * The client credentials belong to the deployment (env), the tokens belong to a
 * workspace (the integrations collection), so one deployment can serve many companies
 * without their calendars touching each other.
 *
 * Nothing here is faked: authorise returns Google's consent URL, the callback exchanges
 * a real code for a real token, bookings call the freebusy and events endpoints.
 */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

const integrations = db.collection('integrations');

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${(process.env.PUBLIC_ORIGIN || 'http://localhost:4000').replace(/\/+$/, '')}/api/calendar/callback`
  );
}

/** The consent URL. `state` is the workspace id plus a nonce, checked on the way back. */
export function authorizationUrl(workspaceId) {
  if (!googleConfigured()) return null;

  const state = `${workspaceId}.${randomUUID()}`;
  const url = new URL(AUTH_ENDPOINT);

  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('access_type', 'offline');
  // Without this Google only returns a refresh token the first time.
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return { url: url.toString(), state };
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `token exchange failed (${response.status})`);
  }

  return payload;
}

async function refresh(workspaceId, record) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: record.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'refresh failed');
  }

  const expiry = new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString();

  await integrations.mutate((rows) => {
    const row = rows.find((entry) => entry.workspaceId === workspaceId && entry.provider === 'google');

    if (row) {
      row.accessToken = payload.access_token;
      row.expiry = expiry;
      row.lastRefreshedAt = new Date().toISOString();
    }
  });

  return payload.access_token;
}

export async function saveTokens(workspaceId, tokens, account = null) {
  const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  return integrations.mutate((rows) => {
    const index = rows.findIndex((row) => row.workspaceId === workspaceId && row.provider === 'google');
    const record = {
      id: index === -1 ? randomUUID() : rows[index].id,
      workspaceId,
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? rows[index]?.refreshToken ?? null,
      expiry,
      account,
      status: 'connected',
      revokedAt: null,
      lastError: null,
      connectedAt: rows[index]?.connectedAt ?? new Date().toISOString(),
      lastSyncAt: null,
      history: rows[index]?.history ?? [],
    };

    if (index === -1) rows.push(record);
    else rows[index] = record;

    return record;
  });
}

export async function connectionFor(workspaceId) {
  return integrations.find((row) => row.workspaceId === workspaceId && row.provider === 'google');
}

export async function disconnect(workspaceId) {
  return integrations.mutate((rows) => {
    const index = rows.findIndex((row) => row.workspaceId === workspaceId && row.provider === 'google');

    return index === -1 ? null : rows.splice(index, 1)[0];
  });
}

async function tokenFor(workspaceId) {
  const record = await connectionFor(workspaceId);

  if (!record) throw new Error('Google Calendar is not connected for this workspace');

  if (record.expiry && Date.parse(record.expiry) - 60000 > Date.now()) {
    return record.accessToken;
  }

  if (!record.refreshToken) throw new Error('The Google token expired and no refresh token was stored');

  return refresh(workspaceId, record);
}

async function api(workspaceId, path, options = {}) {
  const token = await tokenFor(workspaceId);
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(20000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    // A revoked grant looks like a 401. Record it on the connection so the integrations
    // page can say "needs reconnection" instead of showing a healthy Google card over a
    // token that will never work again.
    if (response.status === 401) {
      await integrations.mutate((rows) => {
        const row = rows.find((entry) => entry.workspaceId === workspaceId && entry.provider === 'google');

        if (!row) return;

        row.status = 'needs_reconnection';
        row.revokedAt = new Date().toISOString();
        row.lastError = payload?.error?.message ?? 'the access token was rejected';
      });
    }

    throw new Error(payload?.error?.message || `Google Calendar answered ${response.status}`);
  }

  return payload;
}

/** Busy intervals for the connected calendar, used for the conflict check. */
export async function busyIntervals(workspaceId, startIso, endIso, timeZone) {
  const payload = await api(workspaceId, '/freebusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: startIso,
      timeMax: endIso,
      timeZone,
      items: [{ id: 'primary' }],
    }),
  });

  return payload?.calendars?.primary?.busy ?? [];
}

/** Cancel an event the connected calendar owns. 404/410 means it is already gone. */
export async function deleteEvent(workspaceId, eventId) {
  try {
    await api(workspaceId, `/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'DELETE',
    });

    return { deleted: true };
  } catch (error) {
    if (/404|410|not found|gone/i.test(error.message)) return { deleted: true, alreadyGone: true };

    throw error;
  }
}

/**
 * Book an appointment, refusing to double-book. Times are sent with an explicit
 * timezone so a server in UTC and a browser in Karachi agree on what "10:00" means.
 */
export async function bookAppointment({ workspaceId, summary, description, startIso, endIso, timeZone, attendee }) {
  const busy = await busyIntervals(workspaceId, startIso, endIso, timeZone);

  if (busy.length > 0) {
    return { conflict: true, busy };
  }

  const event = await api(workspaceId, '/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    body: JSON.stringify({
      summary,
      description,
      start: { dateTime: startIso, timeZone },
      end: { dateTime: endIso, timeZone },
      ...(attendee ? { attendees: [{ email: attendee }] } : {}),
    }),
  });

  await integrations.mutate((rows) => {
    const row = rows.find((entry) => entry.workspaceId === workspaceId && entry.provider === 'google');

    if (row) {
      row.lastSyncAt = new Date().toISOString();
      row.history = [
        { at: row.lastSyncAt, action: 'event.created', eventId: event.id, summary },
        ...(row.history ?? []),
      ].slice(0, 50);
    }
  });

  return { event };
}
