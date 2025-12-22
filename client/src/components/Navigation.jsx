import { Link } from 'react-router-dom'
import '../styles/Navigation.css'

export default function Navigation({ darkMode = false, onToggleDarkMode = () => {} }) {
  return (
    <nav className={`main-nav ${darkMode ? 'dark' : ''}`}>
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <img src="./Logo.png" alt="Resume Rush Logo" className="nav-logo-img" />
          Resume Rush
        </Link>
        <div className="nav-right">
          <ul className="nav-menu">
            <li><Link to="/" className="nav-link">Home</Link></li>
            <li><Link to="/about" className="nav-link">About</Link></li>
            <li><Link to="/faq" className="nav-link">FAQ</Link></li>
            <li><Link to="/privacy" className="nav-link">Privacy</Link></li>
            <li><Link to="/terms" className="nav-link">Terms</Link></li>
          </ul>
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
    </nav>
  )
}
