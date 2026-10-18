import { ShieldCheck, Users } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import { useAuth } from '../context/authContext.js';

const POINTS = [
  ['A workspace of your own', 'Signing up creates an isolated workspace — your leads, your pipeline, your integrations. Nothing is shared with another company.'],
  ['No password to lose', 'Google verifies the address, so there is no password reset flow to build, phish or forget.'],
  ['Owner from the first second', 'You land as the Owner: invite your team, set the assignment rules and connect your own WhatsApp number.'],
];

/**
 * Sign-up is Google only. An unknown verified Google address is a new account, and the
 * server gives it a workspace as Owner — so there is no separate registration form to
 * keep in step with this one.
 */
export default function Signup() {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/crm" replace />;
  }

  return (
    <AuthShell>
      <h1>Create your workspace</h1>
      <p className="muted" style={{ fontSize: '0.875rem' }}>
        Accounts are created with Google. One click, and your workspace is ready.
      </p>

      <GoogleSignInButton label="Sign up with Google" />

      <ul className="stack" style={{ listStyle: 'none', paddingLeft: 0, marginTop: '1.25rem' }}>
        {POINTS.map(([title, body]) => (
          <li key={title} style={{ marginBottom: '0.9rem' }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {title === 'No password to lose' ? (
                <ShieldCheck size={15} aria-hidden="true" />
              ) : (
                <Users size={15} aria-hidden="true" />
              )}
              {title}
            </strong>
            <span className="hint">{body}</span>
          </li>
        ))}
      </ul>

      <p className="hint">
        Already have a workspace? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
