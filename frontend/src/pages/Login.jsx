import { CircleAlert, CircleCheckBig, Info } from 'lucide-react';
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
  const { login, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');

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

    return () => {
      active = false;
    };
  }, []);

  const redirectTo = location.state?.from ?? '/crm';

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);

    try {
      const account = await login({ email: form.email.trim(), password: form.password });

      showToast({
        tone: 'success',
        title: `Welcome back, ${account.name.split(' ')[0]}`,
        message: 'Your workspace is ready.',
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
