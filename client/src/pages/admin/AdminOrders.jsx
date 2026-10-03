import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import AdminLayout from './AdminLayout.jsx';
import Modal from '../../components/Modal.jsx';
import Receipt from '../../components/Receipt.jsx';
import { Alert, EmptyState, LoadingState, StatusBadge, TableSkeleton } from '../../components/ui.jsx';
import { NEXT_STATUS, formatDateTime, formatMoney, statusMeta } from '../../lib/format.js';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Collected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const POLL_MS = 12000;
const ACTION_LABEL = { paid: 'Start preparing', preparing: 'Mark ready', ready: 'Handed over' };

export default function AdminOrders() {
  const { id } = useParams();
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      const result = await api.orders.list({ status: filter, search: search.trim() || undefined, limit: 200 });
      if (mounted.current) {
        setOrders(result ?? []);
        setError('');
      }
    } catch (err) {
      if (mounted.current && !quiet) setError(err.message);
    }
  }, [filter, search]);

  useEffect(() => {
    setOrders(null);
    const timer = setTimeout(() => load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    const timer = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const map = {};
    for (const order of orders ?? []) map[order.status] = (map[order.status] ?? 0) + 1;
    return map;
  }, [orders]);

  async function setStatus(order, status) {
    setBusyId(order.id);
    setError('');
    try {
      await api.orders.setStatus(order.id, status, reason || undefined);
      await load({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
      setCancelTarget(null);
      setReason('');
    }
  }

  if (id) return <AdminOrderDetail id={id} />;

  return (
    <AdminLayout
      title="Orders"
      subtitle="Every order, newest first. Status changes are restricted to legal transitions."
    >
      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="between wrap gap-12 mb-16">
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search name, email or token"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search orders"
        />
        <div className="row gap-8 wrap">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chip${filter === option.value ? ' is-active' : ''}`}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
              {counts[option.value] ? <span className="chip__count">{counts[option.value]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {orders === null ? (
        <div className="panel">
          <table>
            <tbody>
              <TableSkeleton rows={6} columns={6} />
            </tbody>
          </table>
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon="🧾" title="No orders here" message="Nothing matches this filter yet." />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Student</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Placed</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const next = NEXT_STATUS[order.status];
                const terminal = ['completed', 'cancelled'].includes(order.status);

                return (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/admin/orders/${order.id}`} className="bold">
                        #{order.token_number}
                      </Link>
                    </td>
                    <td>
                      <div className="small bold">{order.student_name || 'Guest'}</div>
                      <div className="tiny muted truncate">{order.student_email || order.student_phone || '—'}</div>
                    </td>
                    <td className="small">
                      {(order.order_items ?? []).reduce((sum, line) => sum + line.quantity, 0)} items
                    </td>
                    <td className="nowrap">{formatMoney(order.total_amount)}</td>
                    <td>
                      <span className={`badge badge--${order.payment_status === 'paid' ? 'success' : 'warning'}`}>
                        {order.payment_status}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="tiny muted nowrap">{formatDateTime(order.created_at)}</td>
                    <td className="nowrap">
                      {!terminal && (
                        <>
                          {next && (
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={busyId === order.id}
                              onClick={() => setStatus(order, next)}
                            >
                              {ACTION_LABEL[next] ?? next}
                            </button>
                          )}{' '}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setCancelTarget(order)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title="Cancel this order?">
        <p className="muted">
          Cancelling token #{cancelTarget?.token_number}. If it was already paid, refund it from the
          order page after cancelling.
        </p>
        <label className="field mt-16">
          <span className="label">Reason</span>
          <input
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Kitchen closed, item unavailable…"
          />
        </label>
        <div className="row gap-8 mt-24" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={() => setCancelTarget(null)}>
            Keep it
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => setStatus(cancelTarget, 'cancelled')}
            disabled={busyId === cancelTarget?.id}
          >
            Cancel order
          </button>
        </div>
      </Modal>
    </AdminLayout>
  );
}

function AdminOrderDetail({ id }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await api.orders.get(id);
        if (!cancelled) {
          setOrder(result);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  async function advance(status) {
    setBusy(true);
    try {
      setOrder(await api.orders.setStatus(id, status));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    setBusy(true);
    try {
      await api.payment.refund(id);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <AdminLayout title="Order" subtitle={id}>
        {error ? <Alert tone="error">{error}</Alert> : <LoadingState />}
      </AdminLayout>
    );
  }

  const next = NEXT_STATUS[order.status];
  const terminal = ['completed', 'cancelled'].includes(order.status);

  return (
    <AdminLayout
      title={`Order #${order.token_number}`}
      subtitle={`${order.student_name || 'Guest'} · ${formatDateTime(order.created_at)}`}
      actions={
        <>
          <Link to="/admin/orders" className="btn btn--ghost btn--sm">
            ← All orders
          </Link>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowReceipt(true)}>
            🧾 Receipt
          </button>
          {next && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => advance(next)}
              disabled={busy}
            >
              {ACTION_LABEL[next] ?? next}
            </button>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="admin-grid">
        <section className="panel">
          <h3 className="mb-16">Items</h3>
          <div className="stack gap-8">
            {(order.order_items ?? []).map((line) => (
              <div className="between small" key={line.id ?? line.menu_item_id}>
                <span className="truncate">
                  {line.quantity} × {line.item_name}
                </span>
                <span className="nowrap">{formatMoney(line.subtotal)}</span>
              </div>
            ))}
          </div>

          <hr className="divider mt-16 mb-16" />

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
        </section>

        <section className="panel">
          <h3 className="mb-16">Details</h3>
          <div className="stack gap-8 small">
            <div className="between">
              <span className="muted">Status</span>
              <StatusBadge status={order.status} />
            </div>
            <div className="between">
              <span className="muted">Payment</span>
              <span>
                {order.payment_status} · {order.payment_method ?? '—'}
              </span>
            </div>
            <div className="between">
              <span className="muted">Email</span>
              <span className="truncate">{order.student_email || '—'}</span>
            </div>
            <div className="between">
              <span className="muted">Phone</span>
              <span>{order.student_phone || '—'}</span>
            </div>
            <div className="between">
              <span className="muted">Pickup</span>
              <span>{order.pickup_location || 'Main counter'}</span>
            </div>
            {order.razorpay_payment_id && (
              <div className="between">
                <span className="muted">Razorpay ref</span>
                <span className="mono tiny">{order.razorpay_payment_id}</span>
              </div>
            )}
            {order.notes && (
              <div>
                <span className="muted">Kitchen note</span>
                <p className="small mt-8">“{order.notes}”</p>
              </div>
            )}
            {order.cancel_reason && (
              <div>
                <span className="muted">Cancel reason</span>
                <p className="small mt-8">{order.cancel_reason}</p>
              </div>
            )}
          </div>

          {!terminal && (
            <button
              type="button"
              className="btn btn--danger btn--block mt-24"
              onClick={() => advance('cancelled')}
              disabled={busy}
            >
              Cancel order
            </button>
          )}

          {order.payment_status === 'paid' && order.status === 'cancelled' && (
            <button
              type="button"
              className="btn btn--secondary btn--block mt-16"
              onClick={refund}
              disabled={busy}
            >
              Refund via Razorpay
            </button>
          )}

          {(order.timeline ?? []).length > 0 && (
            <>
              <hr className="divider mt-24 mb-16" />
              <h4 className="mb-8">Timeline</h4>
              <div className="timeline">
                {order.timeline.map((entry, index) => (
                  <div className="timeline__item" key={`${entry.created_at}-${index}`}>
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <div className="bold small">{statusMeta(entry.status).label}</div>
                      <div className="tiny muted">
                        {formatDateTime(entry.created_at)} · {entry.actor ?? 'system'}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <Modal open={showReceipt} onClose={() => setShowReceipt(false)} title="Receipt">
        <Receipt order={order} />
      </Modal>
    </AdminLayout>
  );
}

export { AdminOrderDetail };