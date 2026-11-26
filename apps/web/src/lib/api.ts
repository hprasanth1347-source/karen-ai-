import axios, { type AxiosResponse } from 'axios'
import { supabase } from './supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Short-TTL in-memory GET cache for instant menu switching (invalidated on any mutation)
const GET_CACHE_TTL_MS = 15_000;
const getCache = new Map<string, { expiresAt: number; response: AxiosResponse }>();

const rawGet = api.get.bind(api);
const rawPost = api.post.bind(api);
const rawPut = api.put.bind(api);
const rawPatch = api.patch.bind(api);
const rawDelete = api.delete.bind(api);

api.get = (async (url: string, config?: any) => {
  const cacheKey = config?.params ? `${url}?${JSON.stringify(config.params)}` : url;
  const cached = getCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && !config?.skipCache) {
    return cached.response;
  }
  const res = await rawGet(url, config);
  if (!config?.skipCache && res.status >= 200 && res.status < 300) {
    getCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, response: res });
  }
  return res;
}) as typeof api.get;

api.post = (async (...args: Parameters<typeof rawPost>) => {
  getCache.clear();
  return rawPost(...args);
}) as typeof api.post;

api.put = (async (...args: Parameters<typeof rawPut>) => {
  getCache.clear();
  return rawPut(...args);
}) as typeof api.put;

api.patch = (async (...args: Parameters<typeof rawPatch>) => {
  getCache.clear();
  return rawPatch(...args);
}) as typeof api.patch;

api.delete = (async (...args: Parameters<typeof rawDelete>) => {
  getCache.clear();
  return rawDelete(...args);
}) as typeof api.delete;

// Inject auth token synchronously from sessionStorage first, falling back to Supabase
api.interceptors.request.use(async (config) => {
  let token: string | undefined;

  if (typeof window !== 'undefined') {
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

  if (!token && supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
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
