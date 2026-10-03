import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCanteen } from '../context/CanteenContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import Receipt from '../components/Receipt.jsx';
import ReviewForm from '../components/ReviewForm.jsx';
import { Alert, EmptyState, Spinner, StatusPill } from '../components/ui.jsx';
import { formatDateTime, formatMoney, statusMeta } from '../lib/format.js';

/** How often an unfinished order is re-checked while this page is open. */
const POLL_MS = 15000;

const TRACKED_STEPS = ['pending', 'paid', 'preparing', 'ready', 'completed'];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const { is_open: isOpen } = useCanteen();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [reviewItem, setReviewItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const isOwner = Boolean(order?.user_id && user?.id && order.user_id === user.id);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      try {
        const result = await api.orders.get(id, {
          email: order?.student_email || user?.email,
          phone: order?.student_phone,
        });
        if (mounted.current) {
          setOrder(result);
          setError('');
        }
      } catch (err) {
        if (mounted.current && !quiet) setError(err.message);
      } finally {
        if (mounted.current && !quiet) setLoading(false);
      }
    },
    [id, user, order?.student_email, order?.student_phone]
  );

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll only while the order is still moving, so the token status stays live
  // without leaving the tab spinning forever.
  useEffect(() => {
    if (!order || ['completed', 'cancelled'].includes(order.status)) return undefined;
    if (order.status === 'pending' && !isOpen) return undefined;

    const timer = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [order, isOpen, load]);

  async function cancelOrder() {
    setBusy(true);
    try {
      const result = await api.orders.cancel(id, cancelReason || 'Changed my mind');
      setOrder(result);
      setShowCancel(false);
      pushToast({
        type: 'success',
        message:
          result.payment_status === 'refunded'
            ? 'Order cancelled. The refund is on its way to your account.'
            : 'Order cancelled.',
      });
    } catch (err) {
      pushToast({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="center-page">
        <Spinner large />
        <p className="muted small">Loading your order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page page--narrow mt-32">
        <EmptyState
          icon="🔍"
          title="Order not found"
          message={error || 'This order does not exist, or it belongs to another account.'}
          action={
            <Link to="/track" className="btn btn--primary">
              Track with token number
            </Link>
          }
        />
      </div>
    );
  }

  const meta = statusMeta(order.status);
  const canCancel = isOwner && ['pending', 'paid'].includes(order.status);
  const canReview = order.payment_status === 'paid' && order.status !== 'cancelled';

  return (
    <div className="page page--narrow mt-32">
      <div className="section-head">
        <div>
          <div className="row gap-12 wrap">
            <h1>Order #{order.token_number}</h1>
            <StatusPill status={order.status} />
          </div>
          <p>Placed {formatDateTime(order.created_at)}</p>
        </div>

        <div className="row gap-8 wrap">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setShowReceipt(true)}
          >
            🧾 Receipt
          </button>
          {canCancel && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowCancel(true)}
              disabled={busy}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {order.status === 'cancelled' && (
        <div className="mb-16">
          <Alert tone="danger" icon="✕">
            <strong>This order was cancelled.</strong>
            {order.cancel_reason && <div className="mt-8">{order.cancel_reason}</div>}
            {order.payment_status === 'refunded' && (
              <div className="mt-8">Any captured payment is being refunded to the original method.</div>
            )}
          </Alert>
        </div>
      )}

      {order.status === 'ready' && (
        <div className="mb-16">
          <Alert tone="success" icon="★">
            <strong>Your order is ready.</strong> Show token #{order.token_number} at{' '}
            {order.pickup_location || 'the counter'}.
          </Alert>
        </div>
      )}

      {order.status === 'pending' && order.payment_status === 'unpaid' && (
        <div className="mb-16">
          <Alert tone="warning" icon="◷">
            <strong>Payment pending.</strong> The kitchen has not received this order yet.
            <div className="mt-16">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => navigate(`/pay/${order.id}`)}
              >
                Pay now
              </button>
            </div>
          </Alert>
        </div>
      )}

      <div className="checkout-layout">
        <div className="stack gap-16">
          <section className="panel">
            <h3 className="mb-16">Progress</h3>
            <StatusTimeline status={order.status} timeline={order.timeline} />
          </section>

          <section className="panel">
            <h3 className="mb-16">Items</h3>
            <div className="stack gap-12">
              {(order.order_items ?? []).map((line) => (
                <div className="cart-line" key={line.id ?? line.menu_item_id} style={{ padding: 0 }}>
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
                    <div className="bold">{line.item_name}</div>
                    <div className="small muted">
                      {line.quantity} × {formatMoney(line.item_price)}
                    </div>
                    {canReview && isOwner && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm mt-8"
                        onClick={() => setReviewItem(line)}
                      >
                        Rate this
                      </button>
                    )}
                  </div>
                  <div className="bold nowrap">{formatMoney(line.subtotal)}</div>
                </div>
              ))}
            </div>
          </section>

          {(order.timeline ?? []).length > 0 && (
            <section className="panel">
              <h3 className="mb-16">History</h3>
              <div className="timeline">
                {order.timeline.map((entry, index) => (
                  <div className="timeline__item" key={`${entry.created_at}-${index}`}>
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <div className="bold small">{statusMeta(entry.status).label}</div>
                      <div className="tiny muted">
                        {formatDateTime(entry.created_at)} · by {entry.actor ?? 'system'}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="panel summary">
          <h3 className="mb-16">Payment summary</h3>

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
            <span>{Number(order.packing_fee) > 0 ? formatMoney(order.packing_fee) : 'Free'}</span>
          </div>
          <div className="summary__total">
            <span>Total</span>
            <span>{formatMoney(order.total_amount)}</span>
          </div>

          <hr className="divider mt-16 mb-16" />

          <div className="summary__row">
            <span className="muted">Payment</span>
            <span className="small text-right">
              {order.payment_status}
              {order.payment_method ? ` · ${order.payment_method}` : ''}
            </span>
          </div>
          <div className="summary__row">
            <span className="muted">Pickup</span>
            <span className="small text-right">{order.pickup_location || 'Main counter'}</span>
          </div>

          {order.notes && (
            <>
              <hr className="divider mt-16 mb-16" />
              <p className="small muted">“{order.notes}”</p>
            </>
          )}

          <button
            type="button"
            className="btn btn--secondary btn--block mt-16"
            onClick={() => setShowReceipt(true)}
          >
            🧾 View receipt
          </button>
          <Link to="/menu" className="btn btn--ghost btn--block mt-8">
            Order something else
          </Link>
        </aside>
      </div>

      <Modal open={showReceipt} onClose={() => setShowReceipt(false)} title="Receipt">
        <Receipt order={order} />
      </Modal>

      <Modal open={Boolean(reviewItem)} onClose={() => setReviewItem(null)} title="Rate this dish">
        {reviewItem && (
          <ReviewForm
            menuItemId={reviewItem.menu_item_id}
            itemName={reviewItem.item_name}
            onDone={(saved) => {
              setReviewItem(null);
              if (saved) pushToast({ type: 'success', message: 'Thanks for the review!' });
            }}
          />
        )}
      </Modal>

      <Modal open={showCancel} onClose={() => setShowCancel(false)} title="Cancel this order?">
        <p className="muted">
          The kitchen may have already started, so cancellation is refused once the order is being
          prepared.
        </p>
        {order.payment_status === 'paid' && (
          <Alert tone="warning" icon="↩">
            Your payment is captured. Cancelling now starts a refund to the original method, which
            usually takes 5–7 working days.
          </Alert>
        )}

        <label className="field mt-16">
          <span className="label">Reason (optional)</span>
          <input
            className="input"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={200}
            placeholder="Ordered by mistake…"
          />
        </label>

        <div className="row gap-8 mt-24" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={() => setShowCancel(false)}>
            Keep order
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={cancelOrder}
            disabled={busy}
          >
            {busy ? <span className="spinner" /> : 'Yes, cancel it'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** Visual progress bar; the cancelled state short-circuits to a plain message. */
function StatusTimeline({ status, timeline = [] }) {
  if (status === 'cancelled') {
    const cancelledAt = [...timeline].reverse().find((entry) => entry.status === 'cancelled');
    return (
      <Alert tone="danger" icon="✕">
        Cancelled {cancelledAt ? formatDateTime(cancelledAt.created_at) : ''}
      </Alert>
    );
  }

  const currentIndex = TRACKED_STEPS.indexOf(status);

  return (
    <ol className="stepper-timeline">
      {TRACKED_STEPS.map((step, index) => {
        const done = index <= currentIndex;
        const meta = statusMeta(step);
        const entry = [...timeline].reverse().find((item) => item.status === step);

        return (
          <li
            key={step}
            className={`stepper-timeline__step${done ? ' is-done' : ''}${
              index === currentIndex ? ' is-current' : ''
            }`}
          >
            <span className="stepper-timeline__dot" aria-hidden="true">
              {done ? '✓' : index + 1}
            </span>
            <div>
              <div className="bold small">{meta.label}</div>
              <div className="tiny muted">
                {entry ? formatDateTime(entry.created_at) : index === currentIndex ? 'In progress' : 'Pending'}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}