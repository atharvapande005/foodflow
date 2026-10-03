import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCanteen } from '../context/CanteenContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, EmptyState } from '../components/ui.jsx';
import { formatMoney } from '../lib/format.js';

export default function Cart() {
  const { cart, setQty, remove, subtotal, itemCount, longestPrep, couponCode, setCouponCode } =
    useCart();
  const { is_open: isOpen, message } = useCanteen();
  const { user, isAuthenticated } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [couponInput, setCouponInput] = useState('');
  const [applied, setApplied] = useState(null);
  const [validating, setValidating] = useState(false);
  const [couponError, setCouponError] = useState('');

  const packingFee = applied?.waives_packing ? 0 : (applied?.packing_fee ?? 0);
  const discount = applied?.discount ?? 0;
  const total = Math.max(0, subtotal - discount + packingFee);

  // A coupon is only valid against a specific cart, so re-check it whenever the
  // contents change. This stops a student from filling a cart, applying a
  // coupon, then deleting the qualifying item and keeping the discount.
  const cartSignature = cart.map((line) => `${line.menu_item_id}:${line.quantity}`).join(',');

  // A coupon restored from storage has no computed result yet, so re-validate it
  // once to fill the summary back in.
  useEffect(() => {
    if (applied || !couponCode || cart.length === 0) return;
    let cancelled = false;

    api.coupons
      .validate(couponCode, toApiItems(cart))
      .then((result) => {
        if (cancelled) return;
        if (result.valid) setApplied(result);
        else setCouponCode(null);
      })
      .catch(() => {
        if (!cancelled) setCouponCode(null);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponCode]);

  useEffect(() => {
    if (!applied) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await api.coupons.validate(applied.code, toApiItems(cart));
        if (cancelled) return;

        if (result.valid) {
          setApplied((current) => (current ? { ...current, ...result } : current));
        } else {
          // The cart changed in a way that invalidates the coupon.
          setApplied(null);
          setCouponCode(null);
          setCouponError(`${result.message} It has been removed from your cart.`);
        }
      } catch {
        if (!cancelled) {
          setApplied(null);
          setCouponCode(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

  const applyCoupon = useCallback(
    async (event) => {
      event?.preventDefault();

      const code = couponInput.trim().toUpperCase();
      if (!code) return;

      setValidating(true);
      setCouponError('');

      try {
        const result = await api.coupons.validate(code, toApiItems(cart));

        if (!result.valid) {
          setCouponError(result.message);
          return;
        }

        setApplied(result);
        setCouponCode(result.code);
        setCouponInput('');
      } catch (err) {
        setCouponError(err.message);
      } finally {
        setValidating(false);
      }
    },
    [couponInput, cart, setCouponCode]
  );

  if (cart.length === 0) {
    return (
      <div className="page mt-32">
        <EmptyState
          icon="🛒"
          title="Your cart is empty"
          message="Add a few dishes from the menu and they will show up here."
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
    <div className="page mt-32">
      <div className="section-head">
        <div>
          <h1>Your cart</h1>
          <p>
            {itemCount} item{itemCount === 1 ? '' : 's'} · ready in about {longestPrep || 8} min once
            the kitchen starts
          </p>
        </div>
        <Link to="/menu" className="btn btn--secondary btn--sm">
          + Add more items
        </Link>
      </div>

      {!isOpen && (
        <div className="mb-16">
          <Alert tone="warning" icon="🔒">
            {message || 'The canteen is closed right now.'} Your cart is saved, and you can order as
            soon as the kitchen reopens.
          </Alert>
        </div>
      )}

      <div className="cart-layout">
        <div className="panel">
          {cart.map((line) => (
            <div className="cart-line" key={line.menu_item_id}>
              <div className="cart-line__media">
                {line.image_url ? (
                  <img src={line.image_url} alt="" loading="lazy" />
                ) : (
                  <div className="menu-card__placeholder" aria-hidden="true">
                    🍽
                  </div>
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <div className="row gap-8">
                  <span className={line.is_veg ? 'veg-dot' : 'nonveg-dot'} aria-hidden="true" />
                  <span className="bold truncate">{line.name}</span>
                </div>
                <div className="small muted mt-8">
                  {formatMoney(line.price)} each
                  {line.prep_time_minutes ? ` · ${line.prep_time_minutes} min` : ''}
                </div>
                <div className="bold mt-8">{formatMoney(line.price * line.quantity)}</div>
              </div>

              <div className="cart-line__controls">
                <div className="stepper" role="group" aria-label={`Quantity of ${line.name}`}>
                  <button
                    type="button"
                    className="stepper__btn"
                    onClick={() => setQty(line.menu_item_id, line.quantity - 1)}
                    aria-label={`Remove one ${line.name}`}
                  >
                    −
                  </button>
                  <span className="stepper__value">{line.quantity}</span>
                  <button
                    type="button"
                    className="stepper__btn"
                    onClick={() => setQty(line.menu_item_id, line.quantity + 1)}
                    disabled={line.quantity >= 50}
                    aria-label={`Add one ${line.name}`}
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => remove(line.menu_item_id)}
                  aria-label={`Remove ${line.name} from cart`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="panel summary">
          <h3 className="mb-16">Bill summary</h3>

          <form onSubmit={applyCoupon} className="mb-16">
            {applied ? (
              <div className="coupon-applied">
                <span>
                  🎟 {applied.code} applied
                  {applied.description && (
                    <span className="tiny" style={{ display: 'block', fontWeight: 400, opacity: 0.85 }}>
                      {applied.description}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setApplied(null);
                    setCouponCode(null);
                    setCouponError('');
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <div className="coupon-input">
                  <input
                    className="input"
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                    aria-label="Coupon code"
                    aria-invalid={Boolean(couponError)}
                  />
                  <button
                    type="submit"
                    className="btn btn--secondary nowrap"
                    disabled={validating || !couponInput.trim()}
                  >
                    {validating ? <span className="spinner" /> : 'Apply'}
                  </button>
                </div>
                <p className="hint mt-8">
                  Try <Link to="/offers" style={{ color: 'var(--brand-600)' }}>SAVED10</Link> or browse
                  all offers.
                </p>
              </>
            )}

            {couponError && (
              <div className="mt-8">
                <span className="error-text">{couponError}</span>
              </div>
            )}
          </form>

          <hr className="divider mb-16" />

          <div className="summary__row">
            <span className="muted">Item total</span>
            <span>{formatMoney(subtotal)}</span>
          </div>

          {discount > 0 && (
            <div className="summary__row summary__row--discount">
              <span>Coupon discount{applied?.code ? ` (${applied.code})` : ''}</span>
              <span>− {formatMoney(discount)}</span>
            </div>
          )}

          <div className="summary__row">
            <span className="muted">Packing</span>
            <span>{packingFee > 0 ? formatMoney(packingFee) : 'Free'}</span>
          </div>

          <div className="summary__total">
            <span>To pay</span>
            <span>{formatMoney(total)}</span>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--lg btn--block mt-16"
            onClick={() => navigate('/checkout')}
          >
            {isOpen ? 'Proceed to checkout' : 'Checkout when open'}
          </button>

          {!isAuthenticated && (
            <p className="hint mt-16 text-center">
              You are not signed in. You can still order —{' '}
              <Link to="/login" style={{ color: 'var(--brand-600)' }}>
                sign in
              </Link>{' '}
              to keep your order history.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The API always recomputes prices itself, so only ids and quantities go up. */
function toApiItems(cart) {
  return cart.map((line) => ({
    menu_item_id: line.menu_item_id,
    quantity: line.quantity,
  }));
}

export { toApiItems };