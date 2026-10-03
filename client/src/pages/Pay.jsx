import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, Spinner } from '../components/ui.jsx';
import { formatMoney } from '../lib/format.js';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Loads checkout.js once. Razorpay is a hard dependency for the real payment
 * path, so the script is only fetched when the server says Razorpay is enabled.
 */
let scriptPromise = null;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.Razorpay
        ? resolve(window.Razorpay)
        : reject(new Error('Razorpay checkout failed to initialise.'));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the Razorpay checkout script. Check your network.'));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export default function Pay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { pushToast } = useToast();

  // The order the checkout page just created is passed through router state so
  // this screen paints instantly. state is lost on a hard refresh, hence the
  // fallback fetch below.
  const initialOrder = location.state?.order ?? null;

  const [order, setOrder] = useState(initialOrder);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(!initialOrder);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [configError, setConfigError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load the order when router state was lost.
  useEffect(() => {
    if (initialOrder) return;

    let cancelled = false;
    setLoading(true);

    api.orders
      .get(id, { email: user?.email, phone: '' })
      .then((result) => {
        if (!cancelled) setOrder(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, initialOrder, user]);

  // Payment provider config decides which button is shown.
  useEffect(() => {
    let cancelled = false;

    api.payment
      .config()
      .then((result) => {
        if (!cancelled) setConfig(result);
      })
      .catch((err) => {
        if (!cancelled) setConfigError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const startPayment = useCallback(async () => {
    setPaying(true);
    setError('');

    try {
      const intent = await api.payment.createOrder(order.id, user?.email || undefined);

      if (intent.mode === 'simulated') {
        await runSimulatedPayment(intent);
        return;
      }

      const Razorpay = await loadRazorpayScript();

      const options = {
        key: intent.key_id,
        amount: intent.amount,
        currency: intent.currency,
        name: 'FoodFlow Canteen',
        description: `Order token #${order.token_number}`,
        // The receipt is what makes a refund traceable from the admin portal.
        order_id: intent.razorpay_order_id,
        prefill: {
          name: order.student_name || undefined,
          email: order.student_email || user?.email || undefined,
        },
        notes: {
          token_number: String(order.token_number),
          order_id: order.id,
        },
        theme: { color: '#e2612c' },
        // Fires only after Razorpay reports a successful payment. The response
        // is then verified server-side before anything is marked paid.
        handler: (response) => window.__foodflowPaymentHandler?.(response),
        modal: {
          ondismiss: () => {
            if (mounted.current) {
              setPaying(false);
              setError('Payment was cancelled. You have not been charged.');
            }
          },
        },
        retry: { enabled: true, max_retries: 2 },
      };

      const checkout = new Razorpay(options);

      checkout.on('payment.failed', (response) => {
        if (!mounted.current) return;
        setPaying(false);
        setError(
          response?.error?.description ||
            'The payment did not go through. Your order is saved, so you can try again.'
        );
      });

      checkout.on('payment.dismissed', () => {
        if (!mounted.current) return;
        setPaying(false);
      });

      checkout.open();
      // `paying` stays true until payment.failed, modal.ondismiss or verify
      // settles, so the button cannot be double-submitted.
    } catch (err) {
      if (!mounted.current) return;
      setPaying(false);
      setError(err.message);
    }
  }, [order, user]);

  async function runSimulatedPayment(intent) {
    try {
      const result = await api.payment.simulate(order.id, user?.email || undefined, 'success');
      finish(result.order);
    } catch (err) {
      if (!mounted.current) return;
      setPaying(false);
      setError(err.message);
    }
    // intent is only used to keep the flow identical to the real path.
    void intent;
  }

  function finish(paidOrder) {
    if (!mounted.current) return;
    setPaying(false);
    setOrder(paidOrder);
    pushToast({
      type: 'success',
      message: `Payment received. Token #${paidOrder.token_number ?? order.token_number} is on its way.`,
    });
    navigate(`/order/${paidOrder.id}`, { replace: true });
  }

  /**
   * Called from the Razorpay handler. The browser is never trusted on its own:
   * the server re-verifies the HMAC signature and re-reads the payment from
   * Razorpay before it marks the order paid.
   */
  useEffect(() => {
    window.__foodflowPaymentHandler = (response) => {
      (async () => {
        try {
          const result = await api.payment.verify({
            order_id: order.id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          finish(result.order);
        } catch (err) {
          if (!mounted.current) return;
          setPaying(false);
          setError(err.message);
        }
      })();
    };

    return () => {
      delete window.__foodflowPaymentHandler;
    };
  }, [order?.id]);

  if (loading) {
    return (
      <div className="center-page">
        <Spinner label="Loading your order…" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page page--narrow mt-32">
        <Alert tone="error">
          <strong>We could not find that order.</strong>
          <div className="mt-8">{error || 'Check the link, or look it up with your token number.'}</div>
          <div className="mt-16">
            <Link to="/track" className="btn btn--secondary btn--sm">
              Track with token
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  const alreadyPaid = order.payment_status === 'paid';

  return (
    <div className="page page--narrow mt-32">
      <div className="section-head">
        <div>
          <h1>Payment</h1>
          <p>Token #{order.token_number} is reserved for you.</p>
        </div>
        <Link to={`/order/${order.id}`} className="btn btn--ghost btn--sm">
          View order →
        </Link>
      </div>

      {alreadyPaid ? (
        <Alert tone="success" icon="✓">
          <strong>This order is already paid.</strong>
          <div className="mt-8">Head to the order page to track it.</div>
          <div className="mt-16">
            <Link to={`/order/${order.id}`} className="btn btn--primary btn--sm">
              Track order
            </Link>
          </div>
        </Alert>
      ) : (
        <div className="checkout-layout">
          <div className="stack gap-16">
            {error && (
              <Alert tone="error" icon="⚠">
                <strong>Payment did not go through.</strong>
                <div className="mt-8">{error}</div>
              </Alert>
            )}

            {configError && <Alert tone="warning">{configError}</Alert>}

            <section className="panel">
              <h3 className="mb-16">Amount due</h3>
              <div className="between">
                <span className="muted">Order #{order.token_number}</span>
                <span className="price" style={{ fontSize: '2rem' }}>
                  {formatMoney(order.total_amount)}
                </span>
              </div>

              <div className="summary mt-24">
                <div className="summary__row">
                  <span className="muted">Items</span>
                  <span>
                    {(order.order_items ?? []).reduce((sum, line) => sum + line.quantity, 0)}
                  </span>
                </div>
                <div className="summary__row">
                  <span className="muted">Subtotal</span>
                  <span>{formatMoney(order.subtotal_amount ?? order.total_amount)}</span>
                </div>
                {Number(order.discount_amount) > 0 && (
                  <div className="summary__row summary__row--discount">
                    <span>Discount {order.coupon_code ? `(${order.coupon_code})` : ''}</span>
                    <span>− {formatMoney(order.discount_amount)}</span>
                  </div>
                )}
                <div className="summary__row">
                  <span className="muted">Packing</span>
                  <span>
                    {Number(order.packing_fee) > 0 ? formatMoney(order.packing_fee) : 'Free'}
                  </span>
                </div>
                <div className="summary__total">
                  <span>To pay</span>
                  <span>{formatMoney(order.total_amount)}</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn--primary btn--lg btn--block mt-24"
                onClick={startPayment}
                disabled={paying || !config}
              >
                {paying ? (
                  <>
                    <span className="spinner" /> Contacting payment…
                  </>
                ) : config?.method === 'razorpay' ? (
                  `Pay ${formatMoney(order.total_amount)} with Razorpay`
                ) : (
                  `Pay ${formatMoney(order.total_amount)}`
                )}
              </button>

              {config?.method === 'simulated' && (
                <p className="hint mt-16 text-center">
                  Razorpay keys are not configured on this server, so this payment runs in test mode.
                  Add <span className="mono">RAZORPAY_KEY_ID</span> and{' '}
                  <span className="mono">RAZORPAY_KEY_SECRET</span> to take real card and UPI payments.
                </p>
              )}
            </section>
          </div>

          <aside className="panel summary">
            <h3 className="mb-16">Pickup</h3>
            <p className="small muted mb-16">
              {order.pickup_location || 'Main counter'}
              <br />
              Show your token when you collect it.
            </p>

            {order.notes && (
              <>
                <hr className="divider mb-16" />
                <h4 className="mb-8">Kitchen note</h4>
                <p className="small muted">{order.notes}</p>
              </>
            )}

            <hr className="divider mt-16 mb-16" />

            <div className="stack gap-8">
              {(order.order_items ?? []).map((line) => (
                <div className="between small" key={line.id ?? line.menu_item_id}>
                  <span className="truncate muted">
                    {line.quantity} × {line.item_name}
                  </span>
                  <span className="nowrap">{formatMoney(line.subtotal)}</span>
                </div>
              ))}
            </div>

            <hr className="divider mt-16 mb-16" />

            <button
              type="button"
              className="btn btn--ghost btn--block btn--sm"
              onClick={async () => {
                try {
                  await api.orders.cancel(order.id, 'Cancelled before payment');
                  pushToast({ type: 'success', message: 'Order cancelled.' });
                  navigate('/menu');
                } catch (err) {
                  setError(err.message);
                }
              }}
              disabled={paying}
            >
              Cancel this order
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

export { loadRazorpayScript };