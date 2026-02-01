import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/CheckoutPages.css';

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();

  useEffect(() => {
    // Refresh user data to get updated subscription status
    refreshUser();

    // Redirect after 3 seconds
    const timer = setTimeout(() => {
      navigate('/');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate, refreshUser]);

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
