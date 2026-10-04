import express from 'express';
import { supabaseAuth } from '../config/supabaseAuthClient.js';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

// POST /api/auth/signup - create a new student account
// body: { email, password, full_name }
router.post('/signup', async (req, res) => {
    const { email, password, full_name, student_id } = req.body;

    if (!email || !password || !student_id) {
        return res.status(400).json({ error: 'email, password, and student_id are required' });
    }

    const { data, error } = await supabaseAuth.auth.signUp({
        email,
        password,
        options: {
            data: { full_name },
        },
    });

    if (error) return res.status(400).json({ error: error.message });

    // Save the student's College ID in a separate table, linked to their account
    const { error: profileError } = await supabase
        .from('student_profiles')
        .insert([{ user_id: data.user.id, student_id, full_name }]);

    if (profileError) {
        // Most common case: this student_id is already registered to another account
        const message = profileError.message.includes('duplicate')
            ? 'This College Student ID is already registered.'
            : profileError.message;
        return res.status(400).json({ error: message });
    }

    res.status(201).json({
        message: 'Signup successful. Check email for verification if enabled.',
        user: data.user,
        session: data.session,
    });
});

// POST /api/auth/login - log in an existing student
// body: { email, password }
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error) return res.status(401).json({ error: error.message });

    res.json({
        user: data.user,
        access_token: data.session.access_token, // frontend stores this, sends it back on future requests
    });
});

export default router;