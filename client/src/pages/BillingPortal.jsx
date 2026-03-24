import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import '../styles/CheckoutPages.css';

export default function BillingPortal() {
  const navigate = useNavigate();
  const { isAuthenticated, subscription, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [portalUrl, setPortalUrl] = useState(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.resumerush.io');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    if (!subscription || subscription.tier !== 'monthly') {
      setError('No monthly subscription to manage.');
      setLoading(false);
      return;
    }

    setLoading(false);
  }, [isAuthenticated, navigate, subscription]);

  const handleCancel = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE_URL}/api/stripe/cancel-subscription`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await refreshUser();
      setStatusMessage('Your subscription will cancel at the end of the current billing period.');
    } catch (err) {
      console.error('Cancel subscription failed:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to cancel subscription.');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE_URL}/api/stripe/reactivate-subscription`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await refreshUser();
      setStatusMessage('Your subscription has been reactivated.');
    } catch (err) {
      console.error('Reactivate subscription failed:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to reactivate subscription.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      const response = await axios.post(
        `${API_BASE_URL}/api/stripe/create-portal-session`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data?.url) {
        setPortalUrl(response.data.url);
        window.location.href = response.data.url;
      } else {
        setError('Unable to open Stripe portal.');
      }
    } catch (err) {
      console.error('Open portal failed:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to open Stripe portal.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="checkout-page checkout-loading">
        <div className="checkout-content">
          <div className="loading-spinner"></div>
          <h1>Loading Subscription...</h1>
          <p>Preparing your subscription controls.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkout-page checkout-error">
        <div className="checkout-content">
          <div className="checkout-icon error">✕</div>
          <h1>Error</h1>
          <p>{error}</p>
          <button className="checkout-btn" onClick={() => navigate('/')}>
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page checkout-success">
      <div className="checkout-content">
        <div className="checkout-icon success">✓</div>
        <h1>Manage Subscription</h1>
        <p>You are on the Monthly Plan.</p>
        {subscription?.status && (
          <p>Status: {subscription.status === 'canceled' ? 'Cancels at period end' : subscription.status}</p>
        )}
        <p>
          {subscription?.status === 'canceled' ? 'Access ends:' : 'Renews:'}{' '}
          {subscription?.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
            : 'Unavailable'}
        </p>
        {statusMessage && <p>{statusMessage}</p>}
        <div className="checkout-actions">
          <button className="checkout-btn checkout-btn-secondary" onClick={handleOpenPortal}>
            Manage in Stripe
          </button>
          {subscription?.status === 'canceled' ? (
            <button className="checkout-btn" onClick={handleReactivate}>
              Re-activate Subscription
            </button>
          ) : (
            <button className="checkout-btn" onClick={handleCancel}>
              Cancel Subscription
            </button>
          )}
          {portalUrl && (
            <a href={portalUrl} className="checkout-link" rel="noreferrer">
              Open Stripe Portal
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
