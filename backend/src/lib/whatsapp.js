import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';

/**
 * WhatsApp, one linked device per scope.
 *
 * A scope is either `main` — the deployment's own number, used by the public website's
 * auto-reply — or a workspace id, so every customer links their own phone and their
 * messages stay in their account. Sessions never share a browser profile: whatsapp-web.js
 * keeps them in separate directories under WHATSAPP_SESSION_PATH, which is also what makes
 * `main` survive a deploy untouched.
 *
 * Each live session is a Chromium process, so they are started on demand (someone opens
 * the integrations page and scans) rather than all at once, and only sessions that are
 * already linked are restarted on boot.
 */

const MAIN = 'main';
const MAX_LIVE_SESSIONS = Number(process.env.WHATSAPP_MAX_SESSIONS ?? 4);

/** scope -> { scope, state, client, starting } */
const sessions = new Map();

let handler = null;

export function isMainScope(scope) {
  return scope === MAIN;
}

function clientIdFor(scope) {
  // The main session keeps its original id so the existing linked device is reused.
  return isMainScope(scope) ? 'comsats-portal' : `ws-${scope}`;
}

function profileDir(scope) {
  return join(config.whatsapp.sessionPath, `session-${clientIdFor(scope)}`);
}

function markerPath(scope) {
  return join(profileDir(scope), '.linked.json');
}

function record(scope) {
  if (!sessions.has(scope)) {
    sessions.set(scope, {
      scope,
      client: null,
      starting: null,
      state: {
        status: 'stopped',
        qr: null,
        qrDataUrl: null,
        lastQrAt: null,
        me: null,
        error: null,
        readyAt: null,
        received: 0,
        replied: 0,
        lastMessageAt: null,
        lastReplyAt: null,
      },
    });
  }

  return sessions.get(scope);
}

/** What is on disk for this scope. `paired` is exact: the marker is only written on ready. */
export function sessionInfo(scope = MAIN) {
  const base = profileDir(scope);

  let linked = null;

  try {
    linked = JSON.parse(readFileSync(markerPath(scope), 'utf8'));
  } catch {
    linked = null;
  }

  if (!existsSync(base)) {
    return {
      present: false,
      paired: false,
      path: base,
      files: 0,
      megabytes: 0,
      updatedAt: null,
      linkedDevice: null,
      linkedAt: null,
    };
  }

  let files = 0;
  let bytes = 0;

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      files += 1;

      try {
        bytes += statSync(full).size;
      } catch {
        // file vanished mid-walk
      }
    }
  };

  try {
    walk(base);
  } catch {
    // unreadable profile
  }

  return {
    present: true,
    paired: linked !== null,
    path: base,
    files,
    megabytes: Math.round((bytes / 1024 / 1024) * 10) / 10,
    updatedAt: statSync(base).mtime.toISOString(),
    linkedDevice: linked?.me ?? null,
    linkedAt: linked?.linkedAt ?? null,
  };
}

export function whatsappStatus(scope = MAIN) {
  const session = record(scope);

  return {
    scope,
    enabled: config.whatsapp.enabled,
    clientId: clientIdFor(scope),
    sessionPath: config.whatsapp.sessionPath,
    session: sessionInfo(scope),
    liveSessions: [...sessions.values()].filter((entry) => entry.client).length,
    maxLiveSessions: MAX_LIVE_SESSIONS,
    ...session.state,
  };
}

export function setWhatsAppHandler(next) {
  handler = next;
}

