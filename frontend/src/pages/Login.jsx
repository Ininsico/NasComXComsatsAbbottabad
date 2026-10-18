import { CircleAlert, CircleCheckBig, Info, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { api, API_BASE_URL, ApiError } from '../lib/api.js';

/**
 * Sign-in. Google is the way in; the email and password form stays for accounts an
 * operator created through the CLI (`npm run owner:create`).
 */
export default function Login() {
  const { login, adoptToken, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [googleInfo, setGoogleInfo] = useState(null);
  const [instantInfo, setInstantInfo] = useState(null);

  useEffect(() => {
    let active = true;

    api
      .health()
      .then(() => {
        if (active) setApiStatus('ok');
      })
      .catch(() => {
        if (active) setApiStatus('down');
      });

    // So the redirect_uri_mismatch help can name the exact URLs this server sends.
    api
      .googleInfo()
      .then((payload) => {
        if (active) setGoogleInfo(payload);
      })
      .catch(() => {});

    // 404s unless INSTANT_LOGIN is enabled, which is the point: no button, no endpoint.
    api
      .instantLoginInfo()
      .then((payload) => {
        if (active) setInstantInfo(payload);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const redirectTo = location.state?.from ?? '/dashboard';

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await signIn({ email: form.email.trim(), password: form.password });
  }

  /** The demo buttons carry the seeded credentials, so one click is the whole sign-in. */
  async function signIn(credentials, welcome) {
    setError('');
    setFieldErrors({});
    setSubmitting(true);

    try {
      const account = await login(credentials);

      showToast({
        tone: 'success',
        title: `Welcome back, ${account.name.split(' ')[0]}`,
        message: welcome ?? 'Your workspace is ready.',
      });

      // A platform administrator lands on the system console; everyone else lands on the
      // workspace dashboard. Two different jobs, two different home screens.
      navigate(location.state?.from ?? (account.role === 'admin' ? '/admin' : '/dashboard'), {
        replace: true,
      });
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

  /** One click into a workspace role: Owner, Admin, Manager or User. */
  async function signInAsRole(role) {
    setSubmitting(true);

    try {
      const result = await api.instantLogin(role);

      adoptToken(result.token);
      showToast({ tone: 'success', title: `Signed in as ${result.user.name}` });
      navigate('/dashboard', { replace: true });
    } catch (instantError) {
      showToast({ tone: 'error', title: 'Could not sign in', message: instantError.message });
    } finally {
      setSubmitting(false);
    }
  }

  /** The platform operator's console, which is a different job from a workspace role. */
  async function signInAsAdmin() {
    setSubmitting(true);

    try {
      const result = await api.instantLogin();

      adoptToken(result.token);
      showToast({ tone: 'success', title: `Signed in as ${result.user.name}` });
      navigate('/admin', { replace: true });
    } catch (instantError) {
      showToast({ tone: 'error', title: 'Could not sign in', message: instantError.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="card">
        <h1>Welcome back</h1>
        <p className="muted" style={{ fontSize: '0.8125rem' }}>
          Sign in to open your workspace.
        </p>

        <div className="api-status" style={{ marginTop: '0.875rem' }}>
          <span
            className={`pill ${
              apiStatus === 'ok' ? 'pill--done' : apiStatus === 'down' ? 'pill--problem' : 'pill--neutral'
            }`}
          >
            {apiStatus === 'ok' ? (
              <CircleCheckBig size={12} aria-hidden="true" />
            ) : apiStatus === 'down' ? (
              <CircleAlert size={12} aria-hidden="true" />
            ) : null}
            {apiStatus === 'down' ? 'API unreachable' : apiStatus === 'checking' ? 'Checking API…' : 'API connected'}
          </span>
          <span className="api-status__url">{API_BASE_URL}</span>
        </div>

        <div className="field" style={{ marginTop: '1.25rem' }}>
          <GoogleSignInButton />
        </div>

        {instantInfo?.roles?.length ? (
          <>
            <p className="auth__or">or jump in as a role</p>

            <div className="instant-login">
              {instantInfo.roles.map((entry) => (
                <button
                  key={entry.role}
                  type="button"
                  className="instant-login__button"
                  disabled={submitting}
                  onClick={() => signInAsRole(entry.role)}
                >
                  <strong>{entry.label}</strong>
                  <em>{entry.summary}</em>
                </button>
              ))}
            </div>

            <p className="hint" style={{ textAlign: 'center' }}>
              All four share the “Instant Demo” workspace, so the same records look different by
              role.
            </p>
          </>
        ) : null}

        {instantInfo?.systemAdmin ? (
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginBottom: '0.5rem' }}
            disabled={submitting}
            onClick={signInAsAdmin}
          >
            <ShieldCheck size={15} aria-hidden="true" />
            Sign in as System Administrator
          </button>
        ) : null}

        {googleInfo ? (
          <details className="google-setup">
            <summary>Google says “redirect_uri_mismatch”?</summary>
            <p className="hint">
              Copy both of these, exactly, into the OAuth client&rsquo;s Authorised redirect URIs, then
              save and try again.
            </p>
            <code>{googleInfo.signInRedirectUri}</code>
            <code>{googleInfo.calendarRedirectUri}</code>
            {!googleInfo.configured ? (
              <p className="hint" style={{ marginBottom: 0 }}>
                This server has no Google client configured either, so sign in with a password below.
              </p>
            ) : null}
          </details>
        ) : null}

        <p className="auth__or">or sign in with a password</p>

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
              onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
              aria-invalid={Boolean(fieldErrors.email)}
              autoComplete="email"
              placeholder="you@company.com"
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
              onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
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
        New here? <Link to="/signup">Create a workspace</Link>
      </p>
      <p className="auth__switch" style={{ marginTop: '0.375rem' }}>
        <Link to="/">Back to the website</Link>
      </p>
    </AuthShell>
  );
}
