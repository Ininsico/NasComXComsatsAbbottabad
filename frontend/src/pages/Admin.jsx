import {
  Activity,
  Bell,
  Bitcoin,
  BookOpen,
  Bot,
  Briefcase,
  CalendarCheck,
  CloudUpload,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  GraduationCap,
  HardDrive,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AsyncSection from '../components/AsyncSection.jsx';
import PlatformHealth from '../components/PlatformHealth.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
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
      {portfolio.permissions === null ? (
        <p className="alert alert--pending" style={{ marginBottom: '1rem' }}>
          <ShieldCheck size={15} aria-hidden="true" />
          The key&apos;s permissions could not be read, so the read-only guarantee is unconfirmed.
        </p>
      ) : portfolio.permissions.canWithdraw || portfolio.permissions.canTrade ? (
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
          value={usdt(totals.totalValue)}
          tone={totals.totalValue > 0 ? 'emerald' : 'amber'}
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
            Account scope · every wallet this key can read, valued live in {portfolio.asset}
          </caption>
          <thead>
            <tr>
              <th scope="col">Wallet</th>
              <th scope="col">Holdings</th>
              <th scope="col">Value ({portfolio.asset})</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.wallets.map((wallet) => (
              <tr key={wallet.id}>
                <th scope="row">{wallet.label}</th>
                <td>{wallet.count}</td>
                <td>{wallet.value.toFixed(2)}</td>
                <td>
                  <span
                    className={`pill ${wallet.status === 'ok' ? 'pill--done' : 'pill--problem'}`}
                  >
                    {wallet.status === 'ok' ? 'Readable' : 'Unavailable'}
                  </span>
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">Total across all wallets</th>
              <td colSpan={2} />
              <td>
                <span className="pill pill--done">{usdt(totals.totalValue)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {portfolio.unreadable.length > 0 ? (
        <ul className="hint" style={{ margin: '0.5rem 0 0', paddingLeft: '1.15rem' }}>
          {portfolio.unreadable.map((wallet) => (
            <li key={wallet.id}>
              {wallet.label}: {wallet.error}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
        <table className="table">
          <caption>
            {portfolio.holdings.length} holding(s) with a non-zero balance across readable wallets
          </caption>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Wallet</th>
              <th scope="col">Free</th>
              <th scope="col">Locked</th>
              <th scope="col">Price ({portfolio.asset})</th>
              <th scope="col">Value ({portfolio.asset})</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.holdings.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No funds in any wallet yet — the portfolio is {usdt(0)}.
                </td>
              </tr>
            ) : (
              portfolio.holdings.map((holding) => (
                <tr key={`${holding.wallet}-${holding.asset}`}>
                  <th scope="row">{holding.asset}</th>
                  <td>
                    <span className="pill pill--neutral">{holding.walletLabel}</span>
                  </td>
                  <td>{holding.free}</td>
                  <td>{holding.locked}</td>
                  <td>{holding.price === null ? '—' : holding.price}</td>
                  <td>{holding.value === null ? 'unpriced' : holding.value}</td>
                </tr>
              ))
            )}
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

const WA_TONES = {
  ready: 'pill--done',
  authenticated: 'pill--done',
  qr: 'pill--pending',
  starting: 'pill--info',
  error: 'pill--problem',
  disconnected: 'pill--problem',
};

const WA_LABELS = {
  ready: 'Connected',
  authenticated: 'Authenticated',
  qr: 'Scan the QR code',
  starting: 'Starting…',
  stopped: 'Stopped',
  error: 'Error',
  disconnected: 'Disconnected',
  unknown: 'Unknown',
};

function WhatsApp({ wa, busy, onRefresh, onAction, test, onTestChange, onSend }) {
  const tone = WA_TONES[wa.status] ?? 'pill--neutral';

  return (
    <>
      <div className="btn-row" style={{ marginBottom: '1rem' }}>
        <span className={`pill ${tone}`}>
          <MessageCircle size={12} aria-hidden="true" />
          {WA_LABELS[wa.status] ?? wa.status}
        </span>
        {wa.me ? <span className="pill pill--neutral">{wa.me}</span> : null}
        <span className="pill pill--neutral">received {wa.received ?? 0}</span>
        <span className="pill pill--neutral">replied {wa.replied ?? 0}</span>
      </div>

      {wa.error ? (
        <p className="alert alert--error" style={{ marginBottom: '1rem' }}>
          <TriangleAlert size={15} aria-hidden="true" />
          {wa.error}
        </p>
      ) : null}

      <div className="btn-row">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('start')} disabled={busy}>
          <MessageCircle size={14} aria-hidden="true" />
          {busy ? 'Working…' : 'Start / link WhatsApp'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAction('stop')} disabled={busy}>
          Stop
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {wa.qrDataUrl ? (
        <div className="wa-qr" style={{ marginTop: '1rem' }}>
          <span className="label-micro">Scan with WhatsApp → Linked devices</span>
          <img src={wa.qrDataUrl} alt="WhatsApp pairing QR code" />
          <p className="hint" style={{ margin: 0 }}>
            The session is saved to disk, so this is only needed once.
          </p>
        </div>
      ) : null}

      <form className="doc-upload" style={{ marginTop: '1.25rem' }} onSubmit={onSend}>
        <div className="field">
          <label htmlFor="wa-to">Send a test message to</label>
          <input
            id="wa-to"
            className="input"
            value={test.to}
            onChange={(event) => onTestChange({ ...test, to: event.target.value })}
            placeholder="923001234567"
          />
        </div>
        <div className="field">
          <label htmlFor="wa-text">Message</label>
          <input
            id="wa-text"
            className="input"
            value={test.text}
            onChange={(event) => onTestChange({ ...test, text: event.target.value })}
            placeholder="Test from the campus portal"
          />
        </div>
        <button type="submit" className="btn btn-secondary" disabled={busy}>
          Send
        </button>
      </form>

      <p className="hint" style={{ marginTop: '0.75rem' }}>
        Incoming messages are answered from the RAG pipeline: the sender&apos;s number is matched to a
        member profile, and the reply is grounded in that member&apos;s own vector space plus the
        shared campus one.
      </p>
    </>
  );
}

export default function Admin() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const loadOverview = useCallback(() => api.adminOverview(token), [token]);
  const { data, error, loading, reload } = useApiResource(loadOverview);

  const [wa, setWa] = useState({ status: 'unknown' });
  const [waBusy, setWaBusy] = useState(false);
  const [waTest, setWaTest] = useState({ to: '', text: '' });

  const refreshWhatsApp = useCallback(async () => {
    try {
      setWa(await api.whatsappStatus(token));
    } catch (statusError) {
      setWa({ status: 'error', error: statusError.message });
    }
  }, [token]);

  useEffect(() => {
    let active = true;

    api
      .whatsappStatus(token)
      .then((status) => {
        if (active) setWa(status);
      })
      .catch((statusError) => {
        if (active) setWa({ status: 'error', error: statusError.message });
      });

    return () => {
      active = false;
    };
  }, [token]);

  // While the client is booting or waiting for a scan, keep the QR fresh.
  useEffect(() => {
    if (!['starting', 'qr'].includes(wa.status)) return undefined;

    const id = setInterval(() => {
      void refreshWhatsApp();
    }, 4000);

    return () => clearInterval(id);
  }, [wa.status, refreshWhatsApp]);

  async function handleWhatsAppAction(action) {
    setWaBusy(true);

    try {
      setWa(action === 'start' ? await api.whatsappStart(token) : await api.whatsappStop(token));
    } catch (actionError) {
      setWa({ status: 'error', error: actionError.message });
    } finally {
      setWaBusy(false);
    }
  }

  async function handleWhatsAppSend(event) {
    event.preventDefault();
    setWaBusy(true);

    try {
      const result = await api.whatsappSend(token, waTest.to.trim(), waTest.text.trim());
      showToast({ tone: 'success', title: 'Message sent', message: `Queued to ${result.to}.` });
      setWaTest({ to: '', text: '' });
    } catch (sendError) {
      showToast({ tone: 'error', title: 'Could not send', message: sendError.message });
    } finally {
      setWaBusy(false);
    }
  }

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
        <div className="btn-row">
          {/* Grafana is served under /grafana/ by the same origin, so a plain link works
              and needs no extra hostname or certificate. */}
          <a className="btn btn-secondary btn-sm" href="/grafana/" target="_blank" rel="noreferrer">
            <Activity size={14} aria-hidden="true" />
            Grafana
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <PlatformHealth />

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
              <SectionTitle icon={MessageCircle}>WhatsApp assistant</SectionTitle>
              <WhatsApp
                wa={wa}
                busy={waBusy}
                onRefresh={refreshWhatsApp}
                onAction={handleWhatsAppAction}
                test={waTest}
                onTestChange={setWaTest}
                onSend={handleWhatsAppSend}
              />
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
