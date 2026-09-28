import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const NEXT_STATUS = {
  pending: 'paid',
  paid: 'preparing',
  preparing: 'ready',
  ready: 'completed',
};

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  const loadOrders = () => {
    api.getOrders().then(setOrders).catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000); // simple polling for now
    return () => clearInterval(interval);
  }, []);

  const advanceStatus = async (order) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await api.updateOrderStatus(order.id, next);
    loadOrders();
  };

  return (
    <div>
      <h2>Admin Dashboard — Incoming Orders</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Student</th>
            <th>Items</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.token_number}</td>
              <td>{order.student_name}</td>
              <td>
                {order.order_items?.map((i) => `${i.item_name} x${i.quantity}`).join(', ')}
              </td>
              <td>₹{order.total_amount}</td>
              <td>{order.payment_status}</td>
              <td>{order.status}</td>
              <td>
                {NEXT_STATUS[order.status] && (
                  <button onClick={() => advanceStatus(order)}>
                    Mark {NEXT_STATUS[order.status]}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
