import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// GET /api/reports/revenue?from=2026-09-01&to=2026-09-30
// Returns a full financial report for the given date range (inclusive).
router.get('/revenue', requireAdmin, async (req, res) => {
    const { from, to } = req.query;

    if (!from || !to) {
        return res.status(400).json({ error: 'from and to date query params are required (YYYY-MM-DD)' });
    }

    // Include the full 'to' day by extending to end-of-day
    const toEndOfDay = `${to}T23:59:59`;

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, token_number, student_name, total_amount, status, payment_status, user_id, created_at, order_items(item_name, item_price, quantity, subtotal)')
        .eq('payment_status', 'paid')
        .gte('created_at', from)
        .lte('created_at', toEndOfDay)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // Summary numbers
    const total_revenue = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    const order_count = orders.length;
    const average_order_value = order_count > 0 ? total_revenue / order_count : 0;
    const guest_orders = orders.filter((o) => !o.user_id).length;
    const student_orders = orders.filter((o) => o.user_id).length;

    // Best-selling items breakdown
    const itemTotals = {};
    for (const order of orders) {
        for (const item of order.order_items) {
            if (!itemTotals[item.item_name]) {
                itemTotals[item.item_name] = { quantity: 0, revenue: 0 };
            }
            itemTotals[item.item_name].quantity += item.quantity;
            itemTotals[item.item_name].revenue += Number(item.subtotal);
        }
    }
    const item_breakdown = Object.entries(itemTotals)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue);

    res.json({
        from,
        to,
        summary: {
            total_revenue,
            order_count,
            average_order_value,
            guest_orders,
            student_orders,
        },
        item_breakdown,
        orders: orders.map((o) => ({
            token_number: o.token_number,
            student_name: o.student_name,
            total_amount: o.total_amount,
            status: o.status,
            created_at: o.created_at,
            type: o.user_id ? 'Student' : 'Guest',
            items: o.order_items.map((i) => `${i.item_name} x${i.quantity}`).join(', '),
        })),
    });
});

export default router;