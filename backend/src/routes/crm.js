import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import {
  ACTIVITY_KINDS,
  SOURCES,
  STAGES,
  STAGE_LABELS,
  addActivity,
  createLead,
  crmStats,
  deleteLead,
  findLead,
  listActivities,
  listLeads,
  updateLead,
} from '../lib/crm.js';

const router = Router();

/**
 * Public: the marketing site's "book a demo" form posts here, so a visitor becomes a
 * lead in the pipeline instead of an email nobody files. No auth, so it is rate limited
 * per address in memory.
 */
const submissions = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimited(address) {
  const now = Date.now();
  const recent = (submissions.get(address) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    submissions.set(address, recent);
    return true;
  }

  recent.push(now);
  submissions.set(address, recent);

  return false;
}

router.post('/demo-request', async (req, res) => {
  const address = req.ip ?? 'unknown';

  if (rateLimited(address)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });
  }

  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim();

  if (!name || !email) {
    return res.status(400).json({ error: 'A name and an email address are required' });
  }

  const company = String(req.body?.company ?? '').trim();
  const message = String(req.body?.message ?? '').trim();

  const result = await createLead(
    {
      name,
      email,
      phone: req.body?.phone ?? '',
      source: 'website',
      programme: company,
      stage: 'new',
      value: 0,
      notes: [company ? `Company: ${company}` : '', message].filter(Boolean).join('\n'),
      owner: '',
    },
    'website',
  );

  if (result.errors) {
    return res.status(400).json({ error: 'Check the form', fields: result.errors });
  }

  return res.status(201).json({ ok: true });
});

// Everything below needs a session.
router.use(requireAuth);

const canEdit = requireRole('admin', 'faculty');

router.get('/meta', (req, res) => {
  res.json({ stages: STAGES, stageLabels: STAGE_LABELS, sources: SOURCES, activityKinds: ACTIVITY_KINDS });
});

router.get('/stats', async (req, res) => {
  res.json(await crmStats());
});

router.get('/leads', async (req, res) => {
  const leads = await listLeads({
    stage: req.query.stage,
    query: req.query.q,
    owner: req.query.owner,
  });

  res.json({ leads });
});

router.get('/leads/:id', async (req, res) => {
  const lead = await findLead(req.params.id);

  if (!lead) return res.status(404).json({ error: 'No such lead' });

  return res.json({
    lead,
    activities: await listActivities({ leadId: lead.id }),
  });
});

router.post('/leads', canEdit, async (req, res) => {
  const result = await createLead(req.body, req.user.name);

  if (result.errors) {
    return res.status(400).json({ error: 'Check the form', fields: result.errors });
  }

  return res.status(201).json({ lead: result.lead });
});

router.patch('/leads/:id', canEdit, async (req, res) => {
  const result = await updateLead(req.params.id, req.body, req.user.name);

  if (result.errors) {
    return res.status(400).json({ error: 'Check the form', fields: result.errors });
  }

  if (result.missing) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead: result.lead });
});

router.delete('/leads/:id', canEdit, async (req, res) => {
  const result = await deleteLead(req.params.id);

  if (result.missing) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead: result.lead });
});

router.get('/activities', async (req, res) => {
  res.json({
    activities: await listActivities({ leadId: req.query.leadId, limit: req.query.limit }),
  });
});

router.post('/activities', canEdit, async (req, res) => {
  const result = await addActivity(req.body, req.user.name);

  if (result.errors) {
    return res.status(400).json({ error: 'Check the form', fields: result.errors });
  }

  if (result.missing) return res.status(404).json({ error: 'No such lead' });

  return res.status(201).json({ activity: result.activity });
});

export default router;
