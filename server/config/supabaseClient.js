import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check your server/.env file.'
  );
}

// The service role key bypasses Row Level Security and must NEVER be sent to the frontend.
// It is safe here because this file only ever runs on the backend server.
export const supabase = createClient(supabaseUrl, supabaseServiceKey);
