import express from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { optionalAuth, requireAuth } from '../middleware/requireAuth.js';
import {
  frequentlyOrderedTogether,
  recommendationsForUser,
  rebuildCooccurrence,
  topRatedItems,
  trendingItems,
} from '../services/recommendationService.js';

const router = express.Router();

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 24) : 8;
}

/**
 * GET /api/recommendations/home
 * One call for the home page: trending, top rated, and personalised picks
 * when the visitor is signed in.
 */
router.get(
  '/home',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const [trending, topRated, personalised] = await Promise.all([
      trendingItems(7, 8).catch(() => []),
      topRatedItems(8).catch(() => []),
      req.user
        ? recommendationsForUser(req.user.id, 8).catch(() => ({ seeds: [], items: [] }))
        : Promise.resolve(null),
    ]);

    res.json({
      trending,
      top_rated: topRated,
      personalised: personalised?.items ?? null,
      basis: personalised?.items?.length
        ? 'Based on your order history'
        : 'Popular with students this week',
    });
  })
);

/**
 * GET /api/recommendations/together/:menuItemId
 * Association-rule neighbours for one item, used on the item detail page.
 */
router.get(
  '/together/:menuItemId',
  asyncHandler(async (req, res) => {
    const results = await frequentlyOrderedTogether(req.params.menuItemId, parseLimit(req.query.limit));
    res.json({ menu_item_id: req.params.menuItemId, results });
  })
);

/** GET /api/recommendations/for-me - personalised, requires an account. */
router.get(
  '/for-me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { seeds, items } = await recommendationsForUser(
      req.user.id,
      parseLimit(req.query.limit)
    );

    if (seeds.length === 0) {
      res.json({
        items: await trendingItems(7, parseLimit(req.query.limit)),
        basis: 'You have not ordered yet, so here is what is popular',
      });
      return;
    }

    res.json({ items, basis: `Based on ${seeds.length} items you have ordered` });
  })
);

/**
 * POST /api/recommendations/rebuild (admin)
 * Recomputes the co-purchase matrix from scratch.
 */
router.post(
  '/rebuild',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { pairs } = await rebuildCooccurrence();
    res.json({ rebuilt: true, pairs });
  })
);

export default router;