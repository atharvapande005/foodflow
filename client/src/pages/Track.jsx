import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import OrderStatusPanel from '../components/OrderStatusPanel.jsx';
import { Alert, EmptyState } from '../components/ui.jsx';

const POLL_MS = 15000;

/**
 * Guest-friendly tracking: token number + the email or phone used at checkout.
 * A token alone is not enough to read an order, so neither field can be omitted.
 */
export default function Track() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [form, setForm] = useState({
    token: searchParams.get('token') || '',
    email: searchParams.get('email') || user?.email || '',
    phone: searchParams.get('phone') || '',
  });
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const lookup = useCallback(
    async (params) => {
      setLoading(true);
      setError('');

      try {
        const result = await api.orders.track(params);
        if (mounted.current) setOrder(result);
      } catch (err) {
        if (mounted.current) {
          setOrder(null);
          setError(err.message);
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    []
  );

  // Deep link support: /track?token=42&email=a@b.com looks the order up on load.
  const initialToken = searchParams.get('token');
  useEffect(() => {
    if (!initialToken) return;
    if (searchParams.get('email') || searchParams.get('phone')) {
      lookup({
        token: initialToken,
        email: searchParams.get('email') || undefined,
        phone: searchParams.get('phone') || undefined,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh an open order so the status on screen stays truthful.
  useEffect(() => {
    if (!order || ['completed', 'cancelled'].includes(order.status)) return undefined;

    const timer = setInterval(() => {
      lookup({
        token: order.token_number,
        email: order.student_email || undefined,
        phone: order.student_phone || undefined,
      });
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [order, lookup]);

  function submit(event) {
    event.preventDefault();

    const token = form.token.trim();
    if (!token) {
      setError('Enter the token number from your receipt.');
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Enter the email or phone you ordered with.');
      return;
    }

    setSearchParams(
      {
        token,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      },
      { replace: true }
    );

    lookup({
      token,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
    });
  }

  const update = (field) => (event) => setForm((c) => ({ ...c, [field]: event.target.value }));

  return (
    <div className="page page--narrow mt-32">
      <div className="section-head">
        <div>
          <h1>Track your order</h1>
          <p>Your token number is printed on the receipt and in the confirmation message.</p>
        </div>
      </div>

      <section className="panel">
        <form onSubmit={submit} className="form-grid">
          <label className="field">
            <span className="label">Token number *</span>
            <input
              className="input"
              inputMode="numeric"
              value={form.token}
              onChange={update('token')}
              placeholder="e.g. 42"
              required
            />
          </label>

          <label className="field">
            <span className="label">Email used at checkout</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@college.edu"
            />
          </label>

          <label className="field">
            <span className="label">…or phone</span>
            <input
              className="input"
              value={form.phone}
              onChange={update('phone')}
              placeholder="9876543210"
              inputMode="tel"
            />
          </label>
        </form>

        <p className="hint mt-8">
          Signed in?{' '}
          <Link to="/orders" style={{ color: 'var(--brand-600)' }}>
            Your full order history
          </Link>{' '}
          is one click away, no token needed.
        </p>

        <button
          type="submit"
          className="btn btn--primary mt-16"
          onClick={submit}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : 'Find my order'}
        </button>
      </section>

      {error && (
        <div className="mt-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {!order && !error && !loading && (
        <div className="mt-16">
          <EmptyState
            icon="🎫"
            title="Waiting for a token number"
            message="Enter your token above to see exactly where your order is in the kitchen queue."
          />
        </div>
      )}

      {order && (
        <div className="mt-24">
          <OrderStatusPanel order={order} />
          <div className="row gap-8 mt-16">
            <Link to={`/order/${order.id}?email=${encodeURIComponent(order.student_email || '')}`} className="btn btn--secondary">
              Full order & receipt
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}