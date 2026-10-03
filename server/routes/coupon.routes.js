import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { ApiError, asyncHandler, dbError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { optionalAuth } from '../middleware/requireAuth.js';
import { env } from '../config/env.js';

const router = express.Router();

const DISCOUNT_TYPES = ['percent', 'flat', 'free_delivery'];
const CODE_PATTERN = /^[A-Z0-9_-]{3,24}$/;

/**
 * Builds the subtotal and category list straight from the database so a
 * malicious client cannot understate the cart value to unlock a bigger
 * discount than it is entitled to.
 */
async function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('Your cart is empty.');
  }

  const ids = items.map((i) => String(i.menu_item_id));
  const { data: menuItems, error } = await supabase
    .from('menu_items')
    .select('id, price, category')
    .in('id', ids);

  if (error) throw dbError(error);
  if (!menuItems || menuItems.length === 0) {
    throw ApiError.badRequest('None of those items are on the menu.');
  }

  const subtotal = items.reduce((sum, item) => {
    const menuItem = menuItems.find((m) => m.id === String(item.menu_item_id));
    if (!menuItem) return sum;
    return sum + Number(menuItem.price) * Number(item.quantity || 0);
  }, 0);

  const categories = menuItems.map((m) => m.category).filter(Boolean);

  return { subtotal: Number(subtotal.toFixed(2)), categories };
}

/**
 * GET /api/coupons/available
 * Public list of coupons a student could plausibly use right now. Codes are
 * shown so they can be shared; live discounts are still computed server side.
 */
router.get(
  '/available',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('coupons')
      .select(
        'code, description, discount_type, value, max_discount, min_order_amount, applies_to_category, starts_at, ends_at, usage_limit, usage_limit_per_user, used_count'
      )
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order('discount_type', { ascending: true });

    if (error) throw dbError(error);

    const coupons = (data || [])
      // Hide anything whose global cap is already used up.
      .filter((c) => c.usage_limit === null || c.used_count < c.usage_limit)
      .map((c) => ({
        code: c.code,
        description: c.description,
        discount_type: c.discount_type,
        value: Number(c.value),
        max_discount: c.max_discount === null ? null : Number(c.max_discount),
        min_order_amount: Number(c.min_order_amount),
        applies_to_category: c.applies_to_category,
        expires_at: c.ends_at,
        expires_in_days: c.ends_at
          ? Math.max(0, Math.ceil((new Date(c.ends_at) - Date.now()) / 86400000))
          : null,
        remaining_uses: c.usage_limit === null ? null : c.usage_limit - c.used_count,
      }));

    res.json({
      coupons,
      packing_fee: env.pricing.packingFee,
      free_packing_above: env.pricing.freePackingAbove,
    });
  })
);

/**
 * POST /api/coupons/validate
 * body: { code, items: [{ menu_item_id, quantity }] }
 *
 * Runs the same evaluate_coupon() database function the real order uses, so
 * the preview and the charge always agree.
 */
router.post(
  '/validate',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { subtotal, categories } = await priceCart(req.body.items);

    const { data, error } = await supabase.rpc('evaluate_coupon', {
      p_code: String(req.body.code || ''),
      p_subtotal: subtotal,
      p_user_id: req.user?.id ?? null,
      p_categories: categories,
    });

    if (error) throw dbError(error);

    let packingFee = env.pricing.packingFee;
    if (env.pricing.freePackingAbove > 0 && subtotal >= env.pricing.freePackingAbove) {
      packingFee = 0;
    }
    if (data?.waives_packing) packingFee = 0;

    const discount = Number(data?.discount || 0);

    res.json({
      ...data,
      subtotal,
      discount,
      packing_fee: packingFee,
      total: Number((subtotal - discount + packingFee).toFixed(2)),
    });
  })
);

/** GET /api/coupons - full list for the admin portal. */
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw dbError(error);

    const { data: redemptions } = await supabase
      .from('coupon_redemptions')
      .select('coupon_code, discount_amount');

    const totals = new Map();
    for (const row of redemptions || []) {
      const current = totals.get(row.coupon_code) || { redemptions: 0, discount_given: 0 };
      current.redemptions += 1;
      current.discount_given += Number(row.discount_amount);
      totals.set(row.coupon_code, current);
    }

    res.json(
      (data || []).map((coupon) => ({
        ...coupon,
        value: Number(coupon.value),
        min_order_amount: Number(coupon.min_order_amount),
        redemptions: totals.get(coupon.code)?.redemptions ?? 0,
        discount_given: Number((totals.get(coupon.code)?.discount_given ?? 0).toFixed(2)),
      }))
    );
  })
);

