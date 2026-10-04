import { supabaseAuth } from '../config/supabaseAuthClient.js';
import { supabase } from '../config/supabaseClient.js';

export async function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Login required' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabaseAuth.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired login' });
  }

  // Check if this logged-in user is in the admins table
  const { data: adminRow, error: adminError } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .single();

  if (adminError || !adminRow) {
    return res.status(403).json({ error: 'Not authorized as admin' });
  }

  req.user = data.user;
  next();
}