import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCanteen } from '../context/CanteenContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, EmptyState } from '../components/ui.jsx';
import { formatMoney } from '../lib/format.js';

const PICKUP_POINTS = [
  { id: 'main-counter', label: 'Main counter', detail: 'Ground floor, near the turnstiles' },
  { id: 'garden-side', label: 'Garden side window', detail: 'Open-air seating area' },
  { id: 'library-block', label: 'Library block window', detail: 'Next to the reading hall' },
];

/**
 * Checkout collects who is picking up and where, creates the order, then hands
 * off to the payment step. Creating the order is what reserves the token
 * number and freezes the price, so the amount paid is always the amount shown.
 */
export default function Checkout() {
  const { cart, clear, subtotal, itemCount, longestPrep, couponCode } = useCart();
  const { is_open: isOpen } = useCanteen();
  const { user, isAuthenticated } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    student_name: '',
    student_email: '',
    student_phone: '',
    pickup_location: PICKUP_POINTS[0].id,
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Prefill from the account once it is known.
  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      student_name: current.student_name || user.user_metadata?.full_name || '',
      student_email: current.student_email || user.email || '',
      student_phone: current.student_phone || user.user_metadata?.phone || '',
    }));
  }, [user]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  function validate() {
    const next = {};

    if (!form.student_name.trim()) next.student_name = 'We need a name for the token.';
    if (!isAuthenticated) {
      if (!form.student_email.trim()) next.student_email = 'Required to track your order.';
      else if (!/^\S+@\S+\.\S+$/.test(form.student_email)) {
        next.student_email = 'That email does not look right.';
      }
    }
    if (form.student_phone && form.student_phone.replace(/\D/g, '').length < 10) {
      next.student_phone = 'Enter a 10 digit phone number.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function placeOrder() {
    if (!validate()) return;

    setSubmitting(true);
    setServerError('');

    try {
      const order = await api.orders.place({
        student_name: form.student_name.trim(),
        student_email: form.student_email.trim() || undefined,
        student_phone: form.student_phone.trim() || undefined,
        pickup_location: form.pickup_location,
        notes: form.notes.trim() || undefined,
        coupon_code: couponCode || undefined,
        items: cart.map((line) => ({
          menu_item_id: line.menu_item_id,
          quantity: line.quantity,
        })),
      });

      // The cart is only cleared once the order exists. If this throws, the
      // student keeps their cart and can retry.
      clear();

      pushToast({
        type: 'success',
        message: `Token #${order.token_number} reserved. Complete payment to confirm.`,
      });

      navigate(`/pay/${order.id}`, { state: { order } });
    } catch (err) {
      setServerError(err.message);
      pushToast({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const pickupLabel = useMemo(
    () => PICKUP_POINTS.find((point) => point.id === form.pickup_location)?.label ?? '',
    [form.pickup_location]
  );

  if (cart.length === 0) {
    return (
      <div className="page mt-32">
        <EmptyState
          icon="🛒"
          title="Nothing to check out"
          message="Your cart is empty. Add something from the menu first."
          action={
            <Link to="/menu" className="btn btn--primary">
              Browse the menu
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page page--narrow mt-32">
      <div className="section-head">
        <div>
          <h1>Checkout</h1>
          <p>
            {itemCount} item{itemCount === 1 ? '' : 's'} · ready in about {longestPrep || 8} min
          </p>
        </div>
        <Link to="/cart" className="btn btn--ghost btn--sm">
          ← Back to cart
        </Link>
      </div>

      {!isOpen && (
        <div className="mb-16">
          <Alert tone="warning" icon="🔒">
            The canteen is closed, so this order will be refused by the server. Check back when the
            banner at the top says the canteen is open.
          </Alert>
        </div>
      )}

      <div className="checkout-layout">
        <div className="stack gap-16">
          {serverError && <Alert tone="error">{serverError}</Alert>}

          <section className="panel">
            <h3 className="mb-16">Who is collecting?</h3>

            <div className="form-grid">
              <label className="field">
                <span className="label">Full name *</span>
                <input
                  className="input"
                  value={form.student_name}
                  onChange={update('student_name')}
                  placeholder="Aarav Sharma"
                  aria-invalid={Boolean(errors.student_name)}
                  autoComplete="name"
                />
                {errors.student_name && <span className="error-text">{errors.student_name}</span>}
              </label>

              <label className="field">
                <span className="label">Email {isAuthenticated ? '' : '*'}</span>
                <input
                  className="input"
                  type="email"
                  value={form.student_email}
                  onChange={update('student_email')}
                  placeholder="you@college.edu"
                  aria-invalid={Boolean(errors.student_email)}
                  autoComplete="email"
                  readOnly={isAuthenticated}
                />
                {errors.student_email && <span className="error-text">{errors.student_email}</span>}
              </label>

              <label className="field">
                <span className="label">Phone</span>
                <input
                  className="input"
                  value={form.student_phone}
                  onChange={update('student_phone')}
                  placeholder="9876543210"
                  inputMode="tel"
                  aria-invalid={Boolean(errors.student_phone)}
                  autoComplete="tel"
                />
                {errors.student_phone && <span className="error-text">{errors.student_phone}</span>}
              </label>
            </div>
          </section>

          <section className="panel">
            <h3 className="mb-16">Where should we hand it over?</h3>

            <div className="stack gap-8">
              {PICKUP_POINTS.map((point) => (
                <label
                  key={point.id}
                  className={`pickup-option${form.pickup_location === point.id ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="pickup"
                    value={point.id}
                    checked={form.pickup_location === point.id}
                    onChange={update('pickup_location')}
                  />
                  <span>
                    <span className="bold">{point.label}</span>
                    <span className="small muted" style={{ display: 'block' }}>
                      {point.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3 className="mb-16">Anything the kitchen should know?</h3>
            <textarea
              className="textarea"
              value={form.notes}
              onChange={update('notes')}
              maxLength={500}
              placeholder="Less spicy please, no coriander, extra chutney…"
              aria-label="Order notes"
            />
            <p className="hint mt-8">Optional. We try our best but cannot guarantee special requests.</p>
          </section>
        </div>

        <aside className="panel summary">
          <h3 className="mb-16">Order summary</h3>

          <div className="stack gap-8">
            {cart.map((line) => (
              <div className="between small" key={line.menu_item_id}>
                <span className="truncate muted">
                  {line.quantity} × {line.name}
                </span>
                <span className="nowrap">{formatMoney(line.price * line.quantity)}</span>
              </div>
            ))}
          </div>

          <hr className="divider mt-16 mb-16" />

          <div className="summary__row">
            <span className="muted">Item total</span>
            <span>{formatMoney(subtotal)}</span>
          </div>

          {couponCode && (
            <div className="summary__row summary__row--discount">
              <span>
                Coupon <span className="mono">{couponCode}</span>
              </span>
              <span>applied at payment</span>
            </div>
          )}

          <div className="summary__row">
            <span className="muted">Packing</span>
            <span className="muted">Calculated at payment</span>
          </div>

          <div className="summary__row">
            <span className="muted">Pickup</span>
            <span className="small">{pickupLabel}</span>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--lg btn--block mt-16"
            onClick={placeOrder}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" /> Reserving token…
              </>
            ) : (
              'Continue to payment →'
            )}
          </button>

          <p className="hint mt-16">
            Your token number is reserved when you continue. You can still abandon the order if you
            prefer.
          </p>
        </aside>
      </div>
    </div>
  );
}