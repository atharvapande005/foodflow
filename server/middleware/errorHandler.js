import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

/** Terminal 404 for unmatched /api paths. */
export function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Single JSON error shape for the whole API:
 *   { error: string, code?: string, details?: any }
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(err, req, res, next) {
  const isApiError = err instanceof ApiError;
  const status = isApiError ? err.status : err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    error: isApiError || status < 500 ? err.message : 'Something went wrong on our side.',
  };

  if (isApiError && err.code) body.code = err.code;
  if (isApiError && err.details) body.details = err.details;

  // Postgres/PostgREST errors are 500s from the caller's point of view but the
  // text can leak schema details, so it is only logged, never returned.
  res.status(status).json(body);
}

/**
 * CORS restricted to an explicit origin allowlist. `CORS_ORIGINS=*` opens it up
 * for local development against unknown hostnames.
 */
export function corsMiddleware(req, res, next) {
  const origin = req.get('origin');
  const allowAll = env.corsOrigins.includes('*');

  if (allowAll) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && env.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    // Not an allowed origin: respond without the header, the browser blocks it.
    res.status(403).json({ error: 'Origin not allowed.' });
    return;
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-key');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}