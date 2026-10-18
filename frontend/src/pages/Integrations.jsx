import { CalendarCheck, CircleCheckBig, ExternalLink, TriangleAlert, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { calendarApi, crmApi, workspaceApi } from '../lib/api.js';

export default function Integrations() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [calendar, setCalendar] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [channels, setChannels] = useState({ webhookUrl: '', slackWebhookUrl: '', telegramBotToken: '', telegramChatId: '' });
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(
    () => Promise.all([calendarApi.status(token), workspaceApi.get(token), crmApi.alerts(token)]),
    [token],
  );

  const apply = useCallback(([calendarPayload, workspacePayload, alertPayload]) => {
    setCalendar(calendarPayload);
    // Merge rather than replace, so anything typed before a save is not wiped.
    setChannels((current) => ({ ...current, ...(workspacePayload.settings?.alerts ?? {}) }));
    setAlerts(alertPayload.alerts ?? []);
  }, []);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((refreshError) =>
          showToast({ tone: 'error', title: 'Could not load integrations', message: refreshError.message }),
        ),
    [fetchAll, apply, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payloads) => {
        if (active) apply(payloads);
      })
      .catch((loadError) => {
        if (active) {
          showToast({ tone: 'error', title: 'Could not load integrations', message: loadError.message });
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

  async function connectGoogle() {
    setBusy(true);

    try {
      const { url } = await calendarApi.authorize(token);
      window.location.href = url;
    } catch (error) {
      showToast({ tone: 'error', title: 'Google is not available', message: error.message });
      setBusy(false);
    }
  }

  async function disconnectGoogle() {
    await calendarApi.disconnect(token);
    showToast({ tone: 'success', title: 'Google Calendar disconnected' });
    await refresh();
  }

  async function saveChannels(event) {
    event.preventDefault();
    setBusy(true);

    try {
      await workspaceApi.updateSettings(token, { alerts: channels });
      showToast({ tone: 'success', title: 'Alert channels saved' });
      await refresh();
    } catch (error) {
      showToast({ tone: 'error', title: 'Could not save', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Integrations</h1>
          <p>External services, their secrets, and what actually happened when we called them.</p>
        </div>
      </div>

      <section className="grid grid-2" style={{ marginBottom: '1.25rem' }}>
        <article className="card">
          <span className="label-micro">
            <CalendarCheck size={12} aria-hidden="true" /> Google Calendar
          </span>
          <h3 style={{ marginTop: '0.25rem' }}>Appointment booking</h3>

          {!calendar ? (
            <p className="hint">Checking…</p>
          ) : calendar.connected ? (
            <p className="alert alert--success">
              <CircleCheckBig size={15} aria-hidden="true" />
              Connected{calendar.account ? ` as ${calendar.account}` : ''}. Bookings check for conflicts
              first.
            </p>
          ) : calendar.configured ? (
            <p className="muted" style={{ fontSize: '0.8125rem' }}>
              OAuth 2.0 is configured. Connect an account to let the team book appointments from a lead.
            </p>
          ) : (
            <p className="alert alert--pending">
              <TriangleAlert size={15} aria-hidden="true" />
              No Google client is configured on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
            </p>
          )}

          {calendar?.redirectUri ? (
            <p className="hint">
              Redirect URI:{' '}
              <code style={{ wordBreak: 'break-all' }}>{calendar.redirectUri}</code>
              <br />
              This exact value must be listed on the OAuth client.
            </p>
          ) : null}

          <div className="btn-row">
            {calendar?.connected ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={disconnectGoogle}>
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={connectGoogle}
                disabled={busy || !calendar?.configured}
              >
                <ExternalLink size={14} aria-hidden="true" />
                Connect Google
              </button>
            )}
          </div>

          {calendar?.history?.length ? (
            <>
              <hr className="divider" />
              <span className="label-micro">Sync history</span>
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

        <article className="card">
          <span className="label-micro">
            <Zap size={12} aria-hidden="true" /> Alert channels
          </span>
          <h3 style={{ marginTop: '0.25rem' }}>Where escalations go</h3>
          <p className="muted" style={{ fontSize: '0.8125rem' }}>
            A generic webhook, Slack, or Telegram. With none configured the attempt is still recorded,
            as “skipped”.
          </p>

          <form className="form" onSubmit={saveChannels}>
            <div className="field">
              <label htmlFor="webhook">Generic webhook URL</label>
              <input
                id="webhook"
                className="input"
                value={channels.webhookUrl}
                onChange={(event) => setChannels({ ...channels, webhookUrl: event.target.value })}
                placeholder="https://example.com/hooks/leads"
              />
            </div>
            <div className="field">
              <label htmlFor="slack">Slack webhook URL</label>
              <input
                id="slack"
                className="input"
                value={channels.slackWebhookUrl}
                onChange={(event) => setChannels({ ...channels, slackWebhookUrl: event.target.value })}
                placeholder="https://hooks.slack.com/services/…"
              />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="telegram-token">Telegram bot token</label>
                <input
                  id="telegram-token"
                  className="input"
                  value={channels.telegramBotToken}
                  onChange={(event) => setChannels({ ...channels, telegramBotToken: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="telegram-chat">Telegram chat id</label>
                <input
                  id="telegram-chat"
                  className="input"
                  value={channels.telegramChatId}
                  onChange={(event) => setChannels({ ...channels, telegramChatId: event.target.value })}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={busy}>
              Save channels
            </button>
          </form>
        </article>
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Recent alert attempts</h2>

        {alerts.length === 0 ? (
          <p className="hint">Nothing yet. Create a lead and let it go unacknowledged.</p>
        ) : (
          <ul className="voice-log">
            {alerts.slice(0, 12).map((alert) => (
              <li className="voice-turn" key={alert.id}>
                <span className="label-micro">
                  {alert.channel} · {new Date(alert.at).toLocaleString()}
                </span>
                <p>
                  <span className={`pill ${alert.status === 'sent' ? 'pill--done' : alert.status === 'failed' ? 'pill--problem' : 'pill--neutral'}`}>
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
