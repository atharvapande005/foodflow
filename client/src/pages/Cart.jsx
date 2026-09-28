import { useState } from 'react';
import { api } from '../lib/api';

export default function Cart({ cart, setCart }) {
  const [studentName, setStudentName] = useState('');
  const [placing, setPlacing] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [error, setError] = useState(null);

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const placeOrder = async () => {
    setPlacing(true);
    setError(null);
    try {
      const order = await api.createOrder({
        student_name: studentName,
        items: cart.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
      });

      // Payment step (Razorpay) is wired up separately - see payment.routes.js on the backend
      // and integrate razorpay checkout.js here once you're ready to test real payments.
      const paymentOrder = await api.createPaymentOrder(order.id);
      console.log('Razorpay order created, ready to open checkout:', paymentOrder);

      setConfirmedOrder(order);
      setCart([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setPlacing(false);
    }
  };

  if (confirmedOrder) {
    return (
      <div>
        <h2>Order placed!</h2>
        <p>Your token number: <strong>{confirmedOrder.token_number}</strong></p>
        <p>Proceed to payment, then collect your food using this token.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Your Cart</h2>
      {cart.length === 0 && <p>Cart is empty.</p>}
      <ul>
        {cart.map((i) => (
          <li key={i.menu_item_id}>
            {i.name} x {i.quantity} — ₹{i.price * i.quantity}
          </li>
        ))}
      </ul>
      {cart.length > 0 && (
        <>
          <p>Total: ₹{total}</p>
          <input
            placeholder="Your name"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
          <button onClick={placeOrder} disabled={placing || !studentName}>
            {placing ? 'Placing order...' : 'Checkout'}
          </button>
        </>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
