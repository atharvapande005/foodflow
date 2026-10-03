import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useCart } from '../context/CartContext.jsx';
import { useCanteen } from '../context/CanteenContext.jsx';
import MenuCard from '../components/MenuCard.jsx';
import Modal from '../components/Modal.jsx';
import ItemDetail from '../components/ItemDetail.jsx';
import { Alert, EmptyState, MenuSkeleton } from '../components/ui.jsx';
import { categoryMeta, formatMoney } from '../lib/format.js';

const SORTS = [
  { value: 'default', label: 'Recommended' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export default function Menu() {
  const { cart, add, setQty } = useCart();
  const { is_open: isOpen, message } = useCanteen();
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get('category') || 'all';
  const sort = searchParams.get('sort') || 'default';

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [vegOnly, setVegOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Keep the URL in sync so a filtered menu can be shared or bookmarked.
  useEffect(() => {
    const next = {};
    if (category !== 'all') next.category = category;
    if (sort !== 'default') next.sort = sort;
    if (debouncedSearch) next.search = debouncedSearch;
    setSearchParams(next, { replace: true });
  }, [category, sort, debouncedSearch, setSearchParams]);

  useEffect(() => {
    api.menu
      .categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    api.menu
      .list({ category, search: debouncedSearch, sort, available: availableOnly ? 'true' : '' })
      .then((result) => {
        if (!cancelled) setItems(result ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, sort, debouncedSearch, availableOnly]);

  const quantityOf = useCallback(
    (id) => cart.find((line) => line.menu_item_id === id)?.quantity ?? 0,
    [cart]
  );

  const visibleItems = useMemo(
    () => (vegOnly ? items.filter((item) => item.is_veg) : items),
    [items, vegOnly]
  );

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const item of visibleItems) {
      const key = item.category || 'snacks';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()];
  }, [visibleItems]);

  const detailItem = detailId ? items.find((item) => item.id === detailId) : null;
  const activeCategoryMeta = category === 'all' ? null : categoryMeta(category);

  return (
    <div className="page">
      <div className="mt-24">
        <div className="section-head">
          <div>
            <h1>{activeCategoryMeta ? activeCategoryMeta.label : 'Full menu'}</h1>
            <p>
              {loading
                ? 'Loading dishes…'
                : `${visibleItems.length} dish${visibleItems.length === 1 ? '' : 'es'} available`}
              {!isOpen && ' · canteen is currently closed'}
            </p>
          </div>

          <select
            className="select"
            style={{ width: 'auto' }}
            value={sort}
            onChange={(event) => setSearchParams((current) => {
              const next = new URLSearchParams(current);
              if (event.target.value === 'default') next.delete('sort');
              else next.set('sort', event.target.value);
              return next;
            })}
            aria-label="Sort menu"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {!isOpen && (
          <div className="mb-16">
            <Alert tone="warning" icon="🔒">
              {message || 'The canteen is closed. You can build a cart now and order later.'}
            </Alert>
          </div>
        )}

        <div className="between wrap gap-12 mb-16">
          <div className="grow" style={{ minWidth: 240, maxWidth: 420 }}>
            <input
              className="input"
              type="search"
              placeholder="Search for samosa, biryani, chai…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search the menu"
            />
          </div>

          <div className="row gap-12 wrap">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={vegOnly}
                onChange={(event) => setVegOnly(event.target.checked)}
              />
              Veg only
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(event) => setAvailableOnly(event.target.checked)}
              />
              Hide sold out
            </label>
          </div>
        </div>

        <div className="chip-row mb-24" role="tablist" aria-label="Menu categories">
          <button
            type="button"
            className={`chip${category === 'all' ? ' is-active' : ''}`}
            onClick={() => setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('category');
              return next;
            })}
            aria-pressed={category === 'all'}
          >
            All
            <span className="chip__count">{categories.reduce((sum, c) => sum + c.total, 0)}</span>
          </button>

          {categories.map((entry) => {
            const meta = categoryMeta(entry.category);
            return (
              <button
                key={entry.category}
                type="button"
                className={`chip${category === entry.category ? ' is-active' : ''}`}
                onClick={() => setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('category', entry.category);
                  return next;
                })}
                aria-pressed={category === entry.category}
              >
                <span aria-hidden="true">{meta.icon}</span>
                {meta.label}
                <span className="chip__count">{entry.total}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <Alert tone="error">
            <strong>Could not load the menu.</strong>
            <div className="mt-8">{error}</div>
          </Alert>
        )}

        {loading ? (
          <MenuSkeleton count={8} />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="Nothing matches that"
            message={
              debouncedSearch
                ? `No dishes match "${debouncedSearch}". Try a different word or clear the filters.`
                : 'Try clearing the filters to see the whole menu.'
            }
            action={
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setSearch('');
                  setVegOnly(false);
                  setAvailableOnly(false);
                  setSearchParams({}, { replace: true });
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          grouped.map(([groupName, groupItems]) => {
            const meta = categoryMeta(groupName);
            return (
              <section key={groupName} className="mb-32">
                <div className="section-head">
                  <div>
                    <h2>
                      <span aria-hidden="true" style={{ marginRight: 8 }}>
                        {meta.icon}
                      </span>
                      {meta.label}
                    </h2>
                    <p>{groupItems.length} items</p>
                  </div>
                </div>

                <div className="menu-grid">
                  {groupItems.map((item) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      quantity={quantityOf(item.id)}
                      onAdd={add}
                      onSetQty={(next) => setQty(item.id, next)}
                      onOpen={() => setDetailId(item.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <Modal
        open={Boolean(detailItem)}
        onClose={() => setDetailId(null)}
        size="lg"
        title={detailItem?.name}
      >
        {detailItem && (
          <ItemDetail
            item={detailItem}
            quantity={quantityOf(detailItem.id)}
            onAdd={(item, quantity) => {
              add(item, quantity);
              setDetailId(null);
            }}
            onSetQty={(next) => setQty(detailItem.id, next)}
          />
        )}
      </Modal>
    </div>
  );
}

export { formatMoney };