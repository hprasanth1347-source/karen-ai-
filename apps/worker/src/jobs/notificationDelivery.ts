export interface NotificationDeliveryPayload {
  notificationId?: string;
  userId: string;
  channel: 'telegram' | 'web' | 'email';
  title: string;
  body: string;
}

export const notificationDeliveryJob = {
  name: 'notification-delivery',
  async process(payload: NotificationDeliveryPayload): Promise<{ ok: boolean; channel: string }> {
    if (!payload.userId || !payload.title) {
      throw new Error('userId and title are required for notification-delivery');
    }
    console.log(`[notificationDelivery] Delivering via ${payload.channel} to user=${payload.userId}`);
    return { ok: true, channel: payload.channel };
  },
};
