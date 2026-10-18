import { CircleCheckBig, Clock, Download, Plus, Search, TriangleAlert, Zap } from 'lucide-react';
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

const EMPTY_FORM = { name: '', email: '', phone: '', source: 'manual', value: '', notes: '', fields: {} };

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
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [lists, setLists] = useState([]);
  const [listMeta, setListMeta] = useState({ fields: [], ops: [] });
  const [listDraft, setListDraft] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [listBusy, setListBusy] = useState('');

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

  const loadLists = useCallback(
    () =>
      crmApi
        .lists(token)
        .then((payload) => {
          setLists(payload.lists ?? []);
          setListMeta({ fields: payload.fields ?? [], ops: payload.ops ?? [] });
        })
        .catch(() => {}),
    [token],
  );

  /** Load a saved list and its live matches. */
  async function openList(list) {
    setListBusy(list.id);

    try {
      const result = await crmApi.evaluateList(token, list.id);

      setSelectedList(result);
    } catch (listError) {
      showToast({ tone: 'error', title: 'Could not evaluate the list', message: listError.message });
    } finally {
      setListBusy('');
    }
  }

  async function saveList(event) {
    event.preventDefault();

    if (!listDraft) return;

    setListBusy('save');

    try {
      await crmApi.createList(token, {
        name: listDraft.name,
        criteria: listDraft.criteria.filter((criterion) => criterion.value !== ''),
      });

      setListDraft(null);
      await loadLists();
      showToast({ tone: 'success', title: 'List saved' });
    } catch (listError) {
      showToast({ tone: 'error', title: 'Could not save the list', message: listError.message });
    } finally {
      setListBusy('');
    }
  }

  async function removeList(list) {
    setListBusy(list.id);

    try {
      await crmApi.deleteList(token, list.id);

      if (selectedList?.list.id === list.id) setSelectedList(null);

      await loadLists();
    } catch (listError) {
      showToast({ tone: 'error', title: 'Could not delete the list', message: listError.message });
    } finally {
      setListBusy('');
    }
  }

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payloads) => {
        if (active) apply(payloads);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });

    loadLists();

    const timer = setInterval(refresh, REFRESH_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchAll, apply, refresh, loadLists]);

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
        fields: form.fields ?? {},
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
  const canExport = (meta?.member?.permissions ?? []).includes('crm.export');

  /**
   * The export needs the Authorization header, so it cannot be a plain link: fetch it, then
   * hand the browser a blob. The server omits the value column unless the caller may see it.
   */
  async function exportCsv() {
    setExporting(true);

    try {
      const response = await fetch(crmApi.exportUrl(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(`The export was refused (${response.status})`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'opportunities.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      showToast({ tone: 'success', title: 'Export downloaded' });
    } catch (exportError) {
      showToast({ tone: 'error', title: 'Could not export', message: exportError.message });
    } finally {
      setExporting(false);
    }
  }
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
            {meta?.workspace?.name ?? 'Workspace'} · {leads.length} leads · acknowledgements enforced
          </p>
        </div>

        <div className="btn-row">
          {canManage ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={runEscalation}>
              <Zap size={14} aria-hidden="true" />
              Run escalation check
            </button>
          ) : null}
          {canExport ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={exporting}>
              <Download size={14} aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export CSV'}
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

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Saved lists</span>
        <p className="hint" style={{ marginTop: '0.25rem' }}>
          A list is a set of criteria evaluated live, so it shrinks and grows as records start or
          stop matching. Combine three or more for the useful ones.
        </p>

        <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
          {lists.map((list) => (
            <span key={list.id} className="btn-row" style={{ gap: '0.2rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${selectedList?.list?.id === list.id ? 'btn-primary' : 'btn-secondary'}`}
                disabled={listBusy === list.id}
                onClick={() => openList(list)}
              >
                {list.name} · {list.criteria.length}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Delete this list"
                disabled={listBusy === list.id}
                onClick={() => removeList(list)}
              >
                ×
              </button>
            </span>
          ))}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setListDraft({ name: '', criteria: [{ field: 'stage', op: 'eq', value: '' }] })}
          >
            <Plus size={14} aria-hidden="true" />
            New list
          </button>
        </div>

        {listDraft ? (
          <form className="form" style={{ marginTop: '0.75rem' }} onSubmit={saveList}>
            <div className="field">
              <label htmlFor="list-name">List name</label>
              <input
                id="list-name"
                className="input"
                value={listDraft.name}
                onChange={(event) => setListDraft({ ...listDraft, name: event.target.value })}
                required
              />
            </div>

            {listDraft.criteria.map((criterion, index) => (
              <div className="btn-row" key={`criterion-${index}`} style={{ alignItems: 'center', gap: '0.4rem' }}>
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  value={criterion.field}
                  onChange={(event) =>
                    setListDraft({
                      ...listDraft,
                      criteria: listDraft.criteria.map((entry, position) =>
                        position === index ? { ...entry, field: event.target.value } : entry,
                      ),
                    })
                  }
                >
                  {listMeta.fields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>

                <select
                  className="select"
                  style={{ maxWidth: 160 }}
                  value={criterion.op}
                  onChange={(event) =>
                    setListDraft({
                      ...listDraft,
                      criteria: listDraft.criteria.map((entry, position) =>
                        position === index ? { ...entry, op: event.target.value } : entry,
                      ),
                    })
                  }
                >
                  {listMeta.ops.map((op) => (
                    <option key={op.key} value={op.key}>
                      {op.label}
                    </option>
                  ))}
                </select>

                <input
                  className="input"
                  style={{ maxWidth: 200 }}
                  value={criterion.value}
                  placeholder={criterion.field === 'createdAt' ? '2026-10-01' : 'value'}
                  onChange={(event) =>
                    setListDraft({
                      ...listDraft,
                      criteria: listDraft.criteria.map((entry, position) =>
                        position === index ? { ...entry, value: event.target.value } : entry,
                      ),
                    })
                  }
                />

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={listDraft.criteria.length <= 1}
                  onClick={() =>
                    setListDraft({
                      ...listDraft,
                      criteria: listDraft.criteria.filter((_, position) => position !== index),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setListDraft({
                    ...listDraft,
                    criteria: [...listDraft.criteria, { field: 'stage', op: 'eq', value: '' }],
                  })
                }
              >
                <Plus size={14} aria-hidden="true" />
                Add criterion
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={listBusy === 'save'}>
                {listBusy === 'save' ? 'Saving…' : 'Save list'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setListDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {selectedList ? (
          <div style={{ marginTop: '0.75rem' }}>
            <span className="label-micro">
              {selectedList.list?.name} · {selectedList.count} match(es) right now
            </span>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Stage</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Value</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedList.leads ?? []).map((lead) => (
                    <tr key={lead.id}>
                      <th scope="row">
                        <Link to={`/crm/${lead.id}`}>{lead.name}</Link>
                      </th>
                      <td>{lead.stage}</td>
                      <td>{lead.assigneeName ?? 'Unassigned'}</td>
                      <td>{lead.valueHidden ? 'Restricted' : formatMoney(lead.value)}</td>
                      <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {(selectedList.leads ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <span className="hint">Nothing matches this list right now.</span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

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
          <strong>{stats?.valueHidden ? 'Restricted' : formatMoney(stats?.pipelineValue)}</strong>
          <span className="hint">
            {stats?.valueHidden ? 'your role cannot see opportunity value' : `${stats?.weekLeads ?? 0} new this week`}
          </span>
        </article>
        <article className="metric-tile">
          <span className="label-micro">Conversion</span>
          <strong>{stats?.conversionRate ?? 0}%</strong>
          <span className="hint">{stats?.byStage?.won ?? 0} won</span>
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

              {(meta?.customFields ?? []).map((field) => {
                const value = form.fields?.[field.key] ?? '';
                const setValue = (next) =>
                  setForm({ ...form, fields: { ...(form.fields ?? {}), [field.key]: next } });

                return (
                  <div className="field" key={field.key}>
                    <label htmlFor={`cf-${field.key}`}>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>

                    {field.type === 'dropdown' ? (
                      <select
                        id={`cf-${field.key}`}
                        className="select"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                      >
                        <option value="">—</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'checkbox' ? (
                      <label className="hint" style={{ display: 'inline-flex', gap: '0.3rem' }}>
                        <input
                          id={`cf-${field.key}`}
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) => setValue(event.target.checked)}
                        />
                        Yes
                      </label>
                    ) : (
                      <input
                        id={`cf-${field.key}`}
                        className="input"
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create and assign'}
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
                      {lead.valueHidden ? (
                        <span className="pill pill--neutral" title="Your role cannot see opportunity value">
                          Restricted
                        </span>
                      ) : lead.value > 0 ? (
                        <span className="pill pill--neutral">{formatMoney(lead.value)}</span>
                      ) : null}
                    </div>

                    <span className="lead-card__meta">
                      {lead.assigneeName ?? 'Unassigned'} · {lead.source}
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
                      <span className="pill pill--problem">Escalated ×{lead.escalationLevel}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="hint" style={{ marginTop: '1rem' }}>
        Refreshes every {REFRESH_MS / 1000}s. An unacknowledged lead escalates on its own — the clock
        here is the real deadline the server enforces.
      </p>
    </>
  );
}
