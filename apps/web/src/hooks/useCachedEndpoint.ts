import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api, readCachedGet } from '../lib/api';

interface ApiEnvelope<T> {
  ok?: boolean;
  data?: T;
}

export function useCachedEndpoint<T>(
  url: string,
  options?: {
    params?: Record<string, unknown>;
    enabled?: boolean;
    staleTimeMs?: number;
    refetchIntervalMs?: number;
    queryOptions?: Partial<UseQueryOptions<T>>;
  }
) {
  const cacheKey = options?.params ? `${url}?${JSON.stringify(options.params)}` : url;
  const initialCached = readCachedGet<ApiEnvelope<T>>(url, options?.params)?.data;

  return useQuery<T>({
    queryKey: ['karen-endpoint', cacheKey],
    enabled: options?.enabled ?? true,
    initialData: initialCached,
    staleTime: options?.staleTimeMs ?? 120_000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: options?.refetchIntervalMs,
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<T>>(url, {
        params: options?.params,
        skipCache: true,
      } as any);
      return res.data?.data as T;
    },
    ...(options?.queryOptions || {}),
  });
}
