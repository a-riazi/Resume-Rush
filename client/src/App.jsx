import { useState } from 'react'
import axios from 'axios'
import './App.css'

const templateOptions = [
  { key: 'classic', label: 'Classic', accent: '#111', heading: '#111', body: '#222', bg: '#f4f2ec' },
  { key: 'modern', label: 'Modern Accent', accent: '#0f766e', heading: '#0b4f4a', body: '#1f1b16', bg: '#e8f5f3' },
  { key: 'minimal', label: 'Minimal', accent: '#dddddd', heading: '#333333', body: '#111111', bg: '#f8f8f8' },
  { key: 'midnight', label: 'Midnight', accent: '#1f4b99', heading: '#12326f', body: '#0e172a', bg: '#eef2fb' },
  { key: 'sunrise', label: 'Sunrise', accent: '#f97316', heading: '#9a3412', body: '#4a2b16', bg: '#fff3e6' },
  { key: 'mint', label: 'Mint', accent: '#2dd4bf', heading: '#115e59', body: '#064e3b', bg: '#e6fffa' },
  { key: 'sidebar', label: 'Sidebar', accent: '#1e40af', heading: '#1e40af', body: '#1a1a1a', bg: '#dbeafe' },
  { key: 'executive', label: 'Executive', accent: '#d97706', heading: '#d97706', body: '#1a1a1a', bg: '#fef3c7' },
  { key: 'clean', label: 'Clean Modern', accent: '#7c3aed', heading: '#7c3aed', body: '#374151', bg: '#f3e8ff' },
  { key: 'bold', label: 'Bold Impact', accent: '#dc2626', heading: '#dc2626', body: '#1a1a1a', bg: '#fee2e2' },
  { key: 'creative', label: 'Creative', accent: '#059669', heading: '#059669', body: '#1f2937', bg: '#d1fae5' },
  { key: 'centered_serif', label: 'Centered Serif', accent: '#374151', heading: '#374151', body: '#1f2937', bg: '#eef2f7' },
  { key: 'compact_pro', label: 'Compact Professional', accent: '#4b5563', heading: '#1f2937', body: '#111827', bg: '#f6f7f9' },
  { key: 'left_bar', label: 'Left Bar', accent: '#374151', heading: '#1f2937', body: '#111827', bg: '#eef1f4' },
]

const sampleParsed = {
  name: 'Jordan Lee',
  email: 'jordan.lee@example.com',
  phone: '(555) 123-4567',
  location: 'San Francisco, CA',
  summary: 'Product-focused software engineer with 6+ years building web platforms, leading feature delivery, and collaborating across design, product, and data teams.',
  skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'GraphQL', 'PostgreSQL', 'AWS', 'Docker'],
  education: [
    {
      school: 'University of Washington',
      degree: 'B.S.',
      field: 'Computer Science',
      dates: '2014 – 2018',
    },
  ],
  experience: [
    {
      company: 'Nimbus Labs',
      title: 'Senior Software Engineer',
      role: 'Senior Software Engineer',
      dates: '2021 – Present',
      description: 'Lead engineer for growth experiments and self-serve onboarding.',
      bullets: [
        'Shipped experimentation platform (React/Node/GraphQL) improving activation by 12%.',
        'Reduced page load by 28% via code-splitting, bundle analysis, and image optimization.',
        'Mentored 4 engineers; established review guidelines that cut PR cycle time by 18%.',
      ],
    },
    {
      company: 'Brightside',
      title: 'Software Engineer',
      role: 'Software Engineer',
      dates: '2018 – 2021',
      description: 'Built customer-facing features and internal tooling for support ops.',
      bullets: [
        'Implemented real-time chat tooling using WebSockets, reducing support response SLA by 22%.',
        'Co-owned design system components; improved accessibility (WCAG AA) across core flows.',
      ],
    },
  ],
  projects: [
    {
      name: 'Release Radar',
      organization: 'Personal',
      dates: '2024',
      description: 'Launch notifications tool aggregating changelogs across services with weekly digest.',
      technologies: ['Next.js', 'Prisma', 'PostgreSQL', 'Tailwind'],
    },
  ],
}

