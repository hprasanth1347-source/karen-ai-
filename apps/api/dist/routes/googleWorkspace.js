import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { appendGoogleSheetRows, createCalendarEvent, createGoogleContact, createGoogleSheet, createGoogleTask, listCalendarEvents, listGoogleContacts, listGoogleTasks, readGoogleSheet, updateGoogleSheetRange, } from '../services/googleWorkspace.service.js';
import { success, error } from '../utils/response.js';
const router = Router();
router.use(requireAuth, requireOwner);
router.get('/calendar/events', async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 7;
    const result = await listCalendarEvents(days, req.user?.id);
    if (!result.ok)
        return error(res, result.error || 'Calendar fetch failed', 400);
    return success(res, result.events);
});
router.post('/calendar/events', validate(z.object({
    summary: z.string().min(1).max(200),
    startIso: z.string().min(4),
    endIso: z.string().optional(),
    description: z.string().max(1000).optional(),
})), async (req, res) => {
    const result = await createCalendarEvent({ ...req.body, userId: req.user?.id });
    if (!result.ok)
        return error(res, result.error || 'Calendar create failed', 400);
    return success(res, result.event, 201);
});
router.get('/google-tasks', async (req, res) => {
    const result = await listGoogleTasks(req.user?.id);
    if (!result.ok)
        return error(res, result.error || 'Google Tasks fetch failed', 400);
    return success(res, result.tasks);
});
router.post('/google-tasks', validate(z.object({
    title: z.string().min(1).max(200),
    notes: z.string().max(1000).optional(),
    dueIso: z.string().optional(),
})), async (req, res) => {
    const result = await createGoogleTask({ ...req.body, userId: req.user?.id });
    if (!result.ok)
        return error(res, result.error || 'Google Task create failed', 400);
    return success(res, result.task, 201);
});
router.post('/sheets/create', validate(z.object({
    title: z.string().min(1).max(160),
    headers: z.array(z.string()).optional(),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).optional(),
})), async (req, res) => {
    const result = await createGoogleSheet({ ...req.body, userId: req.user?.id });
    if (!result.ok)
        return error(res, result.error || 'Sheet create failed', 400);
    return success(res, result, 201);
});
router.get('/sheets/:id', async (req, res) => {
    const range = typeof req.query.range === 'string' ? req.query.range : 'A1:Z50';
    const result = await readGoogleSheet({ spreadsheetId: String(req.params.id), range, userId: req.user?.id });
    if (!result.ok)
        return error(res, result.error || 'Sheet read failed', 400);
    return success(res, result.values);
});
router.post('/sheets/:id/append', validate(z.object({
    range: z.string().optional(),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).min(1),
})), async (req, res) => {
    const result = await appendGoogleSheetRows({
        spreadsheetId: String(req.params.id),
        range: req.body.range,
        rows: req.body.rows,
        userId: req.user?.id,
    });
    if (!result.ok)
        return error(res, result.error || 'Sheet append failed', 400);
    return success(res, result);
});
router.put('/sheets/:id/update', validate(z.object({
    range: z.string().min(1),
    values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).min(1),
})), async (req, res) => {
    const result = await updateGoogleSheetRange({
        spreadsheetId: String(req.params.id),
        range: req.body.range,
        values: req.body.values,
        userId: req.user?.id,
    });
    if (!result.ok)
        return error(res, result.error || 'Sheet update failed', 400);
    return success(res, result);
});
router.get('/google-contacts', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const result = await listGoogleContacts(q, req.user?.id);
    if (!result.ok)
        return error(res, result.error || 'Contacts fetch failed', result.needsReconnect ? 403 : 400);
    return success(res, result.contacts);
});
router.post('/google-contacts', validate(z.object({
    givenName: z.string().min(1).max(120),
    familyName: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
})), async (req, res) => {
    const result = await createGoogleContact({ ...req.body, userId: req.user?.id });
    if (!result.ok)
        return error(res, result.error || 'Contact create failed', 400);
    return success(res, result.contact, 201);
});
export default router;
