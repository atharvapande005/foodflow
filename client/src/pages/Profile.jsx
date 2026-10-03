import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, EmptyState, MenuSkeleton } from '../components/ui.jsx';
import MenuCard from '../components/MenuCard.jsx';
import { avatarColor, initials } from '../lib/format.js';

export default function Profile() {
  const { user, updateProfile, logout, refresh } = useAuth();
  const { cart, add, setQty, itemCount, couponCode } = useCart();
  const { pushToast } = useToast();

  const [form, setForm] = useState({
    full_name: user?.user_metadata?.full_name || '',
    phone: user?.user_metadata?.phone || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [basis, setBasis] = useState('');

  useEffect(() => {
    let cancelled = false;

    api.recommendations
      .forMe(6)
      .then((result) => {
        if (cancelled) return;
        setSuggestions(result?.items ?? []);
        setBasis(result?.basis || '');
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function save(event) {
    event.preventDefault();

    const next = {};
    if (!form.full_name.trim()) next.full_name = 'Your name cannot be empty.';
    if (form.phone && form.phone.replace(/\D/g, '').length < 10) {
      next.phone = 'Enter a 10 digit phone number.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await updateProfile({ full_name: form.full_name.trim(), phone: form.phone.trim() });
      pushToast({ type: 'success', message: 'Profile updated.' });
      await refresh();
    } catch (err) {
      pushToast({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  const quantityOf = (id) => cart.find((line) => line.menu_item_id === id)?.quantity ?? 0;

  return (
    <div className="page page--narrow mt-32">
      <div className="section-head">
        <div>
          <h1>Your profile</h1>
          <p>Account details and personalised picks.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
          Sign out
        </button>
      </div>

      <div className="profile-hero panel mb-24">
        <div className="avatar" style={{ background: avatarColor(user?.email) }}>
          {initials(user?.user_metadata?.full_name || user?.email)}
        </div>
        <div>
          <h3 style={{ marginBottom: 4 }}>{user?.user_metadata?.full_name || 'Student'}</h3>
          <p className="small muted">{user?.email}</p>
          {user?.created_at && (
            <p className="tiny muted mt-8">
              Member since {new Date(user.created_at).toLocaleDateString('en-IN')}
            </p>
          )}
        </div>
      </div>

      <div className="checkout-layout">
        <section className="panel">
          <h3 className="mb-16">Details</h3>

          <form onSubmit={save} noValidate>
            <label className="field">
              <span className="label">Full name</span>
              <input
                className="input"
                value={form.full_name}
                onChange={update('full_name')}
                autoComplete="name"
                aria-invalid={Boolean(errors.full_name)}
              />
              {errors.full_name && <span className="error-text">{errors.full_name}</span>}
            </label>

            <label className="field">
              <span className="label">Email</span>
              <input className="input" value={user?.email || ''} readOnly disabled />
              <span className="hint">Email changes need verification, so contact the canteen desk.</span>
            </label>

            <label className="field">
              <span className="label">Phone</span>
              <input
                className="input"
                value={form.phone}
                onChange={update('phone')}
                inputMode="tel"
                autoComplete="tel"
                placeholder="9876543210"
                aria-invalid={Boolean(errors.phone)}
              />
              {errors.phone && <span className="error-text">{errors.phone}</span>}
            </label>

            <button type="submit" className="btn btn--primary mt-16" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save changes'}
            </button>
          </form>

          <hr className="divider mt-24 mb-16" />

          <div className="between small">
            <span className="muted">Items in your cart</span>
            <span>{itemCount}</span>
          </div>
          <div className="between small mt-8">
            <span className="muted">Coupon applied</span>
            <span className="mono">{couponCode || 'none'}</span>
          </div>

          <div className="row gap-8 mt-16">
            <Link to="/orders" className="btn btn--secondary btn--sm">
              Order history
            </Link>
            <Link to="/offers" className="btn btn--secondary btn--sm">
              Offers
            </Link>
          </div>
        </section>

        <aside className="panel">
          <h3 className="mb-8">Recommended for you</h3>
          {basis && <p className="small muted mb-16">{basis}.</p>}

          {suggestions === null ? (
            <MenuSkeleton count={2} />
          ) : suggestions.length === 0 ? (
            <EmptyState
              icon="🧭"
              title="Nothing to suggest yet"
              message="Once the canteen has enough order history, this space fills with personal picks."
              action={
                <Link to="/menu" className="btn btn--secondary btn--sm">
                  Browse the menu
                </Link>
              }
            />
          ) : (
            <div className="stack gap-12">
              {suggestions.slice(0, 3).map((entry) => (
                <MenuCard
                  key={entry.item.id}
                  item={entry.item}
                  compact
                  quantity={quantityOf(entry.item.id)}
                  onAdd={add}
                  onSetQty={(next) => setQty(entry.item.id, next)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
