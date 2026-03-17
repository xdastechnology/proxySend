import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../lib/api';

const AuthContext = createContext(null);
const AUTH_BOOT_TIMEOUT_MS = 6000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, AUTH_BOOT_TIMEOUT_MS);

    try {
      const res = await authApi.me({ signal: controller.signal });
      setUser(res.data.user);
    } catch {
      setUser(null);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (data) => {
    const res = await authApi.login(data);
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (data) => {
    const res = await authApi.register(data);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const updateUser = (updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
