import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { ApiError, asyncHandler, dbError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

/** GET /api/canteen - open/closed state shown in the app header. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('canteen_state')
      .select('is_open, message, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw dbError(error);

    res.json(
      data ?? {
        is_open: true,
        message: null,
        updated_at: null,
      }
    );
  })
);

/** PUT /api/canteen - open/close the canteen (admin). */
router.put(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const isOpen = Boolean(req.body.is_open);
    const message = req.body.message ? String(req.body.message).slice(0, 200) : null;

    const { data, error } = await supabase
      .from('canteen_state')
      .update({ is_open: isOpen, message, updated_by: 'canteen_admin' })
      .eq('id', 1)
      .select()
      .maybeSingle();

    if (error) throw dbError(error);
    res.json(data);
  })
);

export default router;