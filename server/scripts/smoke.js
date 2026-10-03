/**
 * Smoke test: boots the API against an unreachable database and verifies the
 * request plumbing (routing, auth gates, validation, error shape) rather than
 * database behaviour.
 *
 * Run with: npm run smoke
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVER_PORT = 5111;
const BASE = `http://localhost:${SERVER_PORT}`;
const ADMIN_KEY = 'smoke-admin-key';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(here, '..', 'server.js');

const child = spawn(process.execPath, [serverEntry], {
  cwd: path.join(here, '..'),
  env: {
    ...process.env,
    PORT: String(SERVER_PORT),
    SUPABASE_URL: 'http://127.0.0.1:59999', // deliberately unreachable
    SUPABASE_SERVICE_ROLE_KEY: 'smoke-test-key',
    // A syntactically valid but non-functional anon key, so requireAuth takes
    // the real JWT verification path instead of short-circuiting on 503.
    SUPABASE_ANON_KEY: 'smoke-anon-key',
    ADMIN_API_KEY: ADMIN_KEY,
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stderr.on('data', (chunk) => {
  const text = String(chunk);
  if (!text.includes('ExperimentalWarning')) process.stderr.write(`[server] ${text}`);
});

function shutdown() {
  child.kill();
}

process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

/** Waits for /api/health to answer before running any checks. */
async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not start in time');
}

let passed = 0;
let failed = 0;

async function call(method, path, { body, adminKey, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminKey) headers['x-admin-key'] = adminKey;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
}

await waitForServer();
console.log('\nFoodFlow API smoke test\n');

const health = await call('GET', '/api/health');
check('health responds', health.status === 200, health.json);
check(
  'health reports payment provider',
  ['razorpay', 'simulated'].includes(health.json?.payment_provider),
  health.json
);

const unknown = await call('GET', '/api/does-not-exist');
check('unknown route is 404', unknown.status === 404, unknown.json);
check('404 body has error string', typeof unknown.json?.error === 'string', unknown.json);

const noKey = await call('GET', '/api/orders');
check('admin list without key is 401', noKey.status === 401, noKey.json);

const badKey = await call('GET', '/api/orders', { adminKey: 'wrong-key' });
check('admin list with wrong key is 401', badKey.status === 401, badKey.json);

const goodKey = await call('GET', '/api/orders', { adminKey: ADMIN_KEY });
check(
  'admin list with correct key passes auth (reaches db)',
  goodKey.status === 500,
  goodKey.json
);
check(
  'db failure is a generic 500, not a leak',
  goodKey.json?.error === 'Something went wrong on our side.',
  goodKey.json
);

const menuValidation = await call('POST', '/api/menu', {
  adminKey: ADMIN_KEY,
  body: { name: '', price: -5 },
});
check('menu create rejects bad payload', menuValidation.status === 400, menuValidation.json);

const massAssign = await call('PUT', '/api/menu/00000000-0000-0000-0000-000000000000', {
  adminKey: ADMIN_KEY,
  body: { rating_avg: 5, created_at: '1999-01-01T00:00:00Z', name: 'ok' },
});
check(
  'menu update strips non-writable fields',
  massAssign.status === 500 && typeof massAssign.json?.error === 'string',
  massAssign.json
);

const badTransition = await call(
  'PUT',
  '/api/orders/00000000-0000-0000-0000-000000000000/status',
  { adminKey: ADMIN_KEY, body: { status: 'not-a-status' } }
);
check('invalid order status is 400', badTransition.status === 400, badTransition.json);

const emptyCart = await call('POST', '/api/orders', { body: { items: [] } });
check('empty cart is 400', emptyCart.status === 400, emptyCart.json);

const badItem = await call('POST', '/api/orders', {
  body: { student_name: 'Test', items: [{ menu_item_id: 'not-a-uuid', quantity: 1 }] },
});
check('non-uuid item id is 400', badItem.status === 400, badItem.json);

const badQty = await call('POST', '/api/orders', {
  body: {
    student_name: 'Test',
    items: [{ menu_item_id: '00000000-0000-0000-0000-000000000001', quantity: 999 }],
  },
});
check('out-of-range quantity is 400', badQty.status === 400, badQty.json);

const anonymousNoName = await call('POST', '/api/orders', {
  body: { items: [{ menu_item_id: '00000000-0000-0000-0000-000000000001', quantity: 1 }] },
});
check('anonymous order without name is 400', anonymousNoName.status === 400, anonymousNoName.json);

const trackNoDetails = await call('GET', '/api/orders/track?token=101');
check('tracking without contact details is 400', trackNoDetails.status === 400, trackNoDetails.json);

const trackBadToken = await call('GET', '/api/orders/track?token=abc&email=a@b.com');
check('tracking with non-numeric token is 400', trackBadToken.status === 400, trackBadToken.json);

const paymentCfg = await call('GET', '/api/payment/config');
check('payment config responds', paymentCfg.status === 200, paymentCfg.json);
check('payment config reports a method', ['razorpay', 'simulated'].includes(paymentCfg.json?.method), paymentCfg.json);

const refundNoKey = await call('POST', '/api/payment/refund', { body: { order_id: 'x' } });
check('refund without admin key is 401', refundNoKey.status === 401, refundNoKey.json);

const webhookNoSecret = await call('POST', '/api/payment/webhook', { body: { event: 'test' } });
check('webhook without configured secret is 400', webhookNoSecret.status === 400, webhookNoSecret.json);

const couponBad = await call('POST', '/api/coupons', {
  adminKey: ADMIN_KEY,
  body: { code: 'a b!', discount_type: 'percent', value: 500 },
});
check('coupon create rejects bad code and percent', couponBad.status === 400, couponBad.json);

const couponEmptyCart = await call('POST', '/api/coupons/validate', {
  body: { code: 'SAVE10', items: [] },
});
check('coupon validate rejects empty cart', couponEmptyCart.status === 400, couponEmptyCart.json);

const reviewNoAuth = await call('PUT', '/api/reviews/item/00000000-0000-0000-0000-000000000000', {
  body: { rating: 5 },
});
check('review without sign-in is 401', reviewNoAuth.status === 401, reviewNoAuth.json);

const reviewBadRating = await call('PUT', '/api/reviews/item/00000000-0000-0000-0000-000000000000', {
  token: 'not-a-real-jwt',
  body: { rating: 9 },
});
check('review with invalid jwt is 401', reviewBadRating.status === 401, reviewBadRating.json);

const historyNoAuth = await call('GET', '/api/orders/my-history');
check('order history without sign-in is 401', historyNoAuth.status === 401, historyNoAuth.json);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);