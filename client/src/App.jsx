import { useState } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [tailored, setTailored] = useState(null)
  const [jobText, setJobText] = useState('')
  const [jobUsed, setJobUsed] = useState('')
  const [error, setError] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showJobDescription, setShowJobDescription] = useState(false)

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    validateAndSetFile(selectedFile)
  }

  // Handle drag events
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  // Handle drop
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0])
    }
  }

  // Validate file type and size
  const validateAndSetFile = (selectedFile) => {
    setError(null)
    
    if (!selectedFile) return

    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    const maxSize = 10 * 1024 * 1024 // 10MB

    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Invalid file type. Please upload a PDF, DOCX, or TXT file.')
      return
    }

    if (selectedFile.size > maxSize) {
      setError('File is too large. Maximum size is 10MB.')
      return
    }

    setFile(selectedFile)
    setResult(null)
    setTailored(null)
  }

  // Upload and tailor resume
  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first.')
      return
    }

    if (!jobText.trim()) {
      setError('Please provide a job description.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setTailored(null)

    const formData = new FormData()
    formData.append('resume', file)
    formData.append('jobDescription', jobText.trim())

    try {
      const response = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      if (response.data.success) {
        setResult(response.data.data)
        setTailored(response.data.tailored || null)
        if (jobText.trim().length > 0) {
          setJobUsed(jobText.trim())
        } else {
          setJobUsed('')
        }
      } else {
        setError('Failed to parse resume. Please try again.')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err.response?.data?.error || 'An error occurred while processing your resume. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Reset to upload new file
  const handleReset = () => {
    setFile(null)
    setResult(null)
    setTailored(null)
    setError(null)
    setShowOriginal(false)
    setShowJobDescription(false)
  }

  const handleDownload = async () => {
    if (!result) return
    setDownloading(true)
    setError(null)
    try {
      const payload = { parsed: result, tailored: tailored || null }
      const response = await axios.post('http://localhost:5000/api/export-pdf', payload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'tailored-resume.pdf')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download error:', err)
      setError('Failed to download PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🚀 Resume Rocket</h1>
        <p>AI-Powered Resume Tailor</p>
      </header>

      <div className="container">
        {!result ? (
          <div className="upload-section">
            <div
              className={`upload-area ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="upload-icon">📄</div>
              <h3>Upload Your Resume</h3>
              <p>Drag and drop your resume here, or click to browse</p>
              <input
                type="file"
                id="file-input"
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="file-input" className="file-label">
                Choose File
              </label>
              <p className="file-types">Supported: PDF, DOCX, TXT (Max 10MB)</p>
            </div>

            <div className="job-section">
              <div className="job-header">
                <h3>Paste Job Description</h3>
                <span className="char-count">{jobText.length} chars</span>
              </div>
              <textarea
                className="job-textarea"
                placeholder="Paste the job description here to tailor your resume"
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={8}
              />
              <p className="job-helper">Provide the job description to get a perfectly tailored resume.</p>
            </div>

            {file && (
              <div className="file-info">
                <p>✓ Selected: <strong>{file.name}</strong></p>
                <button onClick={handleUpload} disabled={loading || !jobText.trim()} className="btn-primary">
                  {loading ? 'Tailoring...' : 'Tailor Resume'}
                </button>
              </div>
            )}

            {loading && (
              <div className="loading">
                <div className="spinner"></div>
                <p>Creating your tailored resume...</p>
              </div>
            )}

            {error && (
              <div className="error-message">
                <span>⚠️</span>
                <p>{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="results-section">
            <div className="results-header">
              <h2>✓ Tailored Resume Ready</h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleDownload} className="btn-primary" disabled={downloading}>
                  {downloading ? 'Preparing PDF...' : 'Download PDF'}
                </button>
                <button onClick={() => setShowJobDescription(!showJobDescription)} className="btn-secondary">
                  {showJobDescription ? 'Hide Job Description' : 'Show Job Description'}
                </button>
                <button onClick={() => setShowOriginal(!showOriginal)} className="btn-secondary">
                  {showOriginal ? 'Hide Original Resume' : 'Show Original Resume'}
                </button>
                <button onClick={handleReset} className="btn-secondary">
                  Tailor Another
                </button>
              </div>
            </div>

            <div className="results-grid">
                {showJobDescription && jobUsed && (
                  <div className="job-description-wrapper" style={{ gridColumn: '1 / -1' }}>
                    <div className="result-card full-width">
                      <h3>Job Description Used</h3>
                      <p className="job-used">{jobUsed}</p>
                    </div>
                  </div>
                )}

                {tailored && (
                  <>
                    <div className="result-card full-width">
                      <h3>Tailored Summary</h3>
                      <p>{tailored.tailored_summary || 'Not available'}</p>
                    </div>

                    {tailored.target_skills && tailored.target_skills.length > 0 && (
                      <div className="result-card">
                        <h3>Target Skills</h3>
                        <div className="skills-container">
                          {tailored.target_skills.map((skill, index) => (
                            <span key={index} className="skill-tag">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {tailored.tailored_experience && tailored.tailored_experience.length > 0 && (
                      <div className="result-card full-width">
                        <h3>Tailored Experience</h3>
                        {tailored.tailored_experience.map((exp, index) => (
                          <div key={index} className="experience-item">
                            <h4>{exp.role} at {exp.company}</h4>
                            <p className="dates">{exp.dates}</p>
                            {exp.bullets && exp.bullets.length > 0 && (
                              <ul className="bullet-list">
                                {exp.bullets.map((b, i) => (
                                  <li key={i}>{b}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

              {showOriginal && (
                <div className="original-resume-wrapper" style={{ gridColumn: '1 / -1' }}>
                  <h2 style={{ color: '#a36500', marginBottom: '1.5rem', fontSize: '1.5rem' }}>Original Resume</h2>
                  <div className="results-grid">
              {/* Personal Information */}
              <div className="result-card">
                <h3>Personal Information</h3>
                <div className="info-row">
                  <span className="label">Name:</span>
                  <span className="value">{result.name || 'Not found'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Email:</span>
                  <span className="value">{result.email || 'Not found'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Phone:</span>
                  <span className="value">{result.phone || 'Not found'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Location:</span>
                  <span className="value">{result.location || 'Not found'}</span>
                </div>
              </div>

              {/* Summary */}
              {result.summary && (
                <div className="result-card full-width">
                  <h3>Professional Summary</h3>
                  <p>{result.summary}</p>
                </div>
              )}

              {/* Experience */}
              {result.experience && result.experience.length > 0 && (
                <div className="result-card full-width">
                  <h3>Work Experience</h3>
                  {result.experience.map((exp, index) => (
                    <div key={index} className="experience-item">
                      <h4>{exp.title} at {exp.company}</h4>
                      <p className="dates">{exp.dates}</p>
                      <p className="description">{exp.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Education */}
              {result.education && result.education.length > 0 && (
                <div className="result-card">
                  <h3>Education</h3>
                  {result.education.map((edu, index) => (
                    <div key={index} className="education-item">
                      <h4>{edu.degree} in {edu.field}</h4>
                      <p>{edu.school}</p>
                      <p className="dates">{edu.dates}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Skills */}
              {result.skills && result.skills.length > 0 && (
                <div className="result-card">
                  <h3>Skills</h3>
                  <div className="skills-container">
                    {result.skills.map((skill, index) => (
                      <span key={index} className="skill-tag">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
