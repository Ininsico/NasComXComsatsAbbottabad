import {
  Activity,
  ArrowRight,
  Clock,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { dashboardApi } from '../lib/api.js';

const REFRESH_MS = 15000;

const money = (value) => `$${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Seconds into the shortest honest unit. Null means nothing has been answered yet. */
function duration(seconds) {
  if (seconds === null || seconds === undefined) return 'no data yet';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;

  return `${(seconds / 3600).toFixed(1)}h`;
}

export default function Dashboard() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(null);

  const apply = useCallback((payload) => setData(payload), []);
  const fetchAll = useCallback(() => dashboardApi.get(token), [token]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load the dashboard', message: error.message }),
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
        if (active) showToast({ tone: 'error', title: 'Could not load the dashboard', message: error.message });
      });

    const timer = setInterval(refresh, REFRESH_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchAll, apply, refresh, showToast]);

  if (!data) return <p className="hint">Loading the dashboard…</p>;

  const { leads, pipeline, revenue, subscription, team } = data;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>{data.workspace.name}</h1>
          <p>
            Updated {new Date(data.generatedAt).toLocaleTimeString()} · {subscription.planName} (
            {subscription.status})
          </p>
        </div>
        <Link className="btn btn-secondary btn-sm" to="/subscription">
          <Wallet size={14} aria-hidden="true" />
          Subscription
        </Link>
      </div>

      <section className="metric-grid" style={{ marginBottom: '1.25rem' }}>
        <Link className="metric-tile" to="/crm">
          <span className="label-micro">New leads today</span>
          <strong>{leads.newToday}</strong>
          <span className="hint">{leads.weekLeads} this week</span>
        </Link>

        <Link className="metric-tile" to="/crm">
          <span className="label-micro">Open pipeline value</span>
          <strong>{data.valueHidden ? 'Restricted' : money(pipeline.openValue)}</strong>
          <span className="hint">
            {data.valueHidden
              ? 'your role cannot see opportunity value'
              : `${money(pipeline.wonValue)} won to date`}
          </span>
        </Link>

        <article className="metric-tile">
          <span className="label-micro">Avg time to first response</span>
          <strong>{duration(leads.avgFirstResponseSeconds)}</strong>
          <span className="hint">
            {leads.acknowledgedCount} acknowledged lead(s) measured
          </span>
        </article>

        <Link className={`metric-tile${leads.recoveryCount > 0 ? ' is-warn' : ''}`} to="/recovery">
          <span className="label-micro">Recovery queue</span>
          <strong>{leads.recoveryCount}</strong>
          <span className="hint">{leads.overdue} past the acknowledgement deadline</span>
        </Link>

        <article className={`metric-tile${leads.escalations24h > 0 ? ' is-warn' : ''}`}>
          <span className="label-micro">Escalations in 24h</span>
          <strong>{leads.escalations24h}</strong>
          <span className="hint">{leads.unacknowledged} awaiting acknowledgement</span>
        </article>

        <Link className="metric-tile" to="/subscription">
          <span className="label-micro">Payments received this month</span>
          <strong>{data.valueHidden ? 'Restricted' : money(revenue.collectedThisMonth)}</strong>
          <span className="hint">
            {data.valueHidden ? 'your role cannot see amounts' : 'collected only, not projected'}
          </span>
        </Link>

        <article className="metric-tile">
          <span className="label-micro">Projected revenue</span>
          <strong>{data.valueHidden ? 'Restricted' : money(revenue.projected)}</strong>
          <span className="hint">
            {data.valueHidden
              ? 'your role cannot see amounts'
              : `open opportunities plus ${revenue.awaitingPaymentRequests} unpaid request(s)`}
          </span>
        </article>

        <article className="metric-tile">
          <span className="label-micro">Conversion</span>
          <strong>{leads.conversionRate}%</strong>
          <span className="hint">{pipeline.monthWon} won this month</span>
        </article>
      </section>

      <section className="grid grid-2" style={{ marginBottom: '1.25rem' }}>
        <article className="card">
          <span className="label-micro">
            <TrendingUp size={12} aria-hidden="true" /> Pipeline by stage
          </span>

          <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Leads</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(pipeline.stageLabels).map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">
                      <Link to="/crm">{label}</Link>
                    </th>
                    <td>{pipeline.byStage[key] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <span className="label-micro">
            <Users size={12} aria-hidden="true" /> Team availability
          </span>

          <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Status</th>
                  <th scope="col">Open leads</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.id}>
                    <th scope="row">
                      {member.name}
                      <br />
                      <span className="hint">{member.levelLabel}</span>
                    </th>
                    <td>
                      <span className={`pill ${member.available ? 'pill--done' : 'pill--neutral'}`}>
                        {member.available ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                    <td>
                      {member.openLeads}
                      {member.openLeadLimit ? ` / ${member.openLeadLimit}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginBottom: 0 }}>
            <Zap size={12} aria-hidden="true" /> Round-robin only considers available members under their
            limit. Change this in Workspace settings.
          </p>
        </article>
      </section>

      <section className="grid grid-2">
        <article className="card">
          <span className="label-micro">
            <Activity size={12} aria-hidden="true" /> Latest leads
          </span>

          <ul className="voice-log">
            {data.recentLeads.map((lead) => (
              <li className="voice-turn" key={lead.id}>
                <Link to={`/crm/${lead.id}`}>
                  <strong>{lead.name}</strong>
                </Link>
                <span className="hint">
                  {' '}
                  · {lead.stage} · {lead.assigneeName ?? 'Unassigned'}
                </span>
                {lead.overdueSeconds > 0 ? (
                  <p className="hint" style={{ margin: 0 }}>
                    <TriangleAlert size={12} aria-hidden="true" /> {lead.overdueSeconds}s past the deadline
                  </p>
                ) : null}
              </li>
            ))}
            {data.recentLeads.length === 0 ? <p className="hint">No leads yet.</p> : null}
          </ul>
        </article>

        <article className="card">
          <span className="label-micro">
            <Clock size={12} aria-hidden="true" /> Recent activity
          </span>

          <ul className="voice-log">
            {data.recentActivities.map((entry) => (
              <li className="voice-turn" key={entry.id}>
                <span className="label-micro">
                  {entry.kind} · {entry.by} · {new Date(entry.at).toLocaleString()}
                </span>
                <p>{entry.summary}</p>
              </li>
            ))}
            {data.recentActivities.length === 0 ? <p className="hint">Nothing recorded yet.</p> : null}
          </ul>
        </article>
      </section>

      <p className="hint" style={{ marginTop: '1rem' }}>
        <ShieldAlert size={12} aria-hidden="true" /> Every figure comes from the same read, so the tiles
        agree with each other. Click a tile to open the records behind it.{' '}
        <Link to="/crm">
          Open the pipeline <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </p>
    </>
  );
}
