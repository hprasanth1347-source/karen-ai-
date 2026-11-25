import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success } from '../utils/response.js';

const router = Router();

const tasksStore: any[] = [
  { id: '1', title: 'Complete Karen Ultra Master Build Documentation', due: '2026-11-23', priority: 'urgent', status: 'in_progress', source: 'manual' },
  { id: '2', title: 'Review AWS Cloud Billing Statement ($14.20)', due: '2026-11-25', priority: 'medium', status: 'todo', source: 'email_derived' },
  { id: '3', title: 'Submit Semester Project Presentation Slides', due: '2026-11-27', priority: 'high', status: 'todo', source: 'document_derived' },
];

router.get('/tasks', requireAuth, (_req, res) => {
  return success(res, tasksStore);
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  due: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

router.post('/tasks', requireAuth, validate(createTaskSchema), (req, res) => {
  const newTask = {
    id: Date.now().toString(),
    ...req.body,
    status: 'todo',
    source: 'manual',
    created_at: new Date().toISOString(),
  };
  tasksStore.push(newTask);
  return success(res, newTask, 201);
});

router.patch('/tasks/:id', requireAuth, (req, res) => {
  const task = tasksStore.find((t) => t.id === req.params.id);
  if (task) {
    Object.assign(task, req.body);
  }
  return success(res, task);
});

export default router;
