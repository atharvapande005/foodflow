import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCanteen } from '../context/CanteenContext.jsx';
import MenuCard from '../components/MenuCard.jsx';
import { Alert, MenuSkeleton } from '../components/ui.jsx';
import { categoryMeta, formatNumber } from '../lib/format.js';

export default function Home() {
  const { cart, add, setQty } = useCart();
  const { is_open: isOpen } = useCanteen();
  const { user, isAuthenticated } = useAuth();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const quantityOf = useCallback(
    (id) => cart.find((line) => line.menu_item_id === id)?.quantity ?? 0,
    [cart]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [menu, categoryList, home] = await Promise.all([
          api.menu.list(),
          api.menu.categories(),
          api.recommendations.home().catch(() => null),
        ]);

        if (cancelled) return;

        setItems(menu ?? []);
        setCategories(categoryList ?? []);
        setRecommendations(home);
        setStats({
          items: menu?.length ?? 0,
          categories: categoryList?.length ?? 0,
          cheapest: menu?.length
            ? Math.min(...menu.map((item) => Number(item.price)))
            : 0,
        });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = useMemo(
    () => (items ?? []).filter((item) => item.is_available).slice(0, 8),
    [items]
  );

  const firstName = (user?.full_name || '').split(' ')[0];

  return (
    <div className="page">
      <section className="hero">
        <div className="hero__content">
          <span className="badge" style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }}>
            {isOpen ? '● Accepting orders' : '● Currently closed'}
          </span>

          <h1 className="mt-16">
            {firstName ? `Hey ${firstName}, ` : ''}skip the queue at the counter.
          </h1>

          <p>
            {isAuthenticated
              ? 'Order ahead, pay by card or UPI, and walk in with your token number already on the screen.'
              : 'Order ahead, pay by card or UPI, and walk in with your token number already on the screen. No account needed to order.'}
          </p>

          <div className="hero__actions">
            <Link to="/menu" className="btn btn--lg" style={{ background: '#fff', color: 'var(--brand-700)' }}>
              Browse the menu
            </Link>
            <Link
              to="/track"
              className="btn btn--lg btn--ghost"
              style={{ color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)' }}
            >
              Track my order
            </Link>
          </div>

          {stats && (
            <div className="hero__stats">
              <div className="hero__stat">
                <strong>{formatNumber(stats.items)}</strong>
                <span>items on the menu</span>
              </div>
              <div className="hero__stat">
                <strong>{formatNumber(stats.categories)}</strong>
                <span>categories</span>
              </div>
              <div className="hero__stat">
                <strong>₹{formatNumber(stats.cheapest)}</strong>
                <span>cheapest item</span>
              </div>
              <div className="hero__stat">
                <strong>~8 min</strong>
                <span>average prep</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {!isOpen && (
        <div className="mt-24">
          <Alert tone="warning" icon="🔒">
            <strong>The canteen is closed right now.</strong> You can still browse the menu and build a
            cart, and place your order as soon as the kitchen reopens.
          </Alert>
        </div>
      )}

      {error && (
        <div className="mt-24">
          <Alert tone="error">
            <strong>Could not load the menu.</strong>
            <div className="mt-8">{error}</div>
          </Alert>
        </div>
      )}

      {recommendations?.personalised?.length > 0 && (
        <section className="mt-32">
          <div className="section-head">
            <div>
              <h2>Picked for you</h2>
              <p>{recommendations.basis} — we learn from what pairs with what people actually buy.</p>
            </div>
          </div>
          <div className="menu-grid">
            {recommendations.personalised.slice(0, 4).map((entry) => (
              <MenuCard
                key={entry.item.id}
                item={entry.item}
                quantity={quantityOf(entry.item.id)}
                onAdd={add}
                onSetQty={(next) => setQty(entry.item.id, next)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-32">
        <div className="section-head">
          <div>
            <h2>{recommendations?.personalised?.length ? 'Popular right now' : 'Start here'}</h2>
            <p>
              {recommendations?.personalised?.length
                ? 'Trending across the canteen this week.'
                : 'A few of our most ordered dishes.'}
            </p>
          </div>
          <Link to="/menu" className="btn btn--secondary btn--sm">
            See full menu →
          </Link>
        </div>

        {loading ? (
          <MenuSkeleton count={4} />
        ) : (
          <div className="menu-grid">
            {featured.slice(0, 4).map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                quantity={quantityOf(item.id)}
                onAdd={add}
                onSetQty={(next) => setQty(item.id, next)}
              />
            ))}
          </div>
        )}
      </section>

      {recommendations?.trending?.length > 0 && (
        <section className="mt-32">
          <div className="section-head">
            <div>
              <h2>Trending this week</h2>
              <p>Ranked by how many portions went out in the last 7 days.</p>
            </div>
          </div>
          <div className="menu-grid">
            {recommendations.trending.slice(0, 4).map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                compact
                quantity={quantityOf(item.id)}
                onAdd={add}
                onSetQty={(next) => setQty(item.id, next)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-32">
        <div className="section-head">
          <div>
            <h2>Browse by category</h2>
            <p>{formatNumber(stats?.items ?? 0)} dishes across {categories.length} categories.</p>
          </div>
        </div>

        <div className="grid grid--cards">
          {categories.map((entry) => {
            const meta = categoryMeta(entry.category);
            return (
              <Link
                key={entry.category}
                to={`/menu?category=${entry.category}`}
                className="card card--pad between"
                style={{ textDecoration: 'none' }}
              >
                <div>
                  <div style={{ fontSize: '1.7rem' }} aria-hidden="true">
                    {meta.icon}
                  </div>
                  <div className="bold mt-8">{meta.label}</div>
                  <div className="tiny muted">
                    {entry.available} available · {entry.total} total
                  </div>
                </div>
                <span className="muted" aria-hidden="true">
                  →
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}