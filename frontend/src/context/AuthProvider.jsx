import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { AuthContext } from './authContext.js';

const TOKEN_KEY = 'comsats.token';

export default function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => localStorage.getItem(TOKEN_KEY) !== null);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let active = true;

    api
      .me(token)
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const login = useCallback(async (credentials) => {
    const data = await api.login(credentials);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  }, []);

  /**
   * Adopt a session that was created elsewhere — the Google callback hands the browser a
   * token in the URL fragment and this stores it, which then loads the user like any
   * other session.
   */
  const adoptToken = useCallback((nextToken) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setLoading(true);
    setToken(nextToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, adoptToken, logout, isAuthenticated: Boolean(user) }),
    [user, token, loading, login, adoptToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
