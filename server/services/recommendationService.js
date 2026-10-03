import { supabase } from '../config/supabaseClient.js';
import { env } from '../config/env.js';

/**
 * RECOMMENDATION ENGINE
 * =====================================================================
 * Two related signals, both learned from real order history.
 *
 * 1. ITEM-TO-ITEM CO-PURCHASE  ("Frequently ordered together")
 *    Association-rule mining. For every ordered pair of items we know how many
 *    orders contained both. We score a candidate with:
 *
 *      confidence = P(B | A) = pair_count / a_count
 *                    "when students order A, how often do they also order B"
 *
 *      lift        = confidence / P(B)
 *                    = (pair_count / a_count) / (b_count / total_orders)
 *                    lift > 1 means A and B are bought together more often
 *                    than chance, which is what separates a genuinely good
 *                    pairing from a merely popular item.
 *
 *    We rank by lift but require a minimum confidence, so a rare item that
 *    happens to appear alongside a bestseller cannot hijack the results.
 *
 * 2. PERSONALISED ("You may also like")
 *    Item-based collaborative filtering. Everything the signed-in student has
 *    ordered acts as a seed; we union the co-purchase neighbours of every seed,
 *    weighting each neighbour by how strongly it was associated with a seed the
 *    student actually likes. Already-ordered items are filtered out.
 */

const MIN_PAIR_COUNT = 2;
const MIN_CONFIDENCE = 0.05;

/** Total number of orders that contained at least one line item. */
async function totalOrders() {
  const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true });
  return Math.max(count ?? 0, 1);
}

/**
 * Rebuilds the item_cooccurrence table from scratch.
 * Exposed as an admin action so the matrix can be refreshed after a bulk menu
 * change or an import, rather than recomputing on every request.
 */
export async function rebuildCooccurrence() {
  const { data, error } = await supabase.rpc('rebuild_item_cooccurrence');
  if (error) throw error;
  return { pairs: Number(data ?? 0) };
}

/** Ensures the matrix exists and is not stale before it gets queried. */
async function ensureFresh(maxAgeHours = 6) {
  const { data, error } = await supabase
    .from('item_cooccurrence')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.updated_at) {
    await rebuildCooccurrence();
    return;
  }

  const ageHours = (Date.now() - new Date(data.updated_at).getTime()) / 3600000;
  if (ageHours > maxAgeHours) await rebuildCooccurrence();
}

function fetchItemsByIds(ids) {
  if (ids.length === 0) return Promise.resolve([]);
  return supabase
    .from('menu_items')
    .select('id, name, description, price, category, image_url, is_veg, is_spicy, prep_time_minutes, rating_avg, rating_count, is_available')
    .in('id', ids);
}

/**
 * Neighbours of one item, best first.
 * Returns [{ item, confidence, lift, pair_count, reason }]
 */
async function neighboursOf(itemId, limit) {
  const total = await totalOrders();

  const { data, error } = await supabase
    .from('item_cooccurrence')
    .select('*')
    .or(`item_a.eq.${itemId},item_b.eq.${itemId}`)
    .gte('pair_count', MIN_PAIR_COUNT);

  if (error) throw error;

  // The stored row is always (lower uuid, higher uuid), so figure out which
  // column is the seed and normalise both sides into a/b.
  const scored = (data || [])
    .map((row) => {
      const aIsSeed = row.item_a === itemId;
      const pair = Number(row.pair_count);
      const seedCount = Number(aIsSeed ? row.a_count : row.b_count);
      const otherCount = Number(aIsSeed ? row.b_count : row.a_count);
      const otherId = aIsSeed ? row.item_b : row.item_a;

      const confidence = seedCount > 0 ? pair / seedCount : 0;
      const otherSupport = otherCount / total;
      const lift = otherSupport > 0 ? confidence / otherSupport : 0;

      return { otherId, pair, confidence, lift };
    })
    .filter((row) => row.confidence >= MIN_CONFIDENCE && row.lift > 0)
    .sort((x, y) => y.lift - x.lift || y.pair - x.pair)
    .slice(0, limit);

  const items = await fetchItemsByIds(scored.map((s) => s.otherId));
  const byId = new Map(items.data?.map((i) => [i.id, i]) ?? []);

  return scored
    .map((row) => {
      const item = byId.get(row.otherId);
      if (!item) return null;
      return {
        item,
        confidence: Number(row.confidence.toFixed(3)),
        lift: Number(row.lift.toFixed(2)),
        pair_count: row.pair,
        reason: `${Math.round(row.confidence * 100)}% of students who ordered this also ordered that`,
      };
    })
    .filter(Boolean);
}

/** GET /api/recommendations/together/:itemId */
export async function frequentlyOrderedTogether(itemId, limit = env.recommendationLimit) {
  await ensureFresh();
  return neighboursOf(itemId, limit);
}

/** GET /api/recommendations/for-me?limit= */
export async function recommendationsForUser(userId, limit = env.recommendationLimit) {
  // Items this student has already had, from their own non-cancelled orders.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status')
    .eq('user_id', userId)
    .neq('status', 'cancelled');

  const orderIds = (orders || []).map((o) => o.id);
  if (orderIds.length === 0) return { seeds: [], items: [] };

  const { data: seeded } = await supabase
    .from('order_items')
    .select('menu_item_id')
    .in('order_id', orderIds);

  const seen = new Set();
  for (const row of seeded || []) seen.add(row.menu_item_id);

  await ensureFresh();

  // Union the neighbours of every seed, keeping the strongest score per item.
  const scores = new Map();
  for (const seedId of seen) {
    for (const row of await neighboursOf(seedId, limit * 2)) {
      if (seen.has(row.item.id)) continue; // already had it
      const current = scores.get(row.item.id);
      if (!current || row.lift > current.lift) {
        scores.set(row.item.id, { ...row, seeds: current ? current.seeds + 1 : 1 });
      } else {
        current.seeds += 1;
      }
    }
  }

  const items = [...scores.values()]
    .sort((a, b) => b.lift * b.seeds - a.lift * a.seeds)
    .slice(0, limit);

  return { seeds: [...seen].slice(0, 12), items };
}

/**
 * Trending right now: most quantity sold across orders in the last `days`,
 * used on the home page when there is no personal history yet.
 */
export async function trendingItems(days = 7, limit = 8) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id')
    .gte('created_at', since)
    .neq('status', 'cancelled');

  const orderIds = (recentOrders || []).map((o) => o.id);
  if (orderIds.length === 0) return [];

  const { data: lines, error } = await supabase
    .from('order_items')
    .select('menu_item_id, quantity, subtotal')
    .in('order_id', orderIds);

  if (error) throw error;

  const totals = new Map();
  for (const line of lines || []) {
    const current = totals.get(line.menu_item_id) || {
      quantity: 0,
      revenue: 0,
      orders: 0,
    };
    current.quantity += line.quantity;
    current.revenue += Number(line.subtotal);
    current.orders += 1;
    totals.set(line.menu_item_id, current);
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, limit);
  const items = await fetchItemsByIds(ranked.map(([id]) => id));
  const byId = new Map(items.data?.map((i) => [i.id, i]) ?? []);

  return ranked
    .map(([id, stats]) => {
      const item = byId.get(id);
      if (!item) return null;
      return { ...item, sold_last_7_days: stats.quantity, revenue_last_7_days: Number(stats.revenue.toFixed(2)) };
    })
    .filter(Boolean);
}

/** Top rated items, used as a fallback recommendation source. */
export async function topRatedItems(limit = 8) {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('is_available', true)
    .gt('rating_count', 0)
    .order('rating_avg', { ascending: false })
    .order('rating_count', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}