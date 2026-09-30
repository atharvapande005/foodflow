import { supabaseAuth } from '../config/supabaseAuthClient.js';

// Reads the Authorization header if present and attaches req.user.
// If there's no token, or it's invalid, req.user stays undefined and the
// request continues normally - this is what allows guest (QR) orders to work
// exactly as before, while logged-in students get linked automatically.
export async function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(); // no token provided - treat as guest, continue
    }

    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (!error && data?.user) {
        req.user = data.user; // logged-in student
    }

    next(); // always continue, whether or not a valid user was found
}