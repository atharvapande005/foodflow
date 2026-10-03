import { barcodeBars, formatDateTime, formatMoney } from '../lib/format.js';
import { PaymentBadge } from './ui.jsx';

/**
 * Printable, downloadable receipt for one order.
 *
 * The markup is deliberately plain: `.receipt` is the only thing that survives
 * `window.print()`, so the printed copy is exactly this layout on white.
 */
export default function Receipt({ order, showActions = true }) {
  if (!order) return null;

  const lines = order.order_items ?? order.items ?? [];
  const bars = barcodeBars(order.id ?? String(order.token_number));
  const discount = Number(order.discount_amount || 0);

  return (
    <div className="receipt">
      <div className="receipt__head">
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 10 }}>
          <span className="logo__mark" aria-hidden="true">
            🍽
          </span>
          FoodFlow
        </div>
        <div className="bold">Canteen Receipt</div>
        <div className="small muted mt-8">{formatDateTime(order.created_at)}</div>
        <div className="mt-16">
          <span className="badge badge--brand" style={{ fontSize: '0.95rem', padding: '6px 14px' }}>
            Token #{order.token_number}
          </span>
        </div>
      </div>

      <div className="receipt__row">
        <span className="muted">Order ID</span>
        <span className="mono tiny">{order.id}</span>
      </div>
      <div className="receipt__row">
        <span className="muted">Ordered by</span>
        <span className="text-right">
          <div className="bold small">{order.student_name || 'Guest'}</div>
          {order.student_email && <div className="tiny muted">{order.student_email}</div>}
        </span>
      </div>
      {order.pickup_location && (
        <div className="receipt__row">
          <span className="muted">Pickup at</span>
          <span>{order.pickup_location}</span>
        </div>
      )}

      <hr className="divider mt-16 mb-8" />

      <div className="tiny bold muted" style={{ letterSpacing: '0.06em' }}>
        ITEMS
      </div>

      {lines.map((line) => (
        <div className="receipt__line" key={line.id ?? line.menu_item_id}>
          <div>
            <div className="bold">
              {line.quantity} × {line.item_name}
            </div>
            <div className="tiny muted">@ {formatMoney(line.item_price)} each</div>
          </div>
          <div className="nowrap bold">{formatMoney(line.subtotal)}</div>
        </div>
      ))}

      <hr className="divider mt-8 mb-8" />

      <div className="receipt__row">
        <span className="muted">Subtotal</span>
        <span>{formatMoney(order.subtotal_amount ?? order.total_amount)}</span>
      </div>

      {discount > 0 && (
        <div className="receipt__row" style={{ color: 'var(--success)', fontWeight: 650 }}>
          <span>
            Discount
            {order.coupon_code && <span className="tiny"> ({order.coupon_code})</span>}
          </span>
          <span>− {formatMoney(discount)}</span>
        </div>
      )}

      <div className="receipt__row">
        <span className="muted">Packing</span>
        <span>{Number(order.packing_fee) > 0 ? formatMoney(order.packing_fee) : 'Free'}</span>
      </div>

      <div className="receipt__row" style={{ fontSize: '1.05rem', fontWeight: 800, paddingTop: 10 }}>
        <span>Total</span>
        <span>{formatMoney(order.total_amount)}</span>
      </div>

      <div className="receipt__row">
        <span className="muted">Payment</span>
        <span className="row gap-8">
          <PaymentBadge status={order.payment_status} />
          {order.payment_method === 'simulated' && (
            <span className="tiny muted">(test)</span>
          )}
        </span>
      </div>

      {order.razorpay_payment_id && (
        <div className="receipt__row">
          <span className="muted">Payment ref</span>
          <span className="mono tiny">{order.razorpay_payment_id}</span>
        </div>
      )}

      {order.notes && (
        <div className="receipt__row">
          <span className="muted">Note</span>
          <span className="small text-right" style={{ maxWidth: '60%' }}>
            {order.notes}
          </span>
        </div>
      )}

      <div className="barcode" aria-hidden="true">
        <svg width="180" height="44" viewBox="0 0 180 44">
          {bars.map((width, index) => {
            const x = bars.slice(0, index).reduce((total, w) => total + w + 1.5, 0);
            return <rect key={index} x={x} y={0} width={width} height={44} fill="currentColor" />;
          })}
        </svg>
      </div>

      <div className="receipt__foot">
        <div className="mono tiny">{order.id}</div>
        <p className="mt-8">
          Show your token at the counter.
          <br />
          Questions? Speak to the canteen desk.
        </p>
      </div>

      {showActions && (
        <div className="row gap-8 mt-24 no-print" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => window.print()}
          >
            🖨 Print
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => downloadReceipt(order)}
          >
            ⬇ Download
          </button>
        </div>
      )}
    </div>
  );
}

/** Saves the receipt as a standalone HTML file that prints cleanly. */
function downloadReceipt(order) {
  const lines = (order.order_items ?? [])
    .map(
      (line) =>
        `<tr><td>${line.quantity} × ${escapeHtml(line.item_name)}</td>` +
        `<td style="text-align:right">${Number(line.subtotal).toFixed(2)}</td></tr>`
    )
    .join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>FoodFlow receipt ${escapeHtml(order.id)}</title>
<style>
  body{font:14px/1.6 system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 20px;color:#1c1917}
  h1{font-size:20px;margin:0 0 4px}
  .meta{color:#6f6862;font-size:13px;margin-bottom:20px}
  .token{display:inline-block;background:#ffedd5;color:#c2410c;font-weight:800;
         padding:8px 18px;border-radius:10px;font-size:20px;margin:12px 0 24px}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  td{padding:8px 0;border-bottom:1px solid #eee}
  .row{display:flex;justify-content:space-between;padding:5px 0}
  .total{font-weight:800;font-size:17px;border-top:2px solid #1c1917;margin-top:10px;padding-top:10px}
  footer{margin-top:28px;padding-top:16px;border-top:1px dashed #ccc;color:#6f6862;font-size:12px;text-align:center}
  @media print{body{margin:0}}
</style></head><body>
  <h1>FoodFlow · Canteen Receipt</h1>
  <div class="meta">${new Date(order.created_at).toLocaleString('en-IN')}</div>
  <div class="token">Token #${order.token_number}</div>
  <div class="meta">Order ID: ${escapeHtml(order.id)}<br>
    Customer: ${escapeHtml(order.student_name || 'Guest')}
    ${order.student_email ? `(${escapeHtml(order.student_email)})` : ''}</div>
  <table>${lines}</table>
  <div class="row"><span>Subtotal</span><span>${Number(order.subtotal_amount ?? order.total_amount).toFixed(2)}</span></div>
  ${
    Number(order.discount_amount) > 0
      ? `<div class="row"><span>Discount${order.coupon_code ? ` (${escapeHtml(order.coupon_code)})` : ''}</span><span>- ${Number(order.discount_amount).toFixed(2)}</span></div>`
      : ''
  }
  <div class="row"><span>Packing</span><span>${Number(order.packing_fee) > 0 ? Number(order.packing_fee).toFixed(2) : 'Free'}</span></div>
  <div class="row total"><span>Total</span><span>Rs ${Number(order.total_amount).toFixed(2)}</span></div>
  <div class="row"><span>Payment</span><span>${escapeHtml(order.payment_status)}${order.payment_method === 'simulated' ? ' (test)' : ''}</span></div>
  <footer>Show your token at the counter. Questions? Speak to the canteen desk.</footer>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `foodflow-receipt-${order.token_number}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { downloadReceipt };