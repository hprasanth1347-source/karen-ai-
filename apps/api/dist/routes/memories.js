import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addMemory, deleteMemory, listMemories } from '../services/memory.service.js';
import { success } from '../utils/response.js';
const router = Router();
router.use('/memories', requireAuth, requireOwner);
router.get('/memories', async (req, res) => {
    const items = await listMemories(req.user?.id);
    return success(res, items);
});
const createMemorySchema = z.object({
    content: z.string().trim().min(1).max(2000),
    category: z.enum(['personal', 'work', 'preference', 'fact', 'instruction', 'reminder', 'other']).default('fact'),
});
router.post('/memories', validate(createMemorySchema), async (req, res) => {
    const newMemory = await addMemory(req.body.content, req.body.category, req.user?.id);
    return success(res, newMemory, 201);
});
router.delete('/memories/:id', async (req, res) => {
    await deleteMemory(req.params.id, req.user?.id);
    return success(res, { deleted: true });
});
export default router;
