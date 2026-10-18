import { CircleCheckBig, Clock, Plus, Search, TriangleAlert, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { crmApi } from '../lib/api.js';
import { countdown } from '../lib/countdown.js';

const REFRESH_MS = 5000;

function formatMoney(value) {
  return `$${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const EMPTY_FORM = { name: '', email: '', phone: '', source: 'manual', value: '', notes: '' };

export default function Crm() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The codebase's pattern: fetch in the effect and set state from the promise
  // callback, never synchronously in the effect body.
  const fetchAll = useCallback(
    () => Promise.all([crmApi.meta(token), crmApi.stats(token), crmApi.leads(token)]),
    [token],
  );

  const apply = useCallback(([metaPayload, statsPayload, leadPayload]) => {
    setMeta(metaPayload);
    setStats(statsPayload);
    setLeads(leadPayload.leads ?? []);
    setError('');
  }, []);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((refreshError) => setError(refreshError.message)),
    [fetchAll, apply],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payloads) => {
        if (active) apply(payloads);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });

    const timer = setInterval(refresh, REFRESH_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchAll, apply, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  async function createLead(event) {
    event.preventDefault();
    setBusy(true);

    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        source: form.source,
        notes: form.notes,
        value: form.value === '' ? 0 : Number(form.value),
      };

      const result = await crmApi.createLead(token, payload);

      showToast({
        tone: 'success',
        title: 'Lead created',
        message: result.assignee ? `Assigned to ${result.assignee.name}` : 'No member was free to assign',
      });

      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
    } catch (createError) {
      showToast({ tone: 'error', title: 'Could not create the lead', message: createError.message });
    } finally {
      setBusy(false);
    }
  }

  async function runEscalation() {
    try {
      const result = await crmApi.escalate(token);

      showToast({
        tone: result.applied.length ? 'success' : 'info',
        title: result.applied.length ? 'Escalation applied' : 'Nothing overdue',
        message: result.applied.length
          ? `${result.applied.length} lead(s) moved`
          : 'Every open lead is inside its acknowledgement window',
      });

      await refresh();
    } catch (escalationError) {
      showToast({ tone: 'error', title: 'Escalation check failed', message: escalationError.message });
    }
  }

  const pipeline = meta?.stages ?? [];
  const canCreate = (meta?.member?.permissions ?? []).includes('crm.create');
  const canManage = (meta?.member?.permissions ?? []).includes('assignment.manage');
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? leads.filter((lead) =>
        [lead.name, lead.email, lead.phone, lead.assigneeName]
          .some((field) => String(field ?? '').toLowerCase().includes(needle)),
      )
    : leads;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Pipeline</h1>
          <p>
            {meta?.workspace?.name ?? 'Workspace'} Â· {leads.length} leads Â· acknowledgements enforced
          </p>
        </div>

        <div className="btn-row">
          {canManage ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={runEscalation}>
              <Zap size={14} aria-hidden="true" />
              Run escalation check
            </button>
          ) : null}
          {canCreate ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm((open) => !open)}>
              <Plus size={14} aria-hidden="true" />
              New lead
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="alert alert--error">{error}</p> : null}

      <section className="metric-grid" style={{ marginBottom: '1.25rem' }}>
        <article className="metric-tile">
          <span className="label-micro">Awaiting acknowledgement</span>
          <strong>{stats?.unacknowledged ?? 0}</strong>
          <span className="hint">{stats?.overdue ?? 0} past the deadline</span>
        </article>
        <article className={`metric-tile${(stats?.overdue ?? 0) > 0 ? ' is-warn' : ''}`}>
          <span className="label-micro">Overdue</span>
          <strong>{stats?.overdue ?? 0}</strong>
          <span className="hint">escalating automatically</span>
        </article>
        <article className="metric-tile">
          <span className="label-micro">Open pipeline</span>
          <strong>{formatMoney(stats?.pipelineValue)}</strong>
          <span className="hint">{stats?.weekLeads ?? 0} new this week</span>
        </article>
        <article className="metric-tile">
          <span className="label-micro">Conversion</span>
          <strong>{stats?.conversionRate ?? 0}%</strong>
          <span className="hint">{stats?.byStage?.enrolled ?? 0} won</span>
        </article>
      </section>

      {showForm ? (
        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <span className="label-micro">New lead</span>
          <form className="form" onSubmit={createLead}>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="lead-name">Name</label>
                <input
                  id="lead-name"
                  className="input"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="lead-email">Email</label>
                <input
                  id="lead-email"
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="lead-phone">Phone</label>
                <input
                  id="lead-phone"
                  className="input"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="lead-value">Opportunity value (USD)</label>
                <input
                  id="lead-value"
                  className="input"
                  type="number"
                  min="0"
                  value={form.value}
                  onChange={(event) => setForm({ ...form, value: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="lead-source">Source</label>
                <select
                  id="lead-source"
                  className="select"
                  value={form.source}
                  onChange={(event) => setForm({ ...form, source: event.target.value })}
                >
                  {['manual', 'website', 'whatsapp', 'sms', 'walk-in', 'phone', 'referral', 'event'].map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="lead-notes">Notes</label>
                <input
                  id="lead-notes"
                  className="input"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
            </div>

            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Creatingâ€¦' : 'Create and assign'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
        <label className="input-icon" style={{ flex: 1, maxWidth: 320 }}>
          <Search size={15} aria-hidden="true" />
          <input
            className="input"
            placeholder="Search name, email, phone or owner"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="board">
        {pipeline.map((stage) => {
          const stageLeads = visible.filter((lead) => lead.stage === stage.key);

          return (
            <div className="board__col" key={stage.key}>
              <div className="board__head">
                <span>{stage.label}</span>
                <strong>{stageLeads.length}</strong>
              </div>

              {stageLeads.length === 0 ? <p className="hint" style={{ margin: 0 }}>Empty</p> : null}

              {stageLeads.map((lead) => {
                const clock = countdown(lead, now);

                return (
                  <Link className="lead-card" to={`/crm/${lead.id}`} key={lead.id}>
                    <div className="lead-card__top">
                      <strong>{lead.name}</strong>
                      {lead.value > 0 ? <span className="pill pill--neutral">{formatMoney(lead.value)}</span> : null}
                    </div>

                    <span className="lead-card__meta">
                      {lead.assigneeName ?? 'Unassigned'} Â· {lead.source}
                    </span>

                    <span className={`countdown countdown--${clock.tone}`}>
                      {clock.tone === 'done' ? (
                        <CircleCheckBig size={12} aria-hidden="true" />
                      ) : clock.tone === 'problem' ? (
                        <TriangleAlert size={12} aria-hidden="true" />
                      ) : (
                        <Clock size={12} aria-hidden="true" />
                      )}
                      {clock.label}
                    </span>

                    {lead.escalationLevel > 0 ? (
                      <span className="pill pill--problem">Escalated Ã—{lead.escalationLevel}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="hint" style={{ marginTop: '1rem' }}>
        Refreshes every {REFRESH_MS / 1000}s. An unacknowledged lead escalates on its own â€” the clock
        here is the real deadline the server enforces.
      </p>
    </>
  );
}
