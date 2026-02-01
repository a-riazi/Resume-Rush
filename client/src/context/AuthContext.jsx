import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

// Create Auth Context
const AuthContext = createContext();

// Provider Component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [usage, setUsage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');

  // Initialize auth from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      fetchCurrentUser(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  // Listen for Google login events from UI
  useEffect(() => {
    const handler = async (event) => {
      const credential = event?.detail?.credential;
      if (credential) {
        await loginWithGoogle(credential);
      }
    };

    window.addEventListener('googleLogin', handler);
    return () => window.removeEventListener('googleLogin', handler);
  }, [token]);

  // Fetch current user data
  const fetchCurrentUser = async (authToken) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setUser(response.data.user);
      setUsage(response.data.usage);
      setSubscription(response.data.subscription);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
      setError(err.response?.data?.error || 'Failed to fetch user');
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth Login
  const loginWithGoogle = async (googleToken) => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/api/auth/google`, {
        token: googleToken,
      });

      const { token: jwtToken, user: userData } = response.data;

      // Store token
      localStorage.setItem('auth_token', jwtToken);
      setToken(jwtToken);
      setUser(userData);

      // Fetch full user data
      await fetchCurrentUser(jwtToken);
      setError(null);

      return { success: true, user: userData };
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Login failed';
      setError(errorMsg);
      console.error('Login failed:', errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    try {
      if (token) {
        await axios.post(
          `${API_BASE_URL}/api/auth/logout`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
      setUsage(null);
      setSubscription(null);
      setError(null);
    }
  };

  // Update user (after subscription or profile changes)
  const refreshUser = async () => {
    if (token) {
      await fetchCurrentUser(token);
    }
  };

  const value = {
    user,
    token,
    usage,
    subscription,
    loading,
    error,
    loginWithGoogle,
    logout,
    refreshUser,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
