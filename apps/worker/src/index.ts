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

  for (const job of jobs) {
    console.log(`  ✓ Registered job: ${job.name}`);
  }

  console.log('✅ Worker ready. Waiting for jobs…');

  // TODO: Connect to job queue (BullMQ / pg-boss / Supabase Realtime)
  // await setupBullMQ();
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n⚡ Received ${signal}. Shutting down worker gracefully…`);
    // TODO: Drain job queues before exiting
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
