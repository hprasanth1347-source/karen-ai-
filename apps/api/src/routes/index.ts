import { Router } from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.js';
import integrationRoutes from './integrations.js';
import notificationRoutes from './notifications.js';
import activityRoutes from './activity.js';
import aiRoutes from './ai.js';
import taskRoutes from './tasks.js';
import memoryRoutes from './memories.js';
import documentsRoutes from './documents.js';
import googleDriveRoutes from './googleDrive.js';
import googleWorkspaceRoutes from './googleWorkspace.js';
import cronRoutes from './cron.js';
import instagramRoutes from './instagram.js';
import telegramRoutes from './telegram.js';
import loveModeRoutes from './loveMode.js';
import classroomRoutes from './classroom.js';

const router = Router();

// Mount API v1 routes
router.use('/v1', healthRoutes);
router.use('/v1', authRoutes);
router.use('/v1', integrationRoutes);
router.use('/v1', notificationRoutes);
router.use('/v1', activityRoutes);
router.use('/v1', aiRoutes);
router.use('/v1', taskRoutes);
router.use('/v1', memoryRoutes);
router.use('/v1', documentsRoutes);
router.use('/v1', googleDriveRoutes);
router.use('/v1', googleWorkspaceRoutes);
router.use('/v1', cronRoutes);
router.use('/v1/instagram', instagramRoutes);
router.use('/v1', telegramRoutes);
router.use('/v1', loveModeRoutes);
router.use('/v1', classroomRoutes);

// Keep public health check at /health and /api/v1/health; all other routes strictly under /api/v1
router.use('/', healthRoutes);

export default router;
