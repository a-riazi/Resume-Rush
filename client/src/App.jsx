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
  const [docxDownloading, setDocxDownloading] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showJobDescription, setShowJobDescription] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)

  // Derived helpers to support both old and new API schemas
  const originalSummary = result?.summary || result?.objective || ''
  const originalSkillsArray = Array.isArray(result?.skills)
    ? result.skills
    : (typeof result?.technical_skills === 'string'
        ? result.technical_skills.split(',').map(s => s.trim()).filter(Boolean)
        : [])
  const originalExperienceArray = Array.isArray(result?.experience) ? result.experience : null
  const originalExperienceText = !originalExperienceArray && typeof result?.experience === 'string' ? result.experience : ''
  const originalEducationArray = Array.isArray(result?.education) ? result.education : null
  const originalEducationText = !originalEducationArray && typeof result?.education === 'string' ? result.education : ''
  const originalProjectsArray = Array.isArray(result?.projects) ? result.projects : null
  const originalProjectsText = !originalProjectsArray && typeof result?.projects === 'string' ? result.projects : ''

  const tailoredSummary = tailored?.tailored_summary || tailored?.tailored_objective || ''
  const tailoredSkillsArray = Array.isArray(tailored?.target_skills)
    ? tailored.target_skills
    : (typeof tailored?.tailored_technical_skills === 'string'
        ? tailored.tailored_technical_skills.split(',').map(s => s.trim()).filter(Boolean)
        : [])
  const tailoredExperienceArray = Array.isArray(tailored?.tailored_experience) ? tailored.tailored_experience : null
  const tailoredExperienceText = !tailoredExperienceArray && typeof tailored?.tailored_experience === 'string' ? tailored.tailored_experience : ''

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
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    setFile(null)
    setResult(null)
    setTailored(null)
    setError(null)
    setShowOriginal(false)
    setShowJobDescription(false)
    setShowPreview(false)
  }

  const handlePreview = async () => {
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
      setPdfUrl(url)
      setShowPreview(true)
    } catch (err) {
      console.error('Preview error:', err)
      setError('Failed to generate preview. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadFromPreview = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.setAttribute('download', 'tailored-resume.pdf')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleClosePreview = () => {
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    setShowPreview(false)
  }

  const handleDownloadDocx = async () => {
    if (!result) return
    setDocxDownloading(true)
    setError(null)
    try {
      const payload = { parsed: result, tailored: tailored || null }
      const response = await axios.post('http://localhost:5000/api/export-docx', payload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'tailored-resume.docx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('DOCX download error:', err)
      setError('Failed to download DOCX. Please try again.')
    } finally {
      setDocxDownloading(false)
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
                <button onClick={handlePreview} className="btn-primary" disabled={downloading}>
                  {downloading ? 'Preparing PDF...' : 'Preview PDF'}
                </button>
                <button onClick={handleDownloadDocx} className="btn-secondary" disabled={docxDownloading}>
                  {docxDownloading ? 'Preparing DOCX...' : 'Download DOCX'}
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
                      <p>{tailoredSummary || 'Not available'}</p>
                    </div>

                    {tailoredSkillsArray && tailoredSkillsArray.length > 0 && (
                      <div className="result-card">
                        <h3>Target Skills</h3>
                        <div className="skills-container">
                          {tailoredSkillsArray.map((skill, index) => (
                            <span key={index} className="skill-tag">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {tailoredExperienceArray && tailoredExperienceArray.length > 0 && (
                      <div className="result-card full-width">
                        <h3>Tailored Experience</h3>
                        {tailoredExperienceArray.map((exp, index) => (
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

                    {!tailoredExperienceArray && tailoredExperienceText && (
                      <div className="result-card full-width">
                        <h3>Tailored Experience</h3>
                        <p>{tailoredExperienceText}</p>
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
              {originalSummary && (
                <div className="result-card full-width">
                  <h3>Professional Summary</h3>
                  <p>{originalSummary}</p>
                </div>
              )}

              {/* Experience */}
              {originalExperienceArray && originalExperienceArray.length > 0 && (
                <div className="result-card full-width">
                  <h3>Work Experience</h3>
                  {originalExperienceArray.map((exp, index) => (
                    <div key={index} className="experience-item">
                      <h4>{exp.title} at {exp.company}</h4>
                      <p className="dates">{exp.dates}</p>
                      <p className="description">{exp.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {!originalExperienceArray && originalExperienceText && (
                <div className="result-card full-width">
                  <h3>Work Experience</h3>
                  <p className="description">{originalExperienceText}</p>
                </div>
              )}

              {/* Education */}
              {originalEducationArray && originalEducationArray.length > 0 && (
                <div className="result-card">
                  <h3>Education</h3>
                  {originalEducationArray.map((edu, index) => (
                    <div key={index} className="education-item">
                      <h4>{edu.degree} in {edu.field}</h4>
                      <p>{edu.school}</p>
                      <p className="dates">{edu.dates}</p>
                    </div>
                  ))}
                </div>
              )}

              {!originalEducationArray && originalEducationText && (
                <div className="result-card">
                  <h3>Education</h3>
                  <p>{originalEducationText}</p>
                </div>
              )}

              {/* Skills */}
              {originalSkillsArray && originalSkillsArray.length > 0 && (
                <div className="result-card">
                  <h3>Skills</h3>
                  <div className="skills-container">
                    {originalSkillsArray.map((skill, index) => (
                      <span key={index} className="skill-tag">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Academic Projects */}
              {originalProjectsArray && originalProjectsArray.length > 0 && (
                <div className="result-card full-width">
                  <h3>Academic Projects</h3>
                  {originalProjectsArray.map((p, index) => (
                    <div key={index} className="project-item">
                      <h4>{[p.name, p.organization].filter(Boolean).join(' — ')}</h4>
                      {p.dates && <p className="dates">{p.dates}</p>}
                      {p.description && <p className="description">{p.description}</p>}
                      {Array.isArray(p.technologies) && p.technologies.length > 0 && (
                        <p className="technologies">Technologies: {p.technologies.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!originalProjectsArray && originalProjectsText && (
                <div className="result-card full-width">
                  <h3>Academic Projects</h3>
                  <p>{originalProjectsText}</p>
                </div>
              )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showPreview && pdfUrl && (
          <div className="modal-overlay" onClick={handleClosePreview}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Resume Preview</h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={handleDownloadFromPreview} className="btn-primary">
                    Download PDF
                  </button>
                  <button onClick={handleClosePreview} className="btn-secondary">
                    Close
                  </button>
                </div>
              </div>
              <div className="modal-body">
                <iframe src={pdfUrl} title="Resume Preview" className="pdf-preview" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
