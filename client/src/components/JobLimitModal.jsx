import React from 'react';
import '../styles/JobLimitModal.css';

export default function JobLimitModal({ isOpen, onClose, jobsLimit, onUpgrade, isMaxTier = false }) {
  if (!isOpen) return null;

  return (
    <div className="job-limit-modal-overlay" onClick={onClose}>
      <div className="job-limit-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <div className="modal-icon">⚙️</div>
        
        <h2>Job Limit Reached</h2>
        
        <p className="modal-message">
          You've reached the maximum number of concurrent jobs ({jobsLimit}) for your current plan.
        </p>
        
        <div className="modal-info">
          <p>Your plan allows you to tailor to <strong>{jobsLimit}</strong> job descriptions at a time.</p>
          {isMaxTier ? (
            <p>You're already on the highest plan for concurrent jobs.</p>
          ) : (
            <p>Upgrade to a higher tier to add more concurrent jobs.</p>
          )}
        </div>
        
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {!isMaxTier && (
            <button className="btn-primary" onClick={onUpgrade}>
              Upgrade Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
