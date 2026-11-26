import { Router } from 'express';
import { success } from '../utils/response.js';
const router = Router();
router.get('/health', (_req, res) => {
    return success(res, {
        service: 'karen-ultra-api',
        status: 'online',
        version: '1.0.0',
        timezone: 'Asia/Kolkata',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
export default router;
