import {
  CalendarCheck,
  CircleCheckBig,
  CreditCard,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Send,
  Smartphone,
  TriangleAlert,
  Unplug,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { api, calendarApi, integrationsApi, workspaceApi } from '../lib/api.js';

const WHATSAPP_TONES = {
  ready: ['pill--done', 'Connected'],
  qr: ['pill--pending', 'Scan the QR'],
  starting: ['pill--pending', 'Starting'],
  authenticated: ['pill--pending', 'Linking'],
  disconnected: ['pill--problem', 'Disconnected'],
  error: ['pill--problem', 'Error'],
  stopped: ['pill--neutral', 'Not connected'],
};

function Detail({ label, value }) {
  if (!value) return null;

  return (
    <div>
      <span className="label-micro">{label}</span>
      <p style={{ margin: 0, fontSize: '0.8125rem', wordBreak: 'break-word' }}>{value}</p>
    </div>
  );
}

export default function Integrations() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [channels, setChannels] = useState(null);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [testText, setTestText] = useState('');

  const apply = useCallback((payload) => {
    setData(payload);
    setChannels((current) => current ?? payload.alerts?.channels ?? {});
  }, []);

  const fetchAll = useCallback(() => integrationsApi.all(token), [token]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load integrations', message: error.message }),
        ),
    [fetchAll, apply, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payload) => {
        if (active) {
          apply(payload);
          setTokenSaved(Boolean(payload.alerts?.telegramBotTokenSet));
        }
      })
      .catch((error) => {
        if (active) {
          showToast({ tone: 'error', title: 'Could not load integrations', message: error.message });
        }
      });

    // Google sends the browser back here after the consent screen.
    const params = new URLSearchParams(window.location.search);
    const result = params.get('calendar');

    if (result === 'connected') {
      showToast({ tone: 'success', title: 'Google Calendar connected' });
    } else if (result === 'error') {
      showToast({
        tone: 'error',
        title: 'Google Calendar was not connected',
        message: params.get('reason') ?? undefined,
      });
    }

    return () => {
      active = false;
    };
  }, [fetchAll, apply, showToast]);

  // While a QR is on screen it has to stay current: WhatsApp rotates it every ~20s.
  const whatsappStatus = data?.whatsapp?.status;

  useEffect(() => {
    if (whatsappStatus !== 'qr' && whatsappStatus !== 'starting') return undefined;

    const timer = setInterval(() => {
      void refresh();
    }, 5000);

    return () => clearInterval(timer);
  }, [whatsappStatus, refresh]);

  async function run(key, action, successTitle) {
    setBusy(key);

    try {
      await action();

      if (successTitle) showToast({ tone: 'success', title: successTitle });

      await refresh();
    } catch (error) {
      showToast({ tone: 'error', title: 'That did not work', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function connectGoogle() {
    try {
      const { url } = await calendarApi.authorize(token);
      window.location.assign(url);
    } catch (error) {
      showToast({ tone: 'error', title: 'Google is not available', message: error.message });
    }
  }

  if (!data) return <p className="hint">Loading integrations…</p>;

  const whatsapp = data.whatsapp;
  const [whatsappTone, whatsappLabel] = WHATSAPP_TONES[whatsapp.status] ?? ['pill--neutral', whatsapp.status];
  const calendar = data.calendar;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Integrations</h1>
          <p>{data.workspace.name} · connect this workspace&rsquo;s own accounts and numbers</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <section className="grid grid-2" style={{ marginBottom: '1.25rem' }}>
        <article className="card">
          <span className="label-micro">
            <MessageCircle size={12} aria-hidden="true" /> WhatsApp
          </span>
          <h3 style={{ marginTop: '0.25rem' }}>
            Your own number
            <span className={`pill ${whatsappTone}`} style={{ marginLeft: '0.5rem' }}>
              {whatsappLabel}
            </span>
          </h3>

          <p className="muted" style={{ fontSize: '0.8125rem' }}>
            Link the phone this workspace sends from. The session is stored for this workspace only, so
            a deploy never asks you to scan again and the website&rsquo;s own number is left alone.
          </p>

          {whatsapp.status === 'qr' ? (
            <div className="qr-panel">
              {whatsapp.qrDataUrl ? (
                <img src={whatsapp.qrDataUrl} alt="WhatsApp linking QR code" width="220" height="220" />
              ) : (
                <div className="qr-panel__fallback">
                  <span className="label-micro">Raw code (QR rendering unavailable)</span>
                  <code>{whatsapp.qr}</code>
                </div>
              )}
              <p className="hint" style={{ margin: 0 }}>
                WhatsApp → Settings → Linked devices → Link a device. This code refreshes on its own.
              </p>
            </div>
          ) : null}

          <div className="detail-grid">
            <Detail
              label="Linked device"
              value={whatsapp.session?.linkedDevice ? String(whatsapp.session.linkedDevice).split('@')[0] : null}
            />
            <Detail
              label="Linked at"
              value={whatsapp.session?.linkedAt ? new Date(whatsapp.session.linkedAt).toLocaleString() : null}
            />
            <Detail
              label="Ready since"
              value={whatsapp.readyAt ? new Date(whatsapp.readyAt).toLocaleString() : null}
            />
            <Detail label="Received / replied" value={`${whatsapp.received} / ${whatsapp.replied}`} />
            <Detail
              label="Last message"
              value={whatsapp.lastMessageAt ? new Date(whatsapp.lastMessageAt).toLocaleString() : null}
            />
            <Detail
              label="Session on disk"
              value={
                whatsapp.session?.present
                  ? `${whatsapp.session.megabytes} MB across ${whatsapp.session.files} files`
                  : null
              }
            />
            <Detail label="Browser profile" value={whatsapp.clientId} />
            <Detail
              label="Live sessions on this server"
              value={`${whatsapp.liveSessions} of ${whatsapp.maxLiveSessions}`}
            />
          </div>

          {whatsapp.error ? (
            <p className="alert alert--error" style={{ marginTop: '0.75rem' }}>
              <TriangleAlert size={15} aria-hidden="true" />
              {whatsapp.error}
            </p>
          ) : null}

          <div className="btn-row" style={{ marginTop: '0.75rem' }}>
            {whatsapp.status === 'ready' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy === 'stop'}
                onClick={() => run('stop', () => api.whatsappStop(token), 'WhatsApp stopped')}
              >
                Stop the session
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy === 'start'}
                onClick={() => run('start', () => api.whatsappStart(token), 'Starting WhatsApp')}
              >
                <Smartphone size={14} aria-hidden="true" />
                {busy === 'start' ? 'Starting…' : 'Connect WhatsApp'}
              </button>
            )}

            {whatsapp.session?.paired ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy === 'logout'}
                onClick={() => run('logout', () => api.whatsappLogout(token), 'Session unlinked')}
              >
                <Unplug size={14} aria-hidden="true" />
                Unlink and forget
              </button>
            ) : null}
          </div>

          {whatsapp.status === 'ready' ? (
            <form
              className="form"
              style={{ marginTop: '0.75rem' }}
              onSubmit={(event) => {
                event.preventDefault();

                void run(
                  'send',
                  () => api.whatsappSend(token, testNumber, testText),
                  'Message sent',
                ).then(() => setTestText(''));
              }}
            >
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="wa-number">Send a message to</label>
                  <input
                    id="wa-number"
                    className="input"
                    placeholder="923001234567"
                    value={testNumber}
                    onChange={(event) => setTestNumber(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="wa-text">Message</label>
                  <input
                    id="wa-text"
                    className="input"
                    value={testText}
                    onChange={(event) => setTestText(event.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-secondary btn-sm" disabled={busy === 'send'}>
                <Send size={14} aria-hidden="true" />
                Send
              </button>
            </form>
          ) : null}
        </article>

        <article className="card">
          <span className="label-micro">
            <CalendarCheck size={12} aria-hidden="true" /> Google Calendar
          </span>
          <h3 style={{ marginTop: '0.25rem' }}>Appointment booking</h3>

          {calendar.connected ? (
            <p className="alert alert--success">
              <CircleCheckBig size={15} aria-hidden="true" />
              Connected{calendar.account ? ` as ${calendar.account}` : ''}. Bookings check for conflicts
              first.
            </p>
          ) : calendar.configured ? (
            <p className="muted" style={{ fontSize: '0.8125rem' }}>
              OAuth 2.0 is configured on the server. Connect an account to book appointments from a lead.
            </p>
          ) : (
            <p className="alert alert--pending">
              <TriangleAlert size={15} aria-hidden="true" />
              No Google client is configured on the server.
            </p>
          )}

          <div className="detail-grid">
            <Detail label="Account" value={calendar.account} />
            <Detail
              label="Connected at"
              value={calendar.connectedAt ? new Date(calendar.connectedAt).toLocaleString() : null}
            />
            <Detail
              label="Last booking"
              value={calendar.lastSyncAt ? new Date(calendar.lastSyncAt).toLocaleString() : null}
            />
          </div>

          <p className="hint">
            Redirect URI on the OAuth client:{' '}
            <code style={{ wordBreak: 'break-all' }}>{calendar.redirectUri}</code>
          </p>

          <div className="btn-row">
            {calendar.connected ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => run('gcal-off', () => calendarApi.disconnect(token), 'Google Calendar disconnected')}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!calendar.configured}
                onClick={connectGoogle}
              >
                <ExternalLink size={14} aria-hidden="true" />
                Connect Google
              </button>
            )}
          </div>

          {calendar.history?.length ? (
            <>
              <hr className="divider" />
              <span className="label-micro">Recent activity</span>
              <ul className="stack" style={{ paddingLeft: '1.1rem', marginBottom: 0 }}>
                {calendar.history.slice(0, 5).map((entry) => (
                  <li key={`${entry.at}-${entry.eventId}`} className="hint">
                    {entry.action} · {new Date(entry.at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </article>
      </section>

      <section className="grid grid-2" style={{ marginBottom: '1.25rem' }}>
        <article className="card">
          <span className="label-micro">
            <Zap size={12} aria-hidden="true" /> Alert channels
          </span>
          <h3 style={{ marginTop: '0.25rem' }}>Where escalations go</h3>
          <p className="muted" style={{ fontSize: '0.8125rem' }}>
            A generic webhook, Slack, or Telegram. With none configured the attempt is still recorded, as
            &ldquo;skipped&rdquo;.
          </p>

          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();

              void run(
                'channels',
                () =>
                  workspaceApi.updateSettings(token, {
                    alerts: {
                      ...channels,
                      // A blank token means "keep the one stored", not "delete it": the
                      // browser never receives the value, so it cannot send it back.
                      ...(channels?.telegramBotToken ? {} : { telegramBotToken: undefined }),
                    },
                  }),
                'Alert channels saved',
              );
            }}
          >
            <div className="field">
              <label htmlFor="webhook">Generic webhook URL</label>
              <input
                id="webhook"
                className="input"
                value={channels?.webhookUrl ?? ''}
                onChange={(event) => setChannels({ ...channels, webhookUrl: event.target.value })}
                placeholder="https://example.com/hooks/leads"
              />
            </div>
            <div className="field">
              <label htmlFor="slack">Slack webhook URL</label>
              <input
                id="slack"
                className="input"
                value={channels?.slackWebhookUrl ?? ''}
                onChange={(event) => setChannels({ ...channels, slackWebhookUrl: event.target.value })}
              />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="telegram-token">Telegram bot token</label>
                <input
                  id="telegram-token"
                  className="input"
                  value={channels?.telegramBotToken ?? ''}
                  onChange={(event) => setChannels({ ...channels, telegramBotToken: event.target.value })}
                  placeholder={tokenSaved ? '•••••••• already saved — leave blank to keep it' : '123456:ABC-DEF…'}
                />
                {tokenSaved && !channels?.telegramBotToken ? (
                  <p className="hint" style={{ margin: 0 }}>
                    A token is stored on the server and is never shown to a browser. Type a new one to
                    replace it.
                  </p>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="telegram-chat">Telegram chat id</label>
                <input
                  id="telegram-chat"
                  className="input"
                  value={channels?.telegramChatId ?? ''}
                  onChange={(event) => setChannels({ ...channels, telegramChatId: event.target.value })}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={busy === 'channels'}>
              Save channels
            </button>
          </form>
        </article>

        <article className="card">
          <span className="label-micro">
            <CreditCard size={12} aria-hidden="true" /> Payments
          </span>
          <h3 style={{ marginTop: '0.25rem' }}>How this workspace can be paid</h3>

          <div className="detail-grid">
            <Detail
              label="Card (Stripe)"
              value={
                data.payments.stripe.configured
                  ? `Ready · ${data.payments.stripe.mode} mode · ${data.payments.stripe.currency}`
                  : 'Not configured on the server'
              }
            />
            <Detail
              label={`Crypto (${data.payments.crypto.asset})`}
              value={
                data.payments.crypto.configured
                  ? `Ready · deposits on ${data.payments.crypto.network}`
                  : 'Not configured on the server'
              }
            />
            <Detail
              label="Voice"
              value={`${data.voice.sttModel} · ${data.voice.ttsVoice}`}
            />
          </div>

          <p className="hint">
            Choose the method at checkout on the billing page. Card details are entered on Stripe and never
            reach this server.
          </p>
        </article>
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Recent alert attempts</h2>

        {data.alerts.attempts.length === 0 ? (
          <p className="hint">Nothing yet. Create a lead and let it go unacknowledged.</p>
        ) : (
          <ul className="voice-log">
            {data.alerts.attempts.slice(0, 12).map((alert, index) => (
              <li className="voice-turn" key={alert.id ?? index}>
                <span className="label-micro">
                  {alert.channel} · {new Date(alert.at).toLocaleString()}
                </span>
                <p>
                  <span
                    className={`pill ${alert.status === 'sent' ? 'pill--done' : alert.status === 'failed' ? 'pill--problem' : 'pill--neutral'}`}
                  >
                    {alert.status}
                  </span>{' '}
                  {alert.title}
                </p>
                {alert.error ? <p className="hint">{alert.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
