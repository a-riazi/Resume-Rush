import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import '../styles/CheckoutPages.css';

export default function BillingPortal() {
  const navigate = useNavigate();
  const { isAuthenticated, usage, subscription, subscriptions, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [portalUrl, setPortalUrl] = useState(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.resumerush.io');
  const monthlySubscription = subscriptions?.monthly || (subscription?.tier === 'monthly' ? subscription : null);
  const oneTimeSubscription = subscriptions?.oneTime || (subscription?.tier === 'one-time' ? subscription : null);
  const monthlyLimit = Number.isFinite(usage?.limit) ? usage.limit : 0;
  const monthlyUsed = Number.isFinite(usage?.used) ? usage.used : 0;
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);
  const bonusRemaining = Number.isFinite(usage?.bonusGenerations) ? usage.bonusGenerations : 0;
  const bonusDaysLeft = Number.isFinite(usage?.bonusDaysLeft) ? usage.bonusDaysLeft : null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const oneTimeSubscriptionEnd = oneTimeSubscription?.currentPeriodEnd ? new Date(oneTimeSubscription.currentPeriodEnd) : null;
  const oneTimeDaysLeft = oneTimeSubscriptionEnd
    ? Math.max(0, Math.ceil((oneTimeSubscriptionEnd - new Date()) / msPerDay))
    : null;
  const hasAddOnStyleOneTime = Boolean(monthlySubscription && oneTimeSubscription);
  const oneTimeTotal = hasAddOnStyleOneTime ? 50 : (usage?.limit || 50);
  const oneTimeRemaining = hasAddOnStyleOneTime
    ? bonusRemaining
    : Math.max(0, (Number.isFinite(usage?.limit) ? usage.limit : 0) - (Number.isFinite(usage?.used) ? usage.used : 0));
  const totalRemaining = monthlyRemaining + oneTimeRemaining;
  const monthlyCanReactivate = monthlySubscription?.status === 'canceled';
  const oneTimeTimeLabel = hasAddOnStyleOneTime
    ? `${bonusDaysLeft ?? '—'} day${bonusDaysLeft === 1 ? '' : 's'} left`
    : `${oneTimeDaysLeft ?? '—'} day${oneTimeDaysLeft === 1 ? '' : 's'} left`;
  const oneTimeEndsOn = oneTimeSubscription?.currentPeriodEnd
    ? new Date(oneTimeSubscription.currentPeriodEnd).toLocaleDateString()
    : 'Unavailable';

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    if (!monthlySubscription) {
      setError('No monthly subscription to manage.');
      setLoading(false);
      return;
    }

    setLoading(false);
  }, [isAuthenticated, navigate, monthlySubscription]);

  const monthlyStatusLabel = monthlySubscription?.status === 'canceled' ? 'Cancels at period end' : 'Active';
  const monthlyDateLabel = monthlySubscription?.status === 'canceled' ? 'Expires:' : 'Renews:';
  const monthlyDateValue = monthlySubscription?.currentPeriodEnd
    ? new Date(monthlySubscription.currentPeriodEnd).toLocaleDateString()
    : 'Unavailable';

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
      <div className="checkout-page checkout-loading billing-shell">
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
      <div className="checkout-page checkout-error billing-shell">
        <div className="checkout-content billing-content">
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
    <div className="checkout-page checkout-success billing-shell">
      <div className="checkout-content billing-content billing-content-wide">
        <div className="billing-hero">
          <div className="checkout-icon success">✓</div>
          <div className="billing-hero-copy">
            <h1>Manage Subscription</h1>
            <p>Monthly subscription and one-time add-on are tracked separately.</p>
          </div>
          <div className="billing-total-card">
            <span>Total remaining</span>
            <strong>{totalRemaining}</strong>
            <small>Combined generations left across both plans</small>
          </div>
        </div>

        <div className="checkout-details-grid">
          <div className="checkout-detail-card checkout-detail-card-monthly">
            <div className="card-heading-row">
              <h2>Monthly Plan</h2>
              <span className={`plan-pill ${monthlySubscription?.status === 'canceled' ? 'warn' : 'ok'}`}>
                {monthlyStatusLabel}
              </span>
            </div>
            <p>200 generations per month.</p>
            <div className="usage-meter">
              <div className="usage-meter-header">
                <span>Remaining</span>
                <strong>{monthlyRemaining} / {monthlyLimit || 200}</strong>
              </div>
              <div className="usage-bar-track">
                <div
                  className="usage-bar-fill"
                  style={{ width: `${monthlyLimit > 0 ? Math.min(100, (monthlyUsed / monthlyLimit) * 100) : 0}%` }}
                />
              </div>
              <small>{monthlyUsed} used this month</small>
            </div>
            <div className="detail-list">
              <div className="detail-row">
                <span>{monthlyDateLabel}</span>
                <strong>{monthlyDateValue}</strong>
              </div>
              <div className="detail-row">
                <span>Billing</span>
                <strong>Can be canceled or reactivated</strong>
              </div>
            </div>
            <div className="monthly-card-actions">
              {monthlyCanReactivate ? (
                <button className="checkout-btn" onClick={handleReactivate}>
                  Re-activate Subscription
                </button>
              ) : (
                <button className="checkout-btn" onClick={handleCancel}>
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>

          <div className="checkout-detail-card checkout-detail-card-addon">
            <div className="card-heading-row">
              <h2>One-Time Add-on</h2>
              <span className="plan-pill addon">5-Day Pass</span>
            </div>
            <p>+50 generations for up to 5 days.</p>
            <div className="usage-meter">
              <div className="usage-meter-header">
                <span>Remaining</span>
                <strong>{oneTimeRemaining} / {oneTimeTotal}</strong>
              </div>
              <div className="usage-bar-track">
                <div
                  className="usage-bar-fill addon"
                  style={{ width: `${oneTimeTotal > 0 ? Math.min(100, ((oneTimeTotal - oneTimeRemaining) / oneTimeTotal) * 100) : 0}%` }}
                />
              </div>
              <small>{oneTimeTimeLabel}</small>
            </div>
            <div className="detail-list">
              <div className="detail-row">
                <span>Expires:</span>
                <strong>{oneTimeEndsOn}</strong>
              </div>
              <p className="detail-note">Available again when fully used or time expires</p>
            </div>
          </div>
        </div>

        {statusMessage && <div className="status-banner success">{statusMessage}</div>}

        <div className="checkout-actions">
          <button className="checkout-btn checkout-btn-secondary" onClick={handleOpenPortal}>
            Manage in Stripe
          </button>
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
