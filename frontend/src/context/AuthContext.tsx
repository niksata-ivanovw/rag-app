import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { clearToken, getToken, setToken, subscribeToken } from '../api/authToken';
import type { AuthUser } from '../types';
import { AuthContext } from './authContextInstance';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(getToken);
  // The account the user belongs to, tagged with the token it was loaded for
  const [loaded, setLoaded] = useState<{ token: string; user: AuthUser } | null>(null);

  // Login/logout here, in another tab, or a 401 from the API (which clears the token)
  useEffect(() => subscribeToken(setTokenState), []);

  // Load the account for the current token; a 401 here logs out via the API client
  useEffect(() => {
    if (!token) return;
    let active = true;
    api
      .me()
      .then((user) => {
        if (active) setLoaded({ token, user });
      })
      .catch((err) => console.warn('Failed to load the current user:', err));
    return () => {
      active = false;
    };
  }, [token]);

  const user = token && loaded?.token === token ? loaded.user : null;

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login(email.trim(), password);
    setToken(access_token);
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await api.register(email.trim(), password);
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout }}>{children}</AuthContext.Provider>
  );
};