function App() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [jobDescriptions, setJobDescriptions] = useState([
    { id: Date.now(), title: '', description: '', results: { tailored: null, coverLetter: null }, isLoading: false, error: null }
  ])
  const [error, setError] = useState(null)
  const [activePreviewTab, setActivePreviewTab] = useState('resume')
  const [activeJobId, setActiveJobId] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [docxDownloading, setDocxDownloading] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showJobDescription, setShowJobDescription] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewJobId, setPreviewJobId] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [coverPdfUrl, setCoverPdfUrl] = useState(null)
  const [templateKey, setTemplateKey] = useState('classic')
  const [previewLabel, setPreviewLabel] = useState('')
  const [expandedJobId, setExpandedJobId] = useState(null)

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

  const tailoredSummary = jobDescriptions[0]?.results?.tailored?.tailored_summary || jobDescriptions[0]?.results?.tailored?.tailored_objective || ''
  const tailoredSkillsArray = Array.isArray(jobDescriptions[0]?.results?.tailored?.target_skills)
    ? jobDescriptions[0].results.tailored.target_skills
    : (typeof jobDescriptions[0]?.results?.tailored?.tailored_technical_skills === 'string'
        ? jobDescriptions[0].results.tailored.tailored_technical_skills.split(',').map(s => s.trim()).filter(Boolean)
        : [])
  const tailoredExperienceArray = Array.isArray(jobDescriptions[0]?.results?.tailored?.tailored_experience) ? jobDescriptions[0].results.tailored.tailored_experience : null
  const tailoredExperienceText = !tailoredExperienceArray && typeof jobDescriptions[0]?.results?.tailored?.tailored_experience === 'string' ? jobDescriptions[0].results.tailored.tailored_experience : ''

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
  }

  // Manage job descriptions
  const addNewJobDescription = () => {
    setJobDescriptions([...jobDescriptions, { id: Date.now(), title: '', description: '', results: { tailored: null, coverLetter: null }, isLoading: false, error: null }])
  }

  const removeJob = (jobId) => {
    if (jobDescriptions.length === 1) {
      setError('You must have at least one job description.')
      return
    }
    setJobDescriptions(jobDescriptions.filter(j => j.id !== jobId))
  }

  const updateJobTitle = (jobId, title) => {
    setJobDescriptions(jobDescriptions.map(j => j.id === jobId ? { ...j, title } : j))
  }

  const updateJobDescription = (jobId, description) => {
    setJobDescriptions(jobDescriptions.map(j => j.id === jobId ? { ...j, description } : j))
  }

  const toggleJobDetails = (jobId) => {
    setExpandedJobId(expandedJobId === jobId ? null : jobId)
  }

  // Upload and tailor resume for all jobs
  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first.')
      return
    }

    const jobsWithContent = jobDescriptions.filter(j => j.description.trim().length > 0)
    if (jobsWithContent.length === 0) {
      setError('Please provide at least one job description.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // First, parse the resume (once)
      const formData = new FormData()
      formData.append('resume', file)
      formData.append('jobDescription', '') // Empty job description to just parse

      const parseResponse = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      if (!parseResponse.data.success) {
        setError('Failed to parse resume. Please try again.')
        setLoading(false)
        return
      }

      setResult(parseResponse.data.data)

      // Now tailor for each job description sequentially
      const updatedJobs = await Promise.all(
        jobDescriptions.map(async (job) => {
          if (!job.description.trim()) {
            return job
          }

          try {
            const jobFormData = new FormData()
            jobFormData.append('resume', file)
            jobFormData.append('jobDescription', job.description.trim())

            const jobResponse = await axios.post('http://localhost:5000/api/upload', jobFormData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            })

            if (jobResponse.data.success) {
              return {
                ...job,
                results: {
                  tailored: jobResponse.data.tailored || null,
                  coverLetter: jobResponse.data.coverLetter || null,
                },
                isLoading: false,
                error: null,
              }
            } else {
              return {
                ...job,
                isLoading: false,
                error: 'Failed to tailor for this job',
              }
            }
          } catch (err) {
            console.error('Tailoring error for job:', err)
            return {
              ...job,
              isLoading: false,
              error: err.response?.data?.error || 'Failed to tailor for this job',
            }
          }
        })
      )

      setJobDescriptions(updatedJobs)
      setActiveJobId(updatedJobs[0].id)
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
    if (coverPdfUrl) {
      window.URL.revokeObjectURL(coverPdfUrl)
      setCoverPdfUrl(null)
    }
    setFile(null)
    setResult(null)
    setJobDescriptions([{ id: Date.now(), title: '', description: '', results: { tailored: null, coverLetter: null }, isLoading: false, error: null }])
    setError(null)
    setShowOriginal(false)
    setShowJobDescription(false)
    setShowPreview(false)
    setTemplateKey('classic')
    setActivePreviewTab('resume')
    setActiveJobId(null)
    setPreviewJobId(null)
  }

  const handlePreviewResume = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.tailored) return
    
    setDownloading(true)
    setError(null)
    setPreviewLabel(`${activeJob.title ? activeJob.title : 'Job'} · Resume`)
    setActivePreviewTab('resume')
    setPreviewJobId(jobId)
    
    try {
      const payload = { parsed: result, tailored: activeJob.results.tailored || null, templateKey }
      const response = await axios.post('http://localhost:5000/api/export-pdf', payload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      setPdfUrl(url)
      setShowPreview(true)
    } catch (err) {
      console.error('Preview error:', err)
      setError('Failed to generate resume preview. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handlePreviewCover = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.coverLetter) return
    
    setDownloading(true)
    setError(null)
    setPreviewLabel(`${activeJob.title ? activeJob.title : 'Job'} · Cover Letter`)
    setActivePreviewTab('cover')
    setPreviewJobId(jobId)
    
    try {
      const coverPayload = { 
        parsed: result, 
        templateKey,
        cover: {
          body: activeJob.results.coverLetter,
        }
      }
      const coverResponse = await axios.post('http://localhost:5000/api/export-pdf-cover', coverPayload, {
        responseType: 'blob',
      })
      const coverBlob = new Blob([coverResponse.data], { type: 'application/pdf' })
      const coverUrl = window.URL.createObjectURL(coverBlob)
      setCoverPdfUrl(coverUrl)
      setShowPreview(true)
    } catch (err) {
      console.error('Cover preview error:', err)
      setError('Failed to generate cover letter preview. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleSamplePreview = async (key) => {
    setDownloading(true)
    setError(null)
    setPreviewLabel(`Sample · ${templateOptions.find((t) => t.key === key)?.label || key}`)
    try {
      const payload = { parsed: sampleParsed, tailored: null, templateKey: key }
      const response = await axios.post('http://localhost:5000/api/export-pdf', payload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      setPdfUrl(url)
      setShowPreview(true)
    } catch (err) {
      console.error('Sample preview error:', err)
      setError('Failed to generate sample preview. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadFromPreview = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.setAttribute('download', 'resume-preview.pdf')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleClosePreview = () => {
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    if (coverPdfUrl) {
      window.URL.revokeObjectURL(coverPdfUrl)
      setCoverPdfUrl(null)
    }
    setShowPreview(false)
  }

  const handleDownloadResumeDocx = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.tailored) return
    
    setDocxDownloading(true)
    setError(null)
    try {
      const payload = { parsed: result, tailored: activeJob.results.tailored || null, templateKey }
      const response = await axios.post('http://localhost:5000/api/export-docx', payload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = activeJob.title ? `resume-${activeJob.title.replace(/\s+/g, '-').toLowerCase()}.docx` : 'resume.docx'
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('DOCX download error:', err)
      setError('Failed to download resume DOCX. Please try again.')
    } finally {
      setDocxDownloading(false)
    }
  }

  const handleDownloadCoverDocx = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.coverLetter) return
    
    setDocxDownloading(true)
    setError(null)
    try {
      const coverPayload = { 
        parsed: result, 
        templateKey,
        cover: {
          body: activeJob.results.coverLetter,
        }
      }
      const response = await axios.post('http://localhost:5000/api/export-docx-cover', coverPayload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = activeJob.title ? `cover-letter-${activeJob.title.replace(/\s+/g, '-').toLowerCase()}.docx` : 'cover-letter.docx'
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Cover DOCX download error:', err)
      setError('Failed to download cover letter DOCX. Please try again.')
    } finally {
      setDocxDownloading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rocket Logo" className="header-logo" /> Resume Rocket</h1>
        <p>AI-Powered Resume Tailor</p>

          <div className="container">
            {!result ? (
              <>
                <div className="pre-tailor-bar" style={{ display: file ? 'flex' : 'none' }}>
                  <div className="pre-tailor-info">
                    <span className="pre-tailor-label">Ready to tailor</span>
                    {file && <span className="pre-tailor-file">{file.name}</span>}
                  </div>
                  <button onClick={handleUpload} disabled={loading || jobDescriptions.every(j => !j.description.trim())} className="btn-primary">
                    {loading ? 'Tailoring...' : 'Tailor Resume'}
                  </button>
                </div>

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

            <div className="job-descriptions-section">
              <div className="job-descriptions-header">
                <h3>Add Job Descriptions</h3>
                <button onClick={addNewJobDescription} className="btn-secondary add-job-btn">
                  + Add Job
                </button>
              </div>
              
              {jobDescriptions.map((job, index) => (
                <div key={job.id} className="job-input-group">
                  <div className="job-group-header">
                    <input
                      type="text"
                      placeholder={`Job title/label (optional)`}
                      value={job.title}
                      onChange={(e) => updateJobTitle(job.id, e.target.value)}
                      className="job-title-input"
                    />
                    {jobDescriptions.length > 1 && (
                      <button 
                        onClick={() => removeJob(job.id)} 
                        className="btn-danger-small"
                        title="Remove this job description"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="job-input-wrapper">
                    <textarea
                      className="job-textarea"
                      placeholder={`Paste job description ${jobDescriptions.length > 1 ? `#${index + 1}` : ''} here`}
                      value={job.description}
                      onChange={(e) => updateJobDescription(job.id, e.target.value)}
                    />
                    <span className="char-count">{job.description.length} chars</span>
                  </div>
                </div>
              ))}

              <p className="job-helper">Provide job descriptions to get perfectly tailored resumes and cover letters.</p>
            </div>

                <div className="template-select-block">
                  <h3 style={{ color: '#1f1b16', marginBottom: '0', fontSize: '1.4rem', fontWeight: 700 }}>Choose a Style:</h3>
                  <div className="template-select-block">

                    <div className="template-samples" style={{ marginTop: '-0.3rem' }}>
                        {templateOptions.map((opt) => (
                          <div
                            key={opt.key}
                          className={`template-sample-card ${templateKey === opt.key ? 'selected' : ''}`}
                          style={{
                            background: opt.bg,
                            borderColor: opt.accent,
                          }}
                          onClick={() => setTemplateKey(opt.key)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setTemplateKey(opt.key)
                            }
                            }}
                          >
                          <div className="template-sample-pill" style={{ background: opt.accent, color: opt.bg }}>{opt.label}</div>
                            <button
                              className="btn-secondary sample-btn"
                              type="button"
                              onClick={() => handleSamplePreview(opt.key)}
                              disabled={downloading}
                            >
                              Preview sample
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {loading && (
                    <div className="loading">
                      <div className="spinner"></div>
                      <p>Tailoring your resumes...</p>
                    </div>
                  )}

                  {error && (
                    <div className="error-message">
                      <span>⚠️</span>
                      <p>{error}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
          <div className="results-section">
            <div className="results-header">
              <h2>✓ Tailored Resumes Ready</h2>
              <div className="results-actions">
                {jobDescriptions.length < 2 && (
                  <div className="template-picker">
                    <label htmlFor="template-select">Template</label>
                    <select
                      id="template-select"
                      value={templateKey}
                      onChange={(e) => setTemplateKey(e.target.value)}
                    >
                      {templateOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>
                    {jobDescriptions[0]?.results?.tailored?.recommended_template && (
                      <span className="recommended-pill">Suggested: {jobDescriptions[0].results.tailored.recommended_template}</span>
                    )}
                  </div>
                )}
                <button onClick={() => setShowJobDescription(!showJobDescription)} className="btn-secondary">
                  {showJobDescription ? 'Hide Job Descriptions' : 'Show Job Descriptions'}
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
                {loading && (
                  <div className="loading-spinner-wrapper" style={{ gridColumn: '1 / -1' }}>
                    <div className="loading">
                      <div className="spinner"></div>
                      <p>Tailoring your resumes...</p>
                    </div>
                  </div>
                )}

                {showJobDescription && (
                  <div className="job-descriptions-wrapper" style={{ gridColumn: '1 / -1' }}>
                    {jobDescriptions.map((job) => (
                      job.description && (
                        <div key={job.id} className="result-card full-width">
                          <h3>{job.title || `Job ${jobDescriptions.indexOf(job) + 1}`}</h3>
                          <p className="job-used">{job.description}</p>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {jobDescriptions.map((job) => (
                  job.results.tailored && (
                    <div key={job.id} className="job-result-block" style={{ gridColumn: '1 / -1' }}>
                      <div className="job-result-header">
                        <h3>{job.title ? `${job.title} · Resume & Cover Letter` : `Job ${jobDescriptions.indexOf(job) + 1} · Resume & Cover Letter`}</h3>
                        <button 
                          onClick={() => toggleJobDetails(job.id)} 
                          className="btn-toggle-details"
                        >
                          {expandedJobId === job.id ? '▼ Hide Details' : '▶ Show Details'}
                        </button>
                      </div>

                      {job.isLoading && (
                        <div className="result-card full-width">
                          <p>Tailoring for this job...</p>
                        </div>
                      )}

                      {job.error && (
                        <div className="result-card full-width error">
                          <p>{job.error}</p>
                        </div>
                      )}

                      <div className="job-action-buttons">
                        <button onClick={() => handlePreviewResume(job.id)} className="btn-primary" disabled={downloading}>
                          {downloading ? 'Preparing...' : 'Preview Resume PDF'}
                        </button>
                        {job.results.coverLetter && (
                          <button onClick={() => handlePreviewCover(job.id)} className="btn-primary" disabled={downloading}>
                            {downloading ? 'Preparing...' : 'Preview Cover Letter PDF'}
                          </button>
                        )}
                        <button onClick={() => handleDownloadResumeDocx(job.id)} className="btn-secondary" disabled={docxDownloading}>
                          {docxDownloading ? 'Preparing...' : 'Download Resume DOCX'}
                        </button>
                        {job.results.coverLetter && (
                          <button onClick={() => handleDownloadCoverDocx(job.id)} className="btn-secondary" disabled={docxDownloading}>
                            {docxDownloading ? 'Preparing...' : 'Download Cover Letter DOCX'}
                          </button>
                        )}
                      </div>

                      {expandedJobId === job.id && (
                        <>
                          <div className="result-card full-width">
                            <h3>Tailored Summary</h3>
                            <p>{job.results.tailored?.tailored_summary || 'Not available'}</p>
                          </div>

                          {job.results.tailored?.target_skills && job.results.tailored.target_skills.length > 0 && (
                            <div className="result-card">
                              <h3>Target Skills</h3>
                              <div className="skills-container">
                                {job.results.tailored.target_skills.map((skill, index) => (
                                  <span key={index} className="skill-tag">{skill}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {job.results.tailored?.tailored_experience && job.results.tailored.tailored_experience.length > 0 && (
                            <div className="result-card full-width">
                              <h3>Tailored Experience</h3>
                              {job.results.tailored.tailored_experience.map((exp, index) => (
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
                    </div>
                  )
                ))}

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

        {showPreview && (pdfUrl || coverPdfUrl) && (
          <div className="modal-overlay" onClick={handleClosePreview}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{previewLabel || 'Preview'}</h2>
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
                <iframe 
                  src={activePreviewTab === 'resume' ? pdfUrl : coverPdfUrl} 
                  title={activePreviewTab === 'resume' ? 'Resume Preview' : 'Cover Letter Preview'} 
                  className="pdf-preview" 
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  </div>
  )
}

export default App
