import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCanteen } from '../../context/CanteenContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert } from '../../components/ui.jsx';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/orders', label: 'Orders', icon: '🧾' },
  { to: '/admin/menu', label: 'Menu', icon: '🍽' },
  { to: '/admin/coupons', label: 'Coupons', icon: '🎟' },
  { to: '/admin/settings', label: 'Canteen', icon: '⚙️' },
];

/** Chrome for every admin screen: sidebar, live open/closed switch, sign-out. */
export default function AdminLayout({ children, title, subtitle, actions }) {
  const { signOutAdmin } = useAuth();
  const { canteen, refresh } = useCanteen();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(false);

  async function toggleOpen() {
    setBusy(true);
    try {
      const result = await api.canteen.set(!canteen.is_open, '');
      await refresh();
      pushToast({
        type: 'success',
        message: result.is_open ? 'Canteen is now open for orders.' : 'Canteen is now closed.',
      });
    } catch (err) {
      pushToast({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin">
      <aside className="admin__sidebar no-print">
        <Link to="/" className="logo mb-24">
          <span className="logo__mark" aria-hidden="true">
            🍽
          </span>
          FoodFlow
        </Link>

        <div className="admin__open">
          <span className={`dot ${canteen.is_open ? 'dot--ok' : 'dot--off'}`} aria-hidden="true" />
          <div>
            <div className="small bold">{canteen.is_open ? 'Open' : 'Closed'}</div>
            <div className="tiny muted">{canteen.is_open ? 'Taking orders' : 'Orders paused'}</div>
          </div>
          <button
            type="button"
            className={`switch${canteen.is_open ? ' is-on' : ''}`}
            onClick={toggleOpen}
            disabled={busy}
            role="switch"
            aria-checked={canteen.is_open}
            aria-label="Toggle whether the canteen accepts orders"
          >
            <span className="switch__knob" />
          </button>
        </div>

        <nav className="admin__nav" aria-label="Admin sections">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin__link${isActive ? ' is-active' : ''}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin__sidebar-foot">
          <Link to="/" className="admin__link">
            <span aria-hidden="true">🏬</span>
            Student site
          </Link>
          <button
            type="button"
            className="admin__link"
            onClick={() => {
              signOutAdmin();
              navigate('/admin/login');
            }}
          >
            <span aria-hidden="true">↩</span>
            Lock the portal
          </button>
        </div>
      </aside>

      <section className="admin__main">
        <header className="admin__head no-print">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="small muted mt-8">{subtitle}</p>}
          </div>
          {actions && <div className="row gap-8 wrap">{actions}</div>}
        </header>

        {!canteen.is_open && (
          <div className="mb-16 no-print">
            <Alert tone="warning" icon="🔒">
              The canteen is closed, so students cannot place new orders. Orders already paid for can
              still be prepared.
            </Alert>
          </div>
        )}

        {children}
      </section>
    </div>
  );
}