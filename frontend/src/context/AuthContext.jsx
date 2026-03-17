import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../lib/api';

const AuthContext = createContext(null);
const AUTH_BOOT_TIMEOUT_MS = 6000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, AUTH_BOOT_TIMEOUT_MS);

    try {
      const [userRes, sellerRes] = await Promise.allSettled([
        authApi.me({ signal: controller.signal }),
        authApi.sellerMe({ signal: controller.signal }),
      ]);

      setUser(userRes.status === 'fulfilled' ? userRes.value.data.user : null);
      setSeller(sellerRes.status === 'fulfilled' ? sellerRes.value.data.seller : null);
    } catch {
      setUser(null);
      setSeller(null);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const login = async (data) => {
    const res = await authApi.login(data);
    setUser(res.data.user);
    setSeller(null);
    return res.data.user;
  };

  const sellerLogin = async (data) => {
    const res = await authApi.sellerLogin(data);
    setSeller(res.data.seller);
    setUser(null);
    return res.data.seller;
  };

  const register = async (data) => {
    const res = await authApi.register(data);
    setUser(res.data.user);
    setSeller(null);
    return res.data.user;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    setSeller(null);
  };

  const updateUser = (updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const updateSeller = (updates) => {
    setSeller((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        seller,
        loading,
        login,
        sellerLogin,
        register,
        logout,
        updateUser,
        updateSeller,
        refetch: fetchSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
