import { useRef, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'
import BugReport from '../components/BugReport'
import PaywallModal from '../components/PaywallModal'
import JobLimitModal from '../components/JobLimitModal'
import WarningBanner from '../components/WarningBanner'
import { useAuth } from '../context/AuthContext'
import { getApiBaseUrl } from '../lib/api'
import { getAppNow, getMonthlyRemaining, getOneTimeRemaining, isSubscriptionExpired, isMonthlyActive } from '../lib/subscription'

// Base API URL comes from environment; falls back to localhost for dev or same-origin for production
const API_BASE_URL = getApiBaseUrl()

// Maximum number of job descriptions allowed (configurable for API limits)
const MAX_JOB_DESCRIPTIONS = 3

const templateOptions = [
  { key: 'classic',  label: 'Classic',  description: 'Serif, ruled sections, zero color. ATS-safe for any role.',                                      accent: '#5c5c5c', heading: '#111111', body: '#1a1a1a', bg: '#f5f5f5' },
  { key: 'ivy',      label: 'Ivy',      description: 'Centered header, Arial font, Harvard-style layout. Academic & business prestige.',               accent: '#1a3a5c', heading: '#000000', body: '#000000', bg: '#edf0f2' },
  { key: 'prestige', label: 'Prestige', description: 'ALL-CAPS name, bold ruled sections, clean professional single-column.',                          accent: '#2d3748', heading: '#000000', body: '#000000', bg: '#f7f8fa' },
  { key: 'dual',     label: 'Dual',     description: 'Two-column sidebar with skills panel on the left. Modern structured layout.',                    accent: '#2b4590', heading: '#2c3e50', body: '#333333', bg: '#eef2ff' },
  { key: 'apex',     label: 'Apex',     description: 'Executive style with prominent summary box and bold ALL-CAPS section headings.',                 accent: '#6b2d0e', heading: '#000000', body: '#222222', bg: '#fff5f0' },
]

const sampleParsed = {
  name: 'Jordan Lee',
  email: 'jordan.lee@example.com',
  phone: '(555) 123-4567',
  location: 'San Francisco, CA',
  summary: 'Product-focused software engineer with 6+ years building scalable web platforms. Experienced leading full-stack feature delivery and collaborating across design, product, and data teams to ship high-impact products.',
  skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'GraphQL', 'PostgreSQL', 'AWS', 'Docker'],
  education: [
    {
      school: 'University of Washington',
      degree: 'B.S.',
      field: 'Computer Science',
      dates: 'Sep 2014 – Jun 2018',
    },
  ],
  experience: [
    {
      company: 'Nimbus Labs',
      title: 'Senior Software Engineer',
      role: 'Senior Software Engineer',
      dates: 'Jan 2021 – Present',
      description: 'Lead engineer for growth experiments and self-serve onboarding.',
      bullets: [
        'Shipped experimentation platform (React/Node/GraphQL) improving user activation by 12%.',
        'Reduced page load by 28% via code-splitting, bundle analysis, and image optimization.',
        'Mentored 4 engineers; established review guidelines that cut PR cycle time by 18%.',
      ],
    },
    {
      company: 'Brightside',
      title: 'Software Engineer',
      role: 'Software Engineer',
      dates: 'Jun 2018 – Dec 2020',
      description: 'Built customer-facing features and internal tooling for support ops.',
      bullets: [
        'Implemented real-time chat tooling using WebSockets, reducing support response SLA by 22%.',
        'Co-owned design system components; improved accessibility (WCAG AA) across core flows.',
      ],
    },
  ],
  activities: [
    {
      org: 'Personal',
      dates: 'Mar 2024 – Present',
      description: 'Launch notifications tool aggregating changelogs across services with weekly digest.',
    },
  ],
  projects: [
    {
      name: 'Release Radar',
      organization: 'Personal',
      dates: 'Mar 2024 – Present',
      description: 'Launch notifications tool aggregating changelogs across services with weekly digest.',
      technologies: ['Next.js', 'Prisma', 'PostgreSQL', 'Tailwind'],
    },
  ],
  certifications: [],
  awards: [],
  languages: [],
}

