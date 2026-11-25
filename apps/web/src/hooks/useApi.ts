import { useQuery, useMutation, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { AxiosRequestConfig } from 'axios'

export function useApiQuery<T>(
  key: string[],
  url: string,
  config?: AxiosRequestConfig,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const { data } = await api.get<T>(url, config)
      return data
    },
    ...options,
  })
}

export function useApiMutation<TData, TVariables = unknown>(
  url: string,
  method: 'post' | 'put' | 'patch' | 'delete' = 'post',
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>
) {
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      const { data } = await api[method]<TData>(url, variables)
      return data
    },
    ...options,
  })
}
