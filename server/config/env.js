/**
 * Centralised, validated environment configuration.
 *
 * Imported once at boot. Throws immediately (with an actionable message) if a
 * value that cannot be defaulted is missing, so the process never starts in a
 * half-configured state and fails later on the first request.
 */

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be an integer, received "${raw}"`);
  }
  return parsed;
}

function readNum(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a number, received "${raw}"`);
  }
  return parsed;
}

function readBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}.\n` +
      'Copy server/.env.example to server/.env and fill in your Supabase credentials.'
  );
}

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: readInt('PORT', 5000),

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },

  razorpay: {
    keyId: razorpayKeyId,
    keySecret: razorpayKeySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    liveOnly: readBool('RAZORPAY_LIVE_ONLY', false),
    /**
     * True when the keys belong to a live Razorpay account. `rzp_test_` ids are
     * always test keys, so this is safe to derive rather than trust a flag.
     */
    live: Boolean(razorpayKeyId && razorpayKeySecret) && razorpayKeyId.startsWith('rzp_live_'),
    /**
     * When Razorpay keys are absent we fall back to a fully working local
     * payment simulator so the whole checkout -> receipt flow still runs
     * end to end. Set the keys to switch over, no code change needed.
     */
    enabled: Boolean(razorpayKeyId && razorpayKeySecret),
  },

  admin: {
    apiKey: process.env.ADMIN_API_KEY || '',
  },

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  pricing: {
    packingFee: readNum('PACKING_FEE', 0),
    freePackingAbove: readNum('FREE_PACKING_ABOVE', 0),
  },

  recommendationLimit: readInt('RECOMMENDATION_LIMIT', 8),
};