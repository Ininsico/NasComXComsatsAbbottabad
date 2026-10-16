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

  const signup = useCallback(async (details) => {
    const data = await api.signup(details);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, signup, logout, isAuthenticated: Boolean(user) }),
    [user, token, loading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
