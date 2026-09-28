import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// POST /api/payment/create-order
// body: { order_id }  (the FoodFlow order's id, already created via /api/orders)
router.post('/create-order', async (req, res) => {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'order_id is required' });

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', order_id)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found' });

  try {
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.total_amount * 100), // Razorpay expects paise
      currency: 'INR',
      receipt: `order_${order.id}`,
    });

    await supabase
      .from('orders')
      .update({ razorpay_order_id: razorpayOrder.id })
      .eq('id', order.id);

    res.json({
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID, // public key, safe to send to frontend
    });
  } catch (err) {
    console.error('Razorpay error:', err);
    res.status(500).json({ error: err.error?.description || err.message || 'Unknown error' });
  }
});

// POST /api/payment/verify
// body: { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
router.post('/verify', async (req, res) => {
  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing required payment verification fields' });
  }

  // Recreate the expected signature using the secret key (never trust the frontend's claim)
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const isValid = expectedSignature === razorpay_signature;

  if (!isValid) {
    await supabase
      .from('orders')
      .update({ payment_status: 'failed' })
      .eq('id', order_id);
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      status: 'paid',
      razorpay_payment_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, order: data });
});

export default router;
