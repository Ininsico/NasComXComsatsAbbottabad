import {
  Bell,
  Bitcoin,
  BookOpen,
  Bot,
  Briefcase,
  CalendarCheck,
  CloudUpload,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import AsyncSection from '../components/AsyncSection.jsx';
import { useAuth } from '../context/authContext.js';
import { ROLE_LABELS } from '../data/site.js';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  percent,
} from '../lib/format.js';

const TINTED = new Set(['amber', 'emerald', 'rose']);

const PAYMENT_TONES = {
  confirmed: 'pill--done',
  overpaid: 'pill--pending',
  mismatch: 'pill--problem',
  expired: 'pill--neutral',
  awaiting_payment: 'pill--info',
};

const PAYMENT_LABELS = {
  confirmed: 'Confirmed',
  overpaid: 'Overpaid',
  mismatch: 'Mismatch',
  expired: 'Expired',
  awaiting_payment: 'Awaiting',
};

const usdt = (value) => `${Number(value ?? 0).toFixed(2)} USDT`;

function Tile({ icon: Icon, label, value, tone = 'blue' }) {
  return (
    <div className={`tile${TINTED.has(tone) ? ` tint-${tone}` : ''}`}>
      <span className={`tile__icon tile__icon--${tone}`} aria-hidden="true">
        <Icon size={17} />
      </span>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
    </div>
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

function Portfolio({ portfolio }) {
  if (portfolio.available === false) {
    return (
      <p className="alert alert--pending">
        <TriangleAlert size={15} aria-hidden="true" />
        Portfolio unavailable: {portfolio.reason}
      </p>
    );
  }

  const totals = portfolio.totals;
  const subs = portfolio.subscriptions;

  return (
    <>
      {portfolio.permissions.canWithdraw || portfolio.permissions.canTrade ? (
        <p className="alert alert--error" style={{ marginBottom: '1rem' }}>
          <ShieldCheck size={15} aria-hidden="true" />
          This API key can trade and withdraw. The portal only ever reads from Binance, but restrict
          the key to “Enable Reading” so a leaked secret cannot move funds.
        </p>
      ) : (
        <p className="alert alert--success" style={{ marginBottom: '1rem' }}>
          <ShieldCheck size={15} aria-hidden="true" />
          Key is read-only — no trading or withdrawal permission.
        </p>
      )}

      <div className="dash-grid">
        <Tile
          icon={Briefcase}
          label="Total portfolio"
          value={usdt(totals.walletValue)}
          tone={totals.walletValue > 0 ? 'emerald' : 'amber'}
        />
        <Tile icon={Bitcoin} label="Deposits received" value={usdt(totals.depositsReceived)} />
        <Tile icon={CreditCard} label="Subscription revenue" value={usdt(totals.subscriptionRevenue)} />
        <Tile
          icon={Clock}
          label="Awaiting payment"
          value={subs.pendingCount}
          tone={subs.pendingCount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      <div className="table-wrap" style={{ marginTop: '1rem' }}>
        <table className="table">
          <caption>
            Holdings valued in {portfolio.asset} · priced live from the Binance ticker
          </caption>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Free</th>
              <th scope="col">Locked</th>
              <th scope="col">Price ({portfolio.asset})</th>
              <th scope="col">Value ({portfolio.asset})</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.holdings.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No funds in the spot wallet yet — the portfolio is {usdt(0)}.
                </td>
              </tr>
            ) : (
              portfolio.holdings.map((holding) => (
                <tr key={holding.asset}>
                  <th scope="row">{holding.asset}</th>
                  <td>{holding.free}</td>
                  <td>{holding.locked}</td>
                  <td>{holding.price === null ? '—' : holding.price}</td>
                  <td>{holding.value === null ? 'unpriced' : holding.value}</td>
                </tr>
              ))
            )}
            <tr>
              <th scope="row">Total portfolio value</th>
              <td colSpan={3} />
              <td>
                <span className="pill pill--done">{usdt(totals.walletValue)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {portfolio.unpriced.length > 0 ? (
        <p className="hint" style={{ marginTop: '0.5rem' }}>
          No USDT market for {portfolio.unpriced.join(', ')}, so those holdings are excluded from the
          total.
        </p>
      ) : null}

      {subs.intents.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
          <table className="table">
            <caption>
              {subs.settledCount} settled · {subs.pendingCount} awaiting ·{' '}
              {subs.mismatchedCount} mismatched · {usdt(subs.revenue)} collected
            </caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Member</th>
                <th scope="col">Plan</th>
                <th scope="col">Expected</th>
                <th scope="col">Received</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {subs.intents.map((intent) => (
                <tr key={intent.reference}>
                  <th scope="row" style={{ fontFamily: 'var(--font-mono)' }}>
                    {intent.reference}
                  </th>
                  <td>{intent.userEmail}</td>
                  <td>{intent.planName}</td>
                  <td>{usdt(intent.expectedAmount)}</td>
                  <td>{usdt(intent.matchedTotal)}</td>
                  <td>
                    <span className={`pill ${PAYMENT_TONES[intent.status] ?? 'pill--neutral'}`}>
                      {PAYMENT_LABELS[intent.status] ?? intent.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export default function Admin() {
  const { token } = useAuth();
  const loadOverview = useCallback(() => api.adminOverview(token), [token]);
  const { data, error, loading, reload } = useApiResource(loadOverview);

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Admin console</h1>
          <p>
            Everything on campus in one place
            {data?.generatedAt ? ` · snapshot ${formatDateTime(data.generatedAt)}` : ''}
          </p>
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
        shape="tiles"
        count={8}
        label="Loading the admin console"
        errorTitle="We could not load the admin console"
      >
        {data ? (
          <>
            <div className="dash-grid">
              <Tile icon={Users} label="Accounts" value={data.counts.users} />
              <Tile icon={GraduationCap} label="Students" value={data.counts.students} />
              <Tile icon={BookOpen} label="Faculty accounts" value={data.counts.facultyAccounts} />
              <Tile
                icon={FileText}
                label="Documents"
                value={data.counts.documents}
                tone={data.counts.documents > 0 ? 'emerald' : 'amber'}
              />
              <Tile icon={TrendingUp} label="Average CGPA" value={data.academics.averageCgpa.toFixed(2)} />
              <Tile
                icon={CalendarCheck}
                label="Average attendance"
                value={percent(data.academics.averageAttendance)}
                tone={data.academics.averageAttendance >= 75 ? 'emerald' : 'rose'}
              />
              <Tile
                icon={CreditCard}
                label="Fees outstanding"
                value={formatCurrency(data.academics.outstandingTotal)}
                tone={data.academics.outstandingCount > 0 ? 'amber' : 'emerald'}
              />
              <Tile icon={HardDrive} label="Stored files" value={formatBytes(data.storage.bytes)} />
            </div>

            <section className="dash-section">
              <SectionTitle icon={BookOpen}>Campus inventory</SectionTitle>
              <ul className="info-list info-list--grid">
                <li>
                  <strong>Programmes</strong>
                  <span>{data.counts.programmes}</span>
                </li>
                <li>
                  <strong>Faculty members listed</strong>
                  <span>{data.counts.facultyMembers}</span>
                </li>
                <li>
                  <strong>Announcements</strong>
                  <span>{data.counts.announcements}</span>
                </li>
                <li>
                  <strong>Parents</strong>
                  <span>{data.counts.parents}</span>
                </li>
                <li>
                  <strong>Administrators</strong>
                  <span>{data.counts.admins}</span>
                </li>
                <li>
                  <strong>Students with records</strong>
                  <span>{data.counts.trackedStudents}</span>
                </li>
              </ul>

              <div className="btn-row" style={{ marginTop: '1rem' }}>
                <span className={`pill ${data.integrations.cloudinary ? 'pill--done' : 'pill--problem'}`}>
                  <CloudUpload size={12} aria-hidden="true" />
                  Cloudinary {data.integrations.cloudinary ? 'connected' : 'off'}
                </span>
                <span className={`pill ${data.integrations.groq ? 'pill--done' : 'pill--problem'}`}>
                  <Bot size={12} aria-hidden="true" />
                  Groq {data.integrations.groq ? 'connected' : 'off'}
                </span>
                <span className={`pill ${data.integrations.binance ? 'pill--done' : 'pill--problem'}`}>
                  <Bitcoin size={12} aria-hidden="true" />
                  Binance {data.integrations.binance ? 'connected' : 'off'}
                </span>
                <Link className="btn btn-secondary btn-sm" to="/documents">
                  <FileText size={14} aria-hidden="true" />
                  Manage documents
                </Link>
                <Link className="btn btn-secondary btn-sm" to="/payments">
                  <Wallet size={14} aria-hidden="true" />
                  Open payments
                </Link>
              </div>
            </section>

            <section className="dash-section">
              <SectionTitle icon={Wallet}>Crypto portfolio (read-only)</SectionTitle>
              <Portfolio portfolio={data.portfolio} />
            </section>

            <section className="dash-section">
              <SectionTitle icon={Users}>All accounts</SectionTitle>
              <div className="table-wrap">
                <table className="table">
                  <caption>{data.users.length} registered accounts</caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((account) => (
                      <tr key={account.id}>
                        <th scope="row">{account.name}</th>
                        <td>{account.email}</td>
                        <td>
                          <span
                            className={`pill ${
                              account.role === 'admin'
                                ? 'pill--problem'
                                : account.role === 'faculty'
                                  ? 'pill--info'
                                  : account.role === 'parent'
                                    ? 'pill--neutral'
                                    : 'pill--done'
                            }`}
                          >
                            {ROLE_LABELS[account.role] ?? account.role}
                          </span>
                        </td>
                        <td>{formatDate(account.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dash-section">
              <SectionTitle icon={GraduationCap}>Student records</SectionTitle>
              <div className="table-wrap">
                <table className="table">
                  <caption>Attendance, results and fees</caption>
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Registration</th>
                      <th scope="col">Semester</th>
                      <th scope="col">CGPA</th>
                      <th scope="col">Attendance</th>
                      <th scope="col">Fees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((student) => (
                      <tr key={student.email}>
                        <th scope="row">
                          {student.name}
                          <span className="hint" style={{ display: 'block' }}>
                            {student.programme}
                          </span>
                        </th>
                        <td>{student.registrationNo}</td>
                        <td>{student.semester}</td>
                        <td>{student.cgpa.toFixed(2)}</td>
                        <td>
                          <span
                            className={`pill ${student.attendance >= 75 ? 'pill--done' : 'pill--problem'}`}
                          >
                            {percent(student.attendance)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`pill ${student.feeDue > 0 ? 'pill--pending' : 'pill--done'}`}
                          >
                            {student.feeDue > 0 ? formatCurrency(student.feeDue) : 'Cleared'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dash-section">
              <SectionTitle icon={FileText}>Uploaded documents</SectionTitle>
              {data.documents.length === 0 ? (
                <p className="alert alert--info">
                  <FileText size={15} aria-hidden="true" />
                  No files have been uploaded yet. Students, faculty and admins can upload from the
                  Documents page.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption>
                      {data.documents.length} file(s) · {formatBytes(data.storage.bytes)} stored
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Uploaded by</th>
                        <th scope="col">Size</th>
                        <th scope="col">When</th>
                        <th scope="col">File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.documents.map((document) => (
                        <tr key={document.id}>
                          <th scope="row">{document.title}</th>
                          <td>
                            {document.ownerName}
                            <span className="hint" style={{ display: 'block' }}>
                              {ROLE_LABELS[document.ownerRole] ?? document.ownerRole}
                            </span>
                          </td>
                          <td>{formatBytes(document.bytes)}</td>
                          <td>{formatDateTime(document.createdAt)}</td>
                          <td>
                            <a href={document.url} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="dash-section">
              <SectionTitle icon={Bell}>Campus announcements</SectionTitle>
              <ul className="notice-list">
                {data.announcements.map((item) => (
                  <li key={item.id}>
                    <div className="notice__meta">
                      <span className="badge">{item.category}</span>
                      <time dateTime={item.date}>{formatDate(item.date)}</time>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </AsyncSection>
    </>
  );
}
