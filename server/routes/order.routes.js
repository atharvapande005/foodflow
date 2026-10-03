import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler, dbError, parseDbError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { optionalAuth, requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

/** The lifecycle a kitchen moves an order through. */
export const STATUSES = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'];

/** Which transitions the canteen portal is allowed to make. */
const ALLOWED_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Terminal states: no payment or status change is possible any more. */
const LOCKED = ['completed', 'cancelled'];

/**
 * Merges duplicate menu_item_ids so adding the same item twice produces one
 * line with quantity 2, instead of two identical lines.
 */
function normaliseItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('Your cart is empty.');
  }

  const merged = new Map();

  for (const item of items) {
    const id = String(item?.menu_item_id ?? '');
    const quantity = Number(item?.quantity ?? 0);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw ApiError.badRequest('One of the items in your cart is invalid.');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw ApiError.badRequest('Item quantities must be between 1 and 50.');
    }

    merged.set(id, (merged.get(id) ?? 0) + quantity);
  }

  if (merged.size === 0) throw ApiError.badRequest('Your cart is empty.');

  return [...merged].map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
}

/**
 * POST /api/orders
 * body: { items, coupon_code?, student_name?, student_email?, student_phone?,
 *         notes?, pickup_location? }
 *
 * Prices, availability, the canteen open/closed flag, coupon rules and token
 * allocation are all resolved by the place_order() database function inside a
 * single transaction, so the client can never dictate what it pays.
 */
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const items = normaliseItems(req.body.items);

    const studentName = String(req.body.student_name ?? '').trim();
    const studentEmail = String(req.body.student_email ?? '').trim();

    if (!req.user && !studentName) {
      throw ApiError.badRequest('Enter your name so the canteen knows whose order this is.');
    }

    const { data, error } = await supabase.rpc('place_order', {
      p_items: items,
      p_coupon_code: req.body.coupon_code ? String(req.body.coupon_code).toUpperCase() : null,
      p_student_name: studentName || req.user?.user_metadata?.full_name || null,
      p_student_email: studentEmail || req.user?.email || null,
      p_student_phone: req.body.student_phone ? String(req.body.student_phone) : null,
      p_user_id: req.user?.id ?? null,
      p_notes: req.body.notes ? String(req.body.notes).slice(0, 500) : null,
      p_pickup_location: req.body.pickup_location ? String(req.body.pickup_location) : null,
      p_packing_fee: env.pricing.packingFee,
      p_free_packing_above: env.pricing.freePackingAbove,
    });

    if (error) throw parseDbError(error);

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', data.id)
      .order('id', { ascending: true });

    res.status(201).json({ ...data, order_items: orderItems ?? [] });
  })
);

/**
 * GET /api/orders/track?token=123&email=a@b.com
 * Guest-friendly tracking. The email (or phone) must match so a token number
 * alone cannot be used to read somebody else's order.
 */
router.get(
  '/track',
  asyncHandler(async (req, res) => {
    const token = Number.parseInt(req.query.token, 10);
    const email = String(req.query.email || '').trim().toLowerCase();
    const phone = String(req.query.phone || '').trim();

    if (!Number.isInteger(token)) {
      throw ApiError.badRequest('Enter the token number printed on your receipt.');
    }
    if (!email && !phone) {
      throw ApiError.badRequest('Enter the email or phone you ordered with.');
    }

    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('token_number', token);

    // Exact match, not a partial one, so "a@b.com" cannot match "xa@b.com".
    query = email ? query.ilike('student_email', email) : query.eq('student_phone', phone);

    const { data, error } = await query.maybeSingle();

    if (error) throw dbError(error);
    if (!data) throw ApiError.notFound('No order matches that token and contact details.');

    res.json(sanitiseOrder(data));
  })
);

/** GET /api/orders/my-history - the signed-in student's orders. */
router.get(
  '/my-history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw dbError(error);
    res.json((data ?? []).map(sanitiseOrder));
  })
);

/**
 * GET /api/orders/:id
 * Readable by the owner (signed in, or matching email) and by canteen staff.
 */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw dbError(error);
    if (!order) throw ApiError.notFound('That order does not exist.');

    assertCanView(order, req);

    const { data: history } = await supabase
      .from('order_status_history')
      .select('status, actor, note, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });

    res.json({ ...sanitiseOrder(order), timeline: history ?? [] });
  })
);

