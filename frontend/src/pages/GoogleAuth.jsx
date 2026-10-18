import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { useAuth } from '../context/authContext.js';

/**
 * Where the Google callback lands.
 *
 * The callback puts the session token in the URL fragment, which the browser never sends
 * to a server. This reads it once, hands it to the auth provider, and clears the fragment
 * so a refresh (or a shared address bar) cannot replay it.
 */
export default function GoogleAuth() {
  const { adoptToken, user } = useAuth();

  // Parsed once, during the first render, so no effect has to set state to read it.
  const [result] = useState(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    return {
      token: params.get('token'),
      error: params.get('error'),
      created: params.get('created') === '1',
      workspace: params.get('workspace'),
    };
  });

  useEffect(() => {
    if (!result.token) return undefined;

    window.history.replaceState({}, '', window.location.pathname);

    // Deferred by a tick: the effect body stays free of state updates, which is what the
    // react-hooks rule asks for, and the token is adopted a moment later all the same.
    const timer = setTimeout(() => adoptToken(result.token), 0);

    return () => clearTimeout(timer);
  }, [result.token, adoptToken]);

  if (user) return <Navigate to="/dashboard" replace />;

  if (result.error) {
    return (
      <AuthShell>
        <h1>We could not sign you in</h1>
        <p className="alert alert--error">
          <TriangleAlert size={15} aria-hidden="true" />
          {result.error}
        </p>
        <Link className="btn btn-primary" to="/login">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>{result.created ? 'Setting up your workspace' : 'Signing you in'}</h1>
      <p className="hint">
        {result.created
          ? 'Your account is new, so a workspace is being created for you as its owner.'
          : 'One moment while we load your workspace.'}
      </p>
    </AuthShell>
  );
}
