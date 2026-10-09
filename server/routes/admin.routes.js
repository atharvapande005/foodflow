import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// GET /api/admin/users?search=SSGMCE2024&page=1
// Read-only list of registered students. Never returns passwords.
router.get('/users', requireAdmin, async (req, res) => {
    const search = (req.query.search || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('student_profiles')
        .select('user_id, student_id, full_name, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (search) {
        query = query.ilike('student_id', `%${search}%`);
    }

    const { data: profiles, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Emails live in Supabase Auth, so look them up for just this page of students
    const users = await Promise.all(
        profiles.map(async (p) => {
            const { data } = await supabase.auth.admin.getUserById(p.user_id);
            return {
                student_id: p.student_id,
                full_name: p.full_name,
                email: data?.user?.email ?? null,
                joined: p.created_at,
            };
        })
    );

    res.json({ page, page_size: pageSize, total: count, users });
});

export default router;