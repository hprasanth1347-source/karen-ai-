export interface ReminderSchedulerPayload {
  look_ahead_minutes?: number;
  apiBaseUrl?: string;
  cronSecret?: string;
}

export const reminderSchedulerJob = {
  name: 'reminder-scheduler',
  async process(payload: ReminderSchedulerPayload = {}): Promise<{ ok: boolean; processed: number }> {
    const base = payload.apiBaseUrl || process.env.API_INTERNAL_URL || 'http://localhost:8080';
    const secret = payload.cronSecret || process.env.CRON_SECRET || '';
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/cron/reminders`, {
        method: 'POST',
        headers: secret ? { 'x-cron-secret': secret } : {},
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (res?.ok) {
        const json = (await res.json().catch(() => ({}))) as { data?: { processed?: number } };
        return { ok: true, processed: json.data?.processed ?? 0 };
      }
    } catch {
      // Non-fatal when API is offline during standalone worker boot
    }
    return { ok: true, processed: 0 };
  },
};
