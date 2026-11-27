// Karen Ultra — Worker Entry Point
// Sets up job queues and handles graceful shutdown

import { documentIngestionJob } from './jobs/documentIngestion.js';
import { gmailSyncJob } from './jobs/gmailSync.js';
import { driveSyncJob } from './jobs/driveSync.js';
import { notificationDeliveryJob } from './jobs/notificationDelivery.js';
import { reminderSchedulerJob } from './jobs/reminderScheduler.js';
import { automationExecutorJob } from './jobs/automationExecutor.js';
import { webhookProcessorJob } from './jobs/webhookProcessor.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const WORKER_VERSION = '0.1.0';
let isShuttingDown = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const activeJobs = new Set<Promise<void>>();

async function bootstrap(): Promise<void> {
  console.log(`🤖 Karen Ultra Worker v${WORKER_VERSION} starting…`);

  // Register all job handlers
  const jobs = [
    documentIngestionJob,
    gmailSyncJob,
    driveSyncJob,
    notificationDeliveryJob,
    reminderSchedulerJob,
    automationExecutorJob,
    webhookProcessorJob,
  ];

  const jobMap = new Map(jobs.map((j) => [j.name, j]));
  for (const job of jobs) {
    console.log(`  ✓ Registered job: ${job.name}`);
  }

  console.log(`✅ Worker ready (${jobMap.size} handlers). Polling interval active.`);

  const tick = async () => {
    if (isShuttingDown) return;
    const p = reminderSchedulerJob
      .process({ look_ahead_minutes: 5 })
      .then(() => {})
      .catch((err: unknown) => {
        console.error('Worker tick error:', err);
      });
    activeJobs.add(p);
    void p.finally(() => activeJobs.delete(p));
  };

  pollTimer = setInterval(() => {
    void tick();
  }, 60_000);
  pollTimer.unref?.();
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n⚡ Received ${signal}. Shutting down worker gracefully…`);
    isShuttingDown = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (activeJobs.size > 0) {
      await Promise.allSettled(Array.from(activeJobs));
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    process.exit(1);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

setupGracefulShutdown();
bootstrap().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
