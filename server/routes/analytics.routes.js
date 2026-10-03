import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { ApiError, asyncHandler, dbError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

const round2 = (n) => Number(Number(n || 0).toFixed(2));

function startOfDayIso(daysBack = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.toISOString();
}

/**
 * GET /api/analytics/dashboard (admin)
 * Everything the canteen dashboard needs in a single round trip.
 */
router.get(
  '/dashboard',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const todayIso = startOfDayIso(0);
    const weekIso = startOfDayIso(6);

    const [
      todayOrders,
      weekOrders,
      allOrders,
      statusRows,
      couponRows,
      lineItems,
    ] = await Promise.all([
      supabase.from('orders').select('*').gte('created_at', todayIso),
      supabase.from('orders').select('*').gte('created_at', weekIso),
      supabase.from('orders').select('status, payment_status, total_amount, discount_amount, created_at'),
      supabase.from('orders').select('status'),
      supabase.from('coupons').select('code, description, discount_type, value, used_count, is_active, usage_limit'),
      supabase.from('order_items').select('menu_item_id, item_name, quantity, subtotal, item_price'),
    ]);

    for (const result of [todayOrders, weekOrders, allOrders, statusRows, couponRows, lineItems]) {
      if (result.error) throw dbError(result.error, "analytics");
    }

    const today = todayOrders.data ?? [];
    const week = weekOrders.data ?? [];
    const every = allOrders.data ?? [];

    const isRevenue = (o) => o.payment_status === 'paid' && o.status !== 'cancelled';

    const sum = (rows) => round2(rows.reduce((total, row) => total + Number(row.total_amount), 0));
    const revenue = (rows) => round2(rows.filter(isRevenue).reduce((t, r) => t + Number(r.total_amount), 0));

    // ---- status funnel ---------------------------------------------------
    const statusCounts = {};
    for (const key of ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled']) {
      statusCounts[key] = 0;
    }
    for (const row of statusRows.data ?? []) {
      if (row.status in statusCounts) statusCounts[row.status] += 1;
    }

    // ---- busiest hours, for staffing decisions ----------------------------
    const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: 0,
      revenue: 0,
    }));
    for (const order of every) {
      const hour = new Date(order.created_at).getHours();
      hourBuckets[hour].orders += 1;
      hourBuckets[hour].revenue += isRevenue(order) ? Number(order.total_amount) : 0;
    }
    const busiestHour = hourBuckets.reduce(
      (best, bucket) => (bucket.orders > best.orders ? bucket : best),
      hourBuckets[0]
    );

    // ---- top items -------------------------------------------------------
    const itemTotals = new Map();
    for (const line of lineItems.data ?? []) {
      const current = itemTotals.get(line.menu_item_id) || {
        menu_item_id: line.menu_item_id,
        name: line.item_name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += line.quantity;
      current.revenue += Number(line.subtotal);
      itemTotals.set(line.menu_item_id, current);
    }
    const topItems = [...itemTotals.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)
      .map((item) => ({ ...item, revenue: round2(item.revenue) }));

    // ---- daily revenue for the last 7 days --------------------------------
    const daily = [];
    for (let back = 6; back >= 0; back -= 1) {
      const from = startOfDayIso(back);
      const to = startOfDayIso(back - 1);
      const rows = week.filter((o) => o.created_at >= from && o.created_at < to);
      daily.push({
        date: from.slice(0, 10),
        orders: rows.length,
        revenue: revenue(rows),
      });
    }

    const paidCount = every.filter(isRevenue).length;

    res.json({
      headline: {
        today_orders: today.length,
        today_revenue: revenue(today),
        today_unpaid: today.filter((o) => o.payment_status === 'unpaid').length,
        week_orders: week.length,
        week_revenue: revenue(week),
        avg_order_value: paidCount ? round2(revenue(every) / paidCount) : 0,
        total_orders: every.length,
        total_revenue: revenue(every),
        total_discount_given: round2(
          every.reduce((t, o) => t + Number(o.discount_amount || 0), 0)
        ),
        completion_rate: every.length
          ? round2((statusCounts.completed / every.length) * 100)
          : 0,
        cancellation_rate: every.length
          ? round2((statusCounts.cancelled / every.length) * 100)
          : 0,
      },
      status_counts: statusCounts,
      busiest_hour: {
        hour: busiestHour.hour,
        orders: busiestHour.orders,
        revenue: round2(busiestHour.revenue),
      },
      hourly: hourBuckets.map((b) => ({ ...b, revenue: round2(b.revenue) })),
      daily,
      top_items: topItems,
      gross: sum(every),
      coupons: (couponRows.data ?? []).map((coupon) => ({
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        value: Number(coupon.value),
        used_count: coupon.used_count,
        usage_limit: coupon.usage_limit,
        is_active: coupon.is_active,
      })),
    });
  })
);

export default router;