import axios, { type AxiosResponse } from 'axios'
import { supabase } from './supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Persistent Stale-While-Revalidate cache for instant menu switching
const GET_CACHE_TTL_MS = 180_000;
const SWR_STORAGE_KEY = 'karen_swr_cache_v1';
const getCache = new Map<string, { expiresAt: number; response: AxiosResponse }>();

function readSessionCacheEntry(cacheKey: string): { expiresAt: number; response: AxiosResponse } | null {
  const mem = getCache.get(cacheKey);
  if (mem) return mem;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SWR_STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, { expiresAt: number; data: unknown }>;
    const hit = store[cacheKey];
    if (!hit) return null;
    const synthetic = { data: hit.data, status: 200, statusText: 'OK', headers: {}, config: {} } as AxiosResponse;
    getCache.set(cacheKey, { expiresAt: hit.expiresAt, response: synthetic });
    return { expiresAt: hit.expiresAt, response: synthetic };
  } catch {
    return null;
  }
}

function writeSessionCacheEntry(cacheKey: string, res: AxiosResponse): void {
  const expiresAt = Date.now() + GET_CACHE_TTL_MS;
  getCache.set(cacheKey, { expiresAt, response: res });
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(SWR_STORAGE_KEY);
    const store: Record<string, { expiresAt: number; data: unknown }> = raw ? JSON.parse(raw) : {};
    store[cacheKey] = { expiresAt, data: res.data };
    // Keep up to 40 cached endpoints bounded cleanly
    const keys = Object.keys(store);
    if (keys.length > 40) {
      delete store[keys[0]];
    }
    window.sessionStorage.setItem(SWR_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

export function readCachedGet<T = unknown>(url: string, params?: Record<string, unknown>): T | null {
  const cacheKey = params ? `${url}?${JSON.stringify(params)}` : url;
  const hit = readSessionCacheEntry(cacheKey);
  return hit ? (hit.response.data as T) : null;
}

export function invalidateCacheByUrl(url: string): void {
  const scopeGroups: Array<[RegExp, string[]]> = [
    [/^\/ai/, ['/ai/conversations', '/ai/models']],
    [/^\/(tasks|google-tasks)/, ['/tasks', '/google-tasks']],
    [/^\/calendar/, ['/calendar']],
    [/^\/sheets/, ['/sheets', '/drive']],
    [/^\/(drive|gmail)/, ['/drive', '/gmail', '/sheets', '/classroom']],
    [/^\/google-contacts/, ['/google-contacts']],
    [/^\/instagram/, ['/instagram']],
    [/^\/classroom/, ['/classroom']],
    [/^\/telegram/, ['/telegram']],
    [/^\/notifications/, ['/notifications']],
    [/^\/memories/, ['/memories']],
  ];

  const matched = scopeGroups.find(([re]) => re.test(url));
  const prefixes = matched ? matched[1] : [url.split('?')[0]];

  for (const key of Array.from(getCache.keys())) {
    if (prefixes.some((p) => key.startsWith(p))) {
      getCache.delete(key);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(SWR_STORAGE_KEY);
      if (raw) {
        const store = JSON.parse(raw) as Record<string, unknown>;
        let changed = false;
        for (const key of Object.keys(store)) {
          if (prefixes.some((p) => key.startsWith(p))) {
            delete store[key];
            changed = true;
          }
        }
        if (changed) {
          window.sessionStorage.setItem(SWR_STORAGE_KEY, JSON.stringify(store));
        }
      }
    } catch {
      // Ignore
    }
  }
}

const rawGet = api.get.bind(api);
const rawPost = api.post.bind(api);
const rawPut = api.put.bind(api);
const rawPatch = api.patch.bind(api);
const rawDelete = api.delete.bind(api);

api.get = (async (url: string, config?: any) => {
  const cacheKey = config?.params ? `${url}?${JSON.stringify(config.params)}` : url;
  const cached = readSessionCacheEntry(cacheKey);
  if (cached && cached.expiresAt > Date.now() && !config?.skipCache) {
    return cached.response;
  }
  const res = await rawGet(url, config);
  if (!config?.skipCache && res.status >= 200 && res.status < 300) {
    writeSessionCacheEntry(cacheKey, res);
  }
  return res;
}) as typeof api.get;

api.post = (async (url: string, ...rest: any[]) => {
  invalidateCacheByUrl(url);
  return (rawPost as any)(url, ...rest);
}) as typeof api.post;

api.put = (async (url: string, ...rest: any[]) => {
  invalidateCacheByUrl(url);
  return (rawPut as any)(url, ...rest);
}) as typeof api.put;

api.patch = (async (url: string, ...rest: any[]) => {
  invalidateCacheByUrl(url);
  return (rawPatch as any)(url, ...rest);
}) as typeof api.patch;

api.delete = (async (url: string, ...rest: any[]) => {
  invalidateCacheByUrl(url);
  return (rawDelete as any)(url, ...rest);
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
    const rawErr = error?.response?.data?.error;
    if (rawErr && typeof rawErr === 'object') {
      const msg = (rawErr as { message?: string }).message;
      const code = (rawErr as { code?: string }).code;
      error.response.data.error = msg || (code ? `Error (${code})` : 'Request failed.');
    }
    const status = error?.response?.status;
    const errorCode = (error?.response?.data as { code?: string } | undefined)?.code;
    const isProviderNotConnected =
      errorCode === 'GMAIL_NOT_CONNECTED' ||
      errorCode === 'DRIVE_NOT_CONNECTED' ||
      errorCode === 'GOOGLE_NOT_CONNECTED';

    if (status === 401 && !isProviderNotConnected && typeof window !== 'undefined') {
      getCache.clear();
      try {
        window.sessionStorage.removeItem('karen_auth_session');
      } catch {
        // Ignore storage errors
      }
      if (supabase) {
        await supabase.auth.signOut().catch(() => { });
      }
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.assign('/auth?expired=1');
      }
    }
    return Promise.reject(error);
  }
)
