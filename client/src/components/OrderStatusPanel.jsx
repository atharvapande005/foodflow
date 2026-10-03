import { Link } from 'react-router-dom';
import { formatDateTime, formatMoney, statusMeta } from '../lib/format.js';
import { StatusBadge, PaymentBadge } from './ui.jsx';

const STEPS = ['paid', 'preparing', 'ready', 'completed'];

/**
 * Compact live status block shared by the tracking page and order history, so a
 * student sees the same progress UI everywhere.
 */
export default function OrderStatusPanel({ order }) {
  if (!order) return null;

  const cancelled = order.status === 'cancelled';
  const awaitingPayment = order.payment_status === 'unpaid' && !cancelled;
  const currentIndex = STEPS.indexOf(order.status);

  return (
    <section className="panel">
      <div className="between wrap gap-12">
        <div>
          <div className="row gap-8">
            <span className="badge badge--brand" style={{ fontSize: '1rem' }}>
              Token #{order.token_number}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <p className="small muted mt-8">
            {order.student_name || 'Guest'} · {formatDateTime(order.created_at)}
          </p>
        </div>

        <div className="text-right">
          <div className="price" style={{ fontSize: '1.4rem' }}>
            {formatMoney(order.total_amount)}
          </div>
          <PaymentBadge status={order.payment_status} />
        </div>
      </div>

      {cancelled ? (
        <div className="mt-24">
          <StatusBadge status="cancelled" />
          <p className="small muted mt-8">{order.cancel_reason || 'This order was cancelled.'}</p>
          {order.payment_status === 'refunded' && (
            <p className="small muted">The payment is being refunded to the original method.</p>
          )}
        </div>
      ) : awaitingPayment ? (
        <div className="mt-24">
          <p className="muted small">
            The kitchen has not received this order yet. Complete the payment to place it in the
            queue.
          </p>
          <Link to={`/pay/${order.id}`} className="btn btn--primary btn--sm mt-16">
            Pay now
          </Link>
        </div>
      ) : (
        <ol className="stepper-timeline mt-24">
          {STEPS.map((step, index) => {
            const done = index <= currentIndex;
            const meta = statusMeta(step);

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
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <hr className="divider mt-24 mb-16" />

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
    </section>
  );
}