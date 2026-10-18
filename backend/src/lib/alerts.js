import { db } from './db.js';

/**
 * External alerts, with the attempt recorded whether or not it worked.
 *
 * The spec's promise is that a missed lead produces a *real* external alert, so every
 * send is persisted with its status and error: the integrations page can show a failed
 * webhook instead of pretending it was delivered, and a demo can point the generic
 * webhook at any request bin.
 */
const alerts = db.collection('alerts');

const TIMEOUT_MS = Number(process.env.ALERT_TIMEOUT_MS || 6000);

async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`${response.status} ${text}`.trim());
  }
}

/** Which channels the workspace has configured, in the order they are tried. */
export function configuredChannels(settings) {
  const alerts = settings?.alerts ?? {};
  const channels = [];

  if (alerts.webhookUrl) channels.push({ channel: 'webhook', target: alerts.webhookUrl });
  if (alerts.slackWebhookUrl) channels.push({ channel: 'slack', target: alerts.slackWebhookUrl });
  if (alerts.telegramBotToken && alerts.telegramChatId) {
    channels.push({
      channel: 'telegram',
      target: `chat:${alerts.telegramChatId}`,
    });
  }

  return channels;
}

/**
 * A member's own alert destinations, in the same shape as the workspace channels.
 *
 * Stored on the member because an escalation belongs to a person; falls back to the
 * workspace's channels when they kept their own empty. Telegram here carries the member's
 * chat id and uses THE WORKSPACE's bot token, so one shared bot sends personal messages
 * without every member provisioning their own.
 */
export function channelsForMember(member, settings) {
  const routing = member?.notificationRouting ?? {};
  const channels = [];

  if (routing.webhookUrl) channels.push({ channel: 'webhook', target: routing.webhookUrl });
  if (routing.slackWebhookUrl) channels.push({ channel: 'slack', target: routing.slackWebhookUrl });

  if (routing.telegramChatId && settings?.alerts?.telegramBotToken) {
    channels.push({ channel: 'telegram', target: `chat:${routing.telegramChatId}` });
  }

  return channels;
}

/** The deep link an alert carries, so the recipient lands on the record, not a dashboard. */
export function leadUrl(leadId) {
  const origin = (process.env.PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');

  return leadId ? `${origin}/crm/${leadId}` : origin;
}

function payloadFor(channel, message, settings) {
  const url = leadUrl(message.leadId);
  const line = `${message.title}\n${message.body}\n${url}`;

  if (channel === 'slack') {
    return { text: `*${message.title}*\n${message.body}\n<${url}|Open the lead>` };
  }

  if (channel === 'telegram') {
    return {
      url: `https://api.telegram.org/bot${settings.alerts.telegramBotToken}/sendMessage`,
      body: { chat_id: settings.alerts.telegramChatId, text: line },
    };
  }

  return {
    title: message.title,
    body: message.body,
    leadId: message.leadId ?? null,
    leadUrl: url,
    level: message.level ?? null,
    at: new Date().toISOString(),
  };
}

/**
 * How many times a failing channel is tried before it is left as failed. Recorded per
 * attempt, so an admin can see the pattern instead of a single ambiguous line. Small on
 * purpose: a dead endpoint burns real seconds on the escalation path.
 */
const RETRY_ATTEMPTS = Number(process.env.ALERT_RETRY_ATTEMPTS ?? 2);

/** Wait between retries, milliseconds: 800, then 1600. */
const backoff = (attempt) => 400 * 2 ** (attempt - 1);

/**
 * Send one alert to every configured channel — with the new owner's own destinations first
 * when they are set, because "your lead needs a reply" belongs on that person's Telegram,
 * not on a shared channel that everyone mutes.
 *
 * Every attempt is recorded, including retries; the caller can show "no channel configured"
 * honestly.
 */
export async function notify({ workspaceId, leadId = null, title, body, level = null, settings, destinations = null }) {
  const channels = destinations?.length > 0 ? destinations : configuredChannels(settings);
  const now = new Date().toISOString();

  if (channels.length === 0) {
    const record = await alerts.insert({
      workspaceId,
      leadId,
      channel: 'none',
      target: '',
      title,
      body,
      level,
      status: 'skipped',
      error: 'No alert channel configured',
      at: now,
    });

    return [record];
  }

  const attempts = [];

  for (const { channel, target } of channels) {
    const prepared = payloadFor(channel, { title, body, leadId, level }, settings);

    let outcome = null;

    // Retried attempts happen with a short sleep between them and are recorded as their own
    // attempt row, so the history shows "tried twice, failed twice" rather than one error.
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, backoff(attempt)));

      try {
        if (channel === 'telegram') {
          await post(prepared.url, prepared.body);
        } else {
          await post(target, prepared);
        }

        outcome = {
          status: 'sent',
          error: null,
        };
        break;
      } catch (error) {
        outcome = { status: 'failed', error: String(error.message ?? error).slice(0, 300), attempt };
      }
    }

    attempts.push(
      await alerts.insert({
        workspaceId,
        leadId,
        channel,
        target,
        title,
        body,
        level,
        status: outcome.status,
        attempt: outcome.attempt ?? 1,
        error: outcome.error,
        at: new Date().toISOString(),
      }),
    );
  }

  return attempts;
}

export async function listAlerts(workspaceId, limit = 50) {
  const rows = await alerts.where((alert) => alert.workspaceId === workspaceId);

  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.min(limit, 200));
}
