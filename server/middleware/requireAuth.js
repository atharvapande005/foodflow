import { supabasePublic, userAuthEnabled } from '../config/supabaseClient.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

/**
 * Verifies a Supabase Auth JWT sent as `Authorization: Bearer <token>` and
 * attaches `req.user` (the Supabase user record) plus `req.accessToken`.
 */
async function resolveUser(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (!token || scheme.toLowerCase() !== 'bearer') {
    throw new ApiError(401, 'Missing bearer token.');
  }

  const { data, error } = await supabasePublic.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  return { user: data.user, accessToken: token };
}

/** Rejects the request unless a valid user JWT is present. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  if (!userAuthEnabled) {
    throw new ApiError(
      503,
      'Student accounts are disabled because SUPABASE_ANON_KEY is missing from server/.env.'
    );
  }

  const { user, accessToken } = await resolveUser(req);
  req.user = user;
  req.accessToken = accessToken;
  next();
});

/**
 * Attaches req.user when a valid token is supplied, but never blocks the
 * request. Used by guest-checkout friendly endpoints such as order placement
 * and order tracking.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  if (!userAuthEnabled) return next();

  try {
    const { user, accessToken } = await resolveUser(req);
    req.user = user;
    req.accessToken = accessToken;
  } catch {
    // Anonymous visitor, carry on.
  }

  next();
});