import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/CheckoutPages.css';

export default function CheckoutCancel() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect after 5 seconds
    const timer = setTimeout(() => {
      navigate('/');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="checkout-page checkout-cancel">
      <div className="checkout-content">
        <div className="checkout-icon cancel">✕</div>
        <h1>Payment Cancelled</h1>
        <p>Your payment was not completed.</p>
        <div className="cancel-details">
          <p>No charges were made to your account.</p>
          <ul>
            <li>You can try again whenever you're ready</li>
            <li>Your data is safe and secure</li>
            <li>Redirecting you back in a moment...</li>
          </ul>
        </div>
        <button className="checkout-btn" onClick={() => navigate('/')}>
          Return to Home
        </button>
      </div>
    </div>
  );
}
