import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import '../styles/ThemedGoogleButton.css';

export default function ThemedGoogleButton({ onSuccess, onError, label = 'Continue with Google', className = '' }) {
  return (
    <div className={`themed-google-wrapper ${className}`} role="button" aria-label={label}>
      <div className="themed-google-visual">
        <span className="themed-google-logo" aria-hidden="true">G</span>
        <span className="themed-google-text">{label}</span>
      </div>
      <div className="themed-google-overlay" aria-hidden="true">
        <GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          text="signin"
          size="large"
        />
      </div>
    </div>
  );
}
