import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import AdminLayout from './AdminLayout.jsx';
import { Alert, LoadingState, Stat, StatusBadge, TableSkeleton } from '../../components/ui.jsx';
import { formatDate, formatMoney, formatNumber, formatTime, statusMeta } from '../../lib/format.js';

const LIVE_POLL_MS = 20000;

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [live, setLive] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    try {
      const [dashboard, active] = await Promise.all([
        api.analytics.dashboard(),
        api.orders.list({ status: 'paid', limit: 25 }),
      ]);
      if (!mounted.current) return;
      setData(dashboard);
      setLive(active ?? []);
      setError('');
    } catch (err) {
      if (mounted.current && !quiet) setError(err.message);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load({ quiet: true }), LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function advance(order) {
    const next = { paid: 'preparing', preparing: 'ready', ready: 'completed' }[order.status];
    if (!next) return;
    try {
      const updated = await api.orders.setStatus(order.id, next);
      setLive((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data && !error) return <LoadingState label="Loading the dashboard…" />;

  const headline = data?.headline ?? {};
  const maxRevenue = Math.max(1, ...(data?.daily ?? []).map((day) => Number(day.revenue || 0)));

  return (
    <AdminLayout
      title="Dashboard"
      subtitle={refreshing ? 'Refreshing…' : 'Live canteen performance, refreshed every 20 seconds.'}
      actions={
        <>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => api.recommendations.rebuild().catch(() => {})}>
            Rebuild suggestions
          </button>
          <Link to="/admin/orders" className="btn btn--primary btn--sm">
            Manage orders
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="grid grid--stats">
        <Stat
          label="Today's orders"
          value={formatNumber(headline.today_orders ?? 0)}
          hint={`${formatMoney(headline.today_revenue)} revenue`}
          tone="brand"
        />
        <Stat
          label="Today's revenue"
          value={formatMoney(headline.today_revenue ?? 0)}
          hint={`${headline.today_unpaid ?? 0} still unpaid`}
        />
        <Stat label="This week" value={formatNumber(headline.week_orders ?? 0)} hint={formatMoney(headline.week_revenue)} />
        <Stat label="Average order" value={formatMoney(headline.avg_order_value ?? 0)} hint="paid orders only" />
        <Stat
          label="Completed"
          value={`${Number(headline.completion_rate ?? 0).toFixed(0)}%`}
          hint={`${Number(headline.cancellation_rate ?? 0).toFixed(0)}% cancelled`}
          tone="success"
        />
        <Stat
          label="Discount given"
          value={formatMoney(headline.total_discount_given ?? 0)}
          hint={`${formatNumber(headline.total_orders ?? 0)} lifetime orders`}
          tone="warning"
        />
      </div>

      <div className="admin-grid mt-24">
        <section className="panel">
          <h3 className="mb-16">Revenue, last 7 days</h3>

          {!data?.daily?.length ? (
            <p className="muted small">No orders in the last week yet.</p>
          ) : (
            <div className="bar-chart" role="img" aria-label="Daily revenue for the last 7 days">
              {data.daily.map((day) => (
                <div className="bar-chart__col" key={day.date}>
                  <div className="bar-chart__value">{formatMoney(day.revenue)}</div>
                  <div
                    className="bar-chart__bar"
                    style={{ height: `${Math.max(6, (Number(day.revenue) / maxRevenue) * 100)}%` }}
                    title={`${formatDate(day.date)}: ${day.orders} orders`}
                  />
                  <div className="bar-chart__label">
                    {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                  </div>
                  <div className="bar-chart__sub">{day.orders} ord</div>
                </div>
              ))}
            </div>
          )}

          {data?.busiest_hour?.orders > 0 && (
            <p className="hint mt-16">
              Busiest hour: {formatTime(`2000-01-01T${String(data.busiest_hour.hour).padStart(2, '0')}:00:00`)} with{' '}
              {data.busiest_hour.orders} orders.
            </p>
          )}
        </section>

        <section className="panel">
          <h3 className="mb-16">Kitchen queue</h3>

          {!live.length ? (
            <p className="muted small">Nothing waiting right now.</p>
          ) : (
            <div className="stack gap-8">
              {live.map((order) => (
                <div className="queue-row" key={order.id}>
                  <span className="badge badge--brand">#{order.token_number}</span>
                  <span className="grow truncate small">{order.student_name || 'Guest'}</span>
                  <StatusBadge status={order.status} />
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => advance(order)}
                  >
                    {{ paid: 'Start', preparing: 'Ready', ready: 'Hand over' }[order.status]}
                  </button>
                </div>
              ))}
            </div>
          )}

          <hr className="divider mt-16 mb-16" />

          <h4 className="mb-8">All time status</h4>
          <div className="row gap-8 wrap">
            {Object.entries(data?.status_counts ?? {}).map(([status, count]) => (
              <span key={status} className="badge">
                {statusMeta(status).label}: {count}
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-grid mt-24">
        <section className="panel">
          <h3 className="mb-16">Top sellers</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dish</th>
                  <th className="num">Portions</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_items ?? []).map((item) => (
                  <tr key={item.menu_item_id}>
                    <td>{item.name}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{formatMoney(item.revenue)}</td>
                  </tr>
                ))}
                {!data?.top_items?.length && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No sales yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h3 className="mb-16">Coupon usage</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th className="num">Used</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {(data?.coupons ?? []).map((coupon) => (
                  <tr key={coupon.code}>
                    <td className="mono">{coupon.code}</td>
                    <td className="num">
                      {coupon.used_count}
                      {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ''}
                    </td>
                    <td>
                      <span className={`badge badge--${coupon.is_active ? 'success' : 'danger'}`}>
                        {coupon.is_active ? 'active' : 'paused'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!data?.coupons?.length && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No coupons yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Link to="/admin/coupons" className="btn btn--secondary btn--sm mt-16">
            Manage coupons
          </Link>
        </section>
      </div>
    </AdminLayout>
  );
}

export { TableSkeleton };