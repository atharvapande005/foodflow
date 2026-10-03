import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import AdminLayout from './AdminLayout.jsx';
import Modal from '../../components/Modal.jsx';
import { Alert, EmptyState, MenuSkeleton, StarRating } from '../../components/ui.jsx';
import { CATEGORIES, categoryMeta, formatMoney, formatPrice } from '../../lib/format.js';

const BLANK = {
  name: '',
  description: '',
  price: '',
  category: 'snacks',
  image_url: '',
  is_veg: false,
  is_spicy: false,
  is_available: true,
  prep_time_minutes: 10,
  calories: '',
  tags: '',
};

export default function AdminMenu() {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [menu, categoryList] = await Promise.all([api.menu.list(), api.menu.categories()]);
      if (mounted.current) {
        setItems(menu ?? []);
        setCategories(categoryList ?? []);
        setError('');
      }
    } catch (err) {
      if (mounted.current) setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleAvailability(item) {
    try {
      await api.menu.setAvailability(item.id, !item.is_available);
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, is_available: !row.is_available } : row))
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.name}"? Past orders keep their copy of the name and price.`)) {
      return;
    }
    try {
      await api.menu.remove(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const visible = (items ?? [])
    .filter((item) => filter === 'all' || item.category === filter)
    .filter((item) => !search || item.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminLayout
      title="Menu"
      subtitle="Add dishes, change prices and mark items sold out without touching the database."
      actions={
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing({ ...BLANK })}>
          + New dish
        </button>
      }
    >
      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="between wrap gap-12 mb-16">
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Search dishes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search dishes"
        />
        <div className="row gap-8 wrap">
          <button
            type="button"
            className={`chip${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span className="chip__count">{items?.length ?? 0}</span>
          </button>
          {categories.map((entry) => (
            <button
              key={entry.category}
              type="button"
              className={`chip${filter === entry.category ? ' is-active' : ''}`}
              onClick={() => setFilter(entry.category)}
            >
              {categoryMeta(entry.category).icon} {categoryMeta(entry.category).label}
              <span className="chip__count">{entry.total}</span>
            </button>
          ))}
        </div>
      </div>

      {items === null ? (
        <MenuSkeleton count={6} />
      ) : visible.length === 0 ? (
        <EmptyState icon="🍽" title="Nothing here" message="Add a dish to get started." />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dish</th>
                <th>Category</th>
                <th className="num">Price</th>
                <th className="num">Prep</th>
                <th>Rating</th>
                <th>Available</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className={item.is_available ? '' : 'row--muted'}>
                  <td>
                    <div className="row gap-8">
                      <span className={item.is_veg ? 'veg-dot' : 'nonveg-dot'} aria-hidden="true" />
                      <div>
                        <div className="small bold">{item.name}</div>
                        <div className="tiny muted clamp-1">{item.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="small">{categoryMeta(item.category).label}</td>
                  <td className="num nowrap">{formatPrice(item.price)}</td>
                  <td className="num small">{item.prep_time_minutes} min</td>
                  <td>
                    {item.rating_count > 0 ? (
                      <span className="row gap-4 small">
                        <span aria-hidden="true" style={{ color: '#f59e0b' }}>
                          ★
                        </span>
                        {Number(item.rating_avg).toFixed(1)} ({item.rating_count})
                      </span>
                    ) : (
                      <span className="tiny muted">none</span>
                    )}
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={item.is_available}
                        onChange={() => toggleAvailability(item)}
                        aria-label={`Toggle ${item.name}`}
                      />
                      <span className="switch__track" aria-hidden="true">
                        <span className="switch__knob" />
                      </span>
                    </label>
                  </td>
                  <td className="nowrap">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditing(item)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(item)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ItemEditor
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </AdminLayout>
  );
}

function ItemEditor({ item, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!item) {
      setForm(null);
      return;
    }
    setForm({
      ...BLANK,
      ...item,
      price: String(item.price ?? ''),
      calories: item.calories ? String(item.calories) : '',
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags || '',
    });
    setErrors({});
    setError('');
  }, [item]);

  if (!form) return null;

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function save(event) {
    event.preventDefault();

    const next = {};
    if (!form.name.trim()) next.name = 'A name is required.';
    if (!Number(form.price) || Number(form.price) < 0) next.price = 'Enter a valid price.';
    if (!CATEGORIES.includes(form.category)) next.category = 'Pick a category.';
    if (form.image_url && !/^https?:\/\//i.test(form.image_url)) {
      next.image_url = 'Image URLs must start with http:// or https://';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      category: form.category,
      image_url: form.image_url.trim() || null,
      is_veg: Boolean(form.is_veg),
      is_spicy: Boolean(form.is_spicy),
      is_available: Boolean(form.is_available),
      prep_time_minutes: Number(form.prep_time_minutes) || 10,
      calories: form.calories === '' ? null : Number(form.calories),
      tags: form.tags
        ? String(form.tags)
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : null,
    };

    setSaving(true);
    setError('');

    try {
      if (form.id) await api.menu.update(form.id, payload);
      else await api.menu.create(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={form.id ? `Edit ${form.name}` : 'New dish'}>
      <form onSubmit={save} noValidate>
        {error && (
          <div className="mb-16">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            <span className="label">Name *</span>
            <input className="input" value={form.name} onChange={update('name')} />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </label>

          <label className="field">
            <span className="label">Price (₹) *</span>
            <input className="input" inputMode="decimal" value={form.price} onChange={update('price')} />
            {errors.price && <span className="error-text">{errors.price}</span>}
          </label>

          <label className="field">
            <span className="label">Category *</span>
            <select className="select" value={form.category} onChange={update('category')}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {categoryMeta(category).label}
                </option>
              ))}
            </select>
            {errors.category && <span className="error-text">{errors.category}</span>}
          </label>

          <label className="field">
            <span className="label">Prep time (minutes)</span>
            <input
              className="input"
              inputMode="numeric"
              value={form.prep_time_minutes}
              onChange={update('prep_time_minutes')}
            />
          </label>

          <label className="field">
            <span className="label">Calories</span>
            <input className="input" inputMode="numeric" value={form.calories} onChange={update('calories')} />
          </label>

          <label className="field">
            <span className="label">Tags (comma separated)</span>
            <input className="input" value={form.tags} onChange={update('tags')} placeholder="spicy, egg, bestseller" />
          </label>
        </div>

        <label className="field mt-16">
          <span className="label">Description</span>
          <textarea className="textarea" rows={3} value={form.description} onChange={update('description')} />
        </label>

        <label className="field mt-16">
          <span className="label">Image URL</span>
          <input className="input" value={form.image_url} onChange={update('image_url')} placeholder="https://…" />
          {errors.image_url && <span className="error-text">{errors.image_url}</span>}
        </label>

        <div className="row gap-24 wrap mt-16">
          <label className="checkbox">
            <input type="checkbox" checked={Boolean(form.is_veg)} onChange={update('is_veg')} /> Vegetarian
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={Boolean(form.is_spicy)} onChange={update('is_spicy')} /> Spicy
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={Boolean(form.is_available)}
              onChange={update('is_available')}
            />{' '}
            Available today
          </label>
        </div>

        {form.rating_count > 0 && (
          <div className="mt-16 row gap-8">
            <StarRating value={Number(form.rating_avg)} readOnly size={16} />
            <span className="tiny muted">
              {Number(form.rating_avg).toFixed(1)} from {form.rating_count} reviews
            </span>
          </div>
        )}

        <div className="row gap-8 mt-24" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? <span className="spinner" /> : form.id ? 'Save changes' : 'Add dish'}
          </button>
        </div>

        {form.id && (
          <p className="hint mt-16">
            Current price {formatMoney(form.price)} · last sold portion keeps its own price, so
            historic receipts never change.
          </p>
        )}
      </form>
    </Modal>
  );
}