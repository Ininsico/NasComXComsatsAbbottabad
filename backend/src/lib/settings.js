import { db } from './db.js';

/**
 * Per-workspace configuration. Everything the spec calls "configurable" lives here,
 * so one company can run a 30-second acknowledgement timer in a demo while another
 * uses 15 minutes in production.
 */
const settings = db.collection('workspace-settings');

export const DEFAULTS = {
  // How long a new lead may sit unacknowledged before escalation begins.
  acknowledgeSeconds: 120,
  // Whether the public website form may create leads in this workspace.
  publicIntake: false,
  // The ladder, in order. `to` is resolved against the workspace's members.
  escalation: [
    { afterSeconds: 60, to: 'next' },
    { afterSeconds: 180, to: 'backup' },
    { afterSeconds: 300, to: 'manager' },
  ],
  maxOpenLeads: 5,
  // A lead nobody has touched for this long shows up in the recovery queue.
  idleHours: 24,
  timezone: 'Asia/Karachi',
  businessHours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  // Stage-specific required fields: a lead cannot enter a stage until these are set.
  // isClosed stops the acknowledgement clock, isWon counts as revenue. Keys are stable
  // identifiers — renaming changes the label, not the key.
  pipeline: [
    { key: 'new', label: 'New', order: 1, required: [], isClosed: false, isWon: false },
    { key: 'contacted', label: 'Contacted', order: 2, required: [], isClosed: false, isWon: false },
    { key: 'qualified', label: 'Qualified', order: 3, required: ['email'], isClosed: false, isWon: false },
    { key: 'proposal', label: 'Proposal', order: 4, required: ['email', 'phone'], isClosed: false, isWon: false },
    { key: 'won', label: 'Won', order: 5, required: ['email', 'phone', 'value'], isClosed: true, isWon: true },
    { key: 'lost', label: 'Lost', order: 6, required: [], isClosed: true, isWon: false },
  ],
  // Admin-defined custom fields rendered on the lead form and detail page. Validated
  // server-side on save: type checks, dropdown options, required.
  customFields: [],
  alerts: {
    // A generic webhook works with anything; Slack and Telegram are convenience shapes.
    webhookUrl: '',
    slackWebhookUrl: '',
    telegramBotToken: '',
    telegramChatId: '',
  },
};

function merge(base, patch) {
  // An explicitly-undefined alerts key means "keep what is stored" — the integrations page
  // blanks secret fields rather than round-tripping them, so a save must not clobber a
  // stored bot token with undefined.
  const alertPatch = {};

  for (const [key, value] of Object.entries(patch?.alerts ?? {})) {
    if (value !== undefined) alertPatch[key] = value;
  }

  return {
    ...base,
    ...patch,
    alerts: { ...base.alerts, ...alertPatch },
    businessHours: { ...base.businessHours, ...(patch?.businessHours ?? {}) },
  };
}

export async function getSettings(workspaceId) {
  const row = await settings.find((entry) => entry.workspaceId === workspaceId);

  if (!row) return { workspaceId, ...DEFAULTS };

  const { id, ...rest } = row;

  return { ...merge(DEFAULTS, rest), workspaceId };
}

export async function saveSettings(workspaceId, patch) {
  const current = await getSettings(workspaceId);
  const next = merge(current, patch ?? {});

  // Numbers arrive from forms as strings; keep them numeric and sane. The lower bound
  // is one second on purpose: a demo has to be able to watch escalation happen.
  next.acknowledgeSeconds = clampInt(next.acknowledgeSeconds, 1, 86400, DEFAULTS.acknowledgeSeconds);
  next.maxOpenLeads = clampInt(next.maxOpenLeads, 1, 500, DEFAULTS.maxOpenLeads);

  if (Array.isArray(next.escalation) && next.escalation.length > 0) {
    next.escalation = next.escalation
      .map((step) => ({
        afterSeconds: clampInt(step.afterSeconds, 0, 86400, 60),
        to: ['next', 'backup', 'manager'].includes(step.to) ? step.to : 'next',
      }))
      .sort((a, b) => a.afterSeconds - b.afterSeconds);
  } else {
    next.escalation = DEFAULTS.escalation;
  }

  // The pipeline is config, not code: normalise what the editor sends. Keys are slugified
  // and unique, order is the array order, and a closed stage must know whether it counts
  // as a win (that is what the dashboard's conversion and revenue read).
  if (Array.isArray(next.pipeline) && next.pipeline.length > 0) {
    const seen = new Set();

    next.pipeline = next.pipeline.map((stage, index) => {
      let key = text(stage.key ?? stage.label, 40)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (!key || seen.has(key)) key = `${key || 'stage'}-${index + 1}`;
      seen.add(key);

      return {
        key,
        label: text(stage.label ?? key, 60),
        order: index + 1,
        required: Array.isArray(stage.required) ? stage.required.filter(Boolean) : [],
        isClosed: Boolean(stage.isClosed),
        isWon: Boolean(stage.isClosed && stage.isWon),
      };
    });
  } else {
    next.pipeline = DEFAULTS.pipeline;
  }

  // Custom fields: normalise the definitions the editor sends. Type and shape are checked
  // here so the lead validator can trust them when a lead is written.
  if (Array.isArray(next.customFields) && next.customFields.length > 0) {
    const TYPES = ['text', 'number', 'date', 'dropdown', 'checkbox'];
    const seen = new Set();

    next.customFields = next.customFields
      .map((field, index) => {
        let key = text(field.key ?? field.label, 40)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        if (!key || seen.has(key)) key = `${key || 'field'}-${index + 1}`;
        seen.add(key);

        const type = TYPES.includes(field.type) ? field.type : 'text';

        return {
          key,
          label: text(field.label ?? key, 60),
          type,
          options: type === 'dropdown' ? (Array.isArray(field.options) ? field.options.filter(Boolean) : []) : [],
          required: Boolean(field.required),
          order: index + 1,
        };
      })
      .filter((field) => field.type !== 'dropdown' || field.options.length > 0);
  } else if (next.customFields !== undefined) {
    next.customFields = [];
  }

  await settings.mutate((rows) => {
    const index = rows.findIndex((row) => row.workspaceId === workspaceId);
    const record = { id: index === -1 ? undefined : rows[index].id, ...next };

    if (index === -1) rows.push(record);
    else rows[index] = { ...rows[index], ...next };
  });

  return getSettings(workspaceId);
}

const text = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(Math.max(number, min), max);
}
