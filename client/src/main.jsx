import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import About from './pages/About'
import FAQ from './pages/FAQ'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import CheckoutSuccess from './pages/CheckoutSuccess'
import CheckoutCancel from './pages/CheckoutCancel'
import ErrorBoundary from './ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext'

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '773935745374-e7tne0elj25une1e1gugkskdpj8t91ku.apps.googleusercontent.com'

function App() {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const classList = document.body.classList
    if (darkMode) {
      classList.add('dark-mode')
    } else {
      classList.remove('dark-mode')
    }
  }, [darkMode])

  const handleToggleDarkMode = (value) => {
    setDarkMode(Boolean(value))
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <Router>
          <Navigation darkMode={darkMode} onToggleDarkMode={handleToggleDarkMode} />
          <Routes>
            <Route path="/" element={<Home darkMode={darkMode} onToggleDarkMode={handleToggleDarkMode} />} />
            <Route path="/about" element={<About darkMode={darkMode} />} />
            <Route path="/faq" element={<FAQ darkMode={darkMode} />} />
            <Route path="/privacy" element={<Privacy darkMode={darkMode} />} />
            <Route path="/terms" element={<Terms darkMode={darkMode} />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
          </Routes>
        </Router>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
