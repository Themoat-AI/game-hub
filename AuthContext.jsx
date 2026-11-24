import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(getToken() ? 'loading' : 'ready'); // loading | ready

  const clear = useCallback(() => {
    setToken(null);
    setUser(null);
    setStats(null);
  }, []);

  // Restore the session from the stored JWT.
  useEffect(() => {
    if (!getToken()) return;
    const ctrl = new AbortController();
    api
      .me(ctrl.signal)
      .then(({ user, stats }) => {
        setUser(user);
        setStats(stats);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // A dead token is dropped; a network error keeps it so a reload can retry.
        if (err.status === 401) clear();
        else toast.error(err.message);
      })
      .finally(() => setStatus('ready'));
    return () => ctrl.abort();
  }, [clear, toast]);

  // Expired/revoked token mid-session.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
      toast.info('Your session expired — please sign in again.');
    });
  }, [clear, toast]);

  const adopt = useCallback(async ({ token, user }) => {
    setToken(token);
    setUser(user);
    try {
      setStats((await api.me()).stats);
    } catch {
      /* stats are non-critical */
    }
    return user;
  }, []);

  const refreshStats = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await api.me();
      setUser(res.user);
      setStats(res.stats);
    } catch {
      /* ignore — stats refresh is best-effort */
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      stats,
      status,
      isAuthed: Boolean(user),
      isGuest: Boolean(user?.isGuest),
      login: async (identifier, password) => adopt(await api.login({ identifier, password })),
      // When a guest registers, the server upgrades that account in place (scores are kept).
      register: async (username, email, password) => adopt(await api.register({ username, email: email || undefined, password })),
      guest: async () => adopt(await api.guest()),
      logout: () => {
        clear();
        toast.info('Signed out');
      },
      refreshStats,
    }),
    [user, stats, status, adopt, clear, refreshStats, toast],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
