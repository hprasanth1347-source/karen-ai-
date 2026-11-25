// Karen Ultra — Notification Delivery Job
// Delivers notifications to users across configured channels
// (WhatsApp, Telegram, email, web push).

export interface NotificationDeliveryPayload {
  notification_id: string;
  user_id: string;
  channel: 'web' | 'whatsapp' | 'telegram' | 'email';
  retry_count?: number;
}

export const notificationDeliveryJob = {
  name: 'notification-delivery',

  async process(payload: NotificationDeliveryPayload): Promise<void> {
    console.log(
      `[notificationDelivery] Delivering notification ${payload.notification_id} via ${payload.channel}`,
    );

    // TODO: Phase 7/8 — Notification System
    // 1. Fetch notification row from Supabase
    // 2. Route based on channel:
    //    - web: Supabase Realtime broadcast or SSE
    //    - whatsapp: Call WhatsApp Cloud API send message
    //    - telegram: Call Telegram Bot API sendMessage
    //    - email: Send via SMTP or Resend API
    // 3. Update notification.status (sent / failed)
    // 4. On failure: increment retry_count, re-queue with back-off

    throw new Error('TODO: Implement notification delivery — Phase 7/8');
  },
};
