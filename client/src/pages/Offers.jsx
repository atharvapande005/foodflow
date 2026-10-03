import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, EmptyState } from '../components/ui.jsx';
import { formatDate, formatMoney } from '../lib/format.js';

const TYPE_LABELS = {
  flat: 'Flat off',
  percent: 'Percentage off',
  free_delivery: 'Free packing',
};

const DISCOUNT_TEXT = {
  flat: (coupon) => `${formatMoney(coupon.value)} off`,
  percent: (coupon) => `${coupon.value}% off`,
  free_delivery: () => 'Packing on us',
};

/**
 * Offers lists the coupons the server says are live. Applying one runs the same
 * engine the real order uses, so a code that does not qualify says so here
 * rather than at the payment screen.
 */
export default function Offers() {
  const { isAuthenticated, user } = useAuth();
  const { cart, couponCode, setCouponCode } = useCart();
  const { pushToast } = useToast();

  const [state, setState] = useState({ coupons: null, packingFee: 0, freeAbove: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;

    api.coupons
      .available()
      .then((result) => {
        if (cancelled) return;
        setState({
          coupons: result?.coupons ?? [],
          packingFee: Number(result?.packing_fee || 0),
          freeAbove: Number(result?.free_packing_above || 0),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function useCoupon(coupon) {
    if (!isAuthenticated) {
      navigateToLogin();
      return;
    }

    setBusy(coupon.code);

    try {
      if (cart.length === 0) {
        // Nothing to validate against yet, so hold the code and check it on the
        // cart page once items exist.
        setCouponCode(coupon.code);
        pushToast({ type: 'success', message: `${coupon.code} saved. Add items to use it.` });
        return;
      }

      const result = await api.coupons.validate(
        coupon.code,
        cart.map((line) => ({ menu_item_id: line.menu_item_id, quantity: line.quantity }))
      );

      if (!result.valid) {
        pushToast({ type: 'error', message: result.message });
        return;
      }

      setCouponCode(coupon.code);
      pushToast({
        type: 'success',
        message:
          result.discount > 0
            ? `${coupon.code} applied — you saved ${formatMoney(result.discount)}.`
            : `${coupon.code} applied — packing is free.`,
      });
    } catch (err) {
      pushToast({ type: 'error', message: err.message });
    } finally {
      setBusy('');
    }
  }

  function navigateToLogin() {
    window.location.assign('/login');
  }

  const { coupons } = state;

  return (
    <div className="page page--narrow mt-32">
      <div className="section-head">
        <div>
          <h1>Offers</h1>
          <p>Every code below is re-checked against your cart before it is applied.</p>
        </div>
        <Link to={cart.length ? '/cart' : '/menu'} className="btn btn--secondary btn--sm">
          {cart.length ? 'Go to cart →' : 'Browse the menu →'}
        </Link>
      </div>

      {!isAuthenticated && (
        <div className="mb-16">
          <Alert tone="info" icon="ℹ">
            <Link to="/login" style={{ color: 'var(--brand-600)' }}>
              Sign in
            </Link>{' '}
            to apply coupons, so usage limits can be tracked per student.
          </Alert>
        </div>
      )}

      {state.packingFee > 0 && (
        <div className="mb-16">
          <Alert tone="success" icon="🎁">
            Orders over {formatMoney(state.freeAbove || Infinity)} get free packing. A smaller order pays{' '}
            {formatMoney(state.packingFee)} packing.
          </Alert>
        </div>
      )}

      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {coupons === null && !error && (
        <div className="grid grid--cards">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton" style={{ height: 148, borderRadius: 'var(--radius)' }} />
          ))}
        </div>
      )}

      {coupons?.length === 0 && (
        <EmptyState
          icon="🎟"
          title="No offers available"
          message="There are no coupons you can use right now. Check back after the next canteen promo."
        />
      )}

      {coupons?.length > 0 && (
        <div className="grid grid--cards">
          {coupons.map((coupon) => {
            const applied = couponCode === coupon.code;

            return (
              <article className={`coupon${applied ? ' is-applied' : ''}`} key={coupon.code}>
                <div className="coupon__stub">
                  <span className="coupon__type">{TYPE_LABELS[coupon.discount_type] ?? coupon.discount_type}</span>
                  <span className="coupon__value">
                    {(DISCOUNT_TEXT[coupon.discount_type] ?? (() => coupon.discount_type))(coupon)}
                  </span>
                </div>

                <div className="coupon__body">
                  <div className="row gap-8 wrap">
                    <span className="mono coupon__code">{coupon.code}</span>
                    {applied && <span className="badge badge--success">Applied</span>}
                  </div>

                  <p className="small mt-8">{coupon.description || 'Limited time offer'}</p>

                  <div className="tiny muted mt-8">
                    {Number(coupon.min_order_amount) > 0 && (
                      <>Min order {formatMoney(coupon.min_order_amount)} · </>
                    )}
                    {Number(coupon.max_discount) > 0 && (
                      <>up to {formatMoney(coupon.max_discount)} off · </>
                    )}
                    {coupon.remaining_uses === null
                      ? 'unlimited uses'
                      : `${coupon.remaining_uses} use${coupon.remaining_uses === 1 ? '' : 's'} left`}
                    {coupon.expires_at && ` · until ${formatDate(coupon.expires_at)}`}
                  </div>

                  {coupon.applies_to_category && (
                    <div className="tiny muted mt-8">On {coupon.applies_to_category} only</div>
                  )}

                  <button
                    type="button"
                    className={`btn ${applied ? 'btn--secondary' : 'btn--primary'} btn--sm mt-16`}
                    onClick={() => useCoupon(coupon)}
                    disabled={!isAuthenticated || busy === coupon.code || applied}
                  >
                    {busy === coupon.code ? (
                      <span className="spinner" />
                    ) : applied ? (
                      'In your cart'
                    ) : cart.length === 0 ? (
                      'Save code'
                    ) : (
                      'Apply to cart'
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="hint mt-24">
        {user?.email
          ? `Codes are tracked against ${user.email} where a per-account limit applies.`
          : 'Sign in to have usage limits tracked against your account.'}
      </p>
    </div>
  );
}
