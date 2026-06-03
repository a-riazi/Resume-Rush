import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ThemedGoogleButton from './ThemedGoogleButton';
import { isOneTimeSubscriptionActive, isMonthlyActive } from '../lib/subscription';
import '../styles/PaywallModal.css';

export default function PaywallModal({ isOpen, onClose, tier, remaining, limit, bonusGenerations, bonusDaysLeft, oneTimeSubscription, monthlySubscription }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { isAuthenticated, loginWithGoogle } = useAuth();
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.resumerush.io');

  const isMonthlySubscribed = tier === 'monthly';
  const isMonthlyCurrentlyActive = isMonthlyActive(monthlySubscription);
  const isOneTimeActive = isOneTimeSubscriptionActive(
    oneTimeSubscription,
    {
      bonusGenerations,
      bonusDaysLeft,
      limit: remaining,
      used: 0,
    },
    null,
  ) || (Number.isFinite(bonusGenerations) && bonusGenerations > 0) || (Number.isFinite(bonusDaysLeft) && bonusDaysLeft > 0);
  const showPlanHeader = isMonthlySubscribed;
  const monthlyButtonLabel = isMonthlyCurrentlyActive ? 'Manage Subscription' : 'Subscribe';
  const oneTimeButtonLabel = isOneTimeActive ? 'Manage Purchase' : 'Purchase';

  useEffect(() => {
    if (isAuthenticated && error) {
      setError(null);
    }
  }, [isAuthenticated, error]);

  if (!isOpen) return null;

  const handleCheckout = async (planType) => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('Please log in first');
        return;
      }

      // Create checkout session
      const response = await axios.post(
        `${API_BASE_URL}/api/checkout`,
        { planType },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { url } = response.data;

      // Redirect to Stripe Checkout URL
      if (url) {
        window.location.href = url;
      } else {
        setError('Checkout URL not provided');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start checkout');
      console.error('Checkout error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanAction = async (planType) => {
    if (planType === 'monthly' && isMonthlyCurrentlyActive) {
      onClose();
      window.location.href = '/account/billing';
      return;
    }

    if (planType === 'one-time' && isOneTimeActive) {
      onClose();
      window.location.href = '/account/billing';
      return;
    }

    await handleCheckout(planType);
  };

  return (
    <div className="paywall-modal-overlay" onClick={onClose}>
      <div className="paywall-modal" onClick={(e) => e.stopPropagation()}>
        <button className="paywall-close" onClick={onClose}>×</button>

        <h2>{showPlanHeader ? 'Your Plan' : 'Upgrade Your Plan'}</h2>
        <p className="paywall-subtitle">
          {showPlanHeader
            ? `Monthly Plan active: ${remaining} of ${limit} generations remaining.`
            : remaining <= 0
              ? `You've reached your limit of ${limit} resumes per month. Upgrade to continue!`
              : 'Upgrade to unlock more generations and higher job limits.'}
        </p>

        {error && <div className="paywall-error">{error}</div>}

        {!isAuthenticated && (
          <div className="paywall-login">
            <p className="paywall-login-text">Please log in to upgrade your plan.</p>
            <ThemedGoogleButton
              onSuccess={async (credentialResponse) => {
                setError(null);
                const credential = credentialResponse?.credential;
                if (!credential) {
                  setError('Google sign-in did not return a credential. Check your localhost OAuth settings.');
                  return;
                }

                const result = await loginWithGoogle(credential);
                if (!result?.success) {
                  setError(result?.error || 'Login failed. Please try again.');
                  return;
                }

                setError(null);
              }}
              onError={() => setError('Google sign-in popup was blocked, closed, or rejected. Check localhost authorization in Google Cloud Console.')}
              label="Login"
              className="compact"
            />
            {error && <div className="auth-inline-error">{error}</div>}
          </div>
        )}

        <div className="paywall-plans">
          {/* Monthly Plan */}
          <div className={`paywall-plan ${isMonthlyCurrentlyActive ? 'plan-active' : ''}`}>
            <h3>Monthly Plan</h3>
            <div className="paywall-price">$7.99<span>/month</span></div>
            <ul className="paywall-features">
              <li>✓ 150 generations per month</li>
              <li>✓ 10 jobs at a time</li>
              <li>✓ Full access to all features</li>
              <li>✓ Auto-renews monthly</li>
            </ul>
            <button
              className="paywall-btn paywall-btn-primary"
              onClick={() => handlePlanAction('monthly')}
              disabled={loading}
            >
              {loading ? 'Processing...' : monthlyButtonLabel}
            </button>
          </div>

          {/* One-Time Plan */}
          <div className={`paywall-plan ${isOneTimeActive ? 'plan-active' : ''}`}>
            <h3>One-Time Plan</h3>
            <div className="paywall-price">$5.00<span>/5 days</span></div>
            <ul className="paywall-features">
              <li>✓ 50 generations in 5 days</li>
              <li>✓ 5 jobs at a time</li>
              <li>✓ Full access to all features</li>
              <li>✓ No auto-renewal</li>
            </ul>
            <button
              className="paywall-btn paywall-btn-secondary"
              onClick={() => handlePlanAction('one-time')}
              disabled={loading}
            >
              {loading ? 'Processing...' : oneTimeButtonLabel}
            </button>
          </div>
        </div>

        <p className="paywall-note">
          All plans include premium resume parsing, AI tailoring, cover letter generation, and PDF/DOCX export.
        </p>
        <p className="paywall-student-note">
          Resume Rush is built and maintained by a single college student. Your support means the world and helps keep this project alive. 🙏
        </p>
      </div>
    </div>
  );
}
