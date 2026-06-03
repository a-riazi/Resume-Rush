import axios from 'axios'
import { getTimeTravelOffsetDays } from './devTime'

let apiClientConfigured = false

export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL
    || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.resumerush.io')

  return configuredUrl.replace(/\/$/, '')
}

export function configureApiClient() {
  if (apiClientConfigured) {
    return
  }

  axios.interceptors.request.use((config) => {
    const headers = config.headers || {}
    headers['X-ResumeRush-Time-Offset-Days'] = String(getTimeTravelOffsetDays())

    const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`
    }

    config.headers = headers
    return config
  })

  apiClientConfigured = true
}
