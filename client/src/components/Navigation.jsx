import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/Navigation.css'
import AdsTxtStatus from './AdsTxtStatus'
import UserProfile from './UserProfile'
import { getSimulatedDate, isTimeTravelEnabled, setTimeTravelEnabled } from '../lib/devTime'

export default function Navigation({ darkMode = false, onToggleDarkMode = () => {} }) {
  const { user } = useAuth()
  const [timeTravelOn, setTimeTravelOn] = useState(() => import.meta.env.DEV ? isTimeTravelEnabled() : false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const sync = () => setTimeTravelOn(isTimeTravelEnabled())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const handleUpgradeClick = () => {
    window.dispatchEvent(new CustomEvent('openUpgrade'))
  }

  const handleHomeClick = () => {
    window.dispatchEvent(new CustomEvent('resetHome'))
  }

  const handleToggleTimeTravel = () => {
    const nextValue = !timeTravelOn
    setTimeTravelEnabled(nextValue)
    setTimeTravelOn(nextValue)
  }

  return (
    <nav className={`main-nav ${darkMode ? 'dark' : ''}`}>
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <img src="/Logo.png" alt="Resume Rush Logo" className="nav-logo-img" />
          Resume Rush
        </Link>
        <div className="nav-right">
          <ul className="nav-menu">
            <li><Link to="/" className="nav-link" onClick={handleHomeClick}>Home</Link></li>
            <li><Link to="/about" className="nav-link">About</Link></li>
            <li><Link to="/faq" className="nav-link">FAQ</Link></li>
            <li><Link to="/privacy" className="nav-link">Privacy</Link></li>
            <li><Link to="/terms" className="nav-link">Terms</Link></li>
            {user?.isAdmin && <li><Link to="/admin" className="nav-link">Admin</Link></li>}
          </ul>
          <Link to="/?upgrade=1" className="nav-upgrade-btn" onClick={handleUpgradeClick}>
            Upgrade
          </Link>
          <UserProfile />
          <AdsTxtStatus />
          {import.meta.env.DEV && (
            <button
              type="button"
              className={`nav-toggle nav-dev-toggle ${timeTravelOn ? 'active' : ''}`}
              onClick={handleToggleTimeTravel}
              title={`Simulated date: ${getSimulatedDate().toLocaleDateString()}`}
            >
              {timeTravelOn ? 'Time Travel: On' : 'Time Travel: Off'}
            </button>
          )}
          <button
            type="button"
            className="nav-toggle"
            aria-pressed={darkMode}
            onClick={() => onToggleDarkMode(!darkMode)}
          >
            {darkMode ? 'Light' : 'Dark'} Mode
          </button>
        </div>
      </div>
      <div className="nav-disclaimer" role="note" aria-live="polite">
        Early development notice: Resume Rush is actively improving and may occasionally have bugs or temporary issues. Please review all generated documents before use.
      </div>
    </nav>
  )
}