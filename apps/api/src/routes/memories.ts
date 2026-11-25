import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success } from '../utils/response.js';

const router = Router();

const memoriesStore: any[] = [
  { id: '1', content: 'Owner prefers conversational responses in Thanglish by default.', category: 'preference', importance: 5, source: 'user_confirmed' },
  { id: '2', content: 'Primary timezone is Asia/Kolkata (+05:30). Reminders must use IST.', category: 'instruction', importance: 5, source: 'user_confirmed' },
  { id: '3', content: 'Strict female-only voice policy: ElevenLabs female voice confirmed.', category: 'instruction', importance: 5, source: 'user_confirmed' },
];

router.get('/memories', requireAuth, (_req, res) => {
  return success(res, memoriesStore);
});

const createMemorySchema = z.object({
  content: z.string().min(1),
  category: z.enum(['personal', 'work', 'preference', 'fact', 'instruction', 'reminder', 'other']).default('fact'),
});

router.post('/memories', requireAuth, validate(createMemorySchema), (req, res) => {
  const newMemory = {
    id: Date.now().toString(),
    ...req.body,
    importance: 4,
    source: 'user_confirmed',
    created_at: new Date().toISOString(),
  };
  memoriesStore.push(newMemory);
  return success(res, newMemory, 201);
});

export default router;
