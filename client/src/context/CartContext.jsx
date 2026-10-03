import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { useToast } from './ToastContext.jsx';

const CartContext = createContext(null);

const STORAGE_KEY = 'foodflow.cart';
const COUPON_KEY = 'foodflow.coupon';
const MAX_QTY = 50;

/**
 * Cart state.
 *
 *   add      increments an existing line instead of duplicating it
 *   setQty   clamps to 1..MAX_QTY and drops the line at 0
 *   remove   drops the line outright
 *   clear    empties the cart (called after a successful order)
 *
 * Persisted to localStorage so a refresh, or navigating to the receipt page,
 * never loses an in-progress order.
 */
function reducer(state, action) {
  switch (action.type) {
    case 'hydrate':
      return action.cart;

    case 'add': {
      const { item, quantity = 1 } = action;
      const existing = state.find((line) => line.menu_item_id === item.id);

      if (existing) {
        return state.map((line) =>
          line.menu_item_id === item.id
            ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_QTY) }
            : line
        );
      }

      return [
        ...state,
        {
          menu_item_id: item.id,
          name: item.name,
          price: Number(item.price),
          image_url: item.image_url,
          category: item.category,
          is_veg: item.is_veg,
          prep_time_minutes: item.prep_time_minutes,
          quantity: Math.min(Math.max(quantity, 1), MAX_QTY),
        },
      ];
    }

    case 'setQty':
      return action.quantity < 1
        ? state.filter((line) => line.menu_item_id !== action.menu_item_id)
        : state.map((line) =>
            line.menu_item_id === action.menu_item_id
              ? { ...line, quantity: Math.min(action.quantity, MAX_QTY) }
              : line
          );

    case 'remove':
      return state.filter((line) => line.menu_item_id !== action.menu_item_id);

    case 'clear':
      return [];

    default:
      return state;
  }
}

function readStoredCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything malformed rather than crashing the whole app on boot.
    return parsed.filter(
      (line) =>
        line &&
        typeof line.menu_item_id === 'string' &&
        Number.isFinite(Number(line.price)) &&
        Number(line.quantity) > 0
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(reducer, []);
  // Only the code is kept here. The discount itself is always recomputed by the
  // server, so a stale or tampered value can never change what a student pays.
  const [couponCode, setCouponCode] = useState(() => {
    try {
      return localStorage.getItem(COUPON_KEY) || null;
    } catch {
      return null;
    }
  });
  const { pushToast } = useToast();

  useEffect(() => {
    dispatch({ type: 'hydrate', cart: readStoredCart() });
  }, []);

  useEffect(() => {
    try {
      if (cart.length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Non-fatal: the cart simply will not survive a refresh.
    }
  }, [cart]);

  // An empty cart can never satisfy a minimum order, so drop the coupon with it.
  useEffect(() => {
    if (cart.length === 0 && couponCode) setCouponCode(null);
  }, [cart.length, couponCode]);

  useEffect(() => {
    try {
      if (couponCode) localStorage.setItem(COUPON_KEY, couponCode);
      else localStorage.removeItem(COUPON_KEY);
    } catch {
      // Non-fatal: the coupon has to be re-typed after a refresh.
    }
  }, [couponCode]);

  const add = useCallback(
    (item, quantity = 1) => {
      if (!item?.is_available) {
        pushToast({ type: 'error', message: `${item?.name ?? 'That item'} is sold out.` });
        return;
      }
      dispatch({ type: 'add', item, quantity });
      pushToast({ type: 'success', message: `${item.name} added to cart` });
    },
    [pushToast]
  );

  const setQty = useCallback((menu_item_id, quantity) => {
    dispatch({ type: 'setQty', menu_item_id, quantity: Number(quantity) });
  }, []);

  const remove = useCallback((menu_item_id) => {
    dispatch({ type: 'remove', menu_item_id });
  }, []);

  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
    const longestPrep = cart.reduce(
      (max, line) => Math.max(max, Number(line.prep_time_minutes) || 0),
      0
    );
    return {
      subtotal: Number(subtotal.toFixed(2)),
      itemCount,
      longestPrep,
      lineCount: cart.length,
    };
  }, [cart]);

  const value = useMemo(
    () => ({ cart, add, setQty, remove, clear, couponCode, setCouponCode, ...totals }),
    [cart, add, setQty, remove, clear, couponCode, totals]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}

export default CartContext;