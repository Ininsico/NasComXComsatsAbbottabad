import { db } from './db.js';
import { record as audit } from './audit.js';
import { channelsForMember, notify } from './alerts.js';
import { dueSteps, pickRoundRobin, resolveTarget } from './assignment.js';
import { findOrCreateCompany } from './companies.js';
import { createContact, findContactForIdentity, listContacts, updateContact } from './contacts.js';
import { listMembers } from './members.js';
import { getSettings } from './settings.js';

const leads = db.collection('leads');
const activities = db.collection('activities');

export const SOURCES = ['website', 'whatsapp', 'sms', 'walk-in', 'phone', 'referral', 'event', 'manual'];

export const ACTIVITY_KINDS = ['call', 'email', 'meeting', 'note', 'whatsapp', 'sms', 'system'];

const text = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);
const nowIso = () => new Date().toISOString();

/**
 * Stages are workspace configuration, not code. The key set lives in settings.pipeline;
 * these helpers read it so an Admin can add, rename, reorder and close stages without a
 * deploy. `won` is a flag on the stage, which is what conversion and revenue count.
 */
export function stageKeys(settings) {
  return (settings?.pipeline ?? []).map((stage) => stage.key);
}

export function closedKeys(settings) {
  return new Set((settings?.pipeline ?? []).filter((stage) => stage.isClosed).map((stage) => stage.key));
}

export function stageLabelsFrom(settingsPipeline) {
  return Object.fromEntries(
    (settingsPipeline ?? []).map((stage) => [stage.key, stage.label]),
  );
}

export function isWonStage(settings, key) {
  const stage = (settings?.pipeline ?? []).find((entry) => entry.key === key);

  return Boolean(stage?.isClosed && stage?.isWon);
}

export function isOpen(lead, settings) {
  return !closedKeys(settings).has(lead.stage);
}

/** Open leads per assignee, which is what the max-open limit is checked against. */
export function openCounts(rows, settings) {
  const closed = closedKeys(settings);
  const counts = {};

  for (const lead of rows) {
    if (!lead.assigneeId || closed.has(lead.stage)) continue;
    counts[lead.assigneeId] = (counts[lead.assigneeId] ?? 0) + 1;
  }

  return counts;
}

