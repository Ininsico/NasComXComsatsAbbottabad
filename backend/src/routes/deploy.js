import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');
const statusFile = join(dataDir, 'deploy-status.json');

// A deploy that dies before clearing its flag must not pin the banner on forever.
const STALE_AFTER_MS = 30 * 60 * 1000;

const router = Router();

async function readStatus() {
  try {
    const parsed = JSON.parse(await readFile(statusFile, 'utf8'));
    const startedAt = Date.parse(parsed.startedAt ?? '');

    if (!Number.isFinite(startedAt) || Date.now() - startedAt > STALE_AFTER_MS) {
      return { inProgress: false };
    }

    return {
      inProgress: true,
      sha: parsed.sha ?? null,
      actor: parsed.actor ?? null,
      startedAt: parsed.startedAt,
    };
  } catch {
    return { inProgress: false };
  }
}

async function writeStatus(payload) {
  await mkdir(dataDir, { recursive: true });

  const temporary = join(dataDir, `.deploy-status.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(payload));
  await rename(temporary, statusFile);
}

/**
 * Public: the site polls this while a deployment is running so it can show a banner.
 * There is nothing sensitive in it — no token, no logs, just "something is being
 * replaced right now".
 */
router.get('/status', async (req, res) => {
  res.json(await readStatus());
});

/**
 * Called by the deploy pipeline. The route only exists when DEPLOY_STATUS_TOKEN is
 * set, so a normal local checkout does not expose a writable endpoint.
 */
router.post('/status', async (req, res) => {
  const expected = process.env.DEPLOY_STATUS_TOKEN ?? '';

  if (!expected) {
    return res.status(404).json({ error: 'Deployment status reporting is not enabled' });
  }

  if (req.get('x-deploy-token') !== expected) {
    return res.status(401).json({ error: 'Invalid deploy token' });
  }

  if (req.body?.inProgress === false) {
    await rm(statusFile, { force: true });
    return res.json({ inProgress: false });
  }

  const startedAt = new Date().toISOString();
  await writeStatus({ startedAt, sha: req.body?.sha ?? null, actor: req.body?.actor ?? null });

  return res.json({ inProgress: true, startedAt });
});

export default router;