function validateCouponPayload(body, { partial = false } = {}) {
  const errors = [];
  const has = (key) => !partial || body[key] !== undefined;

  if (has('code')) {
    const code = String(body.code || '').trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      errors.push('code must be 3-24 characters using only letters, numbers, hyphen or underscore');
    }
  }

  if (has('discount_type')) {
    if (!DISCOUNT_TYPES.includes(body.discount_type)) {
      errors.push(`discount_type must be one of: ${DISCOUNT_TYPES.join(', ')}`);
    }
  }

  if (has('value')) {
    const value = Number(body.value);
    if (!Number.isFinite(value) || value < 0) errors.push('value must be a positive number');
    if (body.discount_type === 'percent' && value > 100) errors.push('percent value cannot exceed 100');
  }

  if (has('min_order_amount')) {
    const min = Number(body.min_order_amount);
    if (!Number.isFinite(min) || min < 0) errors.push('min_order_amount must be zero or more');
  }

  if (has('max_discount')) {
    if (body.max_discount !== null) {
      const max = Number(body.max_discount);
      if (!Number.isFinite(max) || max <= 0) errors.push('max_discount must be greater than zero');
    }
  }

  if (has('starts_at') && has('ends_at') && body.starts_at && body.ends_at) {
    if (new Date(body.ends_at) <= new Date(body.starts_at)) {
      errors.push('ends_at must be later than starts_at');
    }
  }

  for (const key of ['usage_limit', 'usage_limit_per_user']) {
    if (has(key) && body[key] !== null) {
      const limit = Number(body[key]);
      if (!Number.isInteger(limit) || limit <= 0) {
        errors.push(`${key} must be a positive whole number or null`);
      }
    }
  }

  return errors;
}

/** POST /api/coupons - create (admin) */
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const errors = validateCouponPayload(req.body);
    if (errors.length > 0) throw ApiError.badRequest(errors.join('. '));

    const row = {
      code: String(req.body.code).trim().toUpperCase(),
      description: req.body.description ?? null,
      discount_type: req.body.discount_type ?? 'percent',
      value: Number(req.body.value ?? 0),
      max_discount: req.body.max_discount === null ? null : Number(req.body.max_discount ?? 0) || null,
      min_order_amount: Number(req.body.min_order_amount ?? 0),
      applies_to_category: req.body.applies_to_category || null,
      starts_at: req.body.starts_at || null,
      ends_at: req.body.ends_at || null,
      usage_limit: req.body.usage_limit ? Number(req.body.usage_limit) : null,
      usage_limit_per_user: req.body.usage_limit_per_user
        ? Number(req.body.usage_limit_per_user)
        : null,
      is_active: req.body.is_active !== false,
    };

    const { data, error } = await supabase.from('coupons').insert(row).select().single();

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('That coupon code already exists.');
      if (error.code === '23514') throw ApiError.badRequest('That coupon failed a validation rule.');
      throw dbError(error);
    }

    res.status(201).json(data);
  })
);

/** PUT /api/coupons/:code - update (admin) */
router.put(
  '/:code',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const errors = validateCouponPayload(req.body, { partial: true });
    if (errors.length > 0) throw ApiError.badRequest(errors.join('. '));

    const updates = {};
    if (req.body.code !== undefined) updates.code = String(req.body.code).toUpperCase();
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.discount_type !== undefined) updates.discount_type = req.body.discount_type;
    if (req.body.value !== undefined) updates.value = Number(req.body.value);
    if (req.body.max_discount !== undefined) {
      updates.max_discount = req.body.max_discount === null ? null : Number(req.body.max_discount);
    }
    if (req.body.min_order_amount !== undefined) {
      updates.min_order_amount = Number(req.body.min_order_amount);
    }
    if (req.body.applies_to_category !== undefined) {
      updates.applies_to_category = req.body.applies_to_category || null;
    }
    if (req.body.starts_at !== undefined) updates.starts_at = req.body.starts_at || null;
    if (req.body.ends_at !== undefined) updates.ends_at = req.body.ends_at || null;
    if (req.body.usage_limit !== undefined) {
      updates.usage_limit = req.body.usage_limit === null ? null : Number(req.body.usage_limit);
    }
    if (req.body.usage_limit_per_user !== undefined) {
      updates.usage_limit_per_user =
        req.body.usage_limit_per_user === null ? null : Number(req.body.usage_limit_per_user);
    }
    if (req.body.is_active !== undefined) updates.is_active = Boolean(req.body.is_active);

    const { data, error } = await supabase
      .from('coupons')
      .update(updates)
      .eq('code', code)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23514') throw ApiError.badRequest('That coupon failed a validation rule.');
      throw dbError(error);
    }
    if (!data) throw ApiError.notFound('That coupon does not exist.');

    res.json(data);
  })
);

/** DELETE /api/coupons/:code (admin) */
router.delete(
  '/:code',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();

    const { data, error } = await supabase
      .from('coupons')
      .delete()
      .eq('code', code)
      .select('code');

    if (error) throw dbError(error);
    if (!data || data.length === 0) throw ApiError.notFound('That coupon does not exist.');

    res.json({ deleted: code });
  })
);

export default router;