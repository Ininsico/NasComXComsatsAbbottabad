import { db } from './db.js';
import { record as audit } from './audit.js';
import { notify } from './alerts.js';
import { dueSteps, pickRoundRobin, resolveTarget } from './assignment.js';
import { listMembers } from './members.js';
import { getSettings } from './settings.js';

const leads = db.collection('leads');
const activities = db.collection('activities');

export const STAGES = ['new', 'contacted', 'qualified', 'applied', 'enrolled', 'lost'];

export const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  applied: 'Applied',
  enrolled: 'Won',
  lost: 'Lost',
};

export const SOURCES = ['website', 'whatsapp', 'sms', 'walk-in', 'phone', 'referral', 'event', 'manual'];

export const ACTIVITY_KINDS = ['call', 'email', 'meeting', 'note', 'whatsapp', 'sms', 'system'];

const CLOSED = new Set(['enrolled', 'lost']);

const text = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);
const nowIso = () => new Date().toISOString();

export function isOpen(lead) {
  return !CLOSED.has(lead.stage);
}

/** Open leads per assignee, which is what the max-open limit is checked against. */
export function openCounts(rows) {
  const counts = {};

  for (const lead of rows) {
    if (!lead.assigneeId || !isOpen(lead)) continue;
    counts[lead.assigneeId] = (counts[lead.assigneeId] ?? 0) + 1;
  }

  return counts;
}

export function validateLead(input, { partial = false } = {}) {
  const errors = {};
  const lead = {};

  const name = text(input?.name, 120);

  if (!partial || name !== '') {
    if (!name) errors.name = 'A name is required';
    else lead.name = name;
  }

  if (input?.email !== undefined) {
    const email = text(input.email, 160).toLowerCase();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'That is not a valid email';
    else lead.email = email;
  }

  if (input?.phone !== undefined) {
    const phone = text(input.phone, 40);

    if (phone && !/^[+\d][\d\s-()]{5,}$/.test(phone)) errors.phone = 'That is not a valid phone number';
    else lead.phone = phone;
  }

  if (input?.source !== undefined) {
    const source = text(input.source, 40).toLowerCase();

    if (source && !SOURCES.includes(source)) errors.source = `Source must be one of: ${SOURCES.join(', ')}`;
    else lead.source = source || 'manual';
  }

  if (input?.programme !== undefined) lead.programme = text(input.programme, 120);

  if (input?.stage !== undefined) {
    const stage = text(input.stage, 20).toLowerCase();

    if (!STAGES.includes(stage)) errors.stage = `Stage must be one of: ${STAGES.join(', ')}`;
    else lead.stage = stage;
  }

  if (input?.value !== undefined) {
    const value = Number(input.value);

    if (!Number.isFinite(value) || value < 0) errors.value = 'Value must be a positive number';
    else lead.value = Math.round(value * 100) / 100;
  }

  if (input?.owner !== undefined) lead.owner = text(input.owner, 120);
  if (input?.notes !== undefined) lead.notes = text(input.notes, 2000);

  if (input?.nextFollowUp !== undefined) {
    const when = text(input.nextFollowUp, 40);

    if (when && Number.isNaN(Date.parse(when))) errors.nextFollowUp = 'Use an ISO date';
    else lead.nextFollowUp = when ? new Date(when).toISOString() : '';
  }

  if (input?.fields !== undefined && input.fields && typeof input.fields === 'object') {
    lead.fields = Object.fromEntries(
      Object.entries(input.fields).map(([key, value]) => [text(key, 60), text(value, 500)]),
    );
  }

  return Object.keys(errors).length ? { errors } : { lead };
}

