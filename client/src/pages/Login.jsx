import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from || '/';

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  };

  async function submit(event) {
    event.preventDefault();

    const next = {};
    if (!form.email.trim()) next.email = 'Enter your email.';
    if (!form.password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setFormError('');

    try {
      const user = await login(form.email.trim(), form.password);
      pushToast({ type: 'success', message: `Welcome back, ${user?.user_metadata?.full_name || 'friend'}.` });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(
        err.status === 401
          ? 'That email and password combination was not recognised.'
          : err.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card panel">
        <h1>Sign in</h1>
        <p className="muted small mb-24">
          Signing in keeps your order history, coupons and recommendations in one place. You can also
          order without an account.
        </p>

        {formError && (
          <div className="mb-16">
            <Alert tone="error">{formError}</Alert>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              placeholder="you@college.edu"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="error-text">{errors.email}</span>}
          </label>

          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password && <span className="error-text">{errors.password}</span>}
          </label>

          <button type="submit" className="btn btn--primary btn--lg btn--block mt-24" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Sign in'}
          </button>
        </form>

        <p className="hint mt-24 text-center">
          New here?{' '}
          <Link to="/signup" style={{ color: 'var(--brand-600)' }}>
            Create an account
          </Link>
        </p>
        <p className="hint text-center">
          <Link to="/" style={{ color: 'var(--brand-600)' }}>
            Continue as guest
          </Link>
        </p>
      </div>
    </div>
  );
}