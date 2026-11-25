import axios from 'axios'
import { supabase } from './supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Inject auth token on each request (Supabase sessionStorage or backend session token)
api.interceptors.request.use(async (config) => {
  let token: string | undefined;

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }

  if (!token && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem('karen_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw) as { accessToken?: string };
        token = parsed.accessToken;
      }
    } catch {
      // Ignore storage read errors
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors without forcing hard page reloads
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    return Promise.reject(error)
  }
)
