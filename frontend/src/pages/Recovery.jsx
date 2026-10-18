import { CircleCheckBig, Clock, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { crmApi } from '../lib/api.js';

const REFRESH_MS = 10000;

function humanSeconds(seconds) {
  if (seconds === null || seconds === undefined) return 'no data yet';
  if (seconds < 90) return `${Math.round(seconds)}s`;

  const minutes = Math.round(seconds / 60);

  return minutes < 90 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
}

/**
 * The recovery queue: open leads that need a person now, each with the reason it is here.
 * Nothing is inferred in the browser — the server decides, this only renders it.
 */
export default function Recovery() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [queue, setQueue] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState('');

  const apply = useCallback((payload) => setQueue(payload), []);
  const fetchAll = useCallback(() => crmApi.recovery(token), [token]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load the queue', message: error.message }),
        ),
    [fetchAll, apply, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payload) => {
        if (active) apply(payload);
      })
      .catch((error) => {
        if (active) showToast({ tone: 'error', title: 'Could not load the queue', message: error.message });
      });

    const timer = setInterval(refresh, REFRESH_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchAll, apply, refresh, showToast]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  async function acknowledge(lead) {
    setBusy(lead.id);

    try {
      await crmApi.acknowledge(token, lead.id);
      showToast({ tone: 'success', title: `${lead.name} acknowledged` });
      await refresh();
    } catch (error) {
      showToast({ tone: 'error', title: 'Could not acknowledge', message: error.message });
    } finally {
      setBusy('');
    }
  }

  const items = queue?.items ?? [];

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Recovery queue</h1>
          <p>
            {queue
              ? `${queue.count} lead(s) need attention · unacknowledged past ${queue.acknowledgeSeconds}s, escalated twice, or idle over ${queue.idleHours}h`
              : 'Loading…'}
          </p>
        </div>
      </div>

      {queue && items.length === 0 ? (
        <p className="alert alert--success">
          <CircleCheckBig size={15} aria-hidden="true" />
          Nothing is stuck. Every open lead is inside its window and has been touched recently.
        </p>
      ) : null}

      <div className="board" style={{ gridAutoFlow: 'row', gridAutoColumns: 'auto' }}>
        {items.map((lead) => (
          <article className="card" key={lead.id}>
            <div className="pay-panel__head">
              <div>
                <span className="label-micro">
                  <ShieldAlert size={12} aria-hidden="true" /> {lead.source}
                </span>
                <h3 style={{ margin: '0.25rem 0 0' }}>
                  <Link to={`/crm/${lead.id}`}>{lead.name}</Link>
                </h3>
                <p className="hint" style={{ margin: 0 }}>
                  {lead.assigneeName ?? 'Unassigned'} · {lead.stage} ·{' '}
                  {lead.valueHidden
                    ? 'value restricted'
                    : lead.value > 0
                      ? `$${lead.value}`
                      : 'no value set'}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy === lead.id}
                onClick={() => acknowledge(lead)}
              >
                <CircleCheckBig size={14} aria-hidden="true" />
                {busy === lead.id ? 'Working…' : 'Acknowledge'}
              </button>
            </div>

            <ul className="stack" style={{ listStyle: 'none', paddingLeft: 0, margin: '0.75rem 0 0' }}>
              {lead.reasons.map((reason) => (
                <li key={reason.code} className={`pill ${reason.code === 'idle' ? 'pill--neutral' : 'pill--problem'}`}>
                  <TriangleAlert size={12} aria-hidden="true" />
                  {reason.label}
                </li>
              ))}
            </ul>

            <p className="hint" style={{ marginBottom: 0 }}>
              <Clock size={12} aria-hidden="true" /> Escalated{' '}
              {lead.escalationLevel ?? 0} time(s)
              {lead.escalatedAt ? ` · last at ${new Date(lead.escalatedAt).toLocaleString()}` : ''}
              {lead.ackDeadline && !lead.acknowledgedAt
                ? ` · deadline ${new Date(lead.ackDeadline).toLocaleTimeString()} (${humanSeconds(
                    (Date.parse(lead.ackDeadline) - now) / 1000,
                  )} ${Date.parse(lead.ackDeadline) > now ? 'left' : 'ago'})`
                : ''}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
