import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

// GET /api/menu - list all available menu items (students see this)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('category', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/menu - add a new menu item (admin only)
router.post('/', async (req, res) => {
  const { name, description, price, category, image_url } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: 'name and price are required' });
  }

  const { data, error } = await supabase
    .from('menu_items')
    .insert([{ name, description, price, category, image_url }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/menu/:id - edit a menu item (admin only)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const { data, error } = await supabase
    .from('menu_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Menu item not found' });
  res.json(data);
});

// DELETE /api/menu/:id - remove a menu item (admin only)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase.from('menu_items').delete().eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
