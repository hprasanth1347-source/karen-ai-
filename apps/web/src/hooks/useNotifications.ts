import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Notification {
  id: string
  title: string
  body: string
  read: boolean
  created_at: string
  type?: string
}

interface NotificationsResponse {
  data: Notification[]
  total: number
}

export function useNotifications() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<NotificationsResponse>('/notifications')
      return data
    },
    refetchInterval: 30_000, // poll every 30s
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/mark-all-read')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const notifications = data?.data ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount, isLoading, markRead, markAllRead }
}
