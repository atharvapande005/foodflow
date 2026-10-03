/**
 * Thin, typed-ish wrapper around fetch.
 *
 * Responsibilities:
 *  - attach the student's Supabase access token
 *  - attach the canteen admin key when one is present
 *  - normalise every failure into an ApiError the UI can render
 *  - refresh the Supabase session once on a 401 before giving up
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const ADMIN_KEY_STORAGE = 'foodflow.adminKey';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isAuthError() {
    return this.status === 401;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

// ---- access token ----------------------------------------------------------
// Held in memory and mirrored into localStorage by AuthContext so a page
// refresh does not sign the student out.
let accessToken = null;
let refreshHandler = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

/** Called once by AuthContext so the api layer can recover from a 401. */
export function setRefreshHandler(handler) {
  refreshHandler = handler;
}

// ---- admin key -------------------------------------------------------------
export function getAdminKey() {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setAdminKey(key) {
  try {
    if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // Private browsing: the key just will not persist.
  }
}

export function hasAdminKey() {
  return Boolean(getAdminKey());
}

// ---- core request ----------------------------------------------------------
async function request(method, path, { body, auth = false, admin = false, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (admin) {
    const key = getAdminKey();
    if (key) headers['x-admin-key'] = key;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the FoodFlow server. Check your connection and try again.', {
      status: 0,
    });
  }

  if (response.status === 204) return null;

  let payload = null;
  const raw = await response.text();
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    // An expired access token is the one error worth retrying automatically.
    if (response.status === 401 && auth && retry && refreshHandler) {
      const refreshed = await refreshHandler();
      if (refreshed) {
        return request(method, path, { body, auth, admin, retry: false });
      }
    }

    throw new ApiError(payload?.error || `Request failed with status ${response.status}`, {
      status: response.status,
      code: payload?.code,
      details: payload?.details,
    });
  }

  return payload;
}

const get = (path, options) => request('GET', path, options);
const post = (path, body, options) => request('POST', path, { ...options, body });
const put = (path, body, options) => request('PUT', path, { ...options, body });
const patch = (path, body, options) => request('PATCH', path, { ...options, body });
const del = (path, options) => request('DELETE', path, options);

/** Builds a querystring, dropping empty values. */
function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const api = {
  // ---- health / config ----------------------------------------------------
  health: () => get('/health'),
  paymentConfig: () => get('/payment/config'),

  // ---- auth ---------------------------------------------------------------
  auth: {
    signup: (payload) => post('/auth/signup', payload),
    login: (email, password) => post('/auth/login', { email, password }),
    me: () => get('/auth/me', { auth: true }),
    updateProfile: (payload) => put('/auth/me', payload, { auth: true }),
    adminCheck: () => get('/auth/admin-check', { admin: true }),
  },

  // ---- canteen ------------------------------------------------------------
  canteen: {
    get: () => get('/canteen'),
    set: (isOpen, message) => put('/canteen', { is_open: isOpen, message }, { admin: true }),
  },

  // ---- menu ---------------------------------------------------------------
  menu: {
    list: (params) => get(`/menu${qs(params)}`),
    categories: () => get('/menu/categories'),
    get: (id) => get(`/menu/${id}`),
    create: (payload) => post('/menu', payload, { admin: true }),
    update: (id, payload) => put(`/menu/${id}`, payload, { admin: true }),
    setAvailability: (id, isAvailable) =>
      patch(`/menu/${id}/availability`, { is_available: isAvailable }, { admin: true }),
    remove: (id) => del(`/menu/${id}`, { admin: true }),
  },

  // ---- orders -------------------------------------------------------------
  orders: {
    place: (payload) => post('/orders', payload, { auth: true }),
    track: (params) => get(`/orders/track${qs(params)}`),
    myHistory: () => get('/orders/my-history', { auth: true }),
    get: (id, params) => get(`/orders/${id}${qs(params)}`, { auth: true }),
    cancel: (id, reason) => put(`/orders/${id}/cancel`, { reason }, { auth: true }),
    list: (params) => get(`/orders${qs(params)}`, { admin: true }),
    setStatus: (id, status, reason) =>
      put(`/orders/${id}/status`, { status, reason }, { admin: true }),
  },

  // ---- coupons ------------------------------------------------------------
  coupons: {
    available: () => get('/coupons/available', { auth: true }),
    validate: (code, items) => post('/coupons/validate', { code, items }, { auth: true }),
    list: () => get('/coupons', { admin: true }),
    create: (payload) => post('/coupons', payload, { admin: true }),
    update: (code, payload) => put(`/coupons/${code}`, payload, { admin: true }),
    remove: (code) => del(`/coupons/${code}`, { admin: true }),
  },

  // ---- payment ------------------------------------------------------------
  payment: {
    createOrder: (orderId, studentEmail) =>
      post('/payment/create-order', { order_id: orderId, student_email: studentEmail }, { auth: true }),
    verify: (payload) => post('/payment/verify', payload, { auth: true }),
    simulate: (orderId, studentEmail, outcome) =>
      post('/payment/simulate', { order_id: orderId, student_email: studentEmail, outcome }, { auth: true }),
    refund: (orderId, amount) => post('/payment/refund', { order_id: orderId, amount }, { admin: true }),
  },

  // ---- reviews ------------------------------------------------------------
  reviews: {
    forItem: (itemId) => get(`/reviews/item/${itemId}`),
    save: (itemId, payload) => put(`/reviews/item/${itemId}`, payload, { auth: true }),
    remove: (id) => del(`/reviews/${id}`, { auth: true }),
    all: () => get('/reviews/mine', { admin: true }),
  },

  // ---- recommendations ----------------------------------------------------
  recommendations: {
    home: () => get('/recommendations/home', { auth: true }),
    together: (itemId, limit) => get(`/recommendations/together/${itemId}${qs({ limit })}`),
    forMe: (limit) => get(`/recommendations/for-me${qs({ limit })}`, { auth: true }),
    rebuild: () => post('/recommendations/rebuild', undefined, { admin: true }),
  },

  // ---- analytics ----------------------------------------------------------
  analytics: {
    dashboard: () => get('/analytics/dashboard', { admin: true }),
  },
};

export default api;