import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Menu({ cart, setCart }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getMenu()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.menu_item_id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.menu_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  if (loading) return <p>Loading menu...</p>;
  if (error) return <p>Error loading menu: {error}</p>;

  return (
    <div>
      <h2>Menu</h2>
      {items.length === 0 && <p>No items available right now.</p>}
      <ul className="menu-list">
        {items.map((item) => (
          <li key={item.id} className="menu-item">
            <div>
              <strong>{item.name}</strong> — ₹{item.price}
              {!item.is_available && <span> (unavailable)</span>}
            </div>
            <button onClick={() => addToCart(item)} disabled={!item.is_available}>
              Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
