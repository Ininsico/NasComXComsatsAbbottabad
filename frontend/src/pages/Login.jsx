import { CircleAlert, CircleCheckBig, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { DEMO_ACCOUNTS } from '../data/site.js';
import { api, API_BASE_URL, ApiError } from '../lib/api.js';

export default function Login() {
  const { login, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [demoAccounts, setDemoAccounts] = useState(null);

  useEffect(() => {
    let active = true;

    api
      .health()
      .then((payload) => {
        if (!active) return;
        setApiStatus('ok');
        setDemoAccounts(
          typeof payload.demoAccounts === 'number'
            ? { present: payload.demoAccounts, expected: payload.demoAccountsExpected ?? null }
            : null,
        );
      })
      .catch(() => {
        if (active) setApiStatus('down');
      });

    return () => {
      active = false;
    };
  }, []);

  const demoDataMissing =
    apiStatus === 'ok' && demoAccounts && demoAccounts.expected && demoAccounts.present < demoAccounts.expected;

  const redirectTo = location.state?.from ?? '/dashboard';

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  async function signIn(credentials, welcome) {
    setError('');
    setFieldErrors({});
    setSubmitting(true);

    try {
      const account = await login(credentials);
      showToast({
        tone: 'success',
        title: `Welcome back, ${account.name.split(' ')[0]}`,
        message: welcome ?? 'You are signed in to the campus portal.',
      });
      navigate(redirectTo, { replace: true });
    } catch (loginError) {
      if (loginError instanceof ApiError && loginError.fields) {
        setFieldErrors(loginError.fields);
      }
      const message = loginError.message ?? 'Unable to log in. Please try again.';
      setError(message);
      showToast({
        tone: 'error',
        title: 'Sign in failed',
        message: `${message} (API: ${API_BASE_URL})`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    signIn({ email: form.email.trim(), password: form.password });
  }

  function handleInstantLogin(event) {
    const account = DEMO_ACCOUNTS.find((item) => item.email === event.target.value);
    if (!account) return;

    setForm({ email: account.email, password: account.password });
    signIn({ email: account.email, password: account.password }, account.summary);
  }

  return (
    <AuthShell>
      <div className="card">
        <h1>Welcome back</h1>
        <p className="muted" style={{ fontSize: '0.8125rem' }}>
          Sign in to open your campus dashboard.
        </p>

        <div className="api-status" style={{ marginTop: '0.875rem' }}>
          <span
            className={`pill ${
              apiStatus === 'ok'
                ? demoDataMissing
                  ? 'pill--pending'
                  : 'pill--done'
                : apiStatus === 'down'
                  ? 'pill--problem'
                  : 'pill--neutral'
            }`}
          >
            {apiStatus === 'ok' ? (
              <CircleCheckBig size={12} aria-hidden="true" />
            ) : apiStatus === 'down' ? (
              <CircleAlert size={12} aria-hidden="true" />
            ) : null}
            {apiStatus === 'down'
              ? 'API unreachable'
              : apiStatus === 'checking'
                ? 'Checking API…'
                : demoAccounts
                  ? `API connected · ${demoAccounts.present}/${demoAccounts.expected} demo accounts`
                  : 'API connected'}
          </span>
          <span className="api-status__url">{API_BASE_URL}</span>
        </div>

        {demoDataMissing ? (
          <p className="alert alert--pending" style={{ marginBottom: '1rem' }}>
            <Info size={15} aria-hidden="true" />
            This backend has no demo accounts yet. Restart it — running the API seeds them on boot —
            or run <code>npm --prefix backend run seed</code>.
          </p>
        ) : null}

        <div className="field" style={{ marginTop: '1.25rem' }}>
          <label htmlFor="instant-login">Instant demo login</label>
          <select
            id="instant-login"
            className="select"
            defaultValue=""
            onChange={handleInstantLogin}
            disabled={submitting}
          >
            <option value="">Choose an account to sign in with…</option>
            {DEMO_ACCOUNTS.map((account) => (
              <option key={account.email} value={account.email}>
                {account.label} — {account.summary}
              </option>
            ))}
          </select>
        </div>

        <p className="auth__or">or sign in manually</p>

        {error ? (
          <p className="alert alert--error" role="alert" style={{ marginBottom: '1rem' }}>
            <Info size={15} aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              className="input"
              type="email"
              name="email"
              value={form.email}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, email: event.target.value }))
              }
              aria-invalid={Boolean(fieldErrors.email)}
              autoComplete="email"
              placeholder="you@comsats-abbottabad.edu.pk"
              required
            />
            {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              name="password"
              value={form.password}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, password: event.target.value }))
              }
              aria-invalid={Boolean(fieldErrors.password)}
              autoComplete="current-password"
              required
            />
            {fieldErrors.password ? (
              <span className="field-error">{fieldErrors.password}</span>
            ) : null}
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="auth__switch">
        New to the campus portal? <Link to="/signup">Create an account</Link>
      </p>
      <p className="auth__switch" style={{ marginTop: '0.375rem' }}>
        <Link to="/">Back to the website</Link>
      </p>
    </AuthShell>
  );
}
