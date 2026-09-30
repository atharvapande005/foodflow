import { supabaseAuth } from '../config/supabaseAuthClient.js';

export async function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Login required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data?.user) {
        return res.status(401).json({ error: 'Invalid or expired login' });
    }

    req.user = data.user;
    next();
}