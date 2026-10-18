import { RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { crmApi, workspaceApi } from '../lib/api.js';

const EMPTY_FILTERS = { action: '', actorId: '', from: '', to: '' };

/**
 * The audit log. Read-only: the screen offers no edit or delete, because no endpoint for
 * either exists — an entry that could be changed through the UI would make the whole chain
 * decorative. The chain is verified server-side on every read.
 */
export default function Audit() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [state, setState] = useState(null);
  const [actions, setActions] = useState([]);
  const [members, setMembers] = useState([]);

  const fetchAudit = useCallback(
    async (next = filters) =>
      crmApi.audit(token, {
        action: next.action || undefined,
        actorId: next.actorId || undefined,
        from: next.from ? `${next.from}T00:00:00.000Z` : undefined,
        to: next.to ? `${next.to}T23:59:59.999Z` : undefined,
      }),
    [token, filters],
  );

  const refresh = useCallback(
    (next) =>
      fetchAudit(next)
        .then((payload) => {
          setState(payload);
          setActions(payload.actions ?? []);
        })
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load the audit log', message: error.message }),
        ),
    [fetchAudit, showToast],
  );

  useEffect(() => {
    let active = true;

    crmApi
      .audit(token)
      .then((payload) => {
        if (!active) return;
        setState(payload);
        setActions(payload.actions ?? []);
      })
      .catch((error) => {
        if (active) showToast({ tone: 'error', title: 'Could not load the audit log', message: error.message });
      });

    workspaceApi
      .members(token)
      .then((payload) => {
        if (active) setMembers(payload.members ?? []);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [token, showToast]);

  if (!state) return <p className="hint">Loading the audit log…</p>;

  const entries = state.entries ?? [];
  const actorName = (id) => {
    if (!id) return 'system';

    return members.find((member) => member.userId === id)?.name ?? id.slice(0, 8);
  };

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Audit log</h1>
          <p>
            {state.chain?.entries ?? entries.length} entries ·{' '}
            {state.chain?.valid ? 'hash chain verified' : 'chain broken — investigate'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => refresh(filters)}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <p className={`alert ${state.chain?.valid ? 'alert--success' : 'alert--error'}`}>
        {state.chain?.valid ? <ShieldCheck size={15} aria-hidden="true" /> : <ShieldAlert size={15} aria-hidden="true" />}
        {state.chain?.valid
          ? 'Every entry commits to the hash of the one before it. Editing, reordering or deleting any entry would break this check.'
          : `The chain does not verify${state.chain?.brokenAt ? ` — first mismatch at ${state.chain.brokenAt}` : ''}.`}
      </p>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Filters</span>
        <div className="grid grid-3" style={{ marginTop: '0.5rem' }}>
          <div className="field">
            <label htmlFor="audit-action">Event type</label>
            <select
              id="audit-action"
              className="select"
              value={filters.action}
              onChange={(event) => setFilters({ ...filters, action: event.target.value })}
            >
              <option value="">Every event</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="audit-actor">Actor</label>
            <select
              id="audit-actor"
              className="select"
              value={filters.actorId}
              onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}
            >
              <option value="">Anyone, including the system</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Date range</label>
            <div className="btn-row" style={{ gap: '0.35rem' }}>
              <input
                className="input"
                type="date"
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
              <input
                className="input"
                type="date"
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => refresh(filters)}>
            Apply filters
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              refresh(EMPTY_FILTERS);
            }}
          >
            Clear
          </button>
        </div>
      </section>

      {entries.length === 0 ? (
        <p className="hint">Nothing matches those filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Event</th>
                <th scope="col">Actor</th>
                <th scope="col">Target</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.at).toLocaleString()}</td>
                  <th scope="row">
                    <code>{entry.action}</code>
                  </th>
                  <td>{actorName(entry.actorId)}</td>
                  <td>
                    <code className="hint">{entry.target ? `${entry.target.slice(0, 8)}…` : '—'}</code>
                  </td>
                  <td>
                    {entry.metadata ? (
                      <details>
                        <summary className="hint">before / after</summary>
                        <pre className="hint" style={{ whiteSpace: 'pre-wrap', margin: '0.35rem 0 0' }}>
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
