import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * service_role client. Bypasses Row Level Security, so it MUST only ever be
 * used from this server. Every request that reaches it has already passed
 * through our own auth/authorisation middleware.
 */
export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * anon client, used purely to verify user JWTs against Supabase Auth.
 * Safe to construct even when the anon key is not configured.
 */
export const supabasePublic =
  env.supabase.anonKey
    ? createClient(env.supabase.url, env.supabase.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabase;

/** True when the anon key is present, i.e. user signup/login can work. */
export const userAuthEnabled = Boolean(env.supabase.anonKey);