import { Info } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { ROLES } from '../data/site.js';
import { ApiError } from '../lib/api.js';

const EMPTY_FORM = { name: '', email: '', password: '', confirm: '', role: 'student' };

export default function Signup() {
  const { signup, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const update = (field) => (event) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    if (form.password !== form.confirm) {
      setFieldErrors({ confirm: 'Passwords do not match' });
      return;
    }

    setSubmitting(true);

    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      showToast({
        tone: 'success',
        title: 'Account created',
        message: 'Your campus portal account is ready.',
      });
      navigate('/dashboard', { replace: true });
    } catch (signupError) {
      if (signupError instanceof ApiError && signupError.fields) {
        setFieldErrors(signupError.fields);
      }
      const message = signupError.message ?? 'Unable to create your account. Please try again.';
      setError(message);
      showToast({ tone: 'error', title: 'Sign up failed', message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="card">
        <h1>Create your account</h1>
        <p className="muted" style={{ fontSize: '0.8125rem' }}>
          It takes a minute. You can apply for admission straight afterwards.
        </p>

        {error ? (
          <p className="alert alert--error" role="alert" style={{ margin: '1rem 0' }}>
            <Info size={15} aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <form className="form" onSubmit={handleSubmit} noValidate style={{ marginTop: '1.25rem' }}>
          <div className="field">
            <label htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              className="input"
              name="name"
              value={form.name}
              onChange={update('name')}
              aria-invalid={Boolean(fieldErrors.name)}
              autoComplete="name"
              placeholder="e.g. Ayesha Siddiqui"
              required
            />
            {fieldErrors.name ? <span className="field-error">{fieldErrors.name}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
              className="input"
              type="email"
              name="email"
              value={form.email}
              onChange={update('email')}
              aria-invalid={Boolean(fieldErrors.email)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="signup-role">I am a</label>
            <select
              id="signup-role"
              className="select"
              name="role"
              value={form.role}
              onChange={update('role')}
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            {fieldErrors.role ? <span className="field-error">{fieldErrors.role}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className="input"
              type="password"
              name="password"
              value={form.password}
              onChange={update('password')}
              aria-invalid={Boolean(fieldErrors.password)}
              autoComplete="new-password"
              required
            />
            <span className="hint">At least 8 characters, including a letter and a number.</span>
            {fieldErrors.password ? (
              <span className="field-error">{fieldErrors.password}</span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="signup-confirm">Confirm password</label>
            <input
              id="signup-confirm"
              className="input"
              type="password"
              name="confirm"
              value={form.confirm}
              onChange={update('confirm')}
              aria-invalid={Boolean(fieldErrors.confirm)}
              autoComplete="new-password"
              required
            />
            {fieldErrors.confirm ? (
              <span className="field-error">{fieldErrors.confirm}</span>
            ) : null}
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>

      <p className="auth__switch">
        Already registered? <Link to="/login">Sign in instead</Link>
      </p>
      <p className="auth__switch" style={{ marginTop: '0.375rem' }}>
        <Link to="/">Back to the website</Link>
      </p>
    </AuthShell>
  );
}
