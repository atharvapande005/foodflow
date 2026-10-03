import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import AdminLayout from './AdminLayout.jsx';
import Modal from '../../components/Modal.jsx';
import { Alert, EmptyState, TableSkeleton } from '../../components/ui.jsx';
import { CATEGORIES, categoryMeta, formatDate, formatMoney } from '../../lib/format.js';

const TYPES = [
  { value: 'percent', label: 'Percentage off' },
  { value: 'flat', label: 'Flat amount off' },
  { value: 'free_delivery', label: 'Free packing' },
];

const BLANK = {
  code: '',
  description: '',
  discount_type: 'percent',
  value: '10',
  max_discount: '',
  min_order_amount: '',
  applies_to_category: '',
  starts_at: '',
  ends_at: '',
  usage_limit: '',
  usage_limit_per_user: '',
  is_active: true,
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await api.coupons.list();
      if (mounted.current) {
        setCoupons(result ?? []);
        setError('');
      }
    } catch (err) {
      if (mounted.current) setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(coupon) {
    try {
      await api.coupons.update(coupon.code, { is_active: !coupon.is_active });
      setCoupons((current) =>
        current.map((row) => (row.code === coupon.code ? { ...row, is_active: !row.is_active } : row))
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(coupon) {
    if (
      !window.confirm(
        `Delete coupon ${coupon.code}? Students will stop seeing it immediately, and redemptions stay on past orders.`
      )
    ) {
      return;
    }
    try {
      await api.coupons.remove(coupon.code);
      setCoupons((current) => current.filter((row) => row.code !== coupon.code));
      setNotice(`${coupon.code} deleted.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminLayout
      title="Coupons"
      subtitle="Every rule is enforced by the same database function the checkout uses."
      actions={
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing({ ...BLANK })}>
          + New coupon
        </button>
      }
    >
      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-16">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      {coupons === null ? (
        <div className="panel">
          <table>
            <tbody>
              <TableSkeleton rows={4} columns={6} />
            </tbody>
          </table>
        </div>
      ) : coupons.length === 0 ? (
        <EmptyState icon="🎟" title="No coupons" message="Create one to run a promo." />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Offer</th>
                <th>Conditions</th>
                <th className="num">Used</th>
                <th>Window</th>
                <th>Active</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.code} className={coupon.is_active ? '' : 'row--muted'}>
                  <td className="mono bold">{coupon.code}</td>
                  <td>
                    <div className="small bold">
                      {coupon.discount_type === 'percent'
                        ? `${coupon.value}% off`
                        : coupon.discount_type === 'flat'
                          ? `${formatMoney(coupon.value)} off`
                          : 'Free packing'}
                    </div>
                    <div className="tiny muted clamp-1">{coupon.description}</div>
                  </td>
                  <td className="tiny">
                    {Number(coupon.min_order_amount) > 0 && (
                      <>Min {formatMoney(coupon.min_order_amount)}<br /></>
                    )}
                    {coupon.applies_to_category && (
                      <>{categoryMeta(coupon.applies_to_category).label} only<br /></>
                    )}
                    {coupon.usage_limit_per_user
                      ? `${coupon.usage_limit_per_user} per student`
                      : 'No per-student cap'}
                  </td>
                  <td className="num small">
                    {coupon.redemptions}
                    {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ''}
                    <div className="tiny muted">{formatMoney(coupon.discount_given)} given</div>
                  </td>
                  <td className="tiny nowrap">
                    {coupon.starts_at ? formatDate(coupon.starts_at) : 'now'}
                    <br />
                    {coupon.ends_at ? `until ${formatDate(coupon.ends_at)}` : 'no end date'}
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={coupon.is_active}
                        onChange={() => toggle(coupon)}
                        aria-label={`Toggle ${coupon.code}`}
                      />
                      <span className="switch__track" aria-hidden="true">
                        <span className="switch__knob" />
                      </span>
                    </label>
                  </td>
                  <td className="nowrap">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditing(coupon)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(coupon)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CouponEditor
        coupon={editing}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          setNotice(message);
          load();
        }}
      />
    </AdminLayout>
  );
}

function CouponEditor({ coupon, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!coupon) {
      setForm(null);
      return;
    }
    setForm({
      ...BLANK,
      ...coupon,
      max_discount: coupon.max_discount ?? '',
      min_order_amount: coupon.min_order_amount ?? '',
      usage_limit: coupon.usage_limit ?? '',
      usage_limit_per_user: coupon.usage_limit_per_user ?? '',
      applies_to_category: coupon.applies_to_category ?? '',
      starts_at: toLocalInput(coupon.starts_at),
      ends_at: toLocalInput(coupon.ends_at),
    });
    setErrors([]);
    setError('');
  }, [coupon]);

  if (!form) return null;

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function save(event) {
    event.preventDefault();

    const local = [];
    if (!form.code.trim()) local.push('A code is required.');
    else if (!/^[A-Za-z0-9_-]{3,24}$/.test(form.code.trim())) {
      local.push('Codes are 3-24 characters: letters, numbers, hyphen or underscore.');
    }
    if (form.discount_type === 'percent' && Number(form.value) > 100) {
      local.push('A percentage cannot exceed 100.');
    }
    if (form.discount_type !== 'free_delivery' && !(Number(form.value) > 0)) {
      local.push('Enter a discount amount.');
    }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      local.push('The end date must be after the start date.');
    }
    setErrors(local);
    if (local.length > 0) return;

    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      value: form.discount_type === 'free_delivery' ? 0 : Number(form.value),
      max_discount: form.max_discount === '' ? null : Number(form.max_discount),
      min_order_amount: form.min_order_amount === '' ? 0 : Number(form.min_order_amount),
      applies_to_category: form.applies_to_category || null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit),
      usage_limit_per_user: form.usage_limit_per_user === '' ? null : Number(form.usage_limit_per_user),
      is_active: Boolean(form.is_active),
    };

    setSaving(true);
    setError('');

    try {
      if (coupon.code && coupon.created_at) {
        delete payload.code;
        await api.coupons.update(coupon.code, payload);
        onSaved(`${coupon.code} updated.`);
      } else {
        await api.coupons.create(payload);
        onSaved(`${payload.code} created.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={coupon?.created_at ? `Edit ${coupon.code}` : 'New coupon'}>
      <form onSubmit={save} noValidate>
        {error && (
          <div className="mb-16">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {errors.length > 0 && (
          <div className="mb-16">
            <Alert tone="warning">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Alert>
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            <span className="label">Code</span>
            <input
              className="input mono"
              value={form.code}
              onChange={update('code')}
              disabled={Boolean(coupon?.created_at)}
              placeholder="SEMESTER10"
            />
          </label>

          <label className="field">
            <span className="label">Type</span>
            <select className="select" value={form.discount_type} onChange={update('discount_type')}>
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          {form.discount_type !== 'free_delivery' && (
            <label className="field">
              <span className="label">
                Value {form.discount_type === 'percent' ? '(%)' : '(₹)'}
              </span>
              <input className="input" inputMode="decimal" value={form.value} onChange={update('value')} />
            </label>
          )}

          {form.discount_type === 'percent' && (
            <label className="field">
              <span className="label">Maximum discount (₹)</span>
              <input
                className="input"
                inputMode="decimal"
                value={form.max_discount}
                onChange={update('max_discount')}
                placeholder="no cap"
              />
            </label>
          )}

          <label className="field">
            <span className="label">Minimum order (₹)</span>
            <input
              className="input"
              inputMode="decimal"
              value={form.min_order_amount}
              onChange={update('min_order_amount')}
              placeholder="0"
            />
          </label>

          <label className="field">
            <span className="label">Only these categories</span>
            <select
              className="select"
              value={form.applies_to_category}
              onChange={update('applies_to_category')}
            >
              <option value="">Any category</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {categoryMeta(category).label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">Total uses allowed</span>
            <input
              className="input"
              inputMode="numeric"
              value={form.usage_limit}
              onChange={update('usage_limit')}
              placeholder="unlimited"
            />
          </label>

          <label className="field">
            <span className="label">Uses per student</span>
            <input
              className="input"
              inputMode="numeric"
              value={form.usage_limit_per_user}
              onChange={update('usage_limit_per_user')}
              placeholder="unlimited"
            />
          </label>

          <label className="field">
            <span className="label">Starts</span>
            <input className="input" type="datetime-local" value={form.starts_at} onChange={update('starts_at')} />
          </label>

          <label className="field">
            <span className="label">Ends</span>
            <input className="input" type="datetime-local" value={form.ends_at} onChange={update('ends_at')} />
          </label>
        </div>

        <label className="field mt-16">
          <span className="label">Description shown to students</span>
          <input
            className="input"
            value={form.description}
            onChange={update('description')}
            placeholder="10% off your first order over ₹200"
          />
        </label>

        <label className="checkbox mt-16">
          <input type="checkbox" checked={Boolean(form.is_active)} onChange={update('is_active')} /> Active
          immediately
        </label>

        <div className="row gap-8 mt-24" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save coupon'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}