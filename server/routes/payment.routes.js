import express from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler, dbError } from '../lib/errors.js';
import { safeEqual, requireAdmin } from '../middleware/adminAuth.js';
import { optionalAuth } from '../middleware/requireAuth.js';

const router = express.Router();

/**
 * Razorpay SDK is only loaded when keys exist, so the server boots cleanly in
 * simulated mode. When it is missing, /config tells the frontend to render the
 * built-in payment sheet instead of Razorpay Checkout.
 */
let razorpay = null;
if (env.razorpay.enabled) {
  if (env.razorpay.liveOnly && !env.razorpay.keyId.startsWith('rzp_live_')) {
    throw new Error(
      'RAZORPAY_LIVE_ONLY is true but RAZORPAY_KEY_ID is a test key. Set a live key or turn the flag off.'
    );
  }

  const { default: Razorpay } = await import('razorpay');
  razorpay = new Razorpay({
    key_id: env.razorpay.keyId,
    key_secret: env.razorpay.keySecret,
  });
}

/** GET /api/payment/config - which payment method the frontend should render. */
router.get('/config', (req, res) => {
res.json({
      method: env.razorpay.enabled ? 'razorpay' : 'simulated',
      key_id: env.razorpay.enabled ? env.razorpay.keyId : null,
      currency: 'INR',
      // Lets the admin screen say "live keys" vs "test mode" without guessing.
      live: env.razorpay.enabled && env.razorpay.live,
    });
});

/**
 * Loads an order and confirms the caller is allowed to pay for it.
 * Without this, anyone could attach their own payment to somebody else's order.
 */
async function loadPayableOrder(orderId, req) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw dbError(error);
  if (!order) throw ApiError.notFound('That order does not exist.');

  if (order.status === 'cancelled') {
    throw ApiError.conflict('This order was cancelled.');
  }
  if (order.payment_status === 'paid') {
    throw ApiError.conflict('This order has already been paid.');
  }

  if (!req.admin) {
    const owns = req.user && order.user_id && order.user_id === req.user.id;
    const guestMatch =
      !order.user_id &&
      String(req.body?.student_email || '').toLowerCase() === (order.student_email || '').toLowerCase();
    if (!owns && !guestMatch) {
      throw ApiError.forbidden('You cannot pay for this order.');
    }
  }

  return order;
}

/**
 * POST /api/payment/create-order
 * body: { order_id, student_email? }
 */
router.post(
  '/create-order',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const order = await loadPayableOrder(req.body.order_id, req);

    if (!razorpay) {
      // Simulated mode still issues a local payment intent so the client has
      // something real to confirm against.
      const intentId = `sim_${order.id.slice(0, 8)}_${crypto.randomBytes(6).toString('hex')}`;
      await supabase
        .from('orders')
        .update({ payment_method: 'simulated', razorpay_order_id: intentId })
        .eq('id', order.id);

      return res.json({
        mode: 'simulated',
        payment_intent_id: intentId,
        amount: Math.round(Number(order.total_amount) * 100),
        currency: 'INR',
        order,
      });
    }

    try {
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(Number(order.total_amount) * 100), // Razorpay wants paise
        currency: 'INR',
        receipt: `foodflow_${order.id.slice(0, 12)}`,
        notes: {
          foodflow_order_id: order.id,
          token_number: String(order.token_number),
        },
      });

      await supabase
        .from('orders')
        .update({ payment_method: 'razorpay', razorpay_order_id: razorpayOrder.id })
        .eq('id', order.id);

      res.json({
        mode: 'razorpay',
        razorpay_order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key_id: env.razorpay.keyId, // public, safe for the browser
        order,
      });
    } catch (err) {
      console.error('Razorpay create-order failed:', err);
      throw new ApiError(
        502,
        err?.error?.description || 'Could not start the payment. Please try again.'
      );
    }
  })
);

/**
 * POST /api/payment/verify
 * body: { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * The HMAC signature is recomputed with the secret key and compared in
 * constant time. The signature only proves the payment relates to a given
 * razorpay_order_id, so we additionally bind it to OUR order: without this
 * check a student could replay a signature from their own ₹10 order to mark
 * somebody else's ₹500 order as paid.
 */
router.post(
  '/verify',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw ApiError.badRequest('Missing required payment verification fields.');
    }
    if (!razorpay) {
      throw ApiError.badRequest('Razorpay is not configured on this server.');
    }

    const order = await loadPayableOrder(order_id, req);

    if (!order.razorpay_order_id || !safeEqual(order.razorpay_order_id, razorpay_order_id)) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
      throw ApiError.badRequest('This payment does not belong to that order.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', env.razorpay.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!safeEqual(expectedSignature, razorpay_signature)) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
      throw ApiError.badRequest('Payment verification failed.');
    }

    // Fetch the payment from Razorpay so the amount is checked against reality,
    // not against what the browser claims.
    try {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      if (payment.order_id !== razorpay_order_id) {
        throw new ApiError(400, 'Payment does not match the order.');
      }
      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        throw ApiError.badRequest(`Payment is ${payment.status}, not captured.`);
      }
      if (Math.round(payment.amount) !== Math.round(Number(order.total_amount) * 100)) {
        await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
        throw ApiError.badRequest('The amount paid does not match the order total.');
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error('Razorpay payment fetch failed:', err);
      throw new ApiError(502, 'Could not confirm the payment with Razorpay.');
    }

    const { data, error } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'paid',
        razorpay_payment_id,
        razorpay_signature,
        paid_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select()
      .single();

    if (error) throw dbError(error);
    res.json({ success: true, order: data });
  })
);

