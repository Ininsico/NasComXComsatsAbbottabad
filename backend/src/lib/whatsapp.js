import { config } from '../config.js';

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
    ...state,
  };
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

    client.on('ready', () => {
      state.status = 'ready';
      state.me = client?.info?.wid?._serialized ?? null;
      state.readyAt = new Date().toISOString();
      console.log(`[whatsapp] connected as ${state.me}`);
    });

    client.on('auth_failure', (message) => {
      state.status = 'error';
      state.error = `Authentication failed: ${message}`;
    });

    client.on('disconnected', (reason) => {
      state.status = 'disconnected';
      state.error = `Disconnected: ${reason}`;
      client = null;
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