export function validateLead(input, { partial = false, stages = null } = {}) {
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

  if (input?.company !== undefined) lead.company = text(input.company, 120);

  if (input?.stage !== undefined) {
    const stage = text(input.stage, 60).toLowerCase();

    // The key set is the workspace's pipeline config; without it (should not happen) fall
    // back to accepting the value rather than blocking every save.
    if (stages && !stages.includes(stage)) {
      errors.stage = `Stage must be one of: ${stages.join(', ')}`;
    } else {
      lead.stage = stage;
    }
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

  return hydrate(
    workspaceId,
    rows
      .filter((lead) => {
        if (wantedStage && lead.stage !== wantedStage) return false;
        if (assigneeId && lead.assigneeId !== assigneeId) return false;
        if (unacknowledged === 'true' && (lead.acknowledgedAt || !lead.ackDeadline)) return false;
        if (!needle) return true;

        return [lead.name, lead.email, lead.phone, lead.company, lead.notes]
          .some((field) => text(field).toLowerCase().includes(needle));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((lead) => ({
        ...lead,
        assigneeName: lead.assigneeId ? (names.get(lead.assigneeId) ?? 'Unknown') : null,
        overdueSeconds: secondsOverdue(lead),
      })),
  );
}

export async function findLead(id, workspaceId) {
  const leadRow = await leads.find((row) => row.id === id && row.workspaceId === workspaceId);

  if (!leadRow) return null;

  const [activities, [hydratedLead]] = await Promise.all([
    listActivities(workspaceId, { leadId: id }),
    (async () => {
      const memberRows = await listMembers(workspaceId);
      const names = new Map(memberRows.map((member) => [member.id, member.name]));

      return hydrate(workspaceId, [
        {
          ...leadRow,
          assigneeName: leadRow.assigneeId ? (names.get(leadRow.assigneeId) ?? 'Unknown') : null,
          overdueSeconds: secondsOverdue(leadRow),
        },
      ]);
    })(),
  ]);

  return { ...hydratedLead, activities };
}

/**
 * The spec's promise: stage changes are blocked with a clear message until the required
 * fields are set. Where the fields come from is config — this is the required-fields gate
 * the editor feeds.
 */
export async function ensureStageRequirements(settings, stageKey, merged) {
  const stage = (settings?.pipeline ?? []).find((entry) => entry.key === stageKey);
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

  return null;
}

function secondsOverdue(lead) {
  if (!lead.ackDeadline || lead.acknowledgedAt) return 0;

  const deadline = Date.parse(lead.ackDeadline);

  if (!Number.isFinite(deadline)) return 0;

  return Math.max(0, Math.round((Date.now() - deadline) / 1000));
}

/**
 * The parent records, joined in so a lead can be shown as a person under a company.
 * The lead carries its own company name from capture; the contact row is authoritative
 * when the two differ, and a null contact leaves the lead anonymous.
 */
async function hydrate(workspaceId, rows) {
  const [contactRows, companyRows] = await Promise.all([
    listContacts(workspaceId),
    db.collection('companies').where((row) => row.workspaceId === workspaceId),
  ]);

  const contactById = new Map(contactRows.map((row) => [row.id, row]));
  const companyById = new Map(companyRows.map((row) => [row.id, row.name]));

  return rows.map((row) => {
    const contact = row.contactId ? (contactById.get(row.contactId) ?? null) : null;
    const companyId = row.companyId ?? contact?.companyId ?? null;

    return {
      ...row,
      contact,
      contactName: contact?.name ?? null,
      companyId,
      companyName: (companyId ? (companyById.get(companyId) ?? null) : null) ?? row.company ?? null,
    };
  });
}

/**
 * Create a lead, assign it by round-robin, start its acknowledgement clock and tell
 * someone about it. Every side effect is recorded.
 */
export async function createLead({ workspaceId, input, actorId = null, actorName = 'system' }) {
  const settings = await getSettings(workspaceId);
  const { lead, errors } = validateLead(input, { stages: stageKeys(settings) });

  if (errors) return { errors };

  // Custom fields validate against the workspace's definitions, server-side — a type or a
  // dropdown set on the field is enforced here, not in the browser.
  const customFields = validateCustomFields(settings.customFields ?? [], input.fields ?? {}, {});
  const customErrors = Object.fromEntries(
    Object.entries(customFields.errors).map(([key, message]) => [`fields.${key}`, message]),
  );

  if (Object.keys(customErrors).length > 0) {
    return { errors: { ...errors, ...customErrors } };
  }

  lead.stage = lead.stage ?? settings.pipeline[0]?.key ?? 'new';
  lead.fields = { ...(lead.fields ?? {}), ...customFields.values };
  const members = await listMembers(workspaceId);
  const existing = await leads.where((row) => row.workspaceId === workspaceId);
  const counts = openCounts(existing, settings);

  const assignee = pickRoundRobin(members, counts, settings);

  /**
   * The parent records: a company, a contact beneath it, and this opportunity pointing at
   * both. Only a lead with an identity (email or phone) gets a contact, because that is what
   * makes it the same person next time; an anonymous lead stays anonymous rather than
   * quietly becoming junk contacts. An existing identity is reused, never duplicated — the
   * public form and an inbound WhatsApp message land on the same person this way.
   */
  let contactId = null;
  let companyId = null;

  if (lead.email || lead.phone || lead.company) {
    const company = lead.company ? await findOrCreateCompany({ workspaceId, name: lead.company }) : null;

    companyId = company?.id ?? null;

    const existing = await findContactForIdentity(workspaceId, {
      email: lead.contactEmail ?? lead.email,
      phone: lead.phone,
    });

    if (existing) {
      contactId = existing.id;

      // The person is new to this company: adopt it on their contact so the model stays
      // consistent, instead of leaving a dangling opportunity without a company.
      if (companyId && existing.companyId !== companyId) {
        await updateContact({
          workspaceId,
          id: existing.id,
          input: { companyId },
        });
      }
    } else {
      const createdContact = await createContact({
        workspaceId,
        companyId,
        input: {
          name: lead.name || lead.email || lead.phone,
          email: lead.email ?? '',
          phone: lead.phone ?? '',
        },
      });

      contactId = createdContact.contact?.id ?? createdContact.duplicate?.id ?? null;
    }
  }

  const created = await leads.insert({
    workspaceId,
    name: lead.name,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    company: lead.company ?? '',
    contactId,
    companyId,
    source: lead.source ?? 'manual',
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
    // When the clock started for this owner. "Time to first response" is measured from here.
    assignedAt: assignee ? nowIso() : null,
    escalationLevel: 0,
    escalatedAt: null,
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
    metadata: {
      source: created.source,
      assigneeId: assignee?.id ?? null,
      contactId: created.contactId,
      companyId: created.companyId,
    },
  });

  await notify({
    workspaceId,
    leadId: created.id,
    title: assignee ? `New lead: ${created.name}` : `Unassigned lead: ${created.name}`,
    body: assignee
      ? `${created.name} arrived from ${created.source} and was assigned to ${assignee.name}. Acknowledge within ${settings.acknowledgeSeconds}s.`
      : `${created.name} arrived from ${created.source} but no member was under their open-lead limit.`,
    settings,
    destinations: channelsForMember(assignee ?? {}, settings),
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
    const counts = openCounts(rows, settings);

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
          row.escalatedAt = nowIso();
          row.escalatedTo = target?.id ?? null;
          row.updatedAt = row.escalatedAt;

          if (target) {
            // The new owner gets their own clock, otherwise the next step would fire
            // immediately on the same overdue lead.
            row.assigneeId = target.id;
            row.assignedAt = row.escalatedAt;
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
          // The new owner's own destinations come first; the workspace channels are the
          // fallback when a person has not set theirs.
          destinations: channelsForMember(target, settings),
        });

        applied.push({ leadId: lead.id, level: index + 1, to: step.to, assignee: target?.id ?? null });
      }
    }
  }

  return applied;
}

export async function updateLead({ workspaceId, id, patch, actorId = null, actorName = 'system' }) {
  const settings = await getSettings(workspaceId);
  const { lead: changes, errors } = validateLead(patch, {
    partial: true,
    stages: stageKeys(settings),
  });

  if (errors) return { errors };

  const existing = await leads.find((row) => row.id === id && row.workspaceId === workspaceId);

  if (!existing) return { missing: true };

  // Custom fields are validated on every write, against the workspace's definitions.
  if (patch?.fields !== undefined) {
    const custom = validateCustomFields(
      settings.customFields ?? [],
      patch.fields ?? {},
      existing.fields ?? {},
    );

    if (Object.keys(custom.errors).length > 0) {
      return {
        errors: Object.fromEntries(
          Object.entries(custom.errors).map(([key, message]) => [`fields.${key}`, message]),
        ),
      };
    }

    changes.fields = { ...(existing.fields ?? {}), ...custom.values };
  }

  if (changes.stage) {
    const blocked = await ensureStageRequirements(settings, changes.stage, { ...existing, ...changes });

    if (blocked) return blocked;
  }

  let updated = null;

  await leads.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return;

    Object.assign(row, changes, { updatedAt: nowIso() });

    if ((settings.pipeline ?? []).find((stage) => stage.key === changes.stage)?.isClosed) {
      // A closed stage stops the clock: nobody owes a first reply on a finished deal.
      row.ackDeadline = null;
    }

    updated = row;
  });

  if (changes.stage && changes.stage !== existing.stage) {
    await addActivity({
      workspaceId,
      leadId: id,
      kind: 'system',
      summary: `Stage ${stageLabelsFrom(settings.pipeline)[existing.stage] ?? existing.stage} → ${stageLabelsFrom(settings.pipeline)[changes.stage] ?? changes.stage}`,
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

  // Field edits are part of the history too, recording before/after for the fields that
  // change who the customer is or what the deal is worth.
  const EDITABLE = ['name', 'email', 'phone', 'company', 'value', 'notes'];
  const edits = Object.entries(changes).filter(
    ([field, to]) =>
      EDITABLE.includes(field) &&
      String(existing[field] ?? '') !== String(to ?? '') &&
      field !== 'stage',
  );

  if (edits.length > 0) {
    const beforeAfter = Object.fromEntries(
      edits.map(([field, to]) => [
        field,
        { from: existing[field] ?? null, to: to ?? null },
      ]),
    );

    await addActivity({
      workspaceId,
      leadId: id,
      kind: 'system',
      summary: `Updated ${Object.keys(beforeAfter)
        .map((field) => (field === 'value' ? 'opportunity value' : field))
        .join(', ')}`,
      by: actorName,
    });

    await audit({
      workspaceId,
      actorId,
      action: 'lead.field_edited',
      target: id,
      metadata: { changes: beforeAfter },
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
    row.escalatedAt = null;
    row.escalatedTo = null;
    row.ackDeadline = new Date(Date.now() + settings.acknowledgeSeconds * 1000).toISOString();
    row.assignedAt = nowIso();
    row.updatedAt = row.assignedAt;
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

/**
 * The stage keys were renamed when the education vocabulary was dropped (applied ->
 * proposal, enrolled -> won). Stored leads still carry the old keys, which would make them
 * invisible on a board built from the new ones, so this rewrites them once at boot.
 */
export async function migrateStageKeys() {
  const RENAMES = { applied: 'proposal', enrolled: 'won' };
  let changed = 0;

  await leads.mutate((rows) => {
    for (const row of rows) {
      const next = RENAMES[row.stage];

      if (next) {
        row.stage = next;
        changed += 1;
      }
    }
  });

  return changed;
}

/**
 * Give every stored lead its contact and company, once.
 *
 * Idempotent on purpose: a second boot must not fork a second contact for the same person.
 * The "Company:" line capturers typed into the notes is promoted into a real company, which
 * is how the public form expressed it before companies existed as records.
 */
export async function migrateContacts() {
  const rows = await leads.where((row) => !row.contactId);

  let linked = 0;

  for (const lead of rows) {
    const companyFromNotes = /^Company:\s*(.+)\s*$/m.exec(lead.notes ?? '')?.[1]?.trim() ?? '';
    const companyName = lead.company || companyFromNotes;
    let companyId = null;

    if (companyName) {
      const company = await findOrCreateCompany({ workspaceId: lead.workspaceId, name: companyName });

      companyId = company?.id ?? null;
    }

    let contactId = null;

    if (lead.email || lead.phone) {
      const existing = await findContactForIdentity(lead.workspaceId, {
        email: lead.email,
        phone: lead.phone,
      });

      if (existing) {
        contactId = existing.id;
        companyId = companyId ?? existing.companyId;

        if (companyId && existing.companyId !== companyId) {
          await updateContact({
            workspaceId: lead.workspaceId,
            id: existing.id,
            input: { companyId },
          });
        }
      } else {
        const createdContact = await createContact({
          workspaceId: lead.workspaceId,
          companyId,
          input: {
            name: lead.name || lead.email || lead.phone,
            email: lead.email ?? '',
            phone: lead.phone ?? '',
          },
        });

        contactId = createdContact.contact?.id ?? createdContact.duplicate?.id ?? null;
      }
    }

    if (!contactId && !companyId) continue;

    await leads.mutate((all) => {
      const row = all.find((entry) => entry.id === lead.id);

      if (!row) return;

      // Only when still empty: a concurrent boot must not overwrite a link.
      if (!row.contactId) row.contactId = contactId;
      if (!row.companyId) row.companyId = companyId;
      if (!row.company && companyName) row.company = companyName;
    });

    linked += 1;
  }

  return linked;
}

export async function listActivities(workspaceId, { leadId, limit = 50 } = {}) {
  const rows = await activities.where(
    (activity) => activity.workspaceId === workspaceId && (!leadId || activity.leadId === leadId),
  );

  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.min(Number(limit) || 50, 200));
}

/**
 * One entry in the lead's timeline. The activity kinds cover the spec's list — note, stage
 * change, assignment, message, payment, appointment, system — and callers make sure an
 * acknowledgement-shaped action (any of them) clears the clock, because that is the
 * contract the countdown is built on.
 */
export async function addActivity({ workspaceId, leadId, kind, summary, by = 'system' }) {
  const created = await activities.insert({
    workspaceId,
    leadId,
    kind,
    summary: text(summary, 1000),
    by,
    at: nowIso(),
  });

  // Recording any action IS the acknowledgement. Without this the clock keeps running past
  // a note someone just wrote, which is exactly the disagreement the queue should not have.
  if (leadId && kind !== 'system') {
    await leads.mutate((rows) => {
      const row = rows.find((entry) => entry.id === leadId && entry.workspaceId === workspaceId);

      if (!row || row.acknowledgedAt) return null;

      row.acknowledgedAt = nowIso();

      return row;
    });
  }

  return created;
}

export function validateCustomFields(definitions, input = {}, existing = {}) {
  const errors = {};
  const values = {};

  for (const field of definitions ?? []) {
    const raw = input[field.key];
    const prior = existing?.[field.key];

    // A patch that does not mention the field keeps whatever is stored.
    if (raw === undefined && prior !== undefined) {
      values[field.key] = prior;
      continue;
    }

    const value = raw === undefined || raw === null ? '' : raw;

    if (field.type === 'checkbox') {
      values[field.key] = Boolean(value);
      continue;
    }

    const stringValue = String(value).trim();

    if (!stringValue) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      else values[field.key] = '';
      continue;
    }

    if (field.type === 'number') {
      const number = Number(stringValue);

      if (!Number.isFinite(number)) errors[field.key] = `${field.label} must be a number`;
      else values[field.key] = number;
      continue;
    }

    if (field.type === 'date') {
      const parsed = Date.parse(stringValue);

      if (Number.isNaN(parsed)) errors[field.key] = `${field.label} must be a date`;
      else values[field.key] = new Date(parsed).toISOString().slice(0, 10);
      continue;
    }

    if (field.type === 'dropdown') {
      if (!(field.options ?? []).includes(stringValue)) {
        errors[field.key] = `${field.label} must be one of: ${(field.options ?? []).join(', ')}`;
      } else {
        values[field.key] = stringValue;
      }
      continue;
    }

    values[field.key] = stringValue.slice(0, 500);
  }

  return { errors, values };
}

export async function leadStats(workspaceId) {
  const settings = await getSettings(workspaceId);
  const rows = await leads.where((lead) => lead.workspaceId === workspaceId);
  const members = await listMembers(workspaceId);
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const closed = closedKeys(settings);
  const wonStages = new Set(
    (settings.pipeline ?? []).filter((stage) => stage.isClosed && stage.isWon).map((stage) => stage.key),
  );

  const byStage = Object.fromEntries(stageKeys(settings).map((stage) => [stage, 0]));
  const byAssignee = Object.fromEntries(members.map((member) => [member.id, 0]));
  let pipelineValue = 0;
  let wonValue = 0;
  let weekLeads = 0;
  let monthWon = 0;
  let unacknowledged = 0;
  let overdue = 0;
  let firstResponseTotal = 0;
  let firstResponseCount = 0;
  let escalations24h = 0;
  let newToday = 0;
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();

  for (const lead of rows) {
    if (byStage[lead.stage] !== undefined) byStage[lead.stage] += 1;

    if (lead.acknowledgedAt) {
      const from = Date.parse(lead.assignedAt ?? lead.createdAt);
      const seconds = (Date.parse(lead.acknowledgedAt) - from) / 1000;

      if (Number.isFinite(seconds) && seconds >= 0) {
        firstResponseTotal += seconds;
        firstResponseCount += 1;
      }
    }

    if (lead.escalatedAt && lead.escalatedAt >= dayAgo) escalations24h += 1;
    if (lead.createdAt >= dayStart) newToday += 1;

    if (lead.assigneeId && byAssignee[lead.assigneeId] !== undefined) byAssignee[lead.assigneeId] += 1;

    if (!closed.has(lead.stage)) pipelineValue += Number(lead.value ?? 0);

    if (wonStages.has(lead.stage)) {
      wonValue += Number(lead.value ?? 0);
      if (lead.updatedAt >= monthStart) monthWon += 1;
    }

    if (lead.createdAt >= weekAgo) weekLeads += 1;

    if (!closed.has(lead.stage) && lead.ackDeadline && !lead.acknowledgedAt) {
      unacknowledged += 1;
      if (secondsOverdue(lead) > 0) overdue += 1;
    }
  }

  const total = rows.length;
  const won = [...wonStages].reduce((count, key) => count + (byStage[key] ?? 0), 0);

  return {
    generatedAt: nowIso(),
    total,
    byStage,
    byAssignee,
    stageLabels: stageLabelsFrom(settings.pipeline),
    pipelineValue: Math.round(pipelineValue * 100) / 100,
    wonValue: Math.round(wonValue * 100) / 100,
    weekLeads,
    monthWon,
    conversionRate: total ? Math.round((won / total) * 1000) / 10 : 0,
    unacknowledged,
    overdue,
    newToday,
    escalations24h,
    // Null rather than zero when nothing has been answered yet — an average of nothing
    // is not "0 seconds", and the dashboard shows it as "no data" instead of a lie.
    avgFirstResponseSeconds: firstResponseCount
      ? Math.round(firstResponseTotal / firstResponseCount)
      : null,
    acknowledgedCount: firstResponseCount,
    recoveryCount: (await recoveryQueue(workspaceId)).count,
    availability: members.map((member) => ({
      id: member.id,
      name: member.name,
      level: member.level,
      levelLabel: member.levelLabel,
      available: Boolean(member.available),
      backup: Boolean(member.backup),
      openLeads: byAssignee[member.id] ?? 0,
      openLeadLimit: member.openLeadLimit ?? null,
      lastAssignedAt: member.lastAssignedAt ?? null,
    })),
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

/**
 * The recovery queue: every open lead that needs a human now, each with the reason it is
 * here. Three ways in, all configurable — still unacknowledged past its window, escalated
 * twice or more, or untouched for longer than the workspace's idle period.
 */
export async function recoveryQueue(workspaceId) {
  const rows = await leads.where((lead) => lead.workspaceId === workspaceId);
  const members = await listMembers(workspaceId);
  const settings = await getSettings(workspaceId);
  const now = Date.now();
  const idleMs = Math.max(1, Number(settings.idleHours ?? 24)) * 3600 * 1000;

  const items = [];

  for (const lead of rows) {
    if (closedKeys(settings).has(lead.stage)) continue;

    const reasons = [];
    const overdue = secondsOverdue(lead);

    if (!lead.acknowledgedAt && lead.ackDeadline && overdue > 0) {
      reasons.push({
        code: 'unacknowledged',
        label: `Unacknowledged — ${overdue}s past the deadline`,
      });
    }

    if ((lead.escalationLevel ?? 0) >= 2) {
      reasons.push({
        code: 'escalated',
        label: `Escalated ${lead.escalationLevel} times`,
      });
    }

    const idleFor = now - Date.parse(lead.updatedAt ?? lead.createdAt);

    if (idleFor > idleMs) {
      reasons.push({
        code: 'idle',
        label: `No activity for ${Math.round(idleFor / 3600000)}h (idle limit ${settings.idleHours}h)`,
      });
    }

    if (reasons.length === 0) continue;

    items.push({
      ...lead,
      assigneeName: members.find((member) => member.id === lead.assigneeId)?.name ?? null,
      overdueSeconds: overdue,
      idleHours: Math.round(idleFor / 3600000),
      reasons,
    });
  }

  // Worst first: deepest past the deadline, then the most-escalated.
  items.sort(
    (a, b) =>
      b.overdueSeconds - a.overdueSeconds || (b.escalationLevel ?? 0) - (a.escalationLevel ?? 0),
  );

  return {
    generatedAt: nowIso(),
    idleHours: settings.idleHours,
    acknowledgeSeconds: settings.acknowledgeSeconds,
    count: items.length,
    items,
  };
}
