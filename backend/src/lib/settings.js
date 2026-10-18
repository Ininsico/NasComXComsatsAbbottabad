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
  pipeline: [
    { key: 'new', label: 'New', required: [] },
    { key: 'contacted', label: 'Contacted', required: [] },
    { key: 'qualified', label: 'Qualified', required: ['email'] },
    { key: 'proposal', label: 'Proposal', required: ['email', 'phone'] },
    { key: 'won', label: 'Won', required: ['email', 'phone', 'value'] },
    { key: 'lost', label: 'Lost', required: [] },
  ],
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
  return {
    ...base,
    ...patch,
    alerts: { ...base.alerts, ...(patch?.alerts ?? {}) },
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

  await settings.mutate((rows) => {
    const index = rows.findIndex((row) => row.workspaceId === workspaceId);
    const record = { id: index === -1 ? undefined : rows[index].id, ...next };

    if (index === -1) rows.push(record);
    else rows[index] = { ...rows[index], ...next };
  });

  return getSettings(workspaceId);
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(Math.max(number, min), max);
}
