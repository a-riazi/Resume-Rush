import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    // Log for debugging
    console.error('UI error caught by ErrorBoundary:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app" style={{ padding: '2rem' }}>
          <div className="error-message" style={{ maxWidth: 900, margin: '2rem auto' }}>
            <span>⚠️</span>
            <p>Something went wrong while rendering the page. Please try again or reload.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={this.handleReload} className="btn-primary">Reload App</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
