import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState } from './ui.jsx';

/** Sends visitors who are not signed in to /login, preserving where they were. */
export function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return children;
}

/**
 * Gates the canteen admin portal on a valid shared key. The key is verified
 * against the API rather than merely checked for presence, so a stale key in
 * sessionStorage cannot leave someone staring at broken screens.
 */
export function RequireAdmin({ children }) {
  const { adminKey, isAdmin } = useAuth();

  if (!adminKey || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

/** Signed-in students should not see the login or signup forms again. */
export function RedirectIfAuthed({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <LoadingState />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return children;
}