export async function listLeads(workspaceId, { stage, query, assigneeId, unacknowledged } = {}) {
  const rows = await leads.where((lead) => lead.workspaceId === workspaceId);
  const members = await listMembers(workspaceId);
  const names = new Map(members.map((member) => [member.id, member.name]));
  const needle = text(query, 120).toLowerCase();
  const wantedStage = text(stage, 20).toLowerCase();

  return rows
    .filter((lead) => {
      if (wantedStage && lead.stage !== wantedStage) return false;
      if (assigneeId && lead.assigneeId !== assigneeId) return false;
      if (unacknowledged === 'true' && (lead.acknowledgedAt || !lead.ackDeadline)) return false;
      if (!needle) return true;

      return [lead.name, lead.email, lead.phone, lead.programme, lead.notes]
        .some((field) => text(field).toLowerCase().includes(needle));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((lead) => ({
      ...lead,
      assigneeName: lead.assigneeId ? (names.get(lead.assigneeId) ?? 'Unknown') : null,
      overdueSeconds: secondsOverdue(lead),
    }));
}

export async function findLead(id, workspaceId) {
  const lead = await leads.find((row) => row.id === id && row.workspaceId === workspaceId);

  if (!lead) return null;

  const memberRows = await listMembers(workspaceId);
  const names = new Map(memberRows.map((member) => [member.id, member.name]));

  return {
    ...lead,
    assigneeName: lead.assigneeId ? (names.get(lead.assigneeId) ?? 'Unknown') : null,
    overdueSeconds: secondsOverdue(lead),
    activities: await listActivities(workspaceId, { leadId: id }),
  };
}

function secondsOverdue(lead) {
  if (!lead.ackDeadline || lead.acknowledgedAt) return 0;

  const deadline = Date.parse(lead.ackDeadline);

  if (!Number.isFinite(deadline)) return 0;

  return Math.max(0, Math.round((Date.now() - deadline) / 1000));
}

/**
 * Create a lead, assign it by round-robin, start its acknowledgement clock and tell
 * someone about it. Every side effect is recorded.
 */
export async function createLead({ workspaceId, input, actorId = null, actorName = 'system' }) {
  const { lead, errors } = validateLead(input);

  if (errors) return { errors };

  const settings = await getSettings(workspaceId);
  const members = await listMembers(workspaceId);
  const existing = await leads.where((row) => row.workspaceId === workspaceId);
  const counts = openCounts(existing);

  const assignee = pickRoundRobin(members, counts, settings);

  const created = await leads.insert({
    workspaceId,
    name: lead.name,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    source: lead.source ?? 'manual',
    programme: lead.programme ?? '',
    stage: lead.stage ?? 'new',
    value: lead.value ?? 0,
    notes: lead.notes ?? '',
    nextFollowUp: lead.nextFollowUp ?? '',
    fields: lead.fields ?? {},
    assigneeId: assignee?.id ?? null,
    acknowledgedAt: null,
    ackDeadline: assignee
      ? new Date(Date.now() + settings.acknowledgeSeconds * 1000).toISOString()
      : null,
    escalationLevel: 0,
    escalatedTo: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  if (assignee) {
    await db.collection('members').mutate((rows) => {
      const member = rows.find((row) => row.id === assignee.id);
      if (member) member.lastAssignedAt = created.createdAt;
    });
  }

  await addActivity({
    workspaceId,
    leadId: created.id,
    kind: 'system',
    summary: assignee
      ? `Lead created (${created.source}) and assigned to ${assignee.name}`
      : `Lead created (${created.source}) with nobody available to assign`,
    by: actorName,
  });

  await audit({
    workspaceId,
    actorId,
    action: 'lead.created',
    target: created.id,
    metadata: { source: created.source, assigneeId: assignee?.id ?? null },
  });

  await notify({
    workspaceId,
    leadId: created.id,
    title: assignee ? `New lead: ${created.name}` : `Unassigned lead: ${created.name}`,
    body: assignee
      ? `${created.name} arrived from ${created.source} and was assigned to ${assignee.name}. Acknowledge within ${settings.acknowledgeSeconds}s.`
      : `${created.name} arrived from ${created.source} but no member was under their open-lead limit.`,
    settings,
  });

  return { lead: created, assignee };
}

export async function acknowledgeLead({ workspaceId, id, actorId = null, actorName = 'system' }) {
  const settings = await getSettings(workspaceId);
  let result = null;

  await leads.mutate((rows) => {
    const lead = rows.find((row) => row.id === id && row.workspaceId === workspaceId);
    if (!lead) return;

    lead.acknowledgedAt = nowIso();
    lead.ackDeadline = null;
    lead.updatedAt = nowIso();
    result = lead;
  });

  if (!result) return { missing: true };

  await addActivity({
    workspaceId,
    leadId: id,
    kind: 'system',
    summary: 'Lead acknowledged — escalation stopped',
    by: actorName,
  });

  await audit({
    workspaceId,
    actorId,
    action: 'lead.acknowledged',
    target: id,
    metadata: { secondsOverdue: secondsOverdue(result) },
  });

  void settings;

  return { lead: result };
}

/**
 * Apply every escalation that is due. Called by the ticker, and by an endpoint so a
 * demo can trigger it deterministically instead of waiting.
 */
export async function escalateDue({ now = Date.now(), workspaceId = null } = {}) {
  const workspaceRows = workspaceId
    ? [{ id: workspaceId }]
    : await db.collection('workspaces').read();

  const applied = [];

  for (const workspace of workspaceRows) {
    const id = workspace.id;
    const settings = await getSettings(id);
    const members = await listMembers(id);
    const rows = await leads.where((lead) => lead.workspaceId === id);
    const counts = openCounts(rows);

    for (const lead of rows) {
      const due = dueSteps({ lead, settings, now });

      if (!due) continue;

      let currentAssigneeId = lead.assigneeId;

      for (const { index, step } of due.due) {
        const target = resolveTarget(step.to, {
          members,
          openCounts: counts,
          settings,
          currentAssigneeId,
        });

        const fromName =
          members.find((member) => member.id === currentAssigneeId)?.name ?? 'nobody';
        const toName = target?.name ?? 'nobody';

        await leads.mutate((all) => {
          const row = all.find((entry) => entry.id === lead.id);

          if (!row) return;

          row.escalationLevel = index + 1;
          row.escalatedTo = target?.id ?? null;
          row.updatedAt = nowIso();

          if (target) {
            // The new owner gets their own clock, otherwise the next step would fire
            // immediately on the same overdue lead.
            row.assigneeId = target.id;
            row.ackDeadline = new Date(
              now + settings.acknowledgeSeconds * 1000,
            ).toISOString();
          }
        });

        if (target) {
          await db.collection('members').mutate((all) => {
            const member = all.find((entry) => entry.id === target.id);
            if (member) member.lastAssignedAt = nowIso();
          });

          counts[target.id] = (counts[target.id] ?? 0) + 1;

          if (currentAssigneeId) {
            counts[currentAssigneeId] = Math.max(0, (counts[currentAssigneeId] ?? 1) - 1);
          }
        }

        currentAssigneeId = target?.id ?? currentAssigneeId;

        const summary = target
          ? `Escalated (${step.to}) from ${fromName} to ${toName} after no acknowledgement`
          : `Escalated (${step.to}) but no eligible member was free`;

        await addActivity({
          workspaceId: id,
          leadId: lead.id,
          kind: 'system',
          summary,
          by: 'escalation',
        });

        await audit({
          workspaceId: id,
          actorId: null,
          action: 'lead.escalated',
          target: lead.id,
          metadata: { step: step.to, level: index + 1, to: target?.id ?? null },
        });

        await notify({
          workspaceId: id,
          leadId: lead.id,
          level: index + 1,
          title: `Escalation ${index + 1}: ${lead.name} not acknowledged`,
          body: `${lead.name} (${lead.source}) was not acknowledged. Moved from ${fromName} to ${toName}.`,
          settings,
        });

        applied.push({ leadId: lead.id, level: index + 1, to: step.to, assignee: target?.id ?? null });
      }
    }
  }

  return applied;
}

export async function updateLead({ workspaceId, id, patch, actorId = null, actorName = 'system' }) {
  const settings = await getSettings(workspaceId);
  const { lead: changes, errors } = validateLead(patch, { partial: true });

  if (errors) return { errors };

  const existing = await leads.find((row) => row.id === id && row.workspaceId === workspaceId);

  if (!existing) return { missing: true };

  if (changes.stage) {
    const stage = settings.pipeline.find((entry) => entry.key === changes.stage);
    const merged = { ...existing, ...changes };
    const missing = (stage?.required ?? []).filter((field) => {
      const value = merged[field];

      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      return {
        errors: {
          stage: `This stage needs: ${missing
            .map((field) => (field === 'value' ? 'an opportunity value' : field))
            .join(', ')}`,
        },
      };
    }
  }

  let updated = null;

  await leads.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return;

    Object.assign(row, changes, { updatedAt: nowIso() });

    if (changes.stage === 'enrolled' || changes.stage === 'lost') {
      row.ackDeadline = null;
    }

    updated = row;
  });

  if (changes.stage && changes.stage !== existing.stage) {
    await addActivity({
      workspaceId,
      leadId: id,
      kind: 'system',
      summary: `Stage ${STAGE_LABELS[existing.stage] ?? existing.stage} → ${STAGE_LABELS[changes.stage] ?? changes.stage}`,
      by: actorName,
    });

    await audit({
      workspaceId,
      actorId,
      action: 'lead.stage_changed',
      target: id,
      metadata: { from: existing.stage, to: changes.stage },
    });
  }

  return { lead: updated };
}

export async function assignLead({ workspaceId, id, memberId, actorId = null, actorName = 'system' }) {
  const settings = await getSettings(workspaceId);
  let updated = null;

  await leads.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return;

    row.assigneeId = memberId;
    row.acknowledgedAt = null;
    row.escalationLevel = 0;
    row.escalatedTo = null;
    row.ackDeadline = new Date(Date.now() + settings.acknowledgeSeconds * 1000).toISOString();
    row.updatedAt = nowIso();
    updated = row;
  });

  if (!updated) return { missing: true };

  await audit({ workspaceId, actorId, action: 'lead.assigned', target: id, metadata: { memberId } });

  return { lead: updated };
}

export async function deleteLead({ workspaceId, id, actorId = null }) {
  let removed = null;

  await leads.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);

    if (index === -1) return;

    removed = rows.splice(index, 1)[0];
  });

  if (!removed) return { missing: true };

  await activities.mutate((rows) => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].leadId === id) rows.splice(index, 1);
    }
  });

  await audit({ workspaceId, actorId, action: 'lead.deleted', target: id });

  return { lead: removed };
}

