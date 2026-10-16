#!/usr/bin/env node
/**
 * WhatsApp session tooling.
 *
 *   npm --prefix backend run whatsapp:pair     link a device — prints a scannable QR
 *   npm --prefix backend run whatsapp:status    is a session stored, and does it still connect?
 *   npm --prefix backend run whatsapp:logout -- --yes   forget the session
 *
 * The session is written to disk under backend/data/whatsapp-session (gitignored)
 * and is reused on every later start, so a scan is a one-time step.
 */
import { join } from 'node:path';
import { config } from '../config.js';
import { setWhatsAppHandler, startWhatsApp, stopWhatsApp, whatsappStatus, logoutWhatsApp } from '../lib/whatsapp.js';
import { createWhatsAppHandler } from '../lib/whatsappBot.js';

const command = (process.argv[2] ?? 'status').toLowerCase();
const flags = new Set(process.argv.slice(3));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PAIR_TIMEOUT_MS = 5 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 90 * 1000;

async function renderQr(qr) {
  try {
    const terminal = (await import('qrcode-terminal')).default;
    terminal.generate(qr, { small: true });
  } catch {
    console.log('(install qrcode-terminal for a terminal QR)');
  }

  try {
    const qrcode = (await import('qrcode')).default;
    const png = join(config.whatsapp.sessionPath, '..', 'whatsapp-qr.png');
    await qrcode.toFile(png, qr, { width: 340, margin: 2 });
    return png;
  } catch {
    return null;
  }
}

async function pair() {
  setWhatsAppHandler(createWhatsAppHandler());

  console.log('Starting the WhatsApp client (launches Chromium)...');
  const initial = await startWhatsApp();

  if (initial.status === 'error') {
    console.error(`\n${initial.error}`);
    process.exit(1);
  }

  let shownQr = null;
  const deadline = Date.now() + PAIR_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const status = whatsappStatus();

    if (status.status === 'ready') {
      console.log(`\nLinked as ${status.me ?? 'unknown device'}.`);
      console.log(`Session stored at ${status.sessionPath}`);
      console.log('It is reused on every start — you will not be asked to scan again.');
      await stopWhatsApp();
      process.exit(0);
    }

    if (status.status === 'error') {
      console.error(`\n${status.error}`);
      await stopWhatsApp();
      process.exit(1);
    }

    if (status.qr && status.qr !== shownQr) {
      shownQr = status.qr;
      console.log('\nOpen WhatsApp → Settings → Linked devices → Link a device, then scan:\n');

      const png = await renderQr(status.qr);

      if (png) console.log(`\nSaved a PNG of the same code to:\n${png}`);
      console.log('\nWaiting for the scan...');
    }

    await sleep(2000);
  }

  console.error('\nTimed out after 5 minutes with no scan.');
  await stopWhatsApp();
  process.exit(1);
}

async function status() {
  const info = whatsappStatus();

  console.log('WhatsApp session');
  console.log('----------------');
  console.log(`stored   : ${info.session.present ? 'yes' : 'no'}`);
  console.log(`path     : ${info.session.path}`);
  console.log(`size     : ${info.session.files} files, ${info.session.megabytes} MB`);

  if (!info.session.present) {
    console.log('\nNothing stored yet. Link a device with:');
    console.log('  npm --prefix backend run whatsapp:pair');
    return;
  }

  console.log('\nConnecting to confirm the stored session still works...');

  setWhatsAppHandler(async () => null);
  await startWhatsApp();

  const deadline = Date.now() + CONNECT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const current = whatsappStatus();

    if (current.status === 'ready') {
      console.log(`\nCONNECTED as ${current.me ?? 'unknown device'} — no scan needed.`);
      await stopWhatsApp();
      return;
    }

    if (current.status === 'qr') {
      console.log('\nNOT paired — the stored session was rejected, so a scan is required:');
      console.log('  npm --prefix backend run whatsapp:pair');
      await stopWhatsApp();
      process.exitCode = 1;
      return;
    }

    if (current.status === 'error') {
      console.error(`\n${current.error}`);
      await stopWhatsApp();
      process.exitCode = 1;
      return;
    }

    await sleep(2000);
  }

  console.log('\nTimed out waiting for the client to settle.');
  await stopWhatsApp();
  process.exitCode = 1;
}

async function logout() {
  if (!flags.has('--yes')) {
    console.log('This deletes the stored WhatsApp session, so the next start needs a new scan.');
    console.log('Confirm with:  npm --prefix backend run whatsapp:logout -- --yes');
    return;
  }

  const after = await logoutWhatsApp();
  console.log(`Session removed. Stored now: ${after.session.present ? 'yes' : 'no'}`);
}

const commands = { pair, status, logout };

if (!commands[command]) {
  console.log('Usage: node src/scripts/whatsapp.js <pair|status|logout> [--yes]');
  process.exit(1);
}

await commands[command]();
