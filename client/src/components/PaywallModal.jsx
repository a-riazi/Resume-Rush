import React, { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ThemedGoogleButton from './ThemedGoogleButton';
import '../styles/PaywallModal.css';

let stripePromise;
const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

console.log('STRIPE_PUBLIC_KEY:', STRIPE_PUBLIC_KEY);
console.log('All env vars:', import.meta.env);

function getStripePromise() {
  if (!STRIPE_PUBLIC_KEY) {
    return null;
  }
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLIC_KEY);
  }
  return stripePromise;
}

export default function PaywallModal({ isOpen, onClose, tier, remaining, limit, bonusGenerations = 0, bonusDaysLeft = null, onUpgrade }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { isAuthenticated } = useAuth();
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');

  const isOneTime = tier === 'one-time';
  const isMonthly = tier === 'monthly';
  const showPlanHeader = isMonthly;
  const hasActiveBonus = isMonthly && bonusGenerations > 0 && (bonusDaysLeft === null || bonusDaysLeft > 0);

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

      if (!STRIPE_PUBLIC_KEY) {
        setError('Stripe publishable key is missing. Set VITE_STRIPE_PUBLIC_KEY and restart the client.');
        return;
      }

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
              onSuccess={(credentialResponse) => {
                window.dispatchEvent(new CustomEvent('googleLogin', { detail: credentialResponse }));
              }}
              onError={() => setError('Login failed. Please try again.')}
              label="Login"
              className="compact"
            />
          </div>
        )}

        <div className="paywall-plans">
          {/* Monthly Plan */}
          <div className="paywall-plan">
            <h3>Monthly Plan</h3>
            <div className="paywall-price">$7.99<span>/month</span></div>
            <ul className="paywall-features">
              <li>✓ 200 generations per month</li>
              <li>✓ 10 jobs at a time</li>
              <li>✓ Full access to all features</li>
              <li>✓ Auto-renews monthly</li>
            </ul>
            <button
              className="paywall-btn paywall-btn-primary"
              onClick={() => handleCheckout('monthly')}
              disabled={loading || isMonthly}
            >
              {loading ? 'Processing...' : isMonthly ? 'Current Plan' : 'Upgrade Now'}
            </button>
          </div>

          {/* One-Time Plan */}
          <div className="paywall-plan">
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
              onClick={() => handleCheckout('one-time')}
              disabled={loading || isOneTime || hasActiveBonus}
            >
              {loading ? 'Processing...' : isOneTime ? 'Current Plan' : hasActiveBonus ? 'One-Time Pass Active' : 'Purchase'}
            </button>
          </div>
        </div>

        <p className="paywall-note">
          All plans include premium resume parsing, AI tailoring, cover letter generation, and PDF/DOCX export.
        </p>
      </div>
    </div>
  );
}