export async function listActivities(workspaceId, { leadId, limit = 50 } = {}) {
  const rows = await activities.where(
    (activity) => activity.workspaceId === workspaceId && (!leadId || activity.leadId === leadId),
  );

  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.min(Number(limit) || 50, 200));
}

export async function addActivity({ workspaceId, leadId, kind, summary, by = 'system' }) {
  return activities.insert({
    workspaceId,
    leadId,
    kind,
    summary: text(summary, 1000),
    by,
    at: nowIso(),
  });
}

export async function leadStats(workspaceId) {
  const rows = await leads.where((lead) => lead.workspaceId === workspaceId);
  const members = await listMembers(workspaceId);
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const byStage = Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  const byAssignee = Object.fromEntries(members.map((member) => [member.id, 0]));
  let pipelineValue = 0;
  let enrolledValue = 0;
  let weekLeads = 0;
  let monthEnrolled = 0;
  let unacknowledged = 0;
  let overdue = 0;

  for (const lead of rows) {
    if (byStage[lead.stage] !== undefined) byStage[lead.stage] += 1;
    if (lead.assigneeId && byAssignee[lead.assigneeId] !== undefined) byAssignee[lead.assigneeId] += 1;

    if (lead.stage !== 'lost' && lead.stage !== 'enrolled') pipelineValue += Number(lead.value ?? 0);

    if (lead.stage === 'enrolled') {
      enrolledValue += Number(lead.value ?? 0);
      if (lead.updatedAt >= monthStart) monthEnrolled += 1;
    }

    if (lead.createdAt >= weekAgo) weekLeads += 1;

    if (isOpen(lead) && lead.ackDeadline && !lead.acknowledgedAt) {
      unacknowledged += 1;
      if (secondsOverdue(lead) > 0) overdue += 1;
    }
  }

  const total = rows.length;
  const enrolled = byStage.enrolled;

  return {
    generatedAt: nowIso(),
    total,
    byStage,
    byAssignee,
    stageLabels: STAGE_LABELS,
    pipelineValue: Math.round(pipelineValue * 100) / 100,
    enrolledValue: Math.round(enrolledValue * 100) / 100,
    weekLeads,
    monthEnrolled,
    conversionRate: total ? Math.round((enrolled / total) * 1000) / 10 : 0,
    unacknowledged,
    overdue,
    activities: (await activities.where((activity) => activity.workspaceId === workspaceId)).length,
    recentLeads: [...rows]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((lead) => ({
        ...lead,
        assigneeName: members.find((member) => member.id === lead.assigneeId)?.name ?? null,
        overdueSeconds: secondsOverdue(lead),
      })),
    recentActivities: await listActivities(workspaceId, { limit: 8 }),
  };
}
