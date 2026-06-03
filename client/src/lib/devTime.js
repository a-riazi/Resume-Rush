const STORAGE_KEY = 'resumerush.timeTravelEnabled'
const OFFSET_KEY = 'resumerush.timeTravelOffsetDays'

export function getTimeTravelOffsetDays() {
  const fallbackOffsetDays = Number(import.meta.env.VITE_TIME_OFFSET_DAYS || 0)

  if (!import.meta.env.DEV) {
    return 0
  }

  if (typeof window === 'undefined') {
    return fallbackOffsetDays
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY)
  if (storedValue === 'true') {
    const storedOffsetDays = Number(window.localStorage.getItem(OFFSET_KEY) || fallbackOffsetDays)
    return Number.isFinite(storedOffsetDays) ? storedOffsetDays : fallbackOffsetDays
  }

  if (storedValue === 'false') {
    return 0
  }

  return fallbackOffsetDays
}

export function isTimeTravelEnabled() {
  return getTimeTravelOffsetDays() > 0
}

export function setTimeTravelEnabled(enabled) {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return
  }

  if (enabled) {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    window.localStorage.setItem(OFFSET_KEY, String(Number(import.meta.env.VITE_TIME_OFFSET_DAYS || 31)))
  } else {
    window.localStorage.setItem(STORAGE_KEY, 'false')
  }
}

export function getSimulatedDate() {
  return new Date(Date.now() + (getTimeTravelOffsetDays() * 24 * 60 * 60 * 1000))
}