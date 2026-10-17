import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';

/** Written after a successful link; its presence is what "already paired" means. */
const MARKER = () => join(config.whatsapp.sessionPath, '.linked.json');

const state = {
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
};

let client = null;
let handler = null;
let starting = null;

export function whatsappStatus() {
  return {
    enabled: config.whatsapp.enabled,
    sessionPath: config.whatsapp.sessionPath,
    session: sessionInfo(),
    ...state,
  };
}

/**
 * What is on disk for this session.
 *
 * `paired` is driven by a marker written only once the client reaches `ready`,
 * so it is exact: a stored profile that was never linked does not count, and a
 * linked one always does. That lets the API reconnect on boot with no scan while
 * staying out of the way before the first link.
 */
export function sessionInfo() {
  const base = join(config.whatsapp.sessionPath, 'session-comsats-portal');

  let linked = null;

  try {
    linked = JSON.parse(readFileSync(MARKER(), 'utf8'));
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
      if (entry.isDirectory()) walk(full);
      else {
        files += 1;
        try {
          bytes += statSync(full).size;
        } catch {
          // file vanished mid-walk
        }
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

/** Stops the client and deletes the stored session, so the next start re-pairs. */
export async function logoutWhatsApp() {
  await stopWhatsApp();

  await rm(join(config.whatsapp.sessionPath, 'session-comsats-portal'), {
    recursive: true,
    force: true,
  });
  await rm(MARKER(), { force: true });

  state.me = null;
  state.readyAt = null;

  return whatsappStatus();
}

export function setWhatsAppHandler(next) {
  handler = next;
}

/**
 * Boots a whatsapp-web.js client with a persisted session.
 *
 * The first run emits a QR that must be scanned from the admin console; after
 * that the session on disk is reused. Nothing here is fatal — if the library or
 * a browser is missing the status simply reports why.
 */
export async function startWhatsApp() {
  if (client) return whatsappStatus();

  if (starting) {
    await starting;
    return whatsappStatus();
  }

  starting = (async () => {
    state.status = 'starting';
    state.error = null;

    let library;

    try {
      library = await import('whatsapp-web.js');
    } catch (error) {
      state.status = 'error';
      state.error = `whatsapp-web.js is not installed (${error.message})`;
      return;
    }

    const wweb = library.default ?? library;
    const { Client, LocalAuth } = wweb;

    // Chromium leaves SingletonLock/SingletonCookie/SingletonSocket in the profile,
    // naming the host and pid that created them. A recreated container has a new
    // hostname, so Chromium refuses to start against that profile and the client dies
    // silently. Clearing them before launch is what lets a deploy keep the session.
    const profileDir = join(config.whatsapp.sessionPath, 'session-comsats-portal');

    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      await rm(join(profileDir, name), { force: true, recursive: true });
    }

    let qrcode = null;

    try {
      const module = await import('qrcode');
      qrcode = module.default ?? module;
    } catch {
      qrcode = null;
    }

    client = new Client({
      authStrategy: new LocalAuth({ clientId: 'comsats-portal', dataPath: config.whatsapp.sessionPath }),
      puppeteer: {
        headless: true,
        ...(config.whatsapp.chromePath ? { executablePath: config.whatsapp.chromePath } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
    });

    client.on('qr', async (qr) => {
      state.status = 'qr';
      state.qr = qr;
      state.lastQrAt = new Date().toISOString();
      state.qrDataUrl = qrcode
        ? await qrcode.toDataURL(qr, { margin: 1, width: 320 }).catch(() => null)
        : null;
      console.log('[whatsapp] scan the QR in the admin console to link this device');
    });

    client.on('authenticated', () => {
      state.status = 'authenticated';
      state.qr = null;
      state.qrDataUrl = null;
    });

    client.on('ready', async () => {
      state.status = 'ready';
      state.qr = null;
      state.qrDataUrl = null;
      state.me = client?.info?.wid?._serialized ?? null;
      state.readyAt = new Date().toISOString();
      console.log(`[whatsapp] connected as ${state.me}`);

      // Record that this profile is linked, so later boots reconnect without a scan.
      try {
        await writeFile(
          MARKER(),
          JSON.stringify({ me: state.me, linkedAt: state.readyAt }, null, 2),
          'utf8',
        );
      } catch (error) {
        console.error(`[whatsapp] could not record the session marker: ${error.message}`);
      }
    });

    client.on('auth_failure', (message) => {
      state.status = 'error';
      state.error = `Authentication failed: ${message}`;
      // Never silent: a failed session is the one thing that costs a QR re-scan.
      console.error(`[whatsapp] authentication failed: ${message}`);
    });

    client.on('disconnected', (reason) => {
      state.status = 'disconnected';
      state.error = `Disconnected: ${reason}`;
      client = null;
      console.error(`[whatsapp] disconnected: ${reason}`);
    });

    client.on('message', async (message) => {
      state.received += 1;
      state.lastMessageAt = new Date().toISOString();

      try {
        const reply = await handler?.(message);

        if (reply) {
          await message.reply(reply);
          state.replied += 1;
        }
      } catch (error) {
        console.error(`[whatsapp] handler failed: ${error.message}`);
      }
    });

    try {
      await client.initialize();
    } catch (error) {
      state.status = 'error';
      state.error = error.message;
      client = null;
      // Without this line a browser that refuses to start looks like nothing happened.
      console.error(`[whatsapp] could not start the browser: ${error.message}`);
    }
  })();

  try {
    await starting;
  } finally {
    starting = null;
  }

  return whatsappStatus();
}

export async function stopWhatsApp() {
  if (client) {
    try {
      await client.destroy();
    } catch {
      // already gone
    }
  }

  client = null;
  starting = null;
  state.status = 'stopped';
  state.qr = null;
  state.qrDataUrl = null;
  state.me = null;

  return whatsappStatus();
}

export async function sendWhatsAppMessage(to, text) {
  if (!client || state.status !== 'ready') {
    throw new Error('WhatsApp is not connected yet');
  }

  const digits = String(to ?? '').replace(/\D/g, '');

  if (digits.length < 7) {
    throw new Error('Provide a phone number in international format');
  }

  const chatId = `${digits}@c.us`;
  const sent = await client.sendMessage(chatId, text);

  return { id: sent?.id?._serialized ?? null, to: chatId };
}
