/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// Create Auth Context
const AuthContext = createContext();

// Provider Component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [usage, setUsage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subscriptions, setSubscriptions] = useState({ monthly: null, oneTime: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.resumerush.io');

  // Initialize auth from localStorage on mount
  const fetchCurrentUser = useCallback(async (authToken, options = {}) => {
    const {
      preserveSessionOnError = false,
      fallbackUser = null,
    } = options;

    try {
      const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setUser(response.data.user);
      setUsage(response.data.usage);
      setSubscription(response.data.subscription);
      setSubscriptions(response.data.subscriptions || { monthly: null, oneTime: null });
      setError(null);
      return true;
    } catch (err) {
      console.error('Failed to fetch user:', err);
      const errorMessage = err.response?.data?.error || 'Failed to fetch user';

      if (!preserveSessionOnError) {
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
        setUsage(null);
        setSubscription(null);
        setSubscriptions({ monthly: null, oneTime: null });
      } else if (fallbackUser) {
        setUser(fallbackUser);
      }

      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      fetchCurrentUser(storedToken);
    } else {
      setLoading(false);
    }
  }, [fetchCurrentUser]);

  // Google OAuth Login
  const loginWithGoogle = useCallback(async (googleToken) => {
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
      const profileLoaded = await fetchCurrentUser(jwtToken, {
        preserveSessionOnError: true,
        fallbackUser: userData,
      });
      if (!profileLoaded) {
        console.warn('[Auth] Signed in, but failed to load the full profile. Keeping the session alive.');
      } else {
        setError(null);
      }

      return { success: true, user: userData };
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Login failed';
      const errorDetails = err.response?.data?.details;
      const networkHint = err.code === 'ERR_NETWORK'
        ? 'Network/CORS failure. Check that the server is running on localhost:5000 and that Google OAuth allows http://localhost:5173.'
        : null;
      const displayError = [errorMsg, errorDetails, networkHint].filter(Boolean).join(' · ');
      setError(displayError);
      console.error('Login failed:', displayError, err.response?.data || err);
      return { success: false, error: displayError };
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, fetchCurrentUser]);

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
  }, [loginWithGoogle]);

  useEffect(() => {
    const handleFocus = () => {
      if (token) {
        fetchCurrentUser(token);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [token, fetchCurrentUser]);

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
      setSubscriptions({ monthly: null, oneTime: null });
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
    subscriptions,
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
