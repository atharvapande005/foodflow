import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const CanteenContext = createContext(null);

/**
 * Single source of truth for "is the canteen open?".
 *
 * The value is polled while the tab is visible so a student who leaves the app
 * open sees the canteen close. Hidden tabs stop polling to avoid wasting
 * requests, and the banner is refreshed immediately when the tab comes back.
 */
export function CanteenProvider({ children }) {
  const [state, setState] = useState({ is_open: true, message: null, updated_at: null });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.canteen.get();
      setState({
        is_open: next?.is_open ?? true,
        message: next?.message ?? null,
        updated_at: next?.updated_at ?? null,
      });
    } catch {
      // Keep the last known state rather than flashing the wrong banner.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ ...state, canteen: state, loaded, refresh }),
    [state, loaded, refresh]
  );

  return <CanteenContext.Provider value={value}>{children}</CanteenContext.Provider>;
}

export function useCanteen() {
  const context = useContext(CanteenContext);
  if (!context) throw new Error('useCanteen must be used inside <CanteenProvider>');
  return context;
}

export default CanteenContext;