/** Shared presentational atoms used across student and admin screens. */
import { statusMeta, paymentMeta } from '../lib/format.js';

/** Coloured pill showing where an order is in the kitchen workflow. */
export function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <span className={`badge badge--${meta.tone}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

/** Alias kept for call sites that read better as "status pill". */
export const StatusPill = StatusBadge;

export function PaymentBadge({ status }) {
  const meta = paymentMeta(status);
  return <span className={`badge badge--${meta.tone}`}>{meta.label}</span>;
}

/** Wraps content in the standard empty-state block. */
export function EmptyState({ icon = '🍽️', title, message, action }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <h3>{title}</h3>
        {message && <p className="muted small mt-8">{message}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({ tone = 'info', icon, children }) {
  const fallback = { error: '⚠', success: '✓', warning: '!', info: 'ℹ' }[tone] ?? 'ℹ';

  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="alert__icon" aria-hidden="true">
        {icon || fallback}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ large, label }) {
  return (
    <span
      className={large ? 'spinner spinner--lg' : 'spinner'}
      role="status"
      aria-label={label || 'Loading'}
    />
  );
}

/** Full-height centred loading state. */
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="center-page">
      <Spinner large />
      <p className="muted small">{label}</p>
    </div>
  );
}

/** Card-shaped placeholders used while a grid of cards is loading. */
export function MenuSkeleton({ count = 8 }) {
  return (
    <div className="menu-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="menu-card">
          <div className="skeleton" style={{ aspectRatio: '16 / 11', borderRadius: 0 }} />
          <div className="menu-card__body">
            <div className="skeleton" style={{ height: 18, width: '70%' }} />
            <div className="skeleton" style={{ height: 12, width: '100%' }} />
            <div className="skeleton" style={{ height: 12, width: '55%' }} />
            <div className="skeleton" style={{ height: 32, width: 110, marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Single-line placeholder rows for tables that are still loading. */
export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <td key={columnIndex}>
              <div className="skeleton" style={{ height: 14, width: `${60 + ((rowIndex + columnIndex) % 3) * 15}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Five star rating. Read-only by default; pass onChange to make it an input.
 * onHover is passed through to the caller so the hovered value can be previewed.
 */
export function StarRating({ value, onChange, onHover, size = 26, readOnly = false }) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <div
      className="row gap-4"
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `Rated ${value} out of 5` : 'Your rating'}
    >
      {stars.map((star) => {
        const filled = star <= Math.round(value);
        const label = `${star} star${star === 1 ? '' : 's'}`;

        if (readOnly) {
          return (
            <span
              key={star}
              style={{ fontSize: size * 0.7, color: filled ? '#f59e0b' : 'var(--border-strong)' }}
              aria-hidden="true"
            >
              ★
            </span>
          );
        }

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === Math.round(value)}
            aria-label={label}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => onHover?.(star)}
            onFocus={() => onHover?.(star)}
            style={{
              fontSize: size,
              lineHeight: 1,
              color: filled ? '#f59e0b' : 'var(--border-strong)',
              transition: 'transform 0.12s var(--ease), color 0.12s var(--ease)',
            }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

/** Compact labelled statistic used across the admin dashboard. */
export function Stat({ label, value, hint, tone = '' }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}
