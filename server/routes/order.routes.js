import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// POST /api/orders - create a new order (before payment; status starts as 'pending')
// body: { student_name, student_email, items: [{ menu_item_id, quantity }] }
router.post('/', optionalAuth, async (req, res) => {
  const { student_name, student_email, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required and cannot be empty' });
  }
  // Check canteen is open
  const { data: canteenState, error: canteenError } = await supabase
    .from('canteen_state')
    .select('is_open, message')
    .eq('id', 1)
    .single();

  if (canteenError) return res.status(500).json({ error: canteenError.message });
  if (!canteenState.is_open) {
    return res.status(400).json({
      error: canteenState.message || 'The canteen is currently closed and not accepting orders.',
    });
  }

  // Look up current prices/names for each item ordered (never trust prices from the client)
  const menuItemIds = items.map((i) => i.menu_item_id);
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('*')
    .in('id', menuItemIds);

  if (menuError) return res.status(500).json({ error: menuError.message });
  if (!menuItems || menuItems.length !== menuItemIds.length) {
    return res.status(400).json({ error: 'One or more menu items were not found' });
  }
  const unavailableItems = menuItems.filter((m) => !m.is_available);
  if (unavailableItems.length > 0) {
    return res.status(400).json({
      error: `These items are currently unavailable: ${unavailableItems.map((m) => m.name).join(', ')}`,
    });
  }

  const orderItems = items.map((i) => {
    const menuItem = menuItems.find((m) => m.id === i.menu_item_id);
    return {
      menu_item_id: menuItem.id,
      item_name: menuItem.name,
      item_price: menuItem.price,
      quantity: i.quantity,
      subtotal: menuItem.price * i.quantity,
    };
  });

  const total_amount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

  // Get the next sequential token number atomically
  const { data: tokenData, error: tokenError } = await supabase.rpc('next_token_number');
  if (tokenError) return res.status(500).json({ error: tokenError.message });

  // Create the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert([
      {
        token_number: tokenData,
        student_name,
        student_email,
        total_amount,
        status: 'pending',
        payment_status: 'unpaid',
        user_id: req.user?.id || null,
      },
    ])
    .select()
    .single();

  if (orderError) return res.status(500).json({ error: orderError.message });

  // Attach order_id to each order item and insert them
  const itemsToInsert = orderItems.map((i) => ({ ...i, order_id: order.id }));
  const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);

  if (itemsError) return res.status(500).json({ error: itemsError.message });

  res.status(201).json({ ...order, items: orderItems });
});

// GET /api/orders - list all orders (admin dashboard)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
// GET /api/orders/my-history - a logged-in student's own past orders
router.get('/my-history', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/orders/:id - get a single order (for status tracking)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: 'Order not found' });
  res.json(data);
});

// PUT /api/orders/:id/status - admin updates order status (e.g. approve -> preparing -> ready)
router.put('/:id/status', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
