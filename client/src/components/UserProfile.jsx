import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemedGoogleButton from './ThemedGoogleButton';
import '../styles/UserProfile.css';

export default function UserProfile() {
  const { user, usage, subscription, logout, isAuthenticated } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="user-profile">
        <ThemedGoogleButton
          onSuccess={(credentialResponse) => {
            // Handle login in the parent component (App.jsx or Home.jsx)
            window.dispatchEvent(new CustomEvent('googleLogin', { detail: credentialResponse }));
          }}
          onError={() => console.log('Login Failed')}
          label="Login"
          className="compact"
        />
      </div>
    );
  }

  const tierLabel = {
    free: 'Free',
    'auth-free': 'Free (Authenticated)',
    monthly: 'Monthly Plan',
    'one-time': 'One-Time Pass',
  };

  const subscriptionLabel = (tier) => tierLabel[tier] || tier;

  const safeUsed = usage?.used ?? 0;
  const safeLimit = usage?.limit ?? 0;
  const remainingGenerations = safeLimit - safeUsed;
  const usagePercent = safeLimit > 0 ? Math.min(100, (safeUsed / safeLimit) * 100) : 0;
  const bonusGenerations = usage?.bonusGenerations ?? 0;
  const rawBonusDaysLeft = usage?.bonusDaysLeft ?? null;
  const bonusDaysLeft = rawBonusDaysLeft !== null ? Math.min(5, Math.max(0, rawBonusDaysLeft)) : null;

  // Calculate countdown text for one-time pass
  const getCountdownText = () => {
    if (user?.tier === 'one-time' && subscription?.currentPeriodEnd) {
      const endDate = new Date(subscription.currentPeriodEnd);
      const now = new Date();
      const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) {
        return `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
      }
    }
    return null;
  };

  return (
    <div className="user-profile">
      <div className="user-profile-trigger" onClick={() => setShowDropdown(!showDropdown)}>
        {user?.picture && !avatarError ? (
          <img
            src={user.picture}
            alt={user.name}
            className="user-avatar"
            onError={() => setAvatarError(true)}
            referrerPolicy="no-referrer"
          />
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
                  <strong>{safeUsed} / {safeLimit}</strong>
                </div>
                <div className="usage-progress">
                  <div
                    className="usage-bar"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                {remainingGenerations > 0 && (
                  <small>
                    {remainingGenerations} remaining
                    {user?.tier === 'monthly' ? ' this month' : ''}
                    {user?.tier === 'one-time' ? ` - ${getCountdownText()}` : ''}
                  </small>
                )}
                {user?.tier === 'monthly' && bonusGenerations > 0 && bonusDaysLeft !== null && (
                  <small>
                    One-Time Pass add-on: {bonusGenerations} bonus generation{bonusGenerations !== 1 ? 's' : ''} · {bonusDaysLeft} day{bonusDaysLeft !== 1 ? 's' : ''} left
                  </small>
                )}
              </div>
            )}
          </div>

          {subscription && ['active', 'canceled'].includes(subscription.status) && subscription.tier === 'monthly' && (
            <div className="user-dropdown-section">
              <div className="subscription-info">
                <small>Active Plan</small>
                <strong>{subscriptionLabel(subscription.tier)}</strong>
                <small className="renewal-date">
                  {subscription.tier === 'one-time'
                    ? `Expires: ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'Unavailable'}`
                    : `Renews: ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'Unavailable'}`}
                </small>
              </div>
              <Link 
                to="/account/billing" 
                className="manage-subscription-link"
                onClick={() => setShowDropdown(false)}
              >
                Manage Subscription
              </Link>
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
