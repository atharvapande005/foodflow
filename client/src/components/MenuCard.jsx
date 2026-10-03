import { useState } from 'react';
import { formatPrice } from '../lib/format.js';

/**
 * The core interaction of the whole app: a menu card that goes straight into
 * the cart. Shows a quantity stepper once the item is in the cart, so the
 * student can adjust without opening the cart page.
 */
export default function MenuCard({ item, quantity = 0, onAdd, onSetQty, onOpen, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const soldOut = !item.is_available;

  return (
    <article className={`menu-card${soldOut ? ' menu-card--sold-out' : ''}`}>
      <div
        className="menu-card__media"
        onClick={soldOut ? undefined : onOpen}
        role={soldOut ? undefined : 'button'}
        tabIndex={soldOut ? undefined : 0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen?.();
          }
        }}
        aria-label={soldOut ? `${item.name} is sold out` : `View ${item.name}`}
      >
        {item.image_url && !imageFailed ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            width="400"
            height="275"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="menu-card__placeholder" aria-hidden="true">
            {item.is_veg ? '🍛' : '🍗'}
          </div>
        )}

        {item.rating_count > 0 && (
          <span className="menu-card__rating">
            <span aria-hidden="true">★</span>
            {Number(item.rating_avg).toFixed(1)}
            <span className="tiny muted">({item.rating_count})</span>
          </span>
        )}

        {soldOut && <div className="menu-card__sold-out">Sold out</div>}
      </div>

      <div className="menu-card__body">
        <div className="menu-card__tags">
          <span className="badge">
            <span
              className={item.is_veg ? 'veg-dot' : 'nonveg-dot'}
              aria-hidden="true"
            />
            <span className="sr-only">{item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}</span>
          </span>
          {item.is_spicy && <span className="badge badge--danger">🌶 Spicy</span>}
          {!compact && item.category === 'combos' && (
            <span className="badge badge--brand">Combo</span>
          )}
        </div>

        <h3 className="menu-card__name">{item.name}</h3>
        {!compact && item.description && (
          <p className="menu-card__desc clamp-2">{item.description}</p>
        )}

        <div className="menu-card__meta">
          {item.prep_time_minutes > 0 && <span>⏱ {item.prep_time_minutes} min</span>}
          {item.calories > 0 && <span>{item.calories} kcal</span>}
        </div>

        <div className="menu-card__footer">
          <span className="price">{formatPrice(item.price)}</span>

          {soldOut ? (
            <button type="button" className="btn btn--secondary btn--sm" disabled>
              Unavailable
            </button>
          ) : quantity > 0 ? (
            <div className="stepper" role="group" aria-label={`Quantity of ${item.name}`}>
              <button
                type="button"
                className="stepper__btn"
                onClick={() => onSetQty?.(quantity - 1)}
                aria-label={`Remove one ${item.name}`}
              >
                −
              </button>
              <span className="stepper__value" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="stepper__btn"
                onClick={() => onSetQty?.(quantity + 1)}
                disabled={quantity >= 50}
                aria-label={`Add one ${item.name}`}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => onAdd?.(item)}
            >
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}