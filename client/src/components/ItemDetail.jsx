import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import MenuCard from './MenuCard.jsx';
import { Alert, Spinner, StarRating } from './ui.jsx';
import { formatDate, formatMoney } from '../lib/format.js';

/**
 * Item detail shown in a modal from the menu grid.
 *
 * Also surfaces the recommendation engine output: which other dishes students
 * order alongside this one, with the confidence behind each pairing.
 */
export default function ItemDetail({ item, quantity, onAdd, onSetQty }) {
  const [together, setTogether] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setTogether(null);
    setReviews(null);
    setReviewError('');

    api.recommendations
      .together(item.id, 4)
      .then((result) => {
        if (!cancelled) setTogether(result?.results ?? []);
      })
      .catch(() => {
        // Recommendations are a nice-to-have; never block the detail view.
      });

    api.reviews
      .forItem(item.id)
      .then((result) => {
        if (!cancelled) setReviews(result ?? []);
      })
      .catch((err) => {
        if (!cancelled) setReviewError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const recommendations = (together ?? []).filter((entry) => entry.item.id !== item.id);

  return (
    <div>
      {item.image_url && (
        <img
          src={item.image_url}
          alt={item.name}
          style={{
            width: '100%',
            height: 220,
            objectFit: 'cover',
            borderRadius: 'var(--radius)',
            marginBottom: 18,
          }}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}

      <p className="muted">{item.description}</p>

      <div className="row gap-8 wrap mt-16">
        <span className="badge">
          <span className={item.is_veg ? 'veg-dot' : 'nonveg-dot'} aria-hidden="true" />
          <span className="sr-only">{item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}</span>
          {item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
        </span>
        {item.prep_time_minutes > 0 && (
          <span className="badge">⏱ {item.prep_time_minutes} min</span>
        )}
        {item.calories > 0 && <span className="badge">{item.calories} kcal</span>}
        {item.is_spicy && <span className="badge badge--danger">🌶 Spicy</span>}
        {(item.tags ?? []).map((tag) => (
          <span key={tag} className="badge">
            {tag}
          </span>
        ))}
      </div>

      {item.rating_count > 0 && (
        <div className="row gap-8 mt-16">
          <StarRating value={Number(item.rating_avg)} readOnly size={18} />
          <span className="small muted">
            {Number(item.rating_avg).toFixed(1)} from {item.rating_count} review
            {item.rating_count === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <div className="between mt-24" style={{ paddingTop: 18, borderTop: '1px solid var(--border)' }}>
        <span className="price" style={{ fontSize: '1.5rem' }}>
          {formatMoney(item.price)}
        </span>

        {item.is_available ? (
          quantity > 0 ? (
            <div className="row gap-12">
              <div className="stepper" role="group" aria-label={`Quantity of ${item.name}`}>
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => onSetQty(quantity - 1)}
                  aria-label="Remove one"
                >
                  −
                </button>
                <span className="stepper__value">{quantity}</span>
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => onSetQty(quantity + 1)}
                  disabled={quantity >= 50}
                  aria-label="Add one"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onAdd(item, quantity)}
              >
                Done
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => onAdd(item, 1)}>
              Add to cart
            </button>
          )
        ) : (
          <span className="badge badge--danger">Sold out today</span>
        )}
      </div>

      {recommendations.length > 0 && (
        <section className="mt-24" style={{ paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <h4>Frequently ordered with this</h4>
          <p className="small muted mt-8">
            Learned from {item.name?.toLowerCase()} orders placed by other students.
          </p>

          <div className="mt-16">
            {recommendations.map((entry) => (
              <div
                key={entry.item.id}
                className="between"
                style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="bold small truncate">{entry.item.name}</div>
                  <div className="tiny muted">{entry.reason}</div>
                </div>
                <div className="row gap-8 nowrap">
                  <span className="bold small">{formatMoney(entry.item.price)}</span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => onAdd(entry.item, 1)}
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-24" style={{ paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <h4>Reviews</h4>

        {reviewError && (
          <div className="mt-16">
            <Alert tone="warning">{reviewError}</Alert>
          </div>
        )}

        {reviews === null && !reviewError && (
          <div className="center-page" style={{ minHeight: 120 }}>
            <Spinner />
          </div>
        )}

        {reviews?.length === 0 && (
          <p className="muted small mt-16">
            No reviews yet. Students who have ordered this item can leave the first one from their order
            history.
          </p>
        )}

        {reviews?.map((review) => (
          <div key={review.id} className="mt-16" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
            <div className="between">
              <span className="bold small">{review.author}</span>
              <span className="tiny muted">{formatDate(review.created_at)}</span>
            </div>
            <div className="mt-8">
              <StarRating value={review.rating} readOnly size={14} />
            </div>
            {review.comment && <p className="small mt-8">{review.comment}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}