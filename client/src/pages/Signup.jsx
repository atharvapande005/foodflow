import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert } from '../components/ui.jsx';

/** Client-side mirrors of the server rules in auth.routes.js. */
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function scorePassword(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^\w\s]/.test(password)) score += 1;
  return score;
}

const STRENGTH = [
  { label: 'Too short', tone: 'danger' },
  { label: 'Weak', tone: 'danger' },
  { label: 'Fair', tone: 'warning' },
  { label: 'Good', tone: 'warning' },
  { label: 'Strong', tone: 'success' },
  { label: 'Excellent', tone: 'success' },
];

export default function Signup() {
  const { signup } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => {
    const score = scorePassword(form.password);
    return form.password ? STRENGTH[score] : null;
  }, [form.password]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  };

  function validate() {
    const next = {};

    if (!form.full_name.trim()) next.full_name = 'Tell us who is collecting the food.';
    else if (form.full_name.trim().length > 80) next.full_name = 'That name is too long.';

    if (!form.email.trim()) next.email = 'Enter your email.';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'That email does not look right.';

    if (!form.password) next.password = 'Choose a password.';
    else if (form.password.length < 8) next.password = 'Use at least 8 characters.';

    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) return;

    setBusy(true);
    setFormError('');

    try {
      const result = await signup({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
      });

      if (result.needs_email_confirmation) {
        pushToast({
          type: 'success',
          message: 'Check your inbox to confirm the address, then sign in.',
        });
        navigate('/login');
        return;
      }

      pushToast({ type: 'success', message: 'Account created. Happy ordering!' });
      navigate('/');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card panel">
        <h1>Create your account</h1>
        <p className="muted small mb-24">
          Takes a minute, and it means your orders, tokens and receipts are always one click away.
        </p>

        {formError && (
          <div className="mb-16">
            <Alert tone="error">{formError}</Alert>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <label className="field">
            <span className="label">Full name</span>
            <input
              className="input"
              value={form.full_name}
              onChange={update('full_name')}
              autoComplete="name"
              placeholder="Aarav Sharma"
              aria-invalid={Boolean(errors.full_name)}
            />
            {errors.full_name && <span className="error-text">{errors.full_name}</span>}
          </label>

          <label className="field">
            <span className="label">College email</span>
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-invalid={Boolean(errors.password)}
            />
            {strength && (
              <div className="row gap-8 mt-8">
                <div className="progress" style={{ flex: 1 }} aria-hidden="true">
                  <div
                    className={`progress__bar progress__bar--${strength.tone}`}
                    style={{ width: `${(scorePassword(form.password) / 5) * 100}%` }}
                  />
                </div>
                <span className="tiny muted nowrap">{strength.label}</span>
              </div>
            )}
            {errors.password && <span className="error-text">{errors.password}</span>}
          </label>

          <label className="field">
            <span className="label">Confirm password</span>
            <input
              className="input"
              type="password"
              value={form.confirm}
              onChange={update('confirm')}
              autoComplete="new-password"
              placeholder="Type it again"
              aria-invalid={Boolean(errors.confirm)}
            />
            {errors.confirm && <span className="error-text">{errors.confirm}</span>}
          </label>

          <button type="submit" className="btn btn--primary btn--lg btn--block mt-24" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Create account'}
          </button>
        </form>

        <p className="hint mt-24 text-center">
          Already registered?{' '}
          <Link to="/login" style={{ color: 'var(--brand-600)' }}>
            Sign in
          </Link>
        </p>
        <p className="hint text-center">
          <Link to="/" style={{ color: 'var(--brand-600)' }}>
            Order without an account
          </Link>
        </p>
      </div>
    </div>
  );
}