/**
 * POST /api/payment/simulate
 * body: { order_id, student_email?, outcome?: 'success' | 'failure' }
 *
 * Completes a payment without Razorpay when the project has no keys. It is the
 * real code path for local development and demos: the order transitions through
 * exactly the same states as a captured Razorpay payment. Refused while
 * Razorpay is configured, so it can never be used to skip real payments.
 */
router.post(
  '/simulate',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (env.razorpay.enabled) {
      throw ApiError.forbidden('Simulated payments are disabled because Razorpay is configured.');
    }

    const order = await loadPayableOrder(req.body.order_id, req);
    const outcome = req.body.outcome === 'failure' ? 'failure' : 'success';

    if (outcome === 'failure') {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
      throw ApiError.badRequest('Your payment was declined. Try again.');
    }

    const paymentId = `sim_pay_${crypto.randomBytes(8).toString('hex')}`;

    const { data, error } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'paid',
        payment_method: 'simulated',
        razorpay_payment_id: paymentId,
        paid_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select()
      .single();

    if (error) throw dbError(error);
    res.json({ success: true, order: data, payment_id: paymentId });
  })
);

/**
 * POST /api/payment/webhook
 * Razorpay's server-to-server notification. Body is the raw form payload and is
 * authenticated with the webhook secret rather than the admin key.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const secret = env.razorpay.webhookSecret;
    if (!secret) throw ApiError.badRequest('RAZORPAY_WEBHOOK_SECRET is not configured.');

    const signature = req.get('x-razorpay-signature');
    if (!signature) throw ApiError.badRequest('Missing webhook signature.');

    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody ?? JSON.stringify(req.body))
      .digest('hex');

    if (!safeEqual(expected, signature)) {
      throw new ApiError(401, 'Invalid webhook signature.');
    }

    const event = req.body?.event;
    const payload = req.body?.payload || {};

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload.payment?.entity || payload.order?.entity;
      const rzpOrderId = payment?.order_id;
      if (rzpOrderId) {
        await supabase
          .from('orders')
          .update({
            payment_status: 'paid',
            status: 'paid',
            razorpay_payment_id: payment.id,
            paid_at: new Date().toISOString(),
          })
          .eq('razorpay_order_id', rzpOrderId)
          .neq('payment_status', 'paid');
      }
    }

    if (event === 'payment.failed') {
      const payment = payload.payment?.entity;
      if (payment?.order_id) {
        await supabase
          .from('orders')
          .update({ payment_status: 'failed' })
          .eq('razorpay_order_id', payment.order_id)
          .neq('payment_status', 'paid');
      }
    }

    if (event === 'refund.processed' || event === 'refund.failed') {
      const refund = payload.refund?.entity;
      if (refund?.notes?.foodflow_order_id) {
        await supabase
          .from('orders')
          .update({
            payment_status: event === 'refund.processed' ? 'refunded' : 'paid',
            status: 'cancelled',
            cancel_reason: 'Refunded',
          })
          .eq('id', refund.notes.foodflow_order_id);
      }
    }

    // Always 200 once the signature checks out, so Razorpay stops retrying.
    res.json({ received: true });
  })
);

/**
 * POST /api/payment/refund - refund a paid order (admin).
 * body: { order_id, amount? }  amount is in rupees, defaults to the full total.
 */
router.post(
  '/refund',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.body.order_id)
      .maybeSingle();

    if (error) throw dbError(error);
    if (!order) throw ApiError.notFound('That order does not exist.');
    if (order.payment_status !== 'paid') {
      throw ApiError.conflict('Only a paid order can be refunded.');
    }

    const fullRefund = !req.body.amount || Number(req.body.amount) >= Number(order.total_amount);

    if (razorpay && order.razorpay_payment_id) {
      try {
        await razorpay.refunds.create({
          payment_id: order.razorpay_payment_id,
          ...(fullRefund
            ? {}
            : { amount: Math.round(Number(req.body.amount) * 100) }),
          notes: { foodflow_order_id: order.id },
        });
      } catch (err) {
        console.error('Razorpay refund failed:', err);
        throw new ApiError(502, err?.error?.description || 'Razorpay rejected the refund.');
      }
    }

    const { data, error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'refunded',
        status: 'cancelled',
        refund_required: false,
        cancel_reason: 'Refunded by canteen',
      })
      .eq('id', order.id)
      .select()
      .single();

    if (updateError) throw dbError(updateError);
    res.json({ refunded: true, order: data, mode: razorpay ? 'razorpay' : 'simulated' });
  })
);

export default router;