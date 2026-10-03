/** Formatting helpers shared across the app. */

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/** 1234.5 -> "₹1,234.50" */
export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0.00';
  return currency.format(amount);
}

/** Drops the paise when the amount is whole, which reads better in listings. */
export function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0';
  if (Number.isInteger(amount)) return `₹${amount.toLocaleString('en-IN')}`;
  return currency.format(amount);
}

export function formatNumber(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('en-IN');
}

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
});

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  timeStyle: 'short',
});

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormat.format(date);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormat.format(date);
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return timeFormat.format(date);
}

/** "just now", "12 min ago", "3 hr ago", then falls back to a date. */
export function formatRelative(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';

  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1 min ago';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return formatDate(value);
}

/** Rough ETA for an order placed now, based on how long the kitchen is taking. */
export function estimateMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `${n} min`;
  const hours = Math.floor(n / 60);
  const rest = n % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function initials(name) {
  const text = String(name || '').trim();
  if (!text) return '?';
  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Deterministic pastel background so avatars stay stable per user. */
export function avatarColor(seed) {
  const text = String(seed || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 46%)`;
}

/** Turns a stable string into the small barcode drawn on the receipt. */
export function barcodeBars(seed) {
  const text = String(seed || '');
  const bars = [];
  for (let i = 0; i < text.length && bars.length < 60; i += 1) {
    const code = text.charCodeAt(i);
    bars.push(code % 3 === 0 ? 3 : code % 3 === 1 ? 1 : 2);
  }
  return bars;
}

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];

/** What the canteen portal shows as the next action for each status. */
export const NEXT_STATUS = {
  pending: 'paid',
  paid: 'preparing',
  preparing: 'ready',
  ready: 'completed',
  completed: null,
  cancelled: null,
};

export const STATUS_META = {
  pending: { label: 'Awaiting payment', tone: 'warning', icon: '◷' },
  paid: { label: 'Paid', tone: 'info', icon: '✓' },
  preparing: { label: 'Preparing', tone: 'info', icon: '♨' },
  ready: { label: 'Ready for pickup', tone: 'success', icon: '★' },
  completed: { label: 'Collected', tone: 'success', icon: '✓' },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: '✕' },
};

export const PAYMENT_META = {
  unpaid: { label: 'Unpaid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'info' },
};

export const CATEGORY_META = {
  breakfast: { label: 'Breakfast', icon: '🍳' },
  snacks: { label: 'Snacks', icon: '🥨' },
  meals: { label: 'Meals', icon: '🍛' },
  combos: { label: 'Combos', icon: '🍱' },
  beverages: { label: 'Beverages', icon: '🥤' },
  desserts: { label: 'Desserts', icon: '🍮' },
};

/** Every category the menu editor and coupon editor offer, in display order. */
export const CATEGORIES = Object.keys(CATEGORY_META);

export function statusMeta(status) {
  return STATUS_META[status] || { label: status, tone: 'warning', icon: '•' };
}

export function paymentMeta(status) {
  return PAYMENT_META[status] || { label: status, tone: 'warning' };
}

export function categoryMeta(category) {
  return CATEGORY_META[category] || { label: titleCase(category), icon: '🍽️' };
}