import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import OrderStatusPanel from '../components/OrderStatusPanel.jsx';
import Receipt from '../components/Receipt.jsx';
import Modal from '../components/Modal.jsx';
import { Alert, EmptyState, LoadingState, StatusBadge } from '../components/ui.jsx';
import { formatMoney } from '../lib/format.js';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Collected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const POLL_MS = 20000;

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [receiptOrder, setReceiptOrder] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      const result = await api.orders.myHistory();
      if (mounted.current) {
        setOrders(result ?? []);
        setError('');
      }
    } catch (err) {
      if (mounted.current && !quiet) setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep in-flight orders live without hammering the API.
  useEffect(() => {
    if (!orders?.some((order) => ['paid', 'preparing', 'ready', 'pending'].includes(order.status))) {
      return undefined;
    }
    const timer = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [orders, load]);

  const visible = useMemo(() => {
    if (!orders) return [];
    if (filter === 'all') return orders;
    return orders.filter((order) => order.status === filter);
  }, [orders, filter]);

  const spend = useMemo(
    () => (orders ?? []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
    [orders]
  );

  if (orders === null) return <LoadingState label="Loading your orders…" />;

  return (
    <div className="page page--narrow mt-32">
      <div className="section-head">
        <div>
          <h1>Your orders</h1>
          <p>
            {orders.length} order{orders.length === 1 ? '' : 's'} · {formatMoney(spend)} lifetime spend
          </p>
        </div>
        <Link to="/menu" className="btn btn--primary btn--sm">
          Order again
        </Link>
      </div>

      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="chip-row mb-24">
        {FILTERS.map((option) => {
          const count =
            option.value === 'all'
              ? orders.length
              : orders.filter((order) => order.status === option.value).length;

          return (
            <button
              key={option.value}
              type="button"
              className={`chip${filter === option.value ? ' is-active' : ''}`}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
              <span className="chip__count">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="🧾"
          title={orders.length === 0 ? 'No orders yet' : 'Nothing in that filter'}
          message={
            orders.length === 0
              ? 'Your first order will show up here with its receipt and live status.'
              : 'Try a different filter to see your other orders.'
          }
          action={
            <Link to="/menu" className="btn btn--primary">
              Browse the menu
            </Link>
          }
        />
      ) : (
        <div className="stack gap-16">
          {visible.map((order) => (
            <div key={order.id}>
              <OrderStatusPanel order={order} />
              <div className="row gap-8 mt-8">
                <Link to={`/order/${order.id}`} className="btn btn--ghost btn--sm">
                  View details
                </Link>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setReceiptOrder(order)}
                >
                  🧾 Receipt
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(receiptOrder)}
        onClose={() => setReceiptOrder(null)}
        title={`Receipt · Token #${receiptOrder?.token_number ?? ''}`}
      >
        {receiptOrder && <Receipt order={receiptOrder} />}
      </Modal>
    </div>
  );
}
