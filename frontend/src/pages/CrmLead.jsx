import { ArrowLeft, CalendarPlus, CircleCheckBig, Clock, Send, Trash, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { calendarApi, crmApi, workspaceApi } from '../lib/api.js';
import { countdown } from '../lib/countdown.js';

const EMPTY_ACTIVITY = { kind: 'note', summary: '' };

export default function CrmLead() {
  const { id } = useParams();
  const { token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [lead, setLead] = useState(null);
  const [meta, setMeta] = useState(null);
  const [members, setMembers] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(
    () =>
      Promise.all([crmApi.lead(token, id), crmApi.meta(token), workspaceApi.members(token)]),
    [id, token],
  );

  const apply = useCallback(([leadPayload, metaPayload, memberPayload]) => {
    setLead(leadPayload.lead);
    setMeta(metaPayload);
    setMembers(memberPayload.members ?? []);
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

    return () => {
      active = false;
    };
  }, [fetchAll, apply]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  async function act(action, successMessage) {
    setBusy(true);

    try {
      await action();
      showToast({ tone: 'success', title: successMessage });
      await refresh();
    } catch (actionError) {
      showToast({ tone: 'error', title: 'That did not work', message: actionError.message });
    } finally {
      setBusy(false);
    }
  }

  async function addActivity(event) {
    event.preventDefault();

    await act(async () => {
      await crmApi.addActivity(token, { leadId: id, ...activity });
      setActivity(EMPTY_ACTIVITY);
    }, 'Activity recorded');
  }

  async function book(event) {
    event.preventDefault();

    if (!slot) {
      showToast({ tone: 'error', title: 'Pick a date and time first' });
      return;
    }

    const start = new Date(slot);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    await act(async () => {
      await calendarApi.book(token, {
        leadId: id,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      setSlot('');
    }, 'Appointment booked in Google Calendar');
  }

  if (error) {
    return (
      <>
        <Link className="btn btn-ghost btn-sm" to="/crm">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to the pipeline
        </Link>
        <p className="alert alert--error" style={{ marginTop: '1rem' }}>
          {error}
        </p>
      </>
    );
  }

  if (!lead) return <p className="hint">Loading lead…</p>;

  const permissions = meta?.member?.permissions ?? [];
  const canEdit = permissions.includes('crm.edit');
  const canDelete = permissions.includes('crm.delete');
  const canBook = canEdit;
  const clock = countdown(lead, now);
  const stages = meta?.stages ?? [];
  const pending = !lead.acknowledgedAt && lead.ackDeadline;

  return (
    <>
      <Link className="btn btn-ghost btn-sm" to="/crm">
        <ArrowLeft size={14} aria-hidden="true" />
        Pipeline
      </Link>

      <div className="dash-head" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1>{lead.name}</h1>
          <p>
            {lead.source} · {lead.assigneeName ?? 'Unassigned'} · created{' '}
            {new Date(lead.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="btn-row">
          {pending && canEdit ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => act(() => crmApi.acknowledge(token, lead.id), 'Lead acknowledged')}
            >
              <CircleCheckBig size={14} aria-hidden="true" />
              Acknowledge
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={async () => {
                await act(() => crmApi.deleteLead(token, lead.id), 'Lead deleted');
                navigate('/crm');
              }}
            >
              <Trash size={14} aria-hidden="true" />
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <span className={`countdown countdown--${clock.tone}`} style={{ marginBottom: '1rem' }}>
        {clock.tone === 'problem' ? (
          <TriangleAlert size={13} aria-hidden="true" />
        ) : (
          <Clock size={13} aria-hidden="true" />
        )}
        {clock.label}
        {lead.escalationLevel > 0 ? ` · escalated ${lead.escalationLevel}×` : ''}
      </span>

      <section className="split" style={{ alignItems: 'start' }}>
        <div className="card">
          <span className="label-micro">Details</span>

          <div className="form">
            <div className="field">
              <label htmlFor="lead-stage">Stage</label>
              <select
                id="lead-stage"
                className="select"
                value={lead.stage}
                disabled={!canEdit}
                onChange={(event) =>
                  act(
                    () => crmApi.updateLead(token, lead.id, { stage: event.target.value }),
                    'Stage updated',
                  )
                }
              >
                {stages.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="lead-owner">Assigned to</label>
              <select
                id="lead-owner"
                className="select"
                value={lead.assigneeId ?? ''}
                disabled={!permissions.includes('assignment.manage')}
                onChange={(event) =>
                  act(() => crmApi.assign(token, lead.id, event.target.value), 'Lead reassigned')
                }
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.levelLabel})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="lead-email-view">Email</label>
                <input id="lead-email-view" className="input" value={lead.email} readOnly />
              </div>
              <div className="field">
                <label htmlFor="lead-phone-view">Phone</label>
                <input id="lead-phone-view" className="input" value={lead.phone} readOnly />
              </div>
            </div>

            {lead.valueHidden ? (
              <div className="field">
                <label>Opportunity value</label>
                <p className="hint" style={{ margin: 0 }}>
                  Restricted — your role does not include <code>opportunity_value.view</code>. The
                  server does not send this value to your browser.
                </p>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="lead-value-view">Opportunity value</label>
                <input
                  id="lead-value-view"
                  className="input"
                  type="number"
                  defaultValue={lead.value}
                  disabled={!canEdit}
                  onBlur={(event) => {
                    const value = Number(event.target.value);

                    if (value !== lead.value) {
                      void act(() => crmApi.updateLead(token, lead.id, { value }), 'Value updated');
                    }
                  }}
                />
              </div>
            )}

            {lead.notes ? (
              <div className="field">
                <label>Notes</label>
                <p className="muted" style={{ fontSize: '0.8125rem', whiteSpace: 'pre-wrap' }}>
                  {lead.notes}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <span className="label-micro">Book an appointment</span>
          <p className="hint">Checks the connected Google Calendar for conflicts before booking.</p>

          <form className="form" onSubmit={book}>
            <div className="field">
              <label htmlFor="lead-slot">Date and time</label>
              <input
                id="lead-slot"
                className="input"
                type="datetime-local"
                value={slot}
                onChange={(event) => setSlot(event.target.value)}
                disabled={!canBook}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={busy || !canBook}>
              <CalendarPlus size={15} aria-hidden="true" />
              Book 30 minutes
            </button>
          </form>
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Activity</h2>

        {canEdit ? (
          <form className="form" onSubmit={addActivity} style={{ marginBottom: '1rem' }}>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="activity-kind">Kind</label>
                <select
                  id="activity-kind"
                  className="select"
                  value={activity.kind}
                  onChange={(event) => setActivity({ ...activity, kind: event.target.value })}
                >
                  {['note', 'call', 'email', 'meeting', 'whatsapp', 'sms'].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="activity-summary">What happened</label>
                <input
                  id="activity-summary"
                  className="input"
                  value={activity.summary}
                  onChange={(event) => setActivity({ ...activity, summary: event.target.value })}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-secondary" disabled={busy}>
              <Send size={14} aria-hidden="true" />
              Add to the history
            </button>
          </form>
        ) : null}

        <ul className="voice-log">
          {(lead.activities ?? []).map((entry) => (
            <li className="voice-turn" key={entry.id}>
              <span className="label-micro">
                {entry.kind} · {entry.by || 'system'} · {new Date(entry.at).toLocaleString()}
              </span>
              <p>{entry.summary}</p>
            </li>
          ))}
          {(lead.activities ?? []).length === 0 ? <p className="hint">Nothing recorded yet.</p> : null}
        </ul>
      </section>
    </>
  );
}
