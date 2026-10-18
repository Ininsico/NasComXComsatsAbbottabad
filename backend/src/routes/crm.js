import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { record as audit, listEntries, verifyChain } from '../lib/audit.js';
import { listAlerts } from '../lib/alerts.js';
import { requireAuth } from '../lib/auth.js';
import { authorizationUrl, bookAppointment, busyIntervals, connectionFor, disconnect, googleConfigured, redirectUri, saveTokens } from '../lib/calendar.js';
import { workspaceContext, requirePermission } from '../lib/context.js';
import { db } from '../lib/db.js';
import { describe, findMember, listMembers, permissionsFor, removeMember, updateMember } from '../lib/members.js';
import { LEVELS, LEVEL_LABELS, PERMISSIONS, canSeeValue, maskValue, maskValues } from '../lib/permissions.js';
import { createRole, findRole, listRoles, removeRole, updateRole } from '../lib/roles.js';
import { getSettings, saveSettings } from '../lib/settings.js';

const router = Router();

/** The workspace that public website intake lands in. */
async function intakeWorkspace() {
  const workspaces = await db.collection('workspaces').read();

  if (workspaces.length === 0) return null;

  for (const workspace of workspaces) {
    const settings = await getSettings(workspace.id);
    if (settings.publicIntake) return workspace;
  }

  return workspaces[0];
}

/**
 * Public lead intake from the marketing site. Kept on this router so the demo form has
 * one obvious destination; the workspace is resolved rather than supplied.
 */
router.post('/demo-request', async (req, res) => {
  const workspace = await intakeWorkspace();

  if (!workspace) {
    return res.status(503).json({ error: 'No workspace is accepting public leads yet' });
  }

  const { createLead } = await import('../lib/leads.js');
  const result = await createLead({
    workspaceId: workspace.id,
    input: {
      name: req.body?.name,
      email: req.body?.email,
      phone: req.body?.phone ?? '',
      source: 'website',
      company: req.body?.company ?? '',
      notes: [req.body?.company ? `Company: ${req.body.company}` : '', req.body?.message ?? '']
        .filter(Boolean)
        .join('\n'),
    },
    actorName: 'website',
  });

  if (result.errors) {
    return res.status(400).json({ error: 'Check the form', fields: result.errors });
  }

  return res.status(201).json({ ok: true });
});

router.use(requireAuth, workspaceContext);

router.get('/meta', async (req, res) => {
  const settings = await getSettings(req.workspace.id);

  res.json({
    stages: settings.pipeline,
    customFields: settings.customFields ?? [],
    sources: ['website', 'whatsapp', 'sms', 'walk-in', 'phone', 'referral', 'event', 'manual'],
    workspace: { id: req.workspace.id, name: req.workspace.name },
    member: { id: req.member.id, level: req.member.level, permissions: req.permissions },
    settings: { acknowledgeSeconds: settings.acknowledgeSeconds, maxOpenLeads: settings.maxOpenLeads },
  });
});

router.get('/stats', requirePermission('crm.view'), async (req, res) => {
  const { leadStats } = await import('../lib/leads.js');
  const stats = await leadStats(req.workspace.id);

  // A caller without the value permission must not receive the value, not even as a total.
  if (!canSeeValue(req.permissions)) {
    stats.pipelineValue = null;
    stats.wonValue = null;
    stats.valueHidden = true;
    stats.recentLeads = maskValues(stats.recentLeads, req.permissions);
  }

  res.json(stats);
});

/** Every open lead that needs a human, with the reason stated per item. */
router.get('/recovery', requirePermission('crm.view'), async (req, res) => {
  const { recoveryQueue } = await import('../lib/leads.js');
  const queue = await recoveryQueue(req.workspace.id);

  res.json({ ...queue, items: maskValues(queue.items, req.permissions) });
});

/**
 * Saved lists: named criteria evaluated against the live pipeline, so a list shrinks and
 * grows as records start and stop matching. This is a query, not a snapshot.
 */
router.get('/lists', requirePermission('crm.view'), async (req, res) => {
  const { listSavedLists, LIST_FIELDS, LIST_OPS } = await import('../lib/savedLists.js');

  res.json({
    lists: await listSavedLists(req.workspace.id),
    fields: LIST_FIELDS,
    ops: LIST_OPS,
  });
});

router.post('/lists', requirePermission('crm.view'), async (req, res) => {
  const { createSavedList } = await import('../lib/savedLists.js');
  const result = await createSavedList({
    workspaceId: req.workspace.id,
    input: req.body ?? {},
    user: req.user,
  });

  if (result.errors) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: result.errors });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'list.created',
    target: result.list.id,
    metadata: { name: result.list.name, criteria: result.list.criteria.length },
  });

  return res.status(201).json({ list: result.list });
});

