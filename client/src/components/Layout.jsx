import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCanteen } from '../context/CanteenContext.jsx';
import { initials, avatarColor, formatPrice } from '../lib/format.js';
import { getAdminKey } from '../lib/api.js';

function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem('foodflow.theme') || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('foodflow.theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon"
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;

    function onClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    function onEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  if (!isAuthenticated) {
    return (
      <Link to="/login" className="btn btn--secondary btn--sm">
        Sign in
      </Link>
    );
  }

  const name = user?.full_name || user?.email || 'Student';

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="avatar-btn"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        style={{ background: avatarColor(user?.id || name), color: '#fff', borderColor: 'transparent' }}
      >
        {initials(name)}
      </button>

      {open && (
        <div className="dropdown" role="menu">
          <div className="dropdown__header">
            <div className="bold truncate">{name}</div>
            <div className="tiny muted truncate">{user?.email}</div>
          </div>

          <Link to="/orders" className="dropdown__item" role="menuitem" onClick={() => setOpen(false)}>
            <span aria-hidden="true">🧾</span> My orders
          </Link>
          <Link to="/track" className="dropdown__item" role="menuitem" onClick={() => setOpen(false)}>
            <span aria-hidden="true">🔎</span> Track an order
          </Link>
          <Link to="/profile" className="dropdown__item" role="menuitem" onClick={() => setOpen(false)}>
            <span aria-hidden="true">⚙️</span> Profile
          </Link>
          <Link to="/admin" className="dropdown__item" role="menuitem" onClick={() => setOpen(false)}>
            <span aria-hidden="true">🔐</span> Canteen admin
          </Link>

          <hr className="divider" style={{ margin: '6px 0' }} />

          <button
            type="button"
            className="dropdown__item dropdown__item--danger"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/');
            }}
          >
            <span aria-hidden="true">↩</span> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function CartButton() {
  const { itemCount, subtotal } = useCart();

  return (
    <Link to="/cart" className="cart-btn" aria-label={`Cart, ${itemCount} items, ${formatPrice(subtotal)}`}>
      <span aria-hidden="true">🛒</span>
      <span className="nowrap">Cart</span>
      {itemCount > 0 && <span className="cart-btn__count">{itemCount}</span>}
    </Link>
  );
}

export default function Layout({ children, hideFooter = false }) {
  const { is_open: isOpen, message } = useCanteen();
  const { isAdmin } = useAuth();
  const location = useLocation();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="header no-print">
        <div className="page header__inner">
          <Link to="/" className="logo" aria-label="FoodFlow home">
            <span className="logo__mark" aria-hidden="true">
              🍽
            </span>
            FoodFlow
          </Link>

          <nav className="nav" aria-label="Main navigation">
            <NavLink to="/" end className="nav__link">
              Home
            </NavLink>
            <NavLink to="/menu" className="nav__link">
              Menu
            </NavLink>
            <NavLink to="/offers" className="nav__link">
              Offers
            </NavLink>
            <NavLink to="/track" className="nav__link">
              Track
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className="nav__link">
                Admin
              </NavLink>
            )}
          </nav>

          <div className="header__actions">
            <ThemeToggle />
            <UserMenu />
            <CartButton />
          </div>
        </div>

        <div className={`status-bar ${isOpen ? 'status-bar--open' : 'status-bar--closed'}`}>
          {isOpen
            ? `Open now · Order ahead and skip the queue${
                getAdminKey() ? ' · You are signed in as canteen admin' : ''
              }`
            : `Closed for now · ${message || 'The canteen is not accepting orders'}`}
        </div>
      </header>

      <main id="main" key={location.pathname}>
        {children}
      </main>

      {!hideFooter && (
        <footer className="footer no-print">
          <div className="page">
            <div className="footer__grid">
              <div>
                <Link to="/" className="logo mb-16">
                  <span className="logo__mark" aria-hidden="true">
                    🍽
                  </span>
                  FoodFlow
                </Link>
                <p className="muted small" style={{ maxWidth: '32ch' }}>
                  Order ahead, pay online and walk straight to the counter with your token.
                </p>
              </div>

              <div>
                <h4>Order</h4>
                <Link to="/menu">Full menu</Link>
                <Link to="/offers">Offers &amp; coupons</Link>
                <Link to="/cart">Your cart</Link>
                <Link to="/track">Track an order</Link>
              </div>

              <div>
                <h4>Account</h4>
                <Link to="/login">Sign in</Link>
                <Link to="/signup">Create account</Link>
                <Link to="/orders">My orders</Link>
                <Link to="/profile">Profile</Link>
              </div>

              <div>
                <h4>Canteen</h4>
                <Link to="/admin">Admin portal</Link>
                <Link to="/admin/menu">Manage menu</Link>
                <Link to="/admin/coupons">Coupons</Link>
                <Link to="/admin/orders">Live orders</Link>
              </div>
            </div>

            <hr className="divider mt-32" />

            <div className="between wrap mt-16 small muted">
              <span>Built for campus canteens.</span>
              <span>Cash, card and UPI accepted</span>
            </div>
          </div>
        </footer>
      )}
    </>
  );
}