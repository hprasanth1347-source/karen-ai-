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
import instagramRoutes from './instagram.js';
import skillRoutes from './skills.js';
import { telegramWebhook } from '../providers/telegram.js';

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
router.use('/v1/instagram', instagramRoutes);
router.use('/v1', skillRoutes);

// Top-level aliases
router.use('/', healthRoutes);
router.use('/', integrationRoutes);
router.use('/', aiRoutes);
router.use('/instagram', instagramRoutes);

// Telegram Webhooks
router.post('/telegram/webhook', telegramWebhook);
router.post('/api/telegram/webhook', telegramWebhook);

export default router;
