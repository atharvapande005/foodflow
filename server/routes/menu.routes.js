import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { ApiError, asyncHandler, dbError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

export const CATEGORIES = [
  'snacks',
  'meals',
  'beverages',
  'desserts',
  'combos',
  'breakfast',
];

/**
 * Only these fields may ever be written from a request body. Spreading
 * req.body straight into an update would let a caller overwrite `id`,
 * `created_at` or the denormalised rating columns.
 */
const WRITABLE_FIELDS = [
  'name',
  'description',
  'price',
  'category',
  'image_url',
  'is_veg',
  'is_spicy',
  'prep_time_minutes',
  'calories',
  'tags',
  'is_available',
];

function pickWritable(body) {
  const out = {};
  for (const key of WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

function validate(payload, { partial = false } = {}) {
  const errors = [];

  if (!partial || payload.name !== undefined) {
    const name = String(payload.name ?? '').trim();
    if (!name) errors.push('name is required');
    else if (name.length > 120) errors.push('name must be 120 characters or fewer');
  }

  if (!partial || payload.price !== undefined) {
    const price = Number(payload.price);
    if (!Number.isFinite(price)) errors.push('price must be a number');
    else if (price < 0) errors.push('price cannot be negative');
    else if (price > 100000) errors.push('price is unrealistically large');
  }

  if (payload.category !== undefined && payload.category !== null && payload.category !== '') {
    const category = String(payload.category).trim().toLowerCase();
    if (!CATEGORIES.includes(category)) {
      errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
    }
  }

  if (payload.prep_time_minutes !== undefined) {
    const prep = Number(payload.prep_time_minutes);
    if (!Number.isInteger(prep) || prep < 0 || prep > 240) {
      errors.push('prep_time_minutes must be a whole number between 0 and 240');
    }
  }

  if (payload.tags !== undefined && payload.tags !== null) {
    if (!Array.isArray(payload.tags)) errors.push('tags must be an array of strings');
  }

  return errors;
}

/**
 * GET /api/menu
 * Query: ?category=, ?available=true, ?search=, ?sort=name|price_asc|price_desc|rating
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, search, available, sort } = req.query;

    let query = supabase.from('menu_items').select('*');

    if (category && category !== 'all') {
      query = query.eq('category', String(category).toLowerCase());
    }
    if (available === 'true') {
      query = query.eq('is_available', true);
    }
    if (search) {
      // Escape PostgREST wildcard characters so a search for "100%" is literal.
      const term = String(search).replace(/[%_,()]/g, ' ').trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }
    }

    switch (sort) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'rating':
        query = query.order('rating_avg', { ascending: false }).order('rating_count', { ascending: false });
        break;
      default:
        query = query.order('category', { ascending: true }).order('name', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw dbError(error);
    res.json(data);
  })
);

/** GET /api/menu/categories - the category list with live item counts. */
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('category, is_available');

    if (error) throw dbError(error);

    const counts = new Map();
    for (const row of data || []) {
      const category = row.category || 'snacks';
      const current = counts.get(category) || { category, total: 0, available: 0 };
      current.total += 1;
      if (row.is_available) current.available += 1;
      counts.set(category, current);
    }

    res.json([...counts.values()].sort((a, b) => a.category.localeCompare(b.category)));
  })
);

/** GET /api/menu/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw dbError(error);
    if (!data) throw ApiError.notFound('That menu item does not exist.');

    res.json(data);
  })
);

/** POST /api/menu - create (admin) */
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = pickWritable(req.body);
    const errors = validate(payload);
    if (errors.length > 0) throw ApiError.badRequest(errors.join('. '));

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        ...payload,
        name: String(payload.name).trim(),
        price: Number(payload.price),
        category: (payload.category || 'snacks').toLowerCase(),
      })
      .select()
      .single();

    if (error) throw dbError(error);
    res.status(201).json(data);
  })
);

/** PUT /api/menu/:id - partial update (admin) */
router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updates = pickWritable(req.body);
    if (Object.keys(updates).length === 0) {
      throw ApiError.badRequest('Nothing to update.');
    }

    const errors = validate(updates, { partial: true });
    if (errors.length > 0) throw ApiError.badRequest(errors.join('. '));

    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.category) updates.category = updates.category.toLowerCase();
    if (updates.name) updates.name = String(updates.name).trim();

    const { data, error } = await supabase
      .from('menu_items')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw dbError(error);
    if (!data) throw ApiError.notFound('That menu item does not exist.');

    res.json(data);
  })
);

/** PATCH /api/menu/:id/availability - quick sold-out toggle (admin) */
router.patch(
  '/:id/availability',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const isAvailable = Boolean(req.body.is_available);

    const { data, error } = await supabase
      .from('menu_items')
      .update({ is_available: isAvailable })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw dbError(error);
    if (!data) throw ApiError.notFound('That menu item does not exist.');

    res.json(data);
  })
);

/**
 * DELETE /api/menu/:id (admin)
 * A menu item referenced by an order cannot be deleted, because order_items
 * keeps an FK to it and the receipt must stay readable. Those items get
 * archived instead, which hides them from the menu but keeps history intact.
 */
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data: item } = await supabase
      .from('menu_items')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!item) throw ApiError.notFound('That menu item does not exist.');

    const { data, error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', req.params.id)
      .select('id');

    if (error) {
      if (error.code === '23503') {
        const { data: archived, error: archiveError } = await supabase
          .from('menu_items')
          .update({ is_available: false })
          .eq('id', req.params.id)
          .select()
          .single();

        if (archiveError) throw dbError(archiveError);
        return res.status(200).json({
          archived: true,
          item: archived,
          message: 'This item appears in past orders, so it was archived (hidden) instead of deleted.',
        });
      }
      throw dbError(error);
    }

    res.json({ archived: false, deleted: data?.[0]?.id ?? req.params.id });
  })
);

export default router;