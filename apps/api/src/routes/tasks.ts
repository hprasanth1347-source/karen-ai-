import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addTask, listTasks, updateTask } from '../services/task.service.js';
import { success, error } from '../utils/response.js';

const router = Router();

router.use('/tasks', requireAuth, requireOwner);

router.get('/tasks', async (req, res) => {
  const items = await listTasks(req.user?.id);
  return success(res, items);
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  due: z.string().trim().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

router.post('/tasks', validate(createTaskSchema), async (req, res) => {
  const created = await addTask(
    req.body.title,
    req.body.due,
    req.body.priority,
    'manual',
    req.user?.id
  );
  return success(res, created, 201);
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  due: z.string().trim().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
});

router.patch('/tasks/:id', validate(updateTaskSchema), async (req, res) => {
  const updated = await updateTask(String(req.params.id), req.body, req.user?.id);
  if (!updated) {
    return error(res, 'Task not found', 404, 'NOT_FOUND');
  }
  return success(res, updated);
});

export default router;
