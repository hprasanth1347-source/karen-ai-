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
import cronRoutes from './cron.js';
import instagramRoutes from './instagram.js';
import skillRoutes from './skills.js';
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
router.use('/v1', cronRoutes);
router.use('/v1/instagram', instagramRoutes);
router.use('/v1', skillRoutes);
router.use('/v1', telegramRoutes);
router.use('/v1', loveModeRoutes);
router.use('/v1', classroomRoutes);

// Top-level aliases
router.use('/', healthRoutes);
router.use('/', integrationRoutes);
router.use('/', aiRoutes);
router.use('/instagram', instagramRoutes);

export default router;
