import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { trackDeployStatus } from '../lib/metrics.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');
const statusFile = join(dataDir, 'deploy-status.json');

// Expose deploy state as Prometheus gauges, so Grafana can chart releases next to
// traffic and alerting can see them.
trackDeployStatus(statusFile);

// A deploy that dies before clearing its notice must not pin the page on forever.
const STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * The stages the pipeline reports, in order, each with the point on the bar it
 * represents. The weights are honest: building the images is most of the wall time.
 */
const STAGES = [
  { key: 'preparing', label: 'Preparing', percent: 5 },
  { key: 'announced', label: 'Notifying the site', percent: 10 },
  { key: 'building', label: 'Building images', percent: 15 },
  { key: 'rolling', label: 'Restarting the stack', percent: 70 },
  { key: 'health', label: 'Waiting for services to be healthy', percent: 82 },
  { key: 'verifying', label: 'Verifying the site', percent: 92 },
  { key: 'done', label: 'Finished', percent: 100 },
];

const STAGE_KEYS = STAGES.map((stage) => stage.key);
const STAGE_BY_KEY = new Map(STAGES.map((stage) => [stage.key, stage]));

const router = Router();

/** Keep only the fields the page draws, so nothing odd can be stored. */
function cleanContainers(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 12).map((entry) => ({
    name: String(entry?.name ?? '').slice(0, 80),
    service: String(entry?.service ?? '').slice(0, 40),
    state: String(entry?.state ?? '').slice(0, 40),
    health: String(entry?.health ?? '').slice(0, 40),
  }));
}

function describe(record) {
  const index = STAGE_KEYS.indexOf(record.stage);
  const stage = STAGE_BY_KEY.get(record.stage);
  const failed = record.stage === 'failed';

  return {
    inProgress: record.inProgress === true,
    stage: record.stage ?? null,
    stageLabel: failed ? 'Failed' : (stage?.label ?? 'Unknown'),
    percent: failed ? (record.percent ?? 0) : (stage?.percent ?? 0),
    sha: record.sha ?? null,
    actor: record.actor ?? null,
    message: record.message ?? null,
    startedAt: record.startedAt ?? null,
    finishedAt: record.finishedAt ?? null,
    containers: Array.isArray(record.containers) ? record.containers : [],
    stages: STAGES.map((entry, position) => ({
      key: entry.key,
      label: entry.label,
      state: failed
        ? position === 0
          ? 'failed'
          : 'skipped'
        : position < index
          ? 'done'
          : position === index
            ? record.inProgress
              ? 'current'
              : 'done'
            : 'pending',
    })),
  };
}

async function readRecord() {
  try {
    const stored = JSON.parse(await readFile(statusFile, 'utf8'));
    const startedAt = Date.parse(stored.startedAt ?? '');

    // An in-progress notice that nobody cleared is treated as finished, so a deploy
    // that was killed mid-flight cannot leave the site permanently "deploying".
    if (stored.inProgress && (!Number.isFinite(startedAt) || Date.now() - startedAt > STALE_AFTER_MS)) {
      return { ...stored, inProgress: false, stage: 'done', finishedAt: stored.finishedAt ?? null };
    }

    return stored;
  } catch {
    return null;
  }
}

async function writeRecord(record) {
  await mkdir(dataDir, { recursive: true });

  const temporary = join(dataDir, `.deploy-status.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(record));
  await rename(temporary, statusFile);
}

/** Public. The site polls this to draw the progress bar. Nothing sensitive. */
router.get('/status', async (req, res) => {
  const record = await readRecord();
  res.json(record ? describe(record) : { inProgress: false, stages: [] });
});

/**
 * Called by the deploy pipeline at each stage. The route only exists when
 * DEPLOY_STATUS_TOKEN is set, so a local checkout has no writable endpoint.
 */
router.post('/status', async (req, res) => {
  const expected = process.env.DEPLOY_STATUS_TOKEN ?? '';

  if (!expected) {
    return res.status(404).json({ error: 'Deployment status reporting is not enabled' });
  }

  if (req.get('x-deploy-token') !== expected) {
    return res.status(401).json({ error: 'Invalid deploy token' });
  }

  const stage = String(req.body?.stage ?? '').trim() || 'preparing';
  const previous = (await readRecord()) ?? {};

  if (stage === 'done' || stage === 'failed') {
    const record = {
      ...previous,
      inProgress: false,
      stage,
      percent: stage === 'done' ? 100 : (previous.percent ?? STAGE_BY_KEY.get(previous.stage)?.percent ?? 0),
      sha: req.body?.sha ?? previous.sha ?? null,
      actor: req.body?.actor ?? previous.actor ?? null,
      message: req.body?.message ?? previous.message ?? null,
      startedAt: previous.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    await writeRecord(record);

    return res.json(describe(record));
  }

  if (!STAGE_BY_KEY.has(stage)) {
    return res.status(400).json({ error: `Unknown stage: ${stage}` });
  }

  const incomingSha = req.body?.sha ?? previous.sha ?? null;

  // A new run resets the clock. Carrying startedAt over from the previous deploy made
  // every later run look older than the staleness window, so the site reported
  // "Finished" while the build was still running.
  const isNewRun = previous.inProgress !== true || previous.sha !== incomingSha;

  const record = {
    inProgress: true,
    stage,
    percent: STAGE_BY_KEY.get(stage).percent,
    sha: incomingSha,
    actor: req.body?.actor ?? previous.actor ?? null,
    message: req.body?.message ?? null,
    startedAt: isNewRun ? new Date().toISOString() : (previous.startedAt ?? new Date().toISOString()),
    finishedAt: null,
    // The pipeline reports what docker says about each service, so the page can show
    // a row per container without this process needing the docker socket.
    containers: cleanContainers(req.body?.containers).length
      ? cleanContainers(req.body.containers)
      : (previous.containers ?? []),
  };

  await writeRecord(record);

  return res.json(describe(record));
});

/** Lets an operator clear a stuck notice by hand. */
router.delete('/status', async (req, res) => {
  const expected = process.env.DEPLOY_STATUS_TOKEN ?? '';

  if (!expected || req.get('x-deploy-token') !== expected) {
    return res.status(401).json({ error: 'Invalid deploy token' });
  }

  await rm(statusFile, { force: true });

  return res.json({ inProgress: false, stages: [] });
});

export default router;
