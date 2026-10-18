import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { SkeletonTile, SkeletonTitle } from './Skeletons.jsx';

/**
 * The mirror of ProtectedRoute: while a session is active the public site is
 * closed off, so a signed-in user cannot browse (or navigate back to) marketing
 * pages without logging out first.
 */
export default function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="skeleton-stack" aria-busy="true">
        <span className="sr-only">Checking your session</span>
        <SkeletonTitle />
        <div className="skeleton-grid">
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
