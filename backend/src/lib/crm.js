import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');
const dbFile = join(dataDir, 'crm.json');

let writeQueue = Promise.resolve();

/** The pipeline, in the order a lead moves through it. */
export const STAGES = ['new', 'contacted', 'qualified', 'applied', 'enrolled', 'lost'];

export const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  applied: 'Applied',
  enrolled: 'Enrolled',
  lost: 'Lost',
};

export const SOURCES = ['website', 'walk-in', 'phone', 'referral', 'event', 'whatsapp'];

export const ACTIVITY_KINDS = ['call', 'email', 'meeting', 'note', 'whatsapp'];

function emptyStore() {
  return { leads: [], activities: [] };
}

async function readAll() {
  try {
    const raw = await readFile(dbFile, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
    };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    throw error;
  }
}

async function writeAll(store) {
  await mkdir(dataDir, { recursive: true });

  const temporary = join(dataDir, `.crm.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await rename(temporary, dbFile);
}

/** Serialise mutations so two requests cannot read-modify-write the same file. */
function withLock(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

const text = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

/** Returns { lead } or { errors }, so the route can answer 400 with per-field detail. */
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
    else lead.source = source || 'website';
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

  return Object.keys(errors).length ? { errors } : { lead };
}

export async function listLeads({ stage, query, owner } = {}) {
  const store = await readAll();
  const needle = text(query, 120).toLowerCase();
  const wantedStage = text(stage, 20).toLowerCase();
  const wantedOwner = text(owner, 120).toLowerCase();

  return store.leads
    .filter((lead) => {
      if (wantedStage && lead.stage !== wantedStage) return false;
      if (wantedOwner && text(lead.owner, 120).toLowerCase() !== wantedOwner) return false;
      if (!needle) return true;

      return [lead.name, lead.email, lead.phone, lead.programme, lead.notes]
        .some((field) => text(field).toLowerCase().includes(needle));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findLead(id) {
  const store = await readAll();

  return store.leads.find((lead) => lead.id === id) ?? null;
}

export async function createLead(input, actor) {
  const { lead, errors } = validateLead(input);

  if (errors) return { errors };

  return withLock(async () => {
    const store = await readAll();
    const now = new Date().toISOString();

    const created = {
      id: randomUUID(),
      name: lead.name,
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      source: lead.source ?? 'website',
      programme: lead.programme ?? '',
      stage: lead.stage ?? 'new',
      value: lead.value ?? 0,
      owner: lead.owner || actor || '',
      notes: lead.notes ?? '',
      nextFollowUp: lead.nextFollowUp ?? '',
      createdAt: now,
      updatedAt: now,
    };

    store.leads.push(created);
    store.activities.push({
      id: randomUUID(),
      leadId: created.id,
      kind: 'note',
      summary: `Lead created (${created.source})`,
      by: actor ?? '',
      at: now,
    });

    await writeAll(store);

    return { lead: created };
  });
}

export async function updateLead(id, patch, actor) {
  const { lead, errors } = validateLead(patch, { partial: true });

  if (errors) return { errors };

  return withLock(async () => {
    const store = await readAll();
    const index = store.leads.findIndex((entry) => entry.id === id);

    if (index === -1) return { missing: true };

    const previous = store.leads[index];
    const updated = { ...previous, ...lead, updatedAt: new Date().toISOString() };

    store.leads[index] = updated;

    if (lead.stage && lead.stage !== previous.stage) {
      store.activities.push({
        id: randomUUID(),
        leadId: id,
        kind: 'note',
        summary: `Stage ${STAGE_LABELS[previous.stage] ?? previous.stage} → ${STAGE_LABELS[lead.stage] ?? lead.stage}`,
        by: actor ?? '',
        at: updated.updatedAt,
      });
    }

    await writeAll(store);

    return { lead: updated };
  });
}

export async function deleteLead(id) {
  return withLock(async () => {
    const store = await readAll();
    const index = store.leads.findIndex((entry) => entry.id === id);

    if (index === -1) return { missing: true };

    const [removed] = store.leads.splice(index, 1);
    store.activities = store.activities.filter((activity) => activity.leadId !== id);

    await writeAll(store);

    return { lead: removed };
  });
}

export async function listActivities({ leadId, limit = 50 } = {}) {
  const store = await readAll();
  const wanted = text(leadId, 80);
  const byId = new Map(store.leads.map((lead) => [lead.id, lead]));

  return store.activities
    .filter((activity) => (wanted ? activity.leadId === wanted : true))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.min(Number(limit) || 50, 200))
    .map((activity) => ({
      ...activity,
      leadName: byId.get(activity.leadId)?.name ?? 'Unknown lead',
    }));
}

export async function addActivity({ leadId, kind, summary }, actor) {
  const errors = {};
  const id = text(leadId, 80);
  const type = text(kind, 20).toLowerCase() || 'note';
  const body = text(summary, 1000);

  if (!id) errors.leadId = 'A lead is required';
  if (!ACTIVITY_KINDS.includes(type)) errors.kind = `Kind must be one of: ${ACTIVITY_KINDS.join(', ')}`;
  if (!body) errors.summary = 'Write what happened';

  if (Object.keys(errors).length) return { errors };

  return withLock(async () => {
    const store = await readAll();
    const lead = store.leads.find((entry) => entry.id === id);

    if (!lead) return { missing: true };

    const activity = {
      id: randomUUID(),
      leadId: id,
      kind: type,
      summary: body,
      by: actor ?? '',
      at: new Date().toISOString(),
    };

    store.activities.push(activity);
    lead.updatedAt = activity.at;

    if (lead.stage === 'new' && type !== 'note') lead.stage = 'contacted';

    await writeAll(store);

    return { activity };
  });
}

/** Numbers for the CRM overview. */
export async function crmStats() {
  const store = await readAll();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const byStage = Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  let pipelineValue = 0;
  let enrolledValue = 0;
  let weekLeads = 0;
  let monthEnrolled = 0;

  for (const lead of store.leads) {
    if (byStage[lead.stage] !== undefined) byStage[lead.stage] += 1;

    if (lead.stage !== 'lost' && lead.stage !== 'enrolled') pipelineValue += Number(lead.value ?? 0);

    if (lead.stage === 'enrolled') {
      enrolledValue += Number(lead.value ?? 0);
      if (lead.updatedAt >= monthStart) monthEnrolled += 1;
    }

    if (lead.createdAt >= new Date(weekAgo).toISOString()) weekLeads += 1;
  }

  const total = store.leads.length;
  const enrolled = byStage.enrolled;

  return {
    generatedAt: new Date().toISOString(),
    total,
    byStage,
    stageLabels: STAGE_LABELS,
    pipelineValue: Math.round(pipelineValue * 100) / 100,
    enrolledValue: Math.round(enrolledValue * 100) / 100,
    weekLeads,
    monthEnrolled,
    conversionRate: total ? Math.round((enrolled / total) * 1000) / 10 : 0,
    activities: store.activities.length,
    recentLeads: [...store.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    recentActivities: await listActivities({ limit: 8 }),
  };
}