/**
 * PUT /api/orders/:id/cancel
 * A student may cancel their own order, but only while the kitchen has not
 * started cooking it.
 *
 * A captured payment is NOT marked refunded here. Doing so without calling
 * Razorpay would promise the student money that never comes back. The order is
 * flagged so the canteen portal can issue a real refund through
 * POST /api/payment/refund, and payment_status stays 'paid' until it succeeds.
 */
router.put(
  '/:id/cancel',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw dbError(error);
    if (!order) throw ApiError.notFound('That order does not exist.');

    assertCanView(order, req);

    if (order.status === 'cancelled') throw ApiError.conflict('This order is already cancelled.');
    if (!['pending', 'paid'].includes(order.status)) {
      throw ApiError.conflict(
        'This order is already being prepared, so it can no longer be cancelled.'
      );
    }

    const refundDue = order.payment_status === 'paid';

    const { data, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancel_reason: String(req.body.reason || 'Cancelled by student').slice(0, 200),
        refund_required: refundDue ? true : null,
      })
      .eq('id', order.id)
      .select()
      .single();

    if (updateError) throw dbError(updateError);

    res.json({
      ...sanitiseOrder(data),
      refund_required: refundDue,
      message: refundDue
        ? 'Order cancelled. The canteen has been asked to refund the payment.'
        : 'Order cancelled.',
    });
  })
);

/**
 * GET /api/orders - admin order list.
 * Query: ?status=, ?payment_status=, ?search=, ?from=, ?to=, ?limit=
 */
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, payment_status, search, from, to } = req.query;
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 200, 500);

    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      if (!STATUSES.includes(status)) throw ApiError.badRequest(`Unknown status "${status}".`);
      query = query.eq('status', status);
    }
    if (payment_status && payment_status !== 'all') {
      query = query.eq('payment_status', payment_status);
    }
    if (from) query = query.gte('created_at', new Date(from).toISOString());
    if (to) query = query.lte('created_at', new Date(to).toISOString());
    if (search) {
      const term = String(search).replace(/[%_,()]/g, ' ').trim();
      if (term) {
        query = query.or(
          `student_name.ilike.%${term}%,student_email.ilike.%${term}%,token_number.eq.${Number(term) || 0}`
        );
      }
    }

    const { data, error } = await query;
    if (error) throw dbError(error);

    res.json((data ?? []).map(sanitiseOrder));
  })
);

/**
 * PUT /api/orders/:id/status - advance or cancel an order (admin).
 * Refuses illegal jumps such as pending -> completed.
 */
router.put(
  '/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (!STATUSES.includes(status)) {
      throw ApiError.badRequest(`status must be one of: ${STATUSES.join(', ')}`);
    }

    const { data: order, error: lookupError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (lookupError) throw new ApiError(500, lookupError.message);
    if (!order) throw ApiError.notFound('That order does not exist.');

    if (order.status === status) {
      throw ApiError.conflict(`This order is already "${status}".`);
    }
    if (!ALLOWED_TRANSITIONS[order.status]?.includes(status)) {
      throw ApiError.conflict(
        `Cannot move an order from "${order.status}" to "${status}".`
      );
    }
    // An unpaid order can never reach the kitchen: that would be food given away.
    if (status === 'preparing' && order.payment_status !== 'paid') {
      throw ApiError.conflict('This order has not been paid yet, so it cannot be prepared.');
    }

    const patch = { status };
    const now = new Date().toISOString();
    if (status === 'ready') patch.ready_at = now;
    if (status === 'completed') patch.completed_at = now;
    if (status === 'cancelled') {
      patch.cancel_reason = String(req.body.reason || 'Cancelled by canteen').slice(0, 200);
    }

    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', order.id)
      .select('*, order_items(*)')
      .single();

    if (error) throw dbError(error);
    res.json(sanitiseOrder(data));
  })
);

/** Strips nothing sensitive today, but keeps one place to add redactions later. */
export function sanitiseOrder(order) {
  return order ? { ...order } : order;
}

/**
 * Decides whether the current caller may read this order.
 *  - the signed-in owner
 *  - canteen staff (req.admin)
 *  - a guest order, but only when the caller supplies the matching email/phone
 */
function assertCanView(order, req) {
  if (req.user && order.user_id && order.user_id === req.user.id) return;
  if (req.admin) return;

  if (!order.user_id) {
    const email = String(req.query.email || '').trim().toLowerCase();
    const phone = String(req.query.phone || '').trim();
    const matchesEmail = email && order.student_email && email === order.student_email.toLowerCase();
    const matchesPhone = phone && order.student_phone && phone === order.student_phone;
    if (matchesEmail || matchesPhone) return;
  }

  throw ApiError.forbidden('You can only view your own orders.');
}

export default router;