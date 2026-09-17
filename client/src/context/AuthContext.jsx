import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAuthToken } from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyAuth = (userData, token) => {
    setUser(userData);
    setTokenState(token);
    setAuthToken(token);
  };

  const clearAuth = () => {
    setUser(null);
    setTokenState(null);
    setAuthToken(null);
  };

  // Silent session restore on mount via refresh cookie -> /me
  const restoreSession = useCallback(async () => {
    try {
      // 1. Attempt token refresh using HttpOnly cookie
      const { data } = await api.post('/auth/refresh');
      if (data?.accessToken && data?.user) {
        applyAuth(data.user, data.accessToken);
        return data.user;
      }
    } catch {
      // 2. If refresh fails (no cookie or expired), clear session state cleanly
      clearAuth();
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const signup = async ({ name, email, password }) => {
    const { data } = await api.post('/auth/signup', { name, email, password });
    if (data.success && data.user && data.accessToken) {
      applyAuth(data.user, data.accessToken);
    }
    return data;
  };

  const login = async ({ email, password, keepSignedIn = false }) => {
    const { data } = await api.post('/auth/login', { email, password, keepSignedIn });
    if (data.success && data.user && data.accessToken) {
      applyAuth(data.user, data.accessToken);
    }
    return data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      clearAuth();
    }
  };

  const forgotPassword = async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  };

  const resetPassword = async ({ email, otp, newPassword }) => {
    const { data } = await api.post('/auth/reset-password', { email, otp, newPassword });
    return data;
  };

  const value = {
    user,
    accessToken,
    loading,
    isAuthenticated: Boolean(user),
    login,
    signup,
    logout,
    forgotPassword,
    resetPassword,
    restoreSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
