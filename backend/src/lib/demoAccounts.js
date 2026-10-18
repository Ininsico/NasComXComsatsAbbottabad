import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The demo sign-in buttons, and the only thing that may ever hand a password to a browser.
 *
 * `npm run demo:seed` writes a marker file listing the accounts it created. This module
 * reads that marker. No marker means no demo accounts and no buttons — so a real
 * deployment that never ran the seed exposes nothing, and the credentials cannot leak from
 * a server that does not have them.
 */
const here = dirname(fileURLToPath(import.meta.url));
const markerFile = join(here, '..', '..', 'data', '.demo-seed.json');

export async function readDemoSeed() {
  try {
    const parsed = JSON.parse(await readFile(markerFile, 'utf8'));

    return Array.isArray(parsed?.accounts) && parsed.accounts.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeDemoSeed(accounts) {
  const payload = {
    seededAt: new Date().toISOString(),
    accounts,
  };

  await mkdir(dirname(markerFile), { recursive: true });
  await writeFile(markerFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return payload;
}

export async function clearDemoSeed() {
  return writeDemoSeed([]);
}

export { randomUUID };
