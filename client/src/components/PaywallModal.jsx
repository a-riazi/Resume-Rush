import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';
import '../styles/PaywallModal.css';

let stripePromise;

function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
  }
  return stripePromise;
}

export default function PaywallModal({ isOpen, onClose, tier, remaining, limit, onUpgrade }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');

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

      const { sessionId } = response.data;

      // Redirect to Stripe Checkout
      const stripe = await getStripePromise();
      const result = await stripe.redirectToCheckout({ sessionId });

      if (result.error) {
        setError(result.error.message);
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

        <h2>Upgrade Your Plan</h2>
        <p className="paywall-subtitle">
          You've reached your limit of {limit} resumes per month. Upgrade to continue!
        </p>

        {error && <div className="paywall-error">{error}</div>}

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
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Upgrade Now'}
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
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Upgrade Now'}
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
