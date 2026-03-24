import React from 'react';
import '../styles/WarningBanner.css';

export default function WarningBanner({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="warning-banner">
      <div className="warning-banner-content">
        <span className="warning-banner-icon">⚠️</span>
        <span className="warning-banner-text">{message}</span>
        <button className="warning-banner-close" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
