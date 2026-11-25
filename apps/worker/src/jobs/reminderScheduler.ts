// Karen Ultra — Reminder Scheduler Job
// Polls for due reminders and queues notification delivery for each.

export interface ReminderSchedulerPayload {
  look_ahead_minutes?: number;
}

export const reminderSchedulerJob = {
  name: 'reminder-scheduler',

  async process(payload: ReminderSchedulerPayload = {}): Promise<void> {
    const lookAhead = payload.look_ahead_minutes ?? 5;
    console.log(`[reminderScheduler] Checking reminders due in next ${lookAhead} minutes`);

    // TODO: Phase 8 — Automation & Tasks
    // 1. Query reminders WHERE status = 'pending' AND remind_at <= now() + interval
    // 2. For each due reminder:
    //    a. Create a notification row
    //    b. Queue notificationDelivery job for user's preferred channel
    //    c. Update reminder.status = 'sent'
    //    d. If recurrence is set: calculate next remind_at and reset status to 'pending'
    // 3. This job itself is triggered every minute by a cron scheduler

    throw new Error('TODO: Implement reminder scheduler — Phase 8');
  },
};