const sampleTailored = {
  tailored_summary: 'Product-focused software engineer with 6+ years building scalable web platforms. Experienced leading full-stack feature delivery and collaborating across design, product, and data teams to ship high-impact products.',
  skills_grouped: {
    'Frontend': ['JavaScript', 'TypeScript', 'React'],
    'Backend': ['Node.js', 'GraphQL', 'PostgreSQL'],
    'Infrastructure': ['AWS', 'Docker'],
  },
  tailored_experience: [
    {
      company: 'Nimbus Labs',
      role: 'Senior Software Engineer',
      dates: 'Jan 2021 – Present',
      bullets: [
        'Shipped experimentation platform (React/Node/GraphQL) improving user activation by 12%.',
        'Reduced page load by 28% via code-splitting, bundle analysis, and image optimization.',
        'Mentored 4 engineers; established review guidelines that cut PR cycle time by 18%.',
      ],
    },
    {
      company: 'Brightside',
      role: 'Software Engineer',
      dates: 'Jun 2018 – Dec 2020',
      bullets: [
        'Implemented real-time chat tooling using WebSockets, reducing support response SLA by 22%.',
        'Co-owned design system components; improved accessibility (WCAG AA) across core flows.',
      ],
    },
  ],
  tailored_activities: [
    {
      org: 'Personal',
      role: '',
      dates: 'Mar 2024 – Present',
      bullets: [
        'Launch notifications tool aggregating changelogs across services with weekly digest.',
      ],
    },
  ],
  tailored_projects: [
    {
      name: 'Release Radar',
      organization: 'Personal',
      dates: 'Mar 2024 – Present',
      description: 'Launch notifications tool aggregating changelogs across services with weekly digest.',
      technologies: ['Next.js', 'Prisma', 'PostgreSQL', 'Tailwind'],
    },
  ],
  sections: ['summary', 'experience', 'education', 'skills', 'activities'],
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

export default function Home({ darkMode = false }) {
  const { user, isAuthenticated, subscription, subscriptions } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [usageStats, setUsageStats] = useState({ used: 0, limit: 3, remaining: 3, tier: 'free', resetInfo: 'daily' })
  const [jobDescriptions, setJobDescriptions] = useState([
    { id: Date.now(), title: '', description: '', results: { tailored: null, coverLetter: null }, isLoading: false, error: null }
  ])
  const [error, setError] = useState(null)
  const [activeJobId, setActiveJobId] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editHtmlBackup, setEditHtmlBackup] = useState(null)
  const iframeRef = useRef(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showJobDescription, setShowJobDescription] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewJobId, setPreviewJobId] = useState(null)
  const [resumeHtml, setResumeHtml] = useState(null)
  const [templateKey, setTemplateKey] = useState('classic')
  const [previewLabel, setPreviewLabel] = useState('')
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null)
  const [showUploadPreview, setShowUploadPreview] = useState(false)
  const initialCheckboxState = getInitialCheckboxState()
  const [generateResume, setGenerateResume] = useState(initialCheckboxState.generateResume)
  const [generateCoverLetter, setGenerateCoverLetter] = useState(initialCheckboxState.generateCoverLetter)
  const [limitToOnePage, setLimitToOnePage] = useState(initialCheckboxState.limitToOnePage)
  const [showPaywall, setShowPaywall] = useState(false)
  const [showJobLimitModal, setShowJobLimitModal] = useState(false)
  const [warningMessage, setWarningMessage] = useState(null)
  const [jobLimitMessage, setJobLimitMessage] = useState(null)
  const newJobIdRef = useRef(null)

  // Fetch usage stats on mount and after authentication changes
  useEffect(() => {
    const fetchUsageStats = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        
        console.log('[useEffect] Fetching usage stats, auth token:', !!token)
        const response = await axios.get(`${API_BASE_URL}/api/usage`, { headers })
        console.log('Usage stats fetched:', response.data)
        setUsageStats(response.data)
      } catch (err) {
        console.error('Failed to fetch usage stats:', err)
      }
    }

    fetchUsageStats()
  }, [isAuthenticated, user])

  // Open paywall when user clicks Upgrade in nav
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('upgrade') === '1') {
      setShowPaywall(true)
    }
  }, [location.search])

  useEffect(() => {
    const handleOpenUpgrade = () => setShowPaywall(true)
    window.addEventListener('openUpgrade', handleOpenUpgrade)
    return () => window.removeEventListener('openUpgrade', handleOpenUpgrade)
  }, [])

  useEffect(() => {
    window.addEventListener('resetHome', handleReset)
    return () => window.removeEventListener('resetHome', handleReset)
  }, [])

  useEffect(() => {
    if (!editMode || !iframeRef.current) return
    const iframe = iframeRef.current
    const enable = () => {
      try { iframe.contentDocument.designMode = 'on' } catch (e) { console.warn('designMode unavailable:', e) }
    }
    if (iframe.contentDocument?.readyState === 'complete') {
      enable()
    } else {
      iframe.addEventListener('load', enable, { once: true })
      return () => iframe.removeEventListener('load', enable)
    }
  }, [editMode])

  const handleClosePaywall = () => {
    setShowPaywall(false)
    const params = new URLSearchParams(location.search)
    if (params.get('upgrade') === '1') {
      params.delete('upgrade')
      const nextSearch = params.toString()
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
    }
  }

  useEffect(() => {
    const maxJobs = usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS
    if (jobDescriptions.length > maxJobs) {
      setJobDescriptions((prev) => prev.slice(0, maxJobs))
      setJobLimitMessage(`Your plan allows up to ${maxJobs} job descriptions at a time.`)
    }
  }, [usageStats?.jobsLimit, jobDescriptions.length])

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

  const monthlySubscription = subscriptions?.monthly || (subscription?.tier === 'monthly' ? subscription : null)
  const oneTimeSubscription = subscriptions?.oneTime || (subscription?.tier === 'one-time' ? subscription : null)
  const monthlyRemaining = getMonthlyRemaining(monthlySubscription, usageStats)
  const oneTimeRemaining = getOneTimeRemaining(oneTimeSubscription, usageStats, monthlySubscription)

  // Generate usage display text based on tier
  const getUsageDisplayText = () => {
    try {
      const monthlyActive = isMonthlyActive(monthlySubscription) && monthlyRemaining > 0
      const oneTimeEnd = oneTimeSubscription?.currentPeriodEnd ? new Date(oneTimeSubscription.currentPeriodEnd) : null
      const oneTimeActive = Boolean(oneTimeSubscription && oneTimeEnd && oneTimeEnd > getAppNow() && oneTimeRemaining > 0)
      const defaultDailyLimit = isAuthenticated ? 6 : 3

      if (oneTimeActive && monthlyActive) {
        return `${oneTimeRemaining} one-time pass generations left, ${monthlyRemaining} monthly generations left`
      }

      if (oneTimeActive) {
        return `${oneTimeRemaining} one-time pass generations left`
      }

      if (monthlyActive) {
        return `${monthlyRemaining} monthly generations left`
      }

      return `${defaultDailyLimit} daily generations left`
    } catch (err) {
      console.error('[Home] Failed to render usage text:', err)
      return 'Usage information unavailable'
    }
  };

  

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
    setResumeHtml(null)
    setPreviewJobId(null)
    setActiveJobId(null)
    setShowOriginal(false)
    setShowJobDescription(false)
    sessionStorage.removeItem(HOME_STATE_KEY)
  }

  const addNewJobDescription = () => {
    const maxJobs = usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS
    const isMaxTier = usageStats?.tier === 'monthly' && maxJobs >= 10
    if (jobDescriptions.length >= maxJobs) {
      setShowJobLimitModal(true)
      setJobLimitMessage(
        isMaxTier
          ? `You've reached the maximum of ${maxJobs} concurrent job descriptions for the highest plan.`
          : `You've reached the maximum of ${maxJobs} concurrent job descriptions for your plan.`
      )
      return
    }
    setJobLimitMessage(null)
    const newId = Date.now()
    newJobIdRef.current = newId
    setJobDescriptions([...jobDescriptions, { id: newId, title: '', description: '', results: { tailored: null, coverLetter: null }, isLoading: false, error: null }])
  }

  const handleAddJobClick = () => {
    const maxJobs = usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS
    const isMaxTier = usageStats?.tier === 'monthly' && maxJobs >= 10
    if (jobDescriptions.length >= maxJobs) {
      setShowJobLimitModal(true)
      setJobLimitMessage(
        isMaxTier
          ? `You've reached the maximum of ${maxJobs} concurrent job descriptions for the highest plan.`
          : `You've reached the maximum of ${maxJobs} concurrent job descriptions for your plan.`
      )
      return
    }
    addNewJobDescription()
  }

  const handleRemoveFile = () => {
    revokePreviewUrl()
    setFile(null)
    setResult(null)
    setResumeHtml(null)
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
    setJobLimitMessage(null)
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
      // Fetch fresh usage stats to ensure accurate limit check
      let currentUsage = usageStats
      try {
        const token = localStorage.getItem('auth_token')
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const usageResponse = await axios.get(`${API_BASE_URL}/api/usage`, { headers })
        currentUsage = usageResponse.data
        console.log('[handleUpload] Fresh usage stats:', currentUsage)
        setUsageStats(currentUsage)
      } catch (err) {
        console.warn('[handleUpload] Failed to fetch fresh usage stats, using cached:', err)
      }

      // Check if user has generations remaining BEFORE uploading
      console.log('[handleUpload] Checking usage: remaining=', currentUsage.remaining, 'limit=', currentUsage.limit)
      if (currentUsage.remaining <= 0) {
        console.log('[handleUpload] Usage limit reached, showing paywall')
        setShowPaywall(true)
        setLoading(false)
        setError('You have reached your generation limit. Please upgrade your plan.')
        return
      }

      console.log('[handleUpload] Usage check passed, proceeding with upload')
      const formData = new FormData()
      formData.append('resume', file)
      formData.append('jobDescription', '')
      formData.append('generateResume', generateResume)
      formData.append('generateCoverLetter', generateCoverLetter)
      formData.append('limitToOnePage', limitToOnePage)

      const parseResponse = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: localStorage.getItem('auth_token') ? `Bearer ${localStorage.getItem('auth_token')}` : undefined,
        },
      })

      if (!parseResponse.data.success) {
        setError('Failed to parse resume. Please try again.')
        setLoading(false)
        return
      }

      // Update usage stats after successful upload
      if (parseResponse.data.usage) {
        console.log('[handleUpload] Updating usage stats from upload response:', parseResponse.data.usage)
        setUsageStats(parseResponse.data.usage)
      }

      setResult(parseResponse.data.data)

      // Process jobs sequentially (not in parallel) to properly track usage between jobs
      const updatedJobs = []
      let remainingGenerations = currentUsage.remaining
      let limitReached = false

      for (const job of jobDescriptions) {
        if (!job.description.trim()) {
          console.log(`[handleUpload] Skipping job ${job.id} - no description`)
          updatedJobs.push(job)
          continue
        }

        // Check if we've reached the limit before processing this job
        if (remainingGenerations <= 0) {
          console.log(`[handleUpload] Limit reached, stopping job processing`)
          limitReached = true
          updatedJobs.push(job)
          continue
        }

        try {
          console.log(`[handleUpload] Processing job ${job.id}: "${job.description.substring(0, 50)}..."`)
          const tailorPayload = {
            parsed: parseResponse.data.data,
            jobDescription: job.description.trim(),
            generateResume: generateResume,
            generateCoverLetter: generateCoverLetter,
            limitToOnePage: limitToOnePage,
            templateKey: templateKey
          }

          console.log(`[handleUpload] Sending tailor request for job ${job.id}...`)
          const jobResponse = await axios.post(`${API_BASE_URL}/api/tailor`, tailorPayload, {
            headers: {
              Authorization: localStorage.getItem('auth_token') ? `Bearer ${localStorage.getItem('auth_token')}` : undefined,
            },
            timeout: 120000 // 2 minute timeout
          })
          console.log(`[handleUpload] Received tailor response for job ${job.id}:`, jobResponse.data)

          const inferredTitle = job.title?.trim() || await inferJobTitle(job.description)

          if (jobResponse.data.success) {
            // Update usage stats and remaining counter
            if (jobResponse.data.usage) {
              setUsageStats(jobResponse.data.usage)
              remainingGenerations = jobResponse.data.usage.remaining
            }

            // Check for warning message
            if (jobResponse.data.warning && jobResponse.data.warningMessage) {
              setWarningMessage(jobResponse.data.warningMessage)
            }

            updatedJobs.push({
              ...job,
              title: inferredTitle || job.title,
              results: {
                tailored: jobResponse.data.tailored || null,
                coverLetter: jobResponse.data.coverLetter || null,
              },
              isLoading: false,
              error: null,
            })
          } else {
            updatedJobs.push({
              ...job,
              title: inferredTitle || job.title,
              isLoading: false,
              error: 'Failed to tailor for this job',
            })
          }
        } catch (err) {
          console.error('Tailoring error for job:', err)

          // Check if it's a 402 Payment Required error
          if (err.response?.status === 402) {
            console.log('[handleUpload] Hit usage limit (402 error)')
            if (err.response?.data) {
              const nextUsage = {
                used: err.response.data.used !== undefined ? err.response.data.used : usageStats.used,
                limit: err.response.data.limit || usageStats.limit,
                remaining: 0,
                tier: err.response.data.tier || usageStats.tier,
                resetInfo: usageStats.resetInfo,
              }
              setUsageStats(nextUsage)
              remainingGenerations = 0
            }
            setShowPaywall(true)
            limitReached = true
            updatedJobs.push(job)
            continue
          }

          const inferredTitle = job.title?.trim() || await inferJobTitle(job.description)
          updatedJobs.push({
            ...job,
            title: inferredTitle || job.title,
            isLoading: false,
            error: err.response?.data?.error || 'Failed to tailor for this job',
          })
        }
      }

      if (limitReached) {
        setShowPaywall(true)
      }

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
    setResumeHtml(null)
    revokePreviewUrl()
    setFile(null)
    setResult(null)
    setJobDescriptions([{ id: Date.now(), title: '', description: '', results: { tailored: null, coverLetter: null }, isLoading: false, error: null }])
    setError(null)
    setShowOriginal(false)
    setShowJobDescription(false)
    setShowPreview(false)
    setTemplateKey('classic')
    setActiveJobId(null)
    setPreviewJobId(null)
    sessionStorage.removeItem(HOME_STATE_KEY)
  }

  const handlePreviewResume = async (jobId) => {
    if (!result) return
    const activeJob = jobDescriptions.find(j => j.id === jobId)
    if (!activeJob || !activeJob.results.tailored) return

    setDownloading(true)
    setError(null)
    setPreviewLabel(`${activeJob.title ? activeJob.title : 'Job'} · Resume`)
    setPreviewJobId(jobId)

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/export-html`,
        { parsed: result, tailored: activeJob.results.tailored || null, templateKey },
        { responseType: 'text' }
      )
      setResumeHtml(response.data)
      setShowPreview(true)
    } catch (err) {
      console.error('Preview error:', err)
      setError('Failed to generate resume preview. Please try again.')
    } finally {
      setDownloading(false)
    }
  }



  const handleSamplePreview = async (overrideKey) => {
    const activeKey = overrideKey || templateKey
    const activeLabel = templateOptions.find(o => o.key === activeKey)?.label || activeKey
    setDownloading(true)
    setError(null)
    setPreviewLabel(`Sample · ${activeLabel}`)
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/export-html`,
        { parsed: sampleParsed, tailored: sampleTailored, templateKey: activeKey },
        { responseType: 'text' }
      )
      setResumeHtml(response.data)
      setShowPreview(true)
    } catch (err) {
      console.error('Sample preview error:', err)
      setError('Failed to generate sample preview. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleClosePreview = () => {
    setEditMode(false)
    setEditHtmlBackup(null)
    setShowPreview(false)
  }

  const handleStartEdit = () => {
    setEditHtmlBackup(resumeHtml)
    setEditMode(true)
  }

  const handleSaveEdits = () => {
    if (iframeRef.current?.contentDocument) {
      const updated = '<!DOCTYPE html>\n' + iframeRef.current.contentDocument.documentElement.outerHTML
      setResumeHtml(updated)
    }
    setEditMode(false)
    setEditHtmlBackup(null)
  }

  const handleCancelEdit = () => {
    if (editHtmlBackup) {
      setResumeHtml(editHtmlBackup)
      setEditHtmlBackup(null)
    }
    setEditMode(false)
  }

  const handleDownloadPDF = async () => {
    // If editing, capture live iframe HTML so edits appear in the PDF
    let rawHtml = null
    if (editMode && iframeRef.current?.contentDocument) {
      rawHtml = '<!DOCTYPE html>\n' + iframeRef.current.contentDocument.documentElement.outerHTML
      setResumeHtml(rawHtml)
      setEditMode(false)
      setEditHtmlBackup(null)
    }

    let targetParsed = result || sampleParsed
    let targetTailored = null
    if (previewLabel.includes('Sample')) {
      targetTailored = sampleTailored
      targetParsed = sampleParsed
    } else if (previewJobId && result) {
      const activeJob = jobDescriptions.find(j => j.id === previewJobId)
      if (activeJob) targetTailored = activeJob.results.tailored || null
    }

    setDownloading(true)
    try {
      const payload = rawHtml
        ? { html: rawHtml }
        : { parsed: targetParsed, tailored: targetTailored, templateKey }
      const response = await axios.post(
        `${API_BASE_URL}/api/export-pdf`,
        payload,
        { responseType: 'blob' }
      )
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'Tailored_Resume.pdf')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF download error:', err)
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) {
        window.URL.revokeObjectURL(uploadPreviewUrl)
        // don't call setUploadPreviewUrl during unmount
      }
    }
  }, [uploadPreviewUrl])



  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> Resume Rush</h1>
        <p>AI-Powered Resume Tailor</p>
      </header>

      {/* Usage Counter Badge */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '12px',
        opacity: 0.92,
      }}>
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          color: '#1e40af',
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '0.85rem',
          fontWeight: 600,
          border: '1px solid rgba(59, 130, 246, 0.3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span>✨</span>
          <span>{getUsageDisplayText()}</span>
        </div>
      </div>

      <div className="container">
        {/* Warning Banner */}
        <WarningBanner 
          message={warningMessage}
          onClose={() => setWarningMessage(null)}
        />
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
              </div>
              {jobLimitMessage && (
                <div className="job-limit-banner">
                  <span>⚠️</span>
                  <p>{jobLimitMessage}</p>
                  <button type="button" onClick={() => setJobLimitMessage(null)}>×</button>
                </div>
              )}
              
              {jobDescriptions.map((job, index) => (
                <div key={job.id} className="job-input-group">
                  <div className="job-group-header">
                    <span className="job-slot">#{index + 1}</span>
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
                      ref={(el) => {
                        if (newJobIdRef.current === job.id && el) {
                          newJobIdRef.current = null
                          el.focus()
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      }}
                    />
                    <span className="char-count">{job.description.length} chars</span>
                  </div>
                </div>
              ))}

              <div className="job-add-row">
                <button 
                  onClick={handleAddJobClick} 
                  className="btn-secondary add-job-btn"
                  aria-disabled={jobDescriptions.length >= (usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS)}
                  title={jobDescriptions.length >= (usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS) ? `Maximum ${usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS} jobs allowed` : ''}
                >
                  + Add Job
                </button>
              </div>

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
                          <div className="template-sample-pill" style={{ background: opt.accent, color: '#fff' }}>
                              {opt.label}
                            </div>
                            {opt.description && (
                              <div className="template-sample-desc">{opt.description}</div>
                            )}
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
                    <>
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
                        {job.results.tailored && (
                          <button onClick={() => handlePreviewResume(job.id)} className="btn-secondary btn-preview" disabled={downloading}>
                            {downloading && previewJobId === job.id ? 'Preparing...' : 'Preview Resume'}
                          </button>
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
                    </>
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

        {showPreview && resumeHtml && (
          <div className="modal-overlay" onClick={editMode ? undefined : handleClosePreview}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  {previewLabel || 'Resume Preview'}
                  {editMode && (
                    <span style={{ fontSize: '0.7em', fontWeight: 'normal', marginLeft: '0.75rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '4px', verticalAlign: 'middle' }}>
                      Editing
                    </span>
                  )}
                </h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {editMode ? (
                    <>
                      <button onClick={handleSaveEdits} className="btn-primary" disabled={downloading}>
                        Save Edits
                      </button>
                      <button onClick={handleCancelEdit} className="btn-secondary" disabled={downloading}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleDownloadPDF} className="btn-primary" disabled={downloading}>
                        {downloading ? 'Preparing PDF...' : 'Download PDF'}
                      </button>
                      <button onClick={handleStartEdit} className="btn-secondary" disabled={downloading}>
                        Edit
                      </button>
                      <button onClick={handleClosePreview} className="btn-secondary" disabled={downloading}>
                        Close
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editMode && (
                <div style={{ padding: '6px 16px', background: '#fffbeb', borderBottom: '1px solid #fcd34d', fontSize: '0.8rem', color: '#78350f' }}>
                  Click any text on the resume to edit it. Press <strong>Save Edits</strong> when done, or <strong>Cancel</strong> to discard changes.
                </div>
              )}
              <div className="modal-body">
                <iframe
                  ref={iframeRef}
                  srcDoc={resumeHtml}
                  title="Resume Preview"
                  className="pdf-preview"
                  style={editMode ? { outline: '2px solid #f59e0b', cursor: 'text' } : {}}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}

        {/* Paywall Modal */}
        {showPaywall && (
          <PaywallModal 
            isOpen={showPaywall}
            onClose={handleClosePaywall}
            tier={usageStats.tier}
            remaining={usageStats.remaining}
            limit={usageStats.limit}
            bonusGenerations={usageStats.bonusGenerations}
            bonusDaysLeft={usageStats.bonusDaysLeft}
            oneTimeSubscription={subscriptions?.oneTime}
            monthlySubscription={subscriptions?.monthly}
          />
        )}

        {/* Job Limit Modal */}
        <JobLimitModal
          isOpen={showJobLimitModal}
          onClose={() => setShowJobLimitModal(false)}
          jobsLimit={usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS}
          isMaxTier={usageStats?.tier === 'monthly' && (usageStats?.jobsLimit || MAX_JOB_DESCRIPTIONS) >= 10}
          onUpgrade={() => {
            setShowJobLimitModal(false)
            setShowPaywall(true)
          }}
        />
      </div>
      <BugReport />
    </div>
  )
}
