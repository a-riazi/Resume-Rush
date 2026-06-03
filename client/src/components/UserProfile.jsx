import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemedGoogleButton from './ThemedGoogleButton'
import '../styles/UserProfile.css'

export default function UserProfile() {
  const { user, logout, isAuthenticated, loginWithGoogle, error } = useAuth()
  const [showDropdown, setShowDropdown] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const [loginError, setLoginError] = useState('')

  if (!isAuthenticated) {
    return (
      <div className="user-profile">
        <ThemedGoogleButton
          onSuccess={async (credentialResponse) => {
            setLoginError('')
            const credential = credentialResponse?.credential
            if (!credential) {
              const message = 'Google sign-in did not return a credential. Try again or recheck your Google OAuth settings for localhost.'
              setLoginError(message)
              console.error('Google login failed: missing credential payload')
              return
            }

            const result = await loginWithGoogle(credential)
            if (!result?.success) {
              const message = result?.error || 'Google login failed. Check localhost authorization in Google Cloud Console.'
              setLoginError(message)
              console.error('Google login failed:', message)
            }
          }}
          onError={() => {
            const message = 'Google sign-in popup was blocked, closed, or rejected. Check your localhost origin in Google Cloud Console (http://localhost:5173).'
            setLoginError(message)
            console.error('Google login popup failed')
          }}
          label="Login"
          className="compact"
        />
        {(loginError || error) && <div className="auth-inline-error">{loginError || error}</div>}
      </div>
    )
  }

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

          <div className="user-dropdown-actions">
            <Link
              to="/account/billing"
              className="user-dropdown-action primary"
              onClick={() => setShowDropdown(false)}
            >
              Manage Subscription
            </Link>
            <button
              className="user-dropdown-action"
              onClick={() => {
                logout()
                setShowDropdown(false)
              }}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
