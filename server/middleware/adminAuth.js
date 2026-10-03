import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

/**
 * Constant-time string comparison. Guards against timing attacks where an
 * attacker measures how long a comparison takes to guess the secret byte by
 * byte. Both sides must be the same length, otherwise timingSafeEqual throws.
 */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Protects canteen-admin routes with the shared ADMIN_API_KEY secret, sent by
 * the admin portal as the x-admin-key header.
 *
 * The portal stores the key in sessionStorage and attaches it to every request.
 */
export function requireAdmin(req, res, next) {
  if (!env.admin.apiKey) {
    return next(
      new ApiError(
        500,
        'ADMIN_API_KEY is not configured on the server. Add it to server/.env to use the admin portal.'
      )
    );
  }

  const provided = req.get('x-admin-key');
  if (!provided || !safeEqual(provided, env.admin.apiKey)) {
    return next(new ApiError(401, 'Invalid admin key.'));
  }

  // Marks the request so handlers can tell staff apart from students.
  req.admin = true;
  next();
}