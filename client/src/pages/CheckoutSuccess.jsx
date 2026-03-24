import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/CheckoutPages.css';

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');

  useEffect(() => {
    const syncAndRefresh = async () => {
      try {
        const sessionId = searchParams.get('session_id');
        const token = localStorage.getItem('auth_token');

        if (sessionId && token) {
          await axios.post(
            `${API_BASE_URL}/api/stripe/sync-checkout-session`,
            { sessionId },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } else if (sessionId) {
          await axios.post(
            `${API_BASE_URL}/api/stripe/sync-checkout-session-public`,
            { sessionId }
          );
        }
      } catch (err) {
        const sessionId = searchParams.get('session_id');
        const message = err.response?.data || err.message;
        console.error('Checkout sync failed:', message);

        if (sessionId) {
          try {
            await axios.post(
              `${API_BASE_URL}/api/stripe/sync-checkout-session-public`,
              { sessionId }
            );
          } catch (fallbackError) {
            console.error('Public checkout sync failed:', fallbackError.response?.data || fallbackError.message);
          }
        }
      } finally {
        // Refresh user data to get updated subscription status
        refreshUser();

        // Redirect after 3 seconds
        const timer = setTimeout(() => {
          navigate('/');
        }, 3000);

        return () => clearTimeout(timer);
      }
    };

    syncAndRefresh();
  }, [API_BASE_URL, navigate, refreshUser, searchParams]);

  return (
    <div className="checkout-page checkout-success">
      <div className="checkout-content">
        <div className="checkout-icon success">✓</div>
        <h1>Payment Successful!</h1>
        <p>Thank you for upgrading your Resume Rush account.</p>
        <div className="success-details">
          <p>Your new plan is now active and ready to use.</p>
          <ul>
            <li>✓ Your subscription has been activated</li>
            <li>✓ You can now access premium features</li>
            <li>✓ Redirecting you back to the app...</li>
          </ul>
        </div>
        <button className="checkout-btn" onClick={() => navigate('/')}>
          Return to Home
        </button>
      </div>
    </div>
  );
}
