const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getMenu: () => request('/menu'),
  addMenuItem: (item) => request('/menu', { method: 'POST', body: JSON.stringify(item) }),
  updateMenuItem: (id, updates) =>
    request(`/menu/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteMenuItem: (id) => request(`/menu/${id}`, { method: 'DELETE' }),

  createOrder: (order) => request('/orders', { method: 'POST', body: JSON.stringify(order) }),
  getOrders: () => request('/orders'),
  getOrder: (id) => request(`/orders/${id}`),
  updateOrderStatus: (id, status) =>
    request(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  createPaymentOrder: (order_id) =>
    request('/payment/create-order', { method: 'POST', body: JSON.stringify({ order_id }) }),
  verifyPayment: (payload) =>
    request('/payment/verify', { method: 'POST', body: JSON.stringify(payload) }),
};
