import { Router } from 'express';
import { config } from '../config.js';
import { listAlerts } from '../lib/alerts.js';
import { requireAuth } from '../lib/auth.js';
import { connectionFor, googleConfigured, redirectUri } from '../lib/calendar.js';
import { workspaceContext } from '../lib/context.js';
import { getSettings } from '../lib/settings.js';
import { stripeConfigured, stripeMode } from '../lib/stripe.js';
import { whatsappStatus } from '../lib/whatsapp.js';

const router = Router();

/**
 * One read of every connector a workspace can attach, so the integrations page shows the
 * real state of each instead of guessing. Nothing here is cached: a connection made a
 * second ago shows up immediately.
 */
router.get('/', requireAuth, workspaceContext, async (req, res) => {
  const workspaceId = req.workspace.id;

  const [connection, settings, alerts, whatsapp] = await Promise.all([
    connectionFor(workspaceId),
    getSettings(workspaceId),
    listAlerts(workspaceId, { limit: 25 }),
    Promise.resolve(whatsappStatus(workspaceId)),
  ]);

  res.json({
    workspace: { id: workspaceId, name: req.workspace.name },
    whatsapp,
    calendar: {
      id: 'google-calendar',
      label: 'Google Calendar',
      configured: googleConfigured(),
      connected: Boolean(connection),
      account: connection?.account ?? null,
      connectedAt: connection?.connectedAt ?? null,
      lastSyncAt: connection?.lastSyncAt ?? null,
      history: (connection?.history ?? []).slice(0, 10),
      redirectUri: redirectUri(),
    },
    payments: {
      stripe: {
        configured: stripeConfigured(),
        mode: stripeMode(),
        currency: config.stripe.currency.toUpperCase(),
      },
      crypto: {
        configured: config.binance.configured,
        asset: config.binance.coin,
        network: config.binance.network,
      },
    },
    alerts: {
      channels: {
        webhookUrl: settings.alerts?.webhookUrl ?? '',
        slackWebhookUrl: settings.alerts?.slackWebhookUrl ?? '',
        telegramBotToken: settings.alerts?.telegramBotToken ?? '',
        telegramChatId: settings.alerts?.telegramChatId ?? '',
      },
      configured:
        Boolean(settings.alerts?.webhookUrl) ||
        Boolean(settings.alerts?.slackWebhookUrl) ||
        Boolean(settings.alerts?.telegramBotToken && settings.alerts?.telegramChatId),
      attempts: alerts.alerts ?? alerts ?? [],
    },
    voice: {
      sttModel: process.env.VOICE_STT_MODEL ?? 'whisper-large-v3-turbo',
      ttsVoice: process.env.VOICE_TTS_VOICE ?? 'en-US-AriaNeural',
    },
  });
});

export default router;
