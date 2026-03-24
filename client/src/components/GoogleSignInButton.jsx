import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import '../styles/GoogleSignInButton.css';

export default function GoogleSignInButton({ onSuccess, onError, text = 'signin', size = 'large', className = '' }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className={`google-signin-wrapper ${className}`}>
      <div 
        className={`google-signin-container ${isHovered ? 'hovered' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          text={text}
          size={size}
        />
      </div>
    </div>
  );
}
