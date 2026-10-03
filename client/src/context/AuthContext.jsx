import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  getAdminKey,
  hasAdminKey,
  setAccessToken,
  setAdminKey,
  setRefreshHandler,
} from '../lib/api.js';

const AuthContext = createContext(null);

const SESSION_KEY = 'foodflow.session';
const PROFILE_KEY = 'foodflow.profile';

function readStored(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode): the session simply will not persist.
  }
}

/**
 * Holds two independent identities:
 *
 *  - the STUDENT session, from Supabase Auth, persisted so a refresh does not
 *    sign you out. Refreshed automatically when an access token expires.
 *  - the CANTEEN ADMIN key, a shared secret kept in sessionStorage so closing
 *    the tab signs the admin out.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStored(SESSION_KEY));
  const [user, setUser] = useState(() => readStored(PROFILE_KEY));
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKeyState] = useState(() => getAdminKey());

  // ---- refresh + persistence ------------------------------------------------
  const refresh = useCallback(async () => {
    const stored = readStored(SESSION_KEY);
    const refreshToken = stored?.refresh_token;
    if (!refreshToken) return false;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }
      );

      if (!response.ok) return false;

      const fresh = await response.json();
      if (!fresh?.access_token) return false;

      writeStored(SESSION_KEY, fresh);
      setSession(fresh);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Wire the api layer to this refresh function once, so an expired access
  // token is renewed automatically instead of logging the student out.
  useEffect(() => {
    setRefreshHandler(refresh);
  }, [refresh]);

  // ---- lifecycle ------------------------------------------------------------
  // Validates any stored session against the server on boot so a stale or
  // tampered token does not leave the UI in a signed-in-but-broken state.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const stored = readStored(SESSION_KEY);
      if (!stored?.access_token) {
        setLoading(false);
        return;
      }

      setAccessToken(stored.access_token);

      try {
        const { user: profile } = await api.auth.me();
        if (cancelled) return;
        setUser(profile);
        writeStored(PROFILE_KEY, profile);
      } catch {
        if (cancelled) return;
        writeStored(SESSION_KEY, null);
        writeStored(PROFILE_KEY, null);
        setAccessToken(null);
        setSession(null);
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- actions --------------------------------------------------------------
  const applySession = useCallback(async (nextSession, nextUser) => {
    writeStored(SESSION_KEY, nextSession);
    setAccessToken(nextSession?.access_token ?? null);

    setSession(nextSession);
    if (nextUser) {
      setUser(nextUser);
      writeStored(PROFILE_KEY, nextUser);
    }
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { session: nextSession, user: profile } = await api.auth.login(email, password);
      await applySession(nextSession, profile);
      return profile;
    },
    [applySession]
  );

  const signup = useCallback(
    async (payload) => {
      const result = await api.auth.signup(payload);
      if (result.session) {
        await applySession(result.session, result.user);
      }
      return result;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    writeStored(SESSION_KEY, null);
    writeStored(PROFILE_KEY, null);
    setAccessToken(null);
    setSession(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { user: profile } = await api.auth.updateProfile(payload);
    setUser(profile);
    writeStored(PROFILE_KEY, profile);
    return profile;
  }, []);

  // ---- admin key ------------------------------------------------------------
  const signInAdmin = useCallback(async (key) => {
    setAdminKey(key);
    try {
      await api.auth.adminCheck();
      setAdminKeyState(key);
      return true;
    } catch (error) {
      setAdminKey('');
      throw error;
    }
  }, []);

  const signOutAdmin = useCallback(() => {
    setAdminKey('');
    setAdminKeyState('');
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signup,
      logout,
      updateProfile,
      refresh,
      adminKey,
      isAdmin: hasAdminKey() && Boolean(adminKey),
      signInAdmin,
      signOutAdmin,
    }),
    [user, session, loading, login, signup, logout, updateProfile, refresh, adminKey, signInAdmin, signOutAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export default AuthContext;