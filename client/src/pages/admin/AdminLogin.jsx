import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert } from '../../components/ui.jsx';

/**
 * Admin sign-in verifies the shared key against the API rather than trusting
 * the browser, so a typo or a stale key fails here instead of on every screen.
 */
export default function AdminLogin() {
  const { signInAdmin, isAdmin } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAdmin) return <Navigate to="/admin" replace />;

  async function submit(event) {
    event.preventDefault();
    if (!key.trim()) return;

    setBusy(true);
    setError('');

    try {
      await signInAdmin(key.trim());
      pushToast({ type: 'success', message: 'Canteen admin unlocked.' });
      navigate(location.state?.from || '/admin', { replace: true });
    } catch (err) {
      setError(
        err.status === 401 || err.status === 403
          ? 'That admin key was not accepted.'
          : err.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card panel">
        <div className="logo mb-16">
          <span className="logo__mark" aria-hidden="true">
            🔐
          </span>
          FoodFlow Admin
        </div>

        <h1>Canteen sign-in</h1>
        <p className="muted small mb-24">
          Staff access uses the shared admin key from <span className="mono">ADMIN_API_KEY</span> in
          the server environment. It is stored for this browser tab only.
        </p>

        {error && (
          <div className="mb-16">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <form onSubmit={submit}>
          <label className="field">
            <span className="label">Admin key</span>
            <input
              className="input"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoComplete="off"
              placeholder="paste the canteen key"
              aria-invalid={Boolean(error)}
            />
          </label>

          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block mt-24"
            disabled={busy || !key.trim()}
          >
            {busy ? <span className="spinner" /> : 'Unlock the portal'}
          </button>
        </form>

        <p className="hint mt-24 text-center">
          Students order from the <a href="/">main site</a>. No account needed.
        </p>
      </div>
    </div>
  );
}