import 'dotenv/config';
import express from 'express';

import { env } from './config/env.js';
import { userAuthEnabled } from './config/supabaseClient.js';
import { corsMiddleware, errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import analyticsRoutes from './routes/analytics.routes.js';
import authRoutes from './routes/auth.routes.js';
import canteenRoutes from './routes/canteen.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import recommendationRoutes from './routes/recommendation.routes.js';
import reviewRoutes from './routes/review.routes.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Keep the raw body around so the Razorpay webhook signature can be verified,
// which requires the exact bytes that were signed.
//
// Razorpay posts webhooks as application/x-www-form-urlencoded, not JSON, so
// both parsers are mounted and each captures req.rawBody. Mounting the webhook
// parser ahead of the JSON one is harmless: verify() only runs for matching
// content types.
app.use(
  express.urlencoded({
    extended: false,
    limit: '256kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(
  express.json({
    limit: '256kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(corsMiddleware);

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.originalUrl === '/api/health') return;
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
});

// ---- health / readiness ---------------------------------------------------
app.get('/api/health', async (req, res) => {
  const { supabase } = await import('./config/supabaseClient.js');
  const { error } = await supabase.from('canteen_state').select('id').limit(1);

  res.json({
    status: error ? 'degraded' : 'ok',
    service: 'foodflow-api',
    database: error ? 'unreachable' : 'connected',
    payment_provider: env.razorpay.enabled ? 'razorpay' : 'simulated',
    student_accounts: userAuthEnabled ? 'enabled' : 'disabled',
    admin_portal: env.admin.apiKey ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString(),
  });
});

// ---- routes ---------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/canteen', canteenRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log('');
  console.log(`  FoodFlow API listening on http://localhost:${env.port}`);
  console.log(`    env          ${env.nodeEnv}`);
  console.log(`    payments     ${env.razorpay.enabled ? 'Razorpay (live keys)' : 'SIMULATED (no Razorpay keys set)'}`);
  console.log(`    accounts     ${userAuthEnabled ? 'student signup/login enabled' : 'DISABLED - set SUPABASE_ANON_KEY'}`);
  console.log(`    admin portal ${env.admin.apiKey ? 'enabled' : 'DISABLED - set ADMIN_API_KEY'}`);
  console.log(`    packing fee  Rs ${env.pricing.packingFee}${env.pricing.freePackingAbove ? ` (free above Rs ${env.pricing.freePackingAbove})` : ''}`);
  console.log('');
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down.`);
  server.close(() => process.exit(0));
  // Do not hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;