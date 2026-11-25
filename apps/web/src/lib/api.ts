import axios from 'axios'
import { supabase } from './supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Inject auth token on each request
api.interceptors.request.use(async (config) => {
  if (!supabase) return config
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 → sign out only for actual session auth failures
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const code = error.response?.data?.code
    if (
      error.response?.status === 401 &&
      code !== 'DRIVE_NOT_CONNECTED' &&
      code !== 'GMAIL_NOT_CONNECTED'
    ) {
      if (supabase) await supabase.auth.signOut()
      window.location.href = '/auth'
    }
    return Promise.reject(error)
  }
)
