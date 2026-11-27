import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import { deliverEditionToTelegram, generateDailyEditions, getNewsroomConfig, listEditions, renderEditionHtml, renderEditionPdf, updateNewsroomConfig, } from '../services/newsroom.service.js';
const router = Router();
router.use('/newsroom', requireAuth, requireOwner);
router.get('/newsroom/status', (_req, res) => {
    return success(res, {
        config: getNewsroomConfig(),
        editions: listEditions().slice(0, 20),
    });
});
router.put('/newsroom/config', (req, res) => {
    const updated = updateNewsroomConfig(req.body || {});
    return success(res, updated);
});
router.post('/newsroom/generate', async (_req, res) => {
    const result = await generateDailyEditions();
    return success(res, result, 201);
});
router.post('/newsroom/publish/:id', async (req, res) => {
    const ed = listEditions().find((e) => e.id === String(req.params.id));
    if (!ed)
        return error(res, 'Edition not found', 404, 'NOT_FOUND');
    ed.status = 'published';
    ed.publishedAt = new Date().toISOString();
    const delivered = await deliverEditionToTelegram(ed);
    return success(res, { edition: ed, deliveredToTelegram: delivered });
});
router.get('/newsroom/editions/:id/html', (req, res) => {
    const ed = listEditions().find((e) => e.id === String(req.params.id));
    if (!ed)
        return error(res, 'Edition not found', 404, 'NOT_FOUND');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderEditionHtml(ed));
});
router.get('/newsroom/editions/:id/pdf', async (req, res) => {
    const ed = listEditions().find((e) => e.id === String(req.params.id));
    if (!ed)
        return error(res, 'Edition not found', 404, 'NOT_FOUND');
    const buf = await renderEditionPdf(ed);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="KAREN_TIMES_${ed.editionDate}_${ed.language}.pdf"`);
    return res.send(buf);
});
router.post('/newsroom/pause', (_req, res) => {
    return success(res, updateNewsroomConfig({ paused: true }));
});
router.post('/newsroom/resume', (_req, res) => {
    return success(res, updateNewsroomConfig({ paused: false }));
});
export default router;
