import {
  Activity,
  Bot,
  CircleCheckBig,
  CloudUpload,
  CreditCard,
  Database,
  HardDrive,
  Kanban,
  Layers,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AsyncSection from '../components/AsyncSection.jsx';
import PlatformHealth from '../components/PlatformHealth.jsx';
import { useAuth } from '../context/authContext.js';
import useApiResource from '../hooks/useApiResource.js';
import { ROLE_LABELS } from '../data/site.js';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';

/**
 * The platform console: the deployment operator's view. A workspace's own figures live on
 * the workspace dashboard, so nothing here duplicates them — this is who is on the
 * install, what they have stored, and whether the services behind it are up.
 */
function Tile({ icon: Icon, label, value, hint }) {
  return (
    <article className="metric-tile">
      <span className="label-micro">
        <Icon size={12} aria-hidden="true" /> {label}
      </span>
      <strong>{value}</strong>
      {hint ? <span className="hint">{hint}</span> : null}
    </article>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="dash-section__title">
      <Icon size={17} aria-hidden="true" />
      {children}
    </h2>
  );
}

const initials = (name) =>
  String(name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

export default function Admin() {
  const { token } = useAuth();

  const loadOverview = useCallback(() => api.adminOverview(token), [token]);
  const { data, error, loading, reload } = useApiResource(loadOverview);

  const [people, setPeople] = useState(null);
  const [draft, setDraft] = useState({ name: '', email: '', role: 'user' });
  const [created, setCreated] = useState(null);
  const [notice, setNotice] = useState(null);
  const [peopleBusy, setPeopleBusy] = useState('');

  const loadPeople = useCallback(
    () =>
      api
        .adminUsers(token)
        .then((payload) => setPeople(payload.users ?? []))
        .catch(() => setPeople([])),
    [token],
  );

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Platform console</h1>
          <p>Deployment-wide totals, storage and service health.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        shape="cards"
        count={4}
        label="Loading platform totals"
        errorTitle="We could not load the platform totals"
      >
        <section className="metric-grid" style={{ marginBottom: '1.25rem' }}>
          <Tile
            icon={Users}
            label="Accounts"
            value={data.counts.users}
            hint={`${data.counts.admins} administrator(s), ${data.counts.regularUsers} member(s)`}
          />
          <Tile
            icon={Layers}
            label="Workspaces"
            value={data.counts.workspaces}
            hint={`${data.counts.members} membership(s)`}
          />
          <Tile
            icon={Kanban}
            label="Opportunities"
            value={data.counts.opportunities}
            hint={`${data.counts.activities} recorded activity entries`}
          />
          <Tile
            icon={ShieldCheck}
            label="Audited actions"
            value={data.counts.auditedActions}
            hint="Hash-chained, append-only"
          />
          <Tile
            icon={CloudUpload}
            label="Files"
            value={data.counts.documents}
            hint={`${data.storage.megabytes} MB stored`}
          />
        </section>

        <section className="grid grid-2" style={{ marginBottom: '1.25rem' }}>
          <article className="card">
            <span className="label-micro">
              <Bot size={12} aria-hidden="true" /> Services
            </span>
            <h3 style={{ marginTop: '0.25rem' }}>What this deployment can reach</h3>

            <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
              <span className={`pill ${data.integrations.groq ? 'pill--done' : 'pill--problem'}`}>
                <Bot size={12} aria-hidden="true" /> Groq {data.integrations.groq ? 'connected' : 'off'}
              </span>
              <span className={`pill ${data.integrations.cloudinary ? 'pill--done' : 'pill--problem'}`}>
                <CloudUpload size={12} aria-hidden="true" /> Cloudinary{' '}
                {data.integrations.cloudinary ? 'connected' : 'off'}
              </span>
              <span className={`pill ${data.integrations.stripe ? 'pill--done' : 'pill--problem'}`}>
                <CreditCard size={12} aria-hidden="true" /> Stripe{' '}
                {data.integrations.stripe ? 'connected' : 'off'}
              </span>
              <span className={`pill ${data.integrations.google ? 'pill--done' : 'pill--problem'}`}>
                Google {data.integrations.google ? 'connected' : 'off'}
              </span>
              <span className={`pill ${data.integrations.binance ? 'pill--done' : 'pill--problem'}`}>
                <Wallet size={12} aria-hidden="true" /> Binance{' '}
                {data.integrations.binance ? 'connected' : 'off'}
              </span>
            </div>

            <p className="hint">
              Passwords are never stored in plain text, and card numbers never reach this server.
            </p>

            <div className="btn-row">
              <Link className="btn btn-secondary btn-sm" to="/crm">
                <Kanban size={14} aria-hidden="true" />
                Open the pipeline
              </Link>
              <Link className="btn btn-secondary btn-sm" to="/subscription">
                <Wallet size={14} aria-hidden="true" />
                Billing
              </Link>
            </div>
          </article>

          <article className="card">
            <span className="label-micro">
              <Database size={12} aria-hidden="true" /> Storage
            </span>
            <h3 style={{ marginTop: '0.25rem' }}>Uploads</h3>

            <div className="detail-grid">
              <div>
                <span className="label-micro">Files</span>
                <p style={{ margin: 0 }}>{data.counts.documents}</p>
              </div>
              <div>
                <span className="label-micro">Total size</span>
                <p style={{ margin: 0 }}>{data.storage.megabytes} MB</p>
              </div>
            </div>

            <p className="hint">
              Everything else — companies, contacts, opportunities, payments and the audit log —
              lives in the deployment's own store and is included in that backup.
            </p>
          </article>
        </section>

        {data.portfolio?.balances?.length ? (
          <section className="dash-section">
            <SectionTitle icon={Wallet}>Crypto wallet, read-only</SectionTitle>
            <p className="hint">
              The portal never trades and never moves funds; it reads balances and deposit
              history only.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Free</th>
                    <th scope="col">Locked</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.portfolio.balances.map((balance) => (
                    <tr key={balance.asset}>
                      <th scope="row">{balance.asset}</th>
                      <td>{balance.free}</td>
                      <td>{balance.locked}</td>
                      <td>{balance.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="dash-section">
          <SectionTitle icon={Users}>People</SectionTitle>
          <p className="hint">
            Accounts live at the deployment level. Roles here decide who can open this console;
            workspace membership and level decide what each person sees inside a workspace.
          </p>

          <form
            className="card"
            style={{ marginBottom: '1rem' }}
            onSubmit={async (event) => {
              event.preventDefault();
              setPeopleBusy('create');
              setNotice(null);

              try {
                const result = await api.adminCreateUser(token, draft);
                setCreated({
                  email: result.user.email,
                  password: result.password,
                  workspace: result.workspace?.name ?? null,
                });
                setDraft({ name: '', email: '', role: 'user' });
                await loadPeople();
              } catch (createError) {
                setNotice({ tone: 'error', message: createError.message });
              } finally {
                setPeopleBusy('');
              }
            }}
          >
            <span className="label-micro">Create an account</span>
            <div className="grid grid-3" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label htmlFor="new-user-name">Name</label>
                <input
                  id="new-user-name"
                  className="input"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="new-user-email">Email</label>
                <input
                  id="new-user-email"
                  className="input"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="new-user-role">Role</label>
                <select
                  id="new-user-role"
                  className="select"
                  value={draft.role}
                  onChange={(event) => setDraft({ ...draft, role: event.target.value })}
                >
                  <option value="user">Member</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-sm" disabled={peopleBusy === 'create'}>
              {peopleBusy === 'create' ? 'Creating…' : 'Create the account'}
            </button>

            {created ? (
              <p className="alert alert--success" style={{ marginTop: '0.75rem' }}>
                <CircleCheckBig size={15} aria-hidden="true" />
                {created.email} is created{created.workspace ? ` with the workspace “${created.workspace}”` : ''}.
                Password: <code>{created.password}</code> — shown once.
              </p>
            ) : null}

            {notice ? <p className="alert alert--error">{notice.message}</p> : null}
          </form>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                  <th scope="col">Workspace</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {(people ?? []).map((account) => (
                  <tr key={account.id}>
                    <th scope="row">
                      <strong>{account.name}</strong>
                      <br />
                      <span className="hint">
                        {account.email}
                        {account.passwordSet ? '' : ' · Google only'}
                      </span>
                    </th>
                    <td>
                      <select
                        className="select"
                        value={account.role}
                        onChange={async (event) => {
                          setPeopleBusy(account.id);
                          setNotice(null);

                          try {
                            await api.adminUpdateUser(token, account.id, { role: event.target.value });
                            await loadPeople();
                          } catch (roleError) {
                            setNotice({ tone: 'error', message: roleError.message });
                          } finally {
                            setPeopleBusy('');
                          }
                        }}
                        disabled={peopleBusy === account.id}
                      >
                        <option value="user">Member</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </td>
                    <td>
                      {account.member ? (
                        <>
                          {account.member.workspaceName}
                          <br />
                          <span className="hint">
                            {account.member.level} · {account.member.status.replace('_', ' ')}
                          </span>
                        </>
                      ) : (
                        <span className="hint">none</span>
                      )}
                    </td>
                    <td>{formatDateTime(account.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dash-section">
          <SectionTitle icon={HardDrive}>Uploaded files</SectionTitle>
          {data.documents.length === 0 ? (
            <p className="hint">No files have been uploaded yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Uploaded</th>
                    <th scope="col">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documents.map((document) => (
                    <tr key={document.id}>
                      <th scope="row">
                        {initials(document.ownerName)} · {document.title || document.filename}
                        <br />
                        <span className="hint">{document.ownerEmail}</span>
                      </th>
                      <td>{ROLE_LABELS[document.ownerRole] ?? document.ownerRole}</td>
                      <td>{formatDateTime(document.uploadedAt)}</td>
                      <td>
                        {document.url ? (
                          <a className="btn btn-ghost btn-sm" href={document.url} target="_blank" rel="noreferrer">
                            View
                          </a>
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
        </section>

        <section className="dash-section">
          <SectionTitle icon={Activity}>Platform health</SectionTitle>
          <PlatformHealth />
        </section>
      </AsyncSection>
    </>
  );
}
