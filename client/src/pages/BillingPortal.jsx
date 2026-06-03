import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import '../styles/CheckoutPages.css';
import { getApiBaseUrl } from '../lib/api';
import { formatSubscriptionEndLabel, getAppNow, getMonthlyRemaining, getOneTimeRemaining, isSubscriptionExpired, isMonthlyActive, isOneTimeSubscriptionActive } from '../lib/subscription';

export default function BillingPortal() {
  const navigate = useNavigate();
  const { isAuthenticated, usage, subscription, subscriptions, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [portalUrl, setPortalUrl] = useState(null);
  const API_BASE_URL = getApiBaseUrl();
  const monthlySubscription = subscriptions?.monthly || (subscription?.tier === 'monthly' ? subscription : null);
  const oneTimeSubscription = subscriptions?.oneTime || (subscription?.tier === 'one-time' ? subscription : null);
  const monthlyLimit = Number.isFinite(usage?.limit) ? usage.limit : 0;
  const monthlyUsed = Number.isFinite(usage?.used) ? usage.used : 0;
  const monthlyRemaining = getMonthlyRemaining(monthlySubscription, usage);
  
  const msPerDay = 1000 * 60 * 60 * 24;
  const oneTimeSubscriptionEnd = oneTimeSubscription?.currentPeriodEnd ? new Date(oneTimeSubscription.currentPeriodEnd) : null;
  const oneTimeDaysLeft = oneTimeSubscriptionEnd
    ? Math.max(0, Math.ceil((oneTimeSubscriptionEnd - getAppNow()) / msPerDay))
    : null;
  const hasAddOnStyleOneTime = Boolean(monthlySubscription && oneTimeSubscription);
  const oneTimeTotal = 50;
  const oneTimeRemaining = getOneTimeRemaining(oneTimeSubscription, usage, monthlySubscription);
  const totalRemaining = monthlyRemaining + oneTimeRemaining;
  const oneTimeIsExpired = !oneTimeSubscriptionEnd || oneTimeSubscriptionEnd <= getAppNow() || oneTimeRemaining <= 0;
  const oneTimeTimeLabel = `${oneTimeDaysLeft ?? '—'} day${oneTimeDaysLeft === 1 ? '' : 's'} left`;
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    if (!monthlySubscription && !oneTimeSubscription) {
      setError('No active subscription found. Please purchase a plan to continue.');
      setLoading(false);
      return;
    }

    setLoading(false);
  }, [isAuthenticated, navigate, monthlySubscription, oneTimeSubscription]);

  const monthlyStatusLabel = monthlySubscription?.status === 'expired'
    ? 'Expired'
    : monthlySubscription?.status === 'canceled'
      ? 'Cancels at period end'
      : 'Active';
  const monthlyDateValue = formatSubscriptionEndLabel(monthlySubscription);
  const monthlyRemainingLabel = isSubscriptionExpired(monthlySubscription) ? '0 / 150' : `${monthlyRemaining} / ${monthlyLimit || 150}`;
  const oneTimeRemainingLabel = oneTimeIsExpired
    ? '0 / 50'
    : `${oneTimeRemaining} / ${oneTimeTotal}`;
  const monthlyUsagePercent = isSubscriptionExpired(monthlySubscription)
    ? 100
    : (monthlyLimit > 0 ? Math.min(100, (monthlyUsed / monthlyLimit) * 100) : 0);

  // Reactivate is only possible if status='canceled' AND period not yet expired
  const monthlyCanReactivate = monthlySubscription?.status === 'canceled' && isMonthlyActive(monthlySubscription);

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

  const handlePurchaseAgain = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      const response = await axios.post(
        `${API_BASE_URL}/api/checkout`,
        { planType: 'one-time' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { url } = response.data || {};
      if (url) {
        window.location.href = url;
      } else {
        setError('Checkout URL not provided');
      }
    } catch (err) {
      console.error('Purchase again failed:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to start checkout');
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
          {monthlySubscription && (<div className="checkout-detail-card checkout-detail-card-monthly">
            <div className="card-heading-row">
              <h2>Monthly Plan</h2>
              <span className={`plan-pill ${monthlySubscription?.status === 'canceled' ? 'warn' : 'ok'}`}>
                {monthlyStatusLabel}
              </span>
            </div>
            <p>150 generations per month.</p>
            <div className="usage-meter">
              <div className="usage-meter-header">
                <span>Remaining</span>
                <strong>{monthlyRemainingLabel}</strong>
              </div>
              <div className="usage-bar-track">
                <div
                  className="usage-bar-fill"
                  style={{ width: `${monthlyUsagePercent}%` }}
                />
              </div>
              <small>{monthlyUsed} used this month</small>
            </div>
            <div className="detail-list">
              <div className="detail-row">
                <span>Status</span>
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
          </div>)}

          <div className="checkout-detail-card checkout-detail-card-addon">
            <div className="card-heading-row">
              <h2>One-Time Add-on</h2>
              <span className="plan-pill addon">5-Day Pass</span>
            </div>
            <p>+50 generations for up to 5 days.</p>
            <div className="usage-meter">
              <div className="usage-meter-header">
                <span>Remaining</span>
                <strong>{oneTimeRemainingLabel}</strong>
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
                <span>Status</span>
                <strong>{formatSubscriptionEndLabel(oneTimeSubscription)}</strong>
              </div>
              <p className="detail-note">Available again when fully used or time expires</p>
            </div>
            <div className="monthly-card-actions">
              {(!oneTimeSubscription || oneTimeIsExpired) && (
                <button className="checkout-btn" onClick={handlePurchaseAgain} disabled={loading}>
                  {loading ? 'Processing...' : 'Purchase'}
                </button>
              )}
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
