import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { record as audit, listEntries, verifyChain } from '../lib/audit.js';
import { listAlerts } from '../lib/alerts.js';
import { requireAuth } from '../lib/auth.js';
import { authorizationUrl, bookAppointment, busyIntervals, connectionFor, disconnect, googleConfigured, redirectUri, saveTokens } from '../lib/calendar.js';
import { workspaceContext, requirePermission } from '../lib/context.js';
import { db } from '../lib/db.js';
import { describe, findMember, listMembers, permissionsFor, removeMember, updateMember } from '../lib/members.js';
import { LEVELS, LEVEL_LABELS, PERMISSIONS } from '../lib/permissions.js';
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
      programme: req.body?.company ?? '',
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
    sources: ['website', 'whatsapp', 'sms', 'walk-in', 'phone', 'referral', 'event', 'manual'],
    workspace: { id: req.workspace.id, name: req.workspace.name },
    member: { id: req.member.id, level: req.member.level, permissions: req.permissions },
    settings: { acknowledgeSeconds: settings.acknowledgeSeconds, maxOpenLeads: settings.maxOpenLeads },
  });
});

router.get('/stats', requirePermission('crm.view'), async (req, res) => {
  const { leadStats } = await import('../lib/leads.js');
  res.json(await leadStats(req.workspace.id));
});

/** Every open lead that needs a human, with the reason stated per item. */
router.get('/recovery', requirePermission('crm.view'), async (req, res) => {
  const { recoveryQueue } = await import('../lib/leads.js');
  res.json(await recoveryQueue(req.workspace.id));
});

router.get('/leads', requirePermission('crm.view'), async (req, res) => {
  const { listLeads } = await import('../lib/leads.js');

  res.json({
    leads: await listLeads(req.workspace.id, {
      stage: req.query.stage,
      query: req.query.q,
      assigneeId: req.query.assigneeId,
      unacknowledged: req.query.unacknowledged,
    }),
  });
});

router.get('/leads/:id', requirePermission('crm.view'), async (req, res) => {
  const { findLead } = await import('../lib/leads.js');
  const lead = await findLead(req.params.id, req.workspace.id);

  if (!lead) return res.status(404).json({ error: 'No such lead' });

  return res.json({ lead });
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

router.get('/audit', requirePermission('audit.view'), async (req, res) => {
  res.json({
    entries: await listEntries(req.workspace.id),
    chain: await verifyChain(req.workspace.id),
  });
});

export default router;
