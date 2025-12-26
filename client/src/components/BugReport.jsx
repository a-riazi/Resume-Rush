import { useState } from 'react'
import axios from 'axios'
import '../styles/BugReport.css'

// For dev mode, use localhost:5000; for production, use the env variable
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '')

console.log('[BugReport] API_BASE_URL:', API_BASE_URL)
console.log('[BugReport] DEV mode:', import.meta.env.DEV)

export default function BugReport() {
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    email: '',
    steps: '',
    screenshot: null,
  })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      // Limit file size to 5MB
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB')
        return
      }
      setFormData((prev) => ({
        ...prev,
        screenshot: file,
      }))
      setError(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Validate form
    if (!formData.title.trim()) {
      setError('Please enter a bug title')
      return
    }
    if (!formData.description.trim()) {
      setError('Please describe the bug')
      return
    }
    if (!formData.email.trim()) {
      setError('Please enter your email')
      return
    }

    setLoading(true)

    try {
      const emailFormData = new FormData()
      emailFormData.append('to', 'resumerushio@gmail.com')
      emailFormData.append('subject', `Bug Report: ${formData.title}`)
      emailFormData.append('title', formData.title)
      emailFormData.append('description', formData.description)
      emailFormData.append('email', formData.email)
      emailFormData.append('steps', formData.steps)
      if (formData.screenshot) {
        emailFormData.append('screenshot', formData.screenshot)
      }

      const response = await axios.post(`${API_BASE_URL}/api/send-bug-report`, emailFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      if (response.data?.success) {
        setSubmitted(true)
        // Reset form after 2 seconds
        setTimeout(() => {
          setFormData({ title: '', description: '', email: '', steps: '', screenshot: null })
          setSubmitted(false)
          setShowModal(false)
        }, 2000)
      } else {
        setError(response.data?.error || 'Failed to submit bug report')
      }
    } catch (err) {
      console.error('Bug report error:', err)
      setError(err.response?.data?.error || 'An error occurred while submitting the bug report. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Bug Report Button */}
      <button
        type="button"
        className="bug-report-btn"
        onClick={() => setShowModal(true)}
        title="Report a bug"
      >
        🐛 Report Bug
      </button>

      {/* Bug Report Modal */}
      {showModal && (
        <div className="bug-report-modal-overlay" onClick={() => !loading && setShowModal(false)}>
          <div className="bug-report-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="bug-report-header">
              <h2>Report a Bug</h2>
              <button
                type="button"
                className="bug-report-close"
                onClick={() => !loading && setShowModal(false)}
              >
                ✕
              </button>
            </div>

            {submitted ? (
              <div className="bug-report-success">
                <div className="success-icon">✓</div>
                <h3>Thank You!</h3>
                <p>Your bug report has been submitted successfully.</p>
                <p>We'll investigate and fix it as soon as possible.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bug-report-form">
                {error && (
                  <div className="bug-report-error">
                    <span>⚠️</span>
                    <p>{error}</p>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="bug-title">Bug Title *</label>
                  <input
                    id="bug-title"
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g., Resume preview doesn't load"
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bug-description">Description *</label>
                  <textarea
                    id="bug-description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Describe what went wrong"
                    rows={4}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bug-steps">Steps to Reproduce</label>
                  <textarea
                    id="bug-steps"
                    name="steps"
                    value={formData.steps}
                    onChange={handleInputChange}
                    placeholder="e.g., 1. Upload PDF 2. Click Preview 3. Error appears"
                    rows={3}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bug-email">Your Email *</label>
                  <input
                    id="bug-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="your.email@example.com"
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bug-screenshot">Screenshot (Optional)</label>
                  <input
                    id="bug-screenshot"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                  {formData.screenshot && (
                    <p className="file-selected">✓ {formData.screenshot.name}</p>
                  )}
                </div>

                <div className="bug-report-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading}
                  >
                    {loading ? 'Submitting...' : 'Submit Bug Report'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowModal(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
