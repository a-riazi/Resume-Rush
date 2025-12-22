import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './index.css'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import About from './pages/About'
import FAQ from './pages/FAQ'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import ErrorBoundary from './ErrorBoundary.jsx'

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
    <Router>
      <Navigation darkMode={darkMode} onToggleDarkMode={handleToggleDarkMode} />
      <Routes>
        <Route path="/" element={<Home darkMode={darkMode} onToggleDarkMode={handleToggleDarkMode} />} />
        <Route path="/about" element={<About darkMode={darkMode} />} />
        <Route path="/faq" element={<FAQ darkMode={darkMode} />} />
        <Route path="/privacy" element={<Privacy darkMode={darkMode} />} />
        <Route path="/terms" element={<Terms darkMode={darkMode} />} />
      </Routes>
    </Router>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
