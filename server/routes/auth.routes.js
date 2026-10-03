import express from 'express';
import { supabasePublic, userAuthEnabled } from '../config/supabaseClient.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

function assertAuthEnabled() {
  if (!userAuthEnabled) {
    throw new ApiError(
      503,
      'Student accounts are disabled. Add SUPABASE_ANON_KEY to server/.env and re-run the SQL schema.'
    );
  }
}

function publicProfile(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email.split('@')[0],
    phone: user.user_metadata?.phone || null,
    created_at: user.created_at,
  };
}

/**
 * POST /api/auth/signup
 * body: { email, password, full_name }
 */
router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    assertAuthEnabled();

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fullName = String(req.body.full_name || '').trim();

    if (!email || !email.includes('@')) {
      throw ApiError.badRequest('Enter a valid email address.');
    }
    if (password.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters.');
    }

    const { data, error } = await supabasePublic.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      // Supabase reports a generic error for an already registered email.
      const alreadyExists = /already registered|already been registered/i.test(error.message);
      throw new ApiError(
        alreadyExists ? 409 : 400,
        alreadyExists ? 'An account with this email already exists.' : error.message
      );
    }

    res.status(201).json({
      user: publicProfile(data.user),
      // session is null when the project requires email confirmation.
      session: data.session,
      needs_email_confirmation: !data.session,
      message: data.session
        ? 'Account created. Welcome to FoodFlow.'
        : 'Account created. Check your inbox to confirm your email, then sign in.',
    });
  })
);

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    assertAuthEnabled();

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      throw ApiError.badRequest('Email and password are required.');
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      throw new ApiError(401, 'Incorrect email or password.');
    }

    res.json({ user: publicProfile(data.user), session: data.session });
  })
);

/** GET /api/auth/me - the currently signed-in user. */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabasePublic.auth.getUser(req.accessToken);
    if (error || !data.user) {
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
    res.json({ user: publicProfile(data.user) });
  })
);

/**
 * PUT /api/auth/me - update the display name / phone.
 *
 * Uses the service-role admin API rather than `supabasePublic.auth.updateUser`.
 * The public client has no session (it exists only to verify JWTs), and passing
 * an access token to updateUser() does not authenticate it, so the update would
 * fail with "Auth session missing". requireAuth has already verified
 * req.user, and its id is used to target exactly that account.
 */
router.put(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAuthEnabled();

    const fullName = String(req.body.full_name || '').trim();
    const phone = String(req.body.phone || '').trim();

    if (!fullName) throw ApiError.badRequest('Name cannot be empty.');
    if (fullName.length > 80) throw ApiError.badRequest('That name is too long.');
    if (phone && phone.replace(/\D/g, '').length < 10) {
      throw ApiError.badRequest('Enter a 10 digit phone number.');
    }

    const { data, error } = await supabase.auth.admin.updateUserById(req.user.id, {
      user_metadata: { ...(req.user.user_metadata ?? {}), full_name: fullName, phone },
    });

    if (error) throw new ApiError(400, error.message);
    res.json({ user: publicProfile(data.user) });
  })
);

/**
 * GET /api/auth/admin-check - used by the admin portal to validate a key
 * without performing a real action.
 */
router.get(
  '/admin-check',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, role: 'canteen_admin' });
  })
);

export default router;