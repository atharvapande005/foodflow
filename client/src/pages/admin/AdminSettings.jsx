import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import AdminLayout from './AdminLayout.jsx';
import { Alert, Stat } from '../../components/ui.jsx';
import { formatDateTime, formatMoney } from '../../lib/format.js';

export default function AdminSettings() {
  const [canteen, setCanteen] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.canteen.get().then(setCanteen).catch((err) => setError(err.message));
    api.payment
      .config()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const updated = await api.canteen.set(canteen.is_open, message.trim());
      setCanteen(updated);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!canteen) {
    return (
      <AdminLayout title="Canteen settings">
        {error && <Alert tone="error">{error}</Alert>}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Canteen settings" subtitle="Control whether the canteen is taking orders.">
      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="admin-grid">
        <section className="panel">
          <h3 className="mb-16">Open state</h3>

          <form onSubmit={save}>
            <label className="between card card--pad mb-16" style={{ cursor: 'pointer' }}>
              <div>
                <div className="bold">Accepting orders</div>
                <div className="tiny muted">
                  When off, students can browse and build carts but the API refuses new orders.
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(canteen.is_open)}
                onChange={(event) => setCanteen({ ...canteen, is_open: event.target.checked })}
                aria-label="Accepting orders"
              />
            </label>

            <label className="field">
              <span className="label">Message shown while closed</span>
              <textarea
                className="textarea"
                rows={3}
                maxLength={200}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Back at 3:30 pm — out of chai"
              />
              <span className="hint">{message.length}/200</span>
            </label>

            <button type="submit" className="btn btn--primary mt-16" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save'}
            </button>
          </form>

          <hr className="divider mt-24 mb-16" />
          <p className="tiny muted">Last changed {formatDateTime(canteen.updated_at)}</p>
        </section>

        <section className="panel">
          <h3 className="mb-16">System</h3>

          <div className="grid grid--stats">
            <Stat
              label="Payments"
              value={config?.method === 'razorpay' ? 'Razorpay' : 'Test mode'}
              tone={config?.method === 'razorpay' ? 'success' : 'warning'}
              hint={config?.live ? 'Live keys' : 'Set Razorpay keys to take real money'}
            />
            <Stat label="Currency" value={config?.currency ?? 'INR'} hint="Razorpay handles UPI, cards, netbanking" />
          </div>

          {config?.method !== 'razorpay' && (
            <div className="mt-16">
              <Alert tone="warning" icon="⚠">
                Razorpay keys are missing on the server, so payments run in test mode. Add{' '}
                <span className="mono">RAZORPAY_KEY_ID</span> and{' '}
                <span className="mono">RAZORPAY_KEY_SECRET</span> to <span className="mono">server/.env</span>{' '}
                and restart.
              </Alert>
            </div>
          )}

          <hr className="divider mt-24 mb-16" />

          <h4 className="mb-8">Security notes</h4>
          <ul className="hint" style={{ paddingLeft: 18 }}>
            <li>Admin access uses the shared key in ADMIN_API_KEY, verified on every request.</li>
            <li>Student sessions are Supabase JWTs; the anon key never touches the database.</li>
            <li>All writes go through the service-role API with RLS denying direct client reads.</li>
          </ul>
        </section>
      </div>
    </AdminLayout>
  );
}