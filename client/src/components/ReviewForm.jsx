import { useState } from 'react';
import { api } from '../lib/api.js';
import { Alert, StarRating } from './ui.jsx';

/**
 * One review per student per menu item (enforced by a unique index in the
 * schema), so this form both creates and updates.
 */
export default function ReviewForm({ menuItemId, itemName, onDone }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();

    if (rating < 1) {
      setError('Pick a star rating first.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.reviews.save(menuItemId, {
        rating,
        comment: comment.trim() || null,
      });
      onDone?.(true);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="mb-16">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <p className="muted small mb-16">
        How was <strong>{itemName}</strong>?
      </p>

      <div onMouseLeave={() => setHover(0)} style={{ display: 'inline-block' }}>
        <StarRating value={rating || hover} onChange={setRating} onHover={setHover} size={36} />
      </div>

      <label className="field mt-16">
        <span className="label">Tell other students more (optional)</span>
        <textarea
          className="textarea"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Portion size, spice level, freshness…"
        />
      </label>

      <p className="hint">Ratings update the menu card average immediately.</p>

      <div className="row gap-8 mt-24" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <span className="spinner" /> : 'Post review'}
        </button>
      </div>
    </form>
  );
}