async function ownedList(req) {
  const { findSavedList } = await import('../lib/savedLists.js');
  const list = await findSavedList({ workspaceId: req.workspace.id, id: req.params.id });

  if (!list) return { missing: true };
  if (list.createdBy !== req.user.id && !req.permissions.includes('assignment.manage')) {
    return { forbidden: true };
  }

  return { list };
}

router.patch('/lists/:id', requirePermission('crm.view'), async (req, res) => {
  const { updateSavedList } = await import('../lib/savedLists.js');
  const owned = await ownedList(req);

  if (owned.missing) return res.status(404).json({ error: 'No such list' });
  if (owned.forbidden) return res.status(403).json({ error: 'Only its author can change this list' });

  const result = await updateSavedList({
    workspaceId: req.workspace.id,
    id: req.params.id,
    input: req.body ?? {},
  });

  if (result.errors) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: result.errors });
  }

  await audit({ workspaceId: req.workspace.id, actorId: req.user.id, action: 'list.updated', target: result.list.id });

  return res.json({ list: result.list });
});

router.delete('/lists/:id', requirePermission('crm.view'), async (req, res) => {
  const { deleteSavedList } = await import('../lib/savedLists.js');
  const owned = await ownedList(req);

  if (owned.missing) return res.status(404).json({ error: 'No such list' });
  if (owned.forbidden) return res.status(403).json({ error: 'Only its author can delete this list' });

  const result = await deleteSavedList({ workspaceId: req.workspace.id, id: req.params.id });

  await audit({ workspaceId: req.workspace.id, actorId: req.user.id, action: 'list.deleted', target: req.params.id });

  return res.json({ ok: true, removed: result.removed?.name ?? null });
});

/** Evaluate a saved list against right now. Masked exactly like the board. */
router.get('/lists/:id/evaluate', requirePermission('crm.view'), async (req, res) => {
  const { findSavedList, evaluateRows } = await import('../lib/savedLists.js');
  const { listLeads } = await import('../lib/leads.js');

  const list = await findSavedList({ workspaceId: req.workspace.id, id: req.params.id });

  if (!list) return res.status(404).json({ error: 'No such list' });

  const rows = await listLeads(req.workspace.id, {});

  return res.json({
    list,
    count: evaluateRows(rows, list.criteria).length,
    leads: maskValues(evaluateRows(rows, list.criteria), req.permissions),
  });
});

router.get('/leads', requirePermission('crm.view'), async (req, res) => {
  const { listLeads } = await import('../lib/leads.js');

  const leads = await listLeads(req.workspace.id, {
    stage: req.query.stage,
    query: req.query.q,
    assigneeId: req.query.assigneeId,
    unacknowledged: req.query.unacknowledged,
  });

  res.json({ leads: maskValues(leads, req.permissions) });
});

/**
 * CSV export, gated by its own permission. The value column is present only for a caller
 * who may see value — masking a column at the end would still have shipped the numbers in
 * the response body.
 */
