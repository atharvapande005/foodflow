/** An error whose status code and message are safe to show to the client. */
export class ApiError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code || null;
    this.details = options.details || null;
  }

  static badRequest(message, options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'You need to sign in to do that.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, message);
  }

  static conflict(message, options) {
    return new ApiError(409, message, options);
  }
}

/**
 * Wraps an async route handler so a rejected promise reaches Express'
 * error middleware instead of becoming an unhandled rejection.
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Parses the "CODE:message" convention used by the place_order() database
 * function so the student sees a clean sentence instead of a Postgres error.
 */
export function parseDbError(error) {
  const raw = error?.message || String(error);
  const match = /^([A-Z_]+):(.*)$/s.exec(raw.trim());
  if (!match) return new ApiError(500, GENERIC_500);

  const [, code, message] = match;
  const status = code === 'CANTEEN_CLOSED' ? 409 : 400;
  return new ApiError(status, message.trim(), { code });
}

export const GENERIC_500 = 'Something went wrong on our side.';

/**
 * Converts a Supabase/PostgREST error into a safe ApiError.
 *
 * PostgREST messages reveal table and column names ("null value in column
 * student_email violates not-null constraint"), so the real message is logged
 * for the operator and never returned to the caller.
 *
 * @param {object} error    the `error` from a Supabase query
 * @param {string} [context] short description used in the server log
 */
export function dbError(error, context = 'database request') {
  console.error(`[db] ${context} failed:`, error?.message || error, error?.code || '');
  return new ApiError(500, GENERIC_500);
}