import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Missing SUPABASE_URL or SUPABASE_ANON_KEY. Check your server/.env file.'
    );
}

// This client uses the anon key and is used ONLY for auth operations
// (signup, login, token verification) - never for direct database access.
// Direct database access still goes through the service_role client in supabaseClient.js.
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);