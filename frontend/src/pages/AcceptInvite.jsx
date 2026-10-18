import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { api } from '../lib/api.js';

/**
 * Where an invitation link lands. A first-time person signs up here and is created directly
 * inside the inviting workspace with the invited level and role — no empty workspace of
 * their own, which is the whole point of the Owner picking the access up front.
 */
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { adoptToken } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [state, setState] = useState(() => ({
    loading: Boolean(token),
    error: token ? '' : 'This link is missing its invitation code',
    invitation: null,
    hasAccount: false,
  }));
  const [form, setForm] = useState({ name: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    if (!token) return undefined;

    api
      .invitationInfo(token)
      .then((payload) => {
        if (!active) return;
        setState({
          loading: false,
          error: '',
          invitation: payload.invitation,
          hasAccount: Boolean(payload.hasAccount),
        });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, invitation: null, hasAccount: false });
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function accept(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      // A first-time invitation creates the account; an existing one proves itself with its
      // password. Either way the membership is created by the server from the invitation.
      const result = await api.acceptInvite({
        token,
        name: form.name,
        password: form.password,
      });

      adoptToken(result.token);
      showToast({
        tone: 'success',
        title: `Welcome to ${result.workspace}`,
        message: 'Your account is created with the access you were invited with.',
      });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setErrors(error.fields ?? {});
      showToast({ tone: 'error', title: 'Could not accept the invitation', message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (state.loading) {
    return (
      <AuthShell>
        <h1>Checking your invitation…</h1>
        <p className="hint">Verifying the link.</p>
      </AuthShell>
    );
  }

  if (state.error) {
    return (
      <AuthShell>
        <h1>That invitation cannot be used</h1>
        <p className="hint">{state.error}</p>
        <Link className="btn btn-primary btn-block" to="/login">
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  const invitation = state.invitation;

  return (
    <AuthShell>
      <h1>Join {invitation.workspaceName}</h1>
      <p className="hint">
        You were invited as {invitation.level}
        {invitation.roleName ? ` with the ${invitation.roleName} role` : ''}.
      </p>

      <form className="form" onSubmit={accept}>
        <div className="field">
          <label htmlFor="invite-email-readonly">Email address</label>
          <input
            id="invite-email-readonly"
            className="input"
            value={invitation.email}
            readOnly
            autoComplete="off"
          />
          <span className="hint">The invitation is tied to this address.</span>
        </div>

        {state.hasAccount ? null : (
          <div className="field">
            <label htmlFor="invite-name">Your full name</label>
            <input
              id="invite-name"
              className="input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              autoComplete="name"
              required
            />
            {errors.name ? <span className="hint hint--danger">{errors.name}</span> : null}
          </div>
        )}

        <div className="field">
          <label htmlFor="invite-password">
            {state.hasAccount ? 'Your password' : 'Choose a password'}
          </label>
          <input
            id="invite-password"
            className="input"
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            autoComplete={state.hasAccount ? 'current-password' : 'new-password'}
            required
          />
          {errors.password ? <span className="hint hint--danger">{errors.password}</span> : null}
          {state.hasAccount ? null : <span className="hint">At least 8 characters.</span>}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Joining…' : `Join ${invitation.workspaceName}`}
        </button>
      </form>

      <p className="auth__or">or</p>

      <GoogleSignInButton />

      <p className="hint" style={{ textAlign: 'center' }}>
        Signing in with the invited Google address accepts the invitation automatically.
      </p>

      <p className="hint" style={{ textAlign: 'center' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
