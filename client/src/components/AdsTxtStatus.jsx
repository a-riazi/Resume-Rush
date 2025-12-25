import { useEffect, useState } from 'react'

export default function AdsTxtStatus() {
  const [status, setStatus] = useState('checking')

  // Only show in development mode
  if (!import.meta.env.DEV) {
    return null
  }

  useEffect(() => {
    let cancelled = false
    async function checkAdsTxt() {
      try {
        const res = await fetch('/ads.txt', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setStatus('missing')
          return
        }
        const text = await res.text()
        const hasGoogle = /google\.com/i.test(text)
        const hasPublisher = /pub-8830477337853124/i.test(text)
        const hasAuth = /f08c47fec0942fa0/i.test(text)
        if (hasGoogle && hasPublisher && hasAuth) {
          if (!cancelled) setStatus('ok')
        } else {
          if (!cancelled) setStatus('partial')
        }
      } catch (e) {
        if (!cancelled) setStatus('missing')
      }
    }
    checkAdsTxt()
    return () => { cancelled = true }
  }, [])

  const label = status === 'ok' ? 'ads.txt: OK' : status === 'partial' ? 'ads.txt: Check' : status === 'checking' ? 'ads.txt: …' : 'ads.txt: Missing'
  const cls = status === 'ok' ? 'status-badge ok' : status === 'partial' ? 'status-badge warn' : status === 'checking' ? 'status-badge checking' : 'status-badge missing'

  return (
    <a href="/ads.txt" className={cls} aria-label={label} title={label} target="_blank" rel="noopener">
      {label}
    </a>
  )
}