router.get('/export', requirePermission('crm.export'), async (req, res) => {
  const { listLeads } = await import('../lib/leads.js');

  const records = maskValues(await listLeads(req.workspace.id, {}), req.permissions);
  const showValue = canSeeValue(req.permissions);

  const columns = [
    'id',
    'name',
    'stage',
    'source',
    'assigneeId',
    'value',
    'ackDeadline',
    'acknowledgedAt',
    'escalationLevel',
    'createdAt',
    'updatedAt',
  ];

  const escape = (input) => {
    const text = input === null || input === undefined ? '' : String(input);

    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const rows = records.map((record) =>
    columns
      .filter((column) => column !== 'value' || showValue)
      .map((column) => escape(record[column]))
      .join(','),
  );

  const header = columns.filter((column) => column !== 'value' || showValue).join(',');
  const csv = [header, ...rows].join('\n');

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'records.exported',
    metadata: { rows: records.length, includedValue: showValue },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="opportunities-${req.workspace.id}.csv"`);

  return res.send(csv);
});

router.get('/leads/:id', requirePermission('crm.view'), async (req, res) => {
  const { findLead } = await import('../lib/leads.js');
  const lead = await findLead(req.params.id, req.workspace.id);

  if (!lead) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead: maskValue(lead, req.permissions) });
});

router.post('/leads', requirePermission('crm.create'), async (req, res) => {
  const { createLead } = await import('../lib/leads.js');
  const result = await createLead({
    workspaceId: req.workspace.id,
    input: req.body,
    actorId: req.user.id,
    actorName: req.user.name,
  });

  if (result.errors) {
    return res.status(400).json({ error: 'Check the form', fields: result.errors });
  }

  return res.status(201).json({ lead: result.lead, assignee: result.assignee ?? null });
});

router.patch('/leads/:id', requirePermission('crm.edit'), async (req, res) => {
  const { updateLead } = await import('../lib/leads.js');
  const result = await updateLead({
    workspaceId: req.workspace.id,
    id: req.params.id,
    patch: req.body,
    actorId: req.user.id,
    actorName: req.user.name,
  });

  if (result.errors) return res.status(400).json({ error: 'Check the form', fields: result.errors });
  if (result.missing) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead: result.lead });
});

router.delete('/leads/:id', requirePermission('crm.delete'), async (req, res) => {
  const { deleteLead } = await import('../lib/leads.js');
  const result = await deleteLead({ workspaceId: req.workspace.id, id: req.params.id, actorId: req.user.id });

  if (result.missing) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead: result.lead });
});

router.post('/leads/:id/acknowledge', requirePermission('crm.edit'), async (req, res) => {
  const { acknowledgeLead } = await import('../lib/leads.js');
  const result = await acknowledgeLead({
    workspaceId: req.workspace.id,
    id: req.params.id,
    actorId: req.user.id,
    actorName: req.user.name,
  });

  if (result.missing) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead: result.lead });
});

router.post('/leads/:id/assign', requirePermission('assignment.manage'), async (req, res) => {
  const member = await findMember(String(req.body?.memberId ?? ''), req.workspace.id);

  if (!member) return res.status(400).json({ error: 'Pick a member of this workspace' });

  const { assignLead } = await import('../lib/leads.js');
  const result = await assignLead({
    workspaceId: req.workspace.id,
    id: req.params.id,
    memberId: member.id,
    actorId: req.user.id,
    actorName: req.user.name,
  });

  if (result.missing) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead: result.lead });
});

/** Run the escalation pass now, so a demo does not have to wait for the ticker. */
router.post('/escalate', requirePermission('assignment.manage'), async (req, res) => {
  const { escalateDue } = await import('../lib/leads.js');
  const applied = await escalateDue({ workspaceId: req.workspace.id });

  res.json({ applied });
});

router.get('/activities', requirePermission('crm.view'), async (req, res) => {
  const { listActivities } = await import('../lib/leads.js');
  res.json({ activities: await listActivities(req.workspace.id, { leadId: req.query.leadId, limit: req.query.limit }) });
});

router.post('/activities', requirePermission('crm.edit'), async (req, res) => {
  const { addActivity, findLead } = await import('../lib/leads.js');
  const lead = await findLead(String(req.body?.leadId ?? ''), req.workspace.id);

  if (!lead) return res.status(404).json({ error: 'No such lead' });

  const summary = String(req.body?.summary ?? '').trim();

  if (!summary) return res.status(400).json({ error: 'Write what happened' });

  const activity = await addActivity({
    workspaceId: req.workspace.id,
    leadId: lead.id,
    kind: req.body?.kind ?? 'note',
    summary,
    by: req.user.name,
  });

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'activity.created',
    target: lead.id,
    metadata: { kind: activity.kind },
  });

  return res.status(201).json({ activity });
});

router.get('/alerts', requirePermission('integrations.manage'), async (req, res) => {
  res.json({ alerts: await listAlerts(req.workspace.id) });
});

/**
 * Send one real alert through every configured channel, including the Brevo email. This
 * exists so "does the red alert actually arrive" is a button, not a hope.
 */
router.post('/alerts/test', requirePermission('integrations.manage'), async (req, res) => {
  const { notify } = await import('../lib/alerts.js');
  const settings = await getSettings(req.workspace.id);

  const attempts = await notify({
    workspaceId: req.workspace.id,
    title: `Test alert from ${req.workspace.name}`,
    body: `This is a test red alert sent by ${req.user.name}. If you can read this, alerts work.`,
    settings,
  });

  return res.json({ attempts });
});

/**
 * The audit log, filterable by event type, actor and date, with the chain verified on each
 * read. Read-only by design: there is no endpoint that can edit or delete an entry.
 */
router.get('/audit', requirePermission('audit.view'), async (req, res) => {
  const entries = await listEntries(req.workspace.id, {
    action: req.query.action || undefined,
    actorId: req.query.actorId || undefined,
    from: req.query.from || undefined,
    to: req.query.to || undefined,
    limit: req.query.limit,
  });

  res.json({
    entries,
    chain: await verifyChain(req.workspace.id),
    actions: [...new Set((await listEntries(req.workspace.id, { limit: 1000 })).map((entry) => entry.action))].sort(),
  });
});

export default router;