/** Boots a client for this scope. The first run emits a QR that must be scanned. */
export async function startWhatsApp(scope = MAIN) {
  const session = record(scope);

  if (session.client) return whatsappStatus(scope);

  if (session.starting) {
    await session.starting;
    return whatsappStatus(scope);
  }

  const live = [...sessions.values()].filter((entry) => entry.client).length;

  if (live >= MAX_LIVE_SESSIONS) {
    session.state.status = 'error';
    session.state.error = `Too many WhatsApp sessions are live (${live}/${MAX_LIVE_SESSIONS}). Stop one before starting another.`;
    return whatsappStatus(scope);
  }

  session.starting = (async () => {
    session.state.status = 'starting';
    session.state.error = null;

    let library;

    try {
      library = await import('whatsapp-web.js');
    } catch (error) {
      session.state.status = 'error';
      session.state.error = `whatsapp-web.js is not installed (${error.message})`;
      return;
    }

    const wweb = library.default ?? library;
    const { Client, LocalAuth } = wweb;

    // Chromium leaves SingletonLock/SingletonCookie/SingletonSocket in the profile,
    // naming the host and pid that created them. A recreated container has a new
    // hostname, so Chromium refuses to start against that profile and the client dies
    // silently. Clearing them before launch is what lets a deploy keep the session.
    const profile = profileDir(scope);

    await mkdir(profile, { recursive: true });

    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      await rm(join(profile, name), { force: true, recursive: true });
    }

    let qrcode = null;

    try {
      const module = await import('qrcode');
      qrcode = module.default ?? module;
    } catch {
      qrcode = null;
    }

    session.client = new Client({
      authStrategy: new LocalAuth({ clientId: clientIdFor(scope), dataPath: config.whatsapp.sessionPath }),
      puppeteer: {
        headless: true,
        ...(config.whatsapp.chromePath ? { executablePath: config.whatsapp.chromePath } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
    });

    session.client.on('qr', async (qr) => {
      session.state.status = 'qr';
      session.state.qr = qr;
      session.state.lastQrAt = new Date().toISOString();
      session.state.qrDataUrl = qrcode
        ? await qrcode.toDataURL(qr, { margin: 1, width: 320 }).catch(() => null)
        : null;
      console.log(`[whatsapp:${scope}] scan the QR to link this device`);
    });

    session.client.on('authenticated', () => {
      session.state.status = 'authenticated';
      session.state.qr = null;
      session.state.qrDataUrl = null;
    });

    session.client.on('ready', async () => {
      session.state.status = 'ready';
      session.state.qr = null;
      session.state.qrDataUrl = null;
      session.state.me = session.client?.info?.wid?._serialized ?? null;
      session.state.readyAt = new Date().toISOString();
      console.log(`[whatsapp:${scope}] connected as ${session.state.me}`);

      // Record that this profile is linked, so later boots reconnect without a scan.
      try {
        await writeFile(
          markerPath(scope),
          JSON.stringify({ me: session.state.me, linkedAt: session.state.readyAt, scope }, null, 2),
          'utf8',
        );
      } catch (error) {
        console.error(`[whatsapp:${scope}] could not record the session marker: ${error.message}`);
      }
    });

    session.client.on('auth_failure', (message) => {
      session.state.status = 'error';
      session.state.error = `Authentication failed: ${message}`;
      console.error(`[whatsapp:${scope}] authentication failed: ${message}`);
    });

    session.client.on('disconnected', (reason) => {
      session.state.status = 'disconnected';
      session.state.error = `Disconnected: ${reason}`;
      session.client = null;
      console.error(`[whatsapp:${scope}] disconnected: ${reason}`);
    });

    session.client.on('message', async (message) => {
      session.state.received += 1;
      session.state.lastMessageAt = new Date().toISOString();

      try {
        const reply = await handler?.(message, scope);

        if (reply) {
          await message.reply(reply);
          session.state.replied += 1;
          session.state.lastReplyAt = new Date().toISOString();
        }
      } catch (error) {
        console.error(`[whatsapp:${scope}] handler failed: ${error.message}`);
      }
    });

    try {
      await session.client.initialize();
    } catch (error) {
      session.state.status = 'error';
      session.state.error = error.message;
      session.client = null;
      console.error(`[whatsapp:${scope}] could not start the browser: ${error.message}`);
    }
  })();

  try {
    await session.starting;
  } finally {
    session.starting = null;
  }

  return whatsappStatus(scope);
}

export async function stopWhatsApp(scope = MAIN) {
  const session = record(scope);

  if (session.client) {
    try {
      await session.client.destroy();
    } catch {
      // already gone
    }
  }

  session.client = null;
  session.starting = null;
  session.state.status = 'stopped';
  session.state.qr = null;
  session.state.qrDataUrl = null;
  session.state.me = null;

  return whatsappStatus(scope);
}

/** Forget the stored session; the next start needs a fresh scan. */
export async function logoutWhatsApp(scope = MAIN) {
  await stopWhatsApp(scope);

  await rm(profileDir(scope), { recursive: true, force: true });

  const session = record(scope);

  session.state.me = null;
  session.state.readyAt = null;

  return whatsappStatus(scope);
}

export async function sendWhatsAppMessage(scope, to, text) {
  const session = record(scope);

  if (!session.client || session.state.status !== 'ready') {
    throw new Error('This WhatsApp session is not connected yet');
  }

  const digits = String(to ?? '').replace(/\D/g, '');

  if (digits.length < 7) {
    throw new Error('Provide a phone number in international format');
  }

  const chatId = digits.startsWith('0') ? `${digits}@c.us` : `${digits}@c.us`;
  const sent = await session.client.sendMessage(chatId, text);

  return { id: sent?.id?._serialized ?? null, to: chatId, scope };
}

/**
 * Restart every session that is already linked, so a deploy does not ask anyone to scan
 * again. Called once on boot; failures are logged and never fatal.
 */
export async function resumeLinkedSessions(scopes = [MAIN]) {
  const resumed = [];

  for (const scope of scopes.slice(0, MAX_LIVE_SESSIONS)) {
    if (!sessionInfo(scope).paired) continue;

    try {
      await startWhatsApp(scope);
      resumed.push(scope);
    } catch (error) {
      console.error(`[whatsapp:${scope}] could not resume: ${error.message}`);
    }
  }

  return resumed;
}

export { MAIN as MAIN_SCOPE };
