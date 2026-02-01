import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import '../styles/UserProfile.css';

export default function UserProfile() {
  const { user, usage, subscription, logout, isAuthenticated } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="user-profile">
        <GoogleLogin
          onSuccess={(credentialResponse) => {
            // Handle login in the parent component (App.jsx or Home.jsx)
            window.dispatchEvent(new CustomEvent('googleLogin', { detail: credentialResponse }));
          }}
          onError={() => console.log('Login Failed')}
          text="signin"
          size="large"
        />
      </div>
    );
  }

  const tierLabel = {
    free: 'Free User',
    'auth-free': 'Auth Free',
    monthly: 'Monthly Subscriber',
    'one-time': 'One-Time Plan',
  };

  const remainingGenerations = usage ? usage.limit - usage.used : 0;

  return (
    <div className="user-profile">
      <div className="user-profile-trigger" onClick={() => setShowDropdown(!showDropdown)}>
        {user?.picture ? (
          <img src={user.picture} alt={user.name} className="user-avatar" />
        ) : (
          <div className="user-avatar-placeholder">{user?.name?.charAt(0) || 'U'}</div>
        )}
        <span className="user-name">{user?.name || user?.email}</span>
      </div>

      {showDropdown && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <div className="user-info">
              <strong>{user?.name || 'User'}</strong>
              <small>{user?.email}</small>
            </div>
          </div>

          <div className="user-dropdown-section">
            <div className="tier-badge">{tierLabel[user?.tier]}</div>
            {usage && (
              <div className="usage-info">
                <div className="usage-item">
                  <span>Generations Used:</span>
                  <strong>{usage.used} / {usage.limit}</strong>
                </div>
                <div className="usage-progress">
                  <div
                    className="usage-bar"
                    style={{ width: `${(usage.used / usage.limit) * 100}%` }}
                  />
                </div>
                {remainingGenerations > 0 && (
                  <small>{remainingGenerations} remaining this month</small>
                )}
              </div>
            )}
          </div>

          {subscription && subscription.status === 'active' && (
            <div className="user-dropdown-section">
              <div className="subscription-info">
                <small>Active Plan</small>
                <strong>{subscription.tier}</strong>
                {subscription.currentPeriodEnd && (
                  <small className="renewal-date">
                    Renews: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </small>
                )}
              </div>
            </div>
          )}

          <button className="user-dropdown-logout" onClick={() => { logout(); setShowDropdown(false); }}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
