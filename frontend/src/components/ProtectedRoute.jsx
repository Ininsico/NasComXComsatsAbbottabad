import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { SkeletonList, SkeletonTile, SkeletonTitle } from './Skeletons.jsx';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

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
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
