import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { ApiError, asyncHandler, dbError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { optionalAuth, requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

/**
 * Reviews are tied to a real purchase: you can only review an item you have
 * actually had. This is what keeps ratings meaningful, and it doubles as the
 * input for the recommendation engine's rating signals.
 */
async function assertPurchased(itemId, userId) {
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'cancelled');

  const orderIds = (orders || []).map((o) => o.id);
  if (orderIds.length === 0) {
    throw ApiError.forbidden('You can only review items you have ordered.');
  }

  const { data: lines } = await supabase
    .from('order_items')
    .select('id')
    .eq('menu_item_id', itemId)
    .in('order_id', orderIds)
    .limit(1);

  if (!lines || lines.length === 0) {
    throw ApiError.forbidden('You can only review items you have ordered.');
  }

  return orderIds;
}

/** GET /api/reviews/item/:menuItemId - public review list. */
router.get(
  '/item/:menuItemId',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, user_id')
      .eq('menu_item_id', req.params.menuItemId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw dbError(error);

    // Reviews are anonymous to other students: expose only a stable initials tag.
    res.json(
      (data ?? []).map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        created_at: review.created_at,
        author: `Student ${review.user_id.slice(0, 4).toUpperCase()}`,
        is_mine: false,
      }))
    );
  })
);

/** PUT /api/reviews/item/:menuItemId - create or update my review. */
router.put(
  '/item/:menuItemId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || '').trim().slice(0, 1000);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw ApiError.badRequest('Rating must be a whole number from 1 to 5.');
    }

    const { data: item } = await supabase
      .from('menu_items')
      .select('id')
      .eq('id', req.params.menuItemId)
      .maybeSingle();

    if (!item) throw ApiError.notFound('That menu item does not exist.');

    const orderIds = await assertPurchased(item.id, req.user.id);

    const { data, error } = await supabase
      .from('reviews')
      .upsert(
        {
          menu_item_id: item.id,
          user_id: req.user.id,
          order_id: orderIds[0],
          rating,
          comment: comment || null,
        },
        { onConflict: 'menu_item_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('You already reviewed this item.');
      throw dbError(error);
    }

    res.json({
      id: data.id,
      rating: data.rating,
      comment: data.comment,
      created_at: data.created_at,
      author: 'You',
      is_mine: true,
    });
  })
);

/** DELETE /api/reviews/:id - author or admin can remove a review. */
router.delete(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { data: review } = await supabase
      .from('reviews')
      .select('id, user_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!review) throw ApiError.notFound('That review does not exist.');

    const isAuthor = req.user && review.user_id === req.user.id;
    if (!isAuthor && !req.admin) {
      throw ApiError.forbidden('You can only delete your own review.');
    }

    const { error } = await supabase.from('reviews').delete().eq('id', review.id);
    if (error) throw dbError(error);

    res.json({ deleted: review.id });
  })
);

/** GET /api/reviews/mine - the signed-in student's reviews. */
router.get(
  '/mine',
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Kept as an admin-gated aggregate view of all reviews with item context.
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, menu_item:menu_items(id, name), user_id')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw dbError(error);
    res.json(data ?? []);
  })
);

export default router;