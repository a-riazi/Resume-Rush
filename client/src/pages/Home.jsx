import { useState, useEffect } from 'react'
import axios from 'axios'
import '../App.css'

// Base API URL comes from environment; falls back to same-origin
const API_BASE_URL = import.meta.env.VITE_API_URL || ''

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

const HOME_STATE_KEY = 'resume-rush-home-state'
const CHECKBOX_SETTINGS_KEY = 'resume-rush-checkbox-settings'
const PDF_TYPE = 'application/pdf'

// Helper function to get initial checkbox state from sessionStorage
function getInitialCheckboxState() {
  try {
    const saved = sessionStorage.getItem(CHECKBOX_SETTINGS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        generateResume: parsed.generateResume !== undefined ? parsed.generateResume : true,
        generateCoverLetter: parsed.generateCoverLetter !== undefined ? parsed.generateCoverLetter : true,
        limitToOnePage: parsed.limitToOnePage !== undefined ? parsed.limitToOnePage : false,
      }
    }
  } catch (err) {
    console.error('Failed to read checkbox settings:', err)
  }
  return { generateResume: true, generateCoverLetter: true, limitToOnePage: false }
}

export default function Home({ darkMode = false, onToggleDarkMode = () => {} }) {
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
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null)
  const [showUploadPreview, setShowUploadPreview] = useState(false)
  const initialCheckboxState = getInitialCheckboxState()
  const [generateResume, setGenerateResume] = useState(initialCheckboxState.generateResume)
  const [generateCoverLetter, setGenerateCoverLetter] = useState(initialCheckboxState.generateCoverLetter)
  const [limitToOnePage, setLimitToOnePage] = useState(initialCheckboxState.limitToOnePage)

  // Restore persisted state so returning to Home keeps results visible
  useEffect(() => {
    const saved = sessionStorage.getItem(HOME_STATE_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      if (parsed.result) setResult(parsed.result)
      if (Array.isArray(parsed.jobDescriptions)) setJobDescriptions(parsed.jobDescriptions)
      if (parsed.templateKey) setTemplateKey(parsed.templateKey)
      if (parsed.activeJobId) setActiveJobId(parsed.activeJobId)
      setShowOriginal(Boolean(parsed.showOriginal))
      setShowJobDescription(Boolean(parsed.showJobDescription))
      if (parsed.loading) setLoading(parsed.loading)
      if (parsed.error) setError(parsed.error)
      if (parsed.fileMetadata) {
        // Create a pseudo-File object from metadata for display purposes
        const pseudoFile = new File([], parsed.fileMetadata.name, { type: parsed.fileMetadata.type })
        Object.defineProperty(pseudoFile, 'size', { value: parsed.fileMetadata.size })
        setFile(pseudoFile)
      }
    } catch (err) {
      console.error('Failed to restore saved state:', err)
    }
  }, [])

  // Persist checkbox settings
  useEffect(() => {
    const snapshot = {
      generateResume,
      generateCoverLetter,
      limitToOnePage,
    }
    try {
      sessionStorage.setItem(CHECKBOX_SETTINGS_KEY, JSON.stringify(snapshot))
    } catch (err) {
      console.error('Failed to persist checkbox settings:', err)
    }
  }, [generateResume, generateCoverLetter, limitToOnePage])

  // Persist main state (results, job descriptions, etc.) whenever they change
  useEffect(() => {
    // Always save state if we have a file or results
    if (!file && !result && jobDescriptions.every(j => !j.results.tailored && !j.results.coverLetter)) {
      sessionStorage.removeItem(HOME_STATE_KEY)
      return
    }
    const snapshot = {
      result,
      jobDescriptions,
      templateKey,
      activeJobId,
      showOriginal,
      showJobDescription,
      loading,
      error,
      fileMetadata: file ? { name: file.name, size: file.size, type: file.type } : null,
    }
    try {
      sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(snapshot))
    } catch (err) {
      console.error('Failed to persist state:', err)
    }
  }, [result, jobDescriptions, templateKey, activeJobId, showOriginal, showJobDescription, file, loading, error])

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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    validateAndSetFile(selectedFile)
  }

  const revokePreviewUrl = () => {
    if (uploadPreviewUrl) {
      window.URL.revokeObjectURL(uploadPreviewUrl)
      setUploadPreviewUrl(null)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0])
    }
  }

  const validateAndSetFile = (selectedFile) => {
    setError(null)
    
    if (!selectedFile) return

    const allowedTypes = [PDF_TYPE, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    const maxSize = 10 * 1024 * 1024

    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Invalid file type. Please upload a PDF, DOCX, or TXT file.')
      return
    }

    if (selectedFile.size > maxSize) {
      setError('File is too large. Maximum size is 10MB.')
      return
    }

    revokePreviewUrl()
    const url = window.URL.createObjectURL(selectedFile)
    setUploadPreviewUrl(url)
    setFile(selectedFile)
    setResult(null)
    setShowPreview(false)
    setPdfUrl(null)
    setCoverPdfUrl(null)
    setPreviewJobId(null)
    setActiveJobId(null)
    setShowOriginal(false)
    setShowJobDescription(false)
    sessionStorage.removeItem(HOME_STATE_KEY)
  }

  const addNewJobDescription = () => {
    setJobDescriptions([...jobDescriptions, { id: Date.now(), title: '', description: '', results: { tailored: null, coverLetter: null }, isLoading: false, error: null }])
  }

  const handleRemoveFile = () => {
    revokePreviewUrl()
    setFile(null)
    setResult(null)
    setPdfUrl(null)
    setCoverPdfUrl(null)
    setShowPreview(false)
    setShowUploadPreview(false)
    setPreviewJobId(null)
    setActiveJobId(null)
    setShowOriginal(false)
    setShowJobDescription(false)
    setJobDescriptions((prev) => prev.map(j => ({ ...j, results: { tailored: null, coverLetter: null }, isLoading: false, error: null })))
    sessionStorage.removeItem(HOME_STATE_KEY)
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

  const inferJobTitle = async (description) => {
    try {
      const trimmed = description?.trim()
      if (!trimmed) return null
      const resp = await axios.post(`${API_BASE_URL}/api/infer-job-title`, { description: trimmed })
      if (resp.data?.success && resp.data?.title) {
        return resp.data.title
      }
      return null
    } catch (err) {
      console.error('Infer job title error:', err)
      return null
    }
  }

  const deriveJobLabel = (job, index) => {
    const title = job.title?.trim()
    if (title) return title

    const desc = job.description?.trim()
    if (desc) {
      const words = desc.split(/\s+/)
      const snippet = words.slice(0, 6).join(' ')
      return words.length > 6 ? `${snippet}…` : snippet
    }

    return `Job ${index + 1}`
  }

  const toggleJobDetails = (jobId) => {
    setExpandedJobId(expandedJobId === jobId ? null : jobId)
  }

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

    if (!generateResume && !generateCoverLetter) {
      setError('Please select at least one output option (Resume or Cover Letter).')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('resume', file)
      formData.append('jobDescription', '')
      formData.append('generateResume', generateResume)
      formData.append('generateCoverLetter', generateCoverLetter)
      formData.append('limitToOnePage', limitToOnePage)

      const parseResponse = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
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

      const updatedJobs = await Promise.all(
        jobDescriptions.map(async (job) => {
          if (!job.description.trim()) {
            console.log(`[handleUpload] Skipping job ${job.id} - no description`);
            return job
          }

          try {
            console.log(`[handleUpload] Processing job ${job.id}: "${job.description.substring(0, 50)}..."`);
            // Use the faster /api/tailor endpoint for job-specific tailoring
            const tailorPayload = {
              parsed: parseResponse.data.data,
              jobDescription: job.description.trim(),
              generateResume: generateResume,
              generateCoverLetter: generateCoverLetter,
              limitToOnePage: limitToOnePage
            }

            console.log(`[handleUpload] Sending tailor request for job ${job.id}...`);
            const jobResponse = await axios.post(`${API_BASE_URL}/api/tailor`, tailorPayload, {
              timeout: 120000 // 2 minute timeout
            })
            console.log(`[handleUpload] Received tailor response for job ${job.id}:`, jobResponse.data);

            const inferredTitle = job.title?.trim() || await inferJobTitle(job.description)

            if (jobResponse.data.success) {
              return {
                ...job,
                title: inferredTitle || job.title,
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
                title: inferredTitle || job.title,
                isLoading: false,
                error: 'Failed to tailor for this job',
              }
            }
          } catch (err) {
            console.error('Tailoring error for job:', err)
            const inferredTitle = job.title?.trim() || await inferJobTitle(job.description)
            return {
              ...job,
              title: inferredTitle || job.title,
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

  const handleReset = () => {
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    if (coverPdfUrl) {
      window.URL.revokeObjectURL(coverPdfUrl)
      setCoverPdfUrl(null)
    }
    revokePreviewUrl()
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
    sessionStorage.removeItem(HOME_STATE_KEY)
  }

  const handlePreviewResume = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.tailored) return
    
    // Clear any existing previews first
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    if (coverPdfUrl) {
      window.URL.revokeObjectURL(coverPdfUrl)
      setCoverPdfUrl(null)
    }
    
    setDownloading(true)
    setError(null)
    setPreviewLabel(`${activeJob.title ? activeJob.title : 'Job'} · Resume`)
    setActivePreviewTab('resume')
    setPreviewJobId(jobId)
    
    try {
      const payload = { parsed: result, tailored: activeJob.results.tailored || null, templateKey, limitToOnePage }
      const response = await axios.post(`${API_BASE_URL}/api/export-pdf`, payload, {
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
    
    // Clear any existing previews first
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    if (coverPdfUrl) {
      window.URL.revokeObjectURL(coverPdfUrl)
      setCoverPdfUrl(null)
    }
    
    setDownloading(true)
    setError(null)
    setPreviewLabel(`${activeJob.title ? activeJob.title : 'Job'} · Cover Letter`)
    setActivePreviewTab('cover')
    setPreviewJobId(jobId)
    
    try {
      const coverPayload = { 
        parsed: result, 
        templateKey,
        limitToOnePage,
        cover: {
          body: activeJob.results.coverLetter,
        }
      }
      const coverResponse = await axios.post(`${API_BASE_URL}/api/export-pdf-cover`, coverPayload, {
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
      const response = await axios.post(`${API_BASE_URL}/api/export-pdf`, payload, {
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

  useEffect(() => () => revokePreviewUrl(), [])

  const handleDownloadResumeDocx = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.tailored) return
    
    setDocxDownloading(true)
    setError(null)
    try {
      const payload = { parsed: result, tailored: activeJob.results.tailored || null, templateKey, limitToOnePage }
      const response = await axios.post(`${API_BASE_URL}/api/export-docx`, payload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = activeJob.title ? `${activeJob.title.replace(/\s+/g, '-').toLowerCase()}-resume.docx` : 'resume.docx'
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
        limitToOnePage,
        cover: {
          body: activeJob.results.coverLetter,
        }
      }
      const response = await axios.post(`${API_BASE_URL}/api/export-docx-cover`, coverPayload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = activeJob.title ? `${activeJob.title.replace(/\s+/g, '-').toLowerCase()}-cover-letter.docx` : 'cover-letter.docx'
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

  const handleDownloadResumePdf = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.tailored) return
    
    setDownloading(true)
    setError(null)
    try {
      const payload = { parsed: result, tailored: activeJob.results.tailored || null, templateKey, limitToOnePage }
      const response = await axios.post(`${API_BASE_URL}/api/export-pdf`, payload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = activeJob.title ? `${activeJob.title.replace(/\s+/g, '-').toLowerCase()}-resume.pdf` : 'resume.pdf'
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF download error:', err)
      setError('Failed to download resume PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadCoverPdf = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.coverLetter) return
    
    setDownloading(true)
    setError(null)
    try {
      const coverPayload = { 
        parsed: result, 
        templateKey,
        limitToOnePage,
        cover: {
          body: activeJob.results.coverLetter,
        }
      }
      const response = await axios.post(`${API_BASE_URL}/api/export-pdf-cover`, coverPayload, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = activeJob.title ? `${activeJob.title.replace(/\s+/g, '-').toLowerCase()}-cover-letter.pdf` : 'cover-letter.pdf'
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Cover PDF download error:', err)
      setError('Failed to download cover letter PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadAllPdfs = async (jobId) => {
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob) return

    // Download resume if available
    if (activeJob.results.tailored) {
      await handleDownloadResumePdf(jobId)
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Download cover letter if available
    if (activeJob.results.coverLetter) {
      await handleDownloadCoverPdf(jobId)
    }
  }

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> Resume Rush</h1>
        <p>AI-Powered Resume Tailor</p>

          <div className="container">
            {!result ? (
              <>
                <div className="upload-section">
                  <input
                    type="file"
                    id="file-input"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />

                  {file ? (
                    <div className="upload-preview-card">
                      <div className="upload-preview-header">
                        <div className="file-headings">
                          <span className="pre-tailor-label">Ready to tailor</span>
                          <span className="file-name">{file.name}</span>
                          <span className="file-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type || 'File'}</span>
                        </div>
                        <div className="upload-preview-actions">
                          {uploadPreviewUrl && file.type === PDF_TYPE && (
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              onClick={() => setShowUploadPreview(!showUploadPreview)}
                            >
                              {showUploadPreview ? 'Hide Preview' : 'Preview PDF'}
                            </button>
                          )}
                          <label htmlFor="file-input" className="btn-secondary">Change File</label>
                          <button type="button" className="btn-danger-small" onClick={handleRemoveFile}>Remove</button>
                        </div>
                      </div>

                      <div className="generation-options">
                        <div className="options-group">
                          <label className="option-checkbox">
                            <input 
                              type="checkbox" 
                              checked={generateResume} 
                              onChange={(e) => setGenerateResume(e.target.checked)}
                              disabled={loading}
                            />
                            <span>Generate Resume</span>
                          </label>
                          <label className="option-checkbox">
                            <input 
                              type="checkbox" 
                              checked={generateCoverLetter} 
                              onChange={(e) => setGenerateCoverLetter(e.target.checked)}
                              disabled={loading}
                            />
                            <span>Generate Cover Letter</span>
                          </label>
                          <label className="option-checkbox">
                            <input 
                              type="checkbox" 
                              checked={limitToOnePage} 
                              onChange={(e) => setLimitToOnePage(e.target.checked)}
                              disabled={loading}
                            />
                            <span>Limit to One Page</span>
                          </label>
                        </div>
                        <div className="tailor-action">
                          <span className="consent-note">By pressing Tailor you agree to our <a href="/terms" className="consent-link">Terms</a>.</span>
                          <button 
                            onClick={handleUpload} 
                            disabled={loading || jobDescriptions.every(j => !j.description.trim()) || (!generateResume && !generateCoverLetter)} 
                            className="btn-primary"
                          >
                            {loading ? 'Tailoring...' : 'Tailor Resume'}
                          </button>
                        </div>
                      </div>

                      {showUploadPreview && uploadPreviewUrl && file.type === PDF_TYPE && (
                        <div className="upload-preview-body">
                          <iframe src={uploadPreviewUrl} title="Resume preview" className="pdf-preview-inline" />
                        </div>
                      )}

                      {loading && (
                        <div className="loading inline-loading">
                          <div className="spinner"></div>
                          <p>
                            Tailoring your {generateResume && generateCoverLetter ? 'resumes and cover letters' : generateCoverLetter ? 'cover letters' : 'resumes'}...
                          </p>
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
              <label htmlFor="file-input" className="file-label">
                Choose File
              </label>
              <p className="file-types">Supported: PDF, DOCX, TXT (Max 10MB)</p>
            </div>
                  )}

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
                  <h3 className="template-section-heading">Choose a Style:</h3>
                  <div className="template-select-block">

                    <div className="template-samples" style={{ marginTop: '-0.3rem' }}>
                        {templateOptions.map((opt) => (
                          <div
                            key={opt.key}
                          className={`template-sample-card ${templateKey === opt.key ? 'selected' : ''}`}
                          style={{
                            background: darkMode ? 'linear-gradient(145deg, #121728, #0b0f1d)' : opt.bg,
                            borderColor: darkMode ? 'rgba(255, 123, 220, 0.35)' : opt.accent,
                            boxShadow: darkMode ? '0 14px 32px rgba(0, 0, 0, 0.35)' : undefined,
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

                  {error && !file && (
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
              <h2>{generateResume && generateCoverLetter ? '✓ Tailored Resumes & Cover Letters Ready' : generateCoverLetter ? '✓ Tailored Cover Letters Ready' : '✓ Tailored Resumes Ready'}</h2>
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
                      <p>
                        Tailoring your {generateResume && generateCoverLetter ? 'resumes and cover letters' : generateCoverLetter ? 'cover letters' : 'resumes'}...
                      </p>
                    </div>
                  </div>
                )}

                {jobDescriptions.map((job, index) => (
                  (job.results.tailored || job.results.coverLetter) && (
                    <div key={job.id} className="job-result-block" style={{ gridColumn: '1 / -1' }}>
                      {(() => {
                        const jobLabel = deriveJobLabel(job, index)
                        const resumePart = job.results.tailored ? 'Resume' : ''
                        const coverPart = job.results.coverLetter ? 'Cover Letter' : ''
                        const parts = [resumePart, coverPart].filter(Boolean).join(' & ')
                        return (
                          <div className="job-result-header">
                            <h3>{`${jobLabel} · ${parts || 'Results'}`}</h3>
                            <button
                              onClick={() => toggleJobDetails(job.id)}
                              className="btn-toggle-details"
                            >
                              {expandedJobId === job.id ? '▼ Hide Details' : '▶ Show Details'}
                            </button>
                          </div>
                        )
                      })()}

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
                        {(job.results.tailored || job.results.coverLetter) && (
                          <button onClick={() => handleDownloadAllPdfs(job.id)} className="btn-primary" disabled={downloading}>
                            {downloading && previewJobId === job.id ? 'Downloading...' : 'Download All PDFs'}
                          </button>
                        )}
                        
                        {job.results.tailored && (
                          <>
                            <button onClick={() => handlePreviewResume(job.id)} className="btn-secondary" disabled={downloading}>
                              {downloading && previewJobId === job.id ? 'Preparing...' : 'Preview Resume PDF'}
                            </button>
                            <button onClick={() => handleDownloadResumePdf(job.id)} className="btn-secondary" disabled={downloading}>
                              {downloading && previewJobId === job.id ? 'Downloading...' : 'Download Resume PDF'}
                            </button>
                            <button onClick={() => handleDownloadResumeDocx(job.id)} className="btn-secondary" disabled={docxDownloading}>
                              {docxDownloading ? 'Preparing...' : 'Download Resume DOCX'}
                            </button>
                          </>
                        )}
                        {job.results.coverLetter && (
                          <>
                            <button onClick={() => handlePreviewCover(job.id)} className="btn-secondary" disabled={downloading}>
                              {downloading && previewJobId === job.id ? 'Preparing...' : 'Preview Cover Letter PDF'}
                            </button>
                            <button onClick={() => handleDownloadCoverPdf(job.id)} className="btn-secondary" disabled={downloading}>
                              {downloading && previewJobId === job.id ? 'Downloading...' : 'Download Cover Letter PDF'}
                            </button>
                            <button onClick={() => handleDownloadCoverDocx(job.id)} className="btn-secondary" disabled={docxDownloading}>
                              {docxDownloading ? 'Preparing...' : 'Download Cover Letter DOCX'}
                            </button>
                          </>
                        )}
                      </div>

                      {expandedJobId === job.id && (
                        <>
                          {job.results.tailored && (
                            <div className="result-card full-width">
                              <h3>Tailored Summary</h3>
                              <p>{job.results.tailored?.tailored_summary || 'Not available'}</p>
                            </div>
                          )}

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

                          {job.results.coverLetter && (
                            <div className="result-card full-width">
                              <h3>Cover Letter</h3>
                              <p style={{ whiteSpace: 'pre-line' }}>{job.results.coverLetter.replace(/\\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                ))}

                {showJobDescription && (
                  <div className="job-descriptions-wrapper" style={{ gridColumn: '1 / -1' }}>
                    <h2 className="job-descriptions-heading">Job Descriptions</h2>
                    <div className="results-grid">
                      {jobDescriptions.map((job, index) => (
                        job.description && (
                          <div key={job.id} className="result-card full-width">
                            <h3>{deriveJobLabel(job, index)}</h3>
                            <p className="job-used">{job.description.replace(/\n\s*\n+/g, '\n').replace(/\s+/g, ' ').trim()}</p>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}

              {showOriginal && (
                <div className="original-resume-wrapper" style={{ gridColumn: '1 / -1' }}>
                  <h2 className="original-resume-heading">Original Resume</h2>
                  <div className="results-grid">
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

              {originalSummary && (
                <div className="result-card full-width">
                  <h3>Professional Summary</h3>
                  <p>{originalSummary}</p>
                </div>
              )}

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
