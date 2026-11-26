/**
 * Karen AI – Google Classroom Routes
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimit } from '../middleware/rateLimit.js';
import { success, error } from '../utils/response.js';
import { buildGoogleAuthUrl, disconnectGoogleAccount, getGoogleConnectionStatus, getGoogleRedirectUri, isGoogleOAuthConfigured, } from './googleDrive.js';
import { addManualExam, deleteManualExam, draftClassroomAssignment, explainClassroomAssignment, getClassroomCache, getClassroomOverview, getClassroomSettings, getGradesOverview, joinClassroom, listPendingClassroomInvitations, listClassroomAssignments, runLastMinuteExamPrep, setPersonalAssignmentStatus, summarizeClassroomAnnouncement, syncClassroomData, toggleExamTopicRevised, updateClassroomSettings, } from '../services/classroom.service.js';
const router = Router();
router.use('/classroom', requireAuth, requireOwner);
router.get('/classroom/status', async (req, res) => {
    const [overview, googleStatus] = await Promise.all([
        getClassroomOverview(),
        getGoogleConnectionStatus(req.user?.id, req),
    ]);
    return success(res, {
        configured: isGoogleOAuthConfigured(),
        googleStatus,
        ...overview,
    });
});
router.get('/classroom/auth-url', (req, res) => {
    if (!isGoogleOAuthConfigured()) {
        return error(res, 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured.', 400, 'GOOGLE_NOT_CONFIGURED');
    }
    const redirectUri = getRedirectUriCompat(req);
    return success(res, {
        url: buildGoogleAuthUrl(redirectUri, 'classroom', req.user?.id || 'owner'),
        redirectUri,
    });
});
function getRedirectUriCompat(req) {
    return getGoogleRedirectUri(req);
}
router.post('/classroom/disconnect', async (req, res) => {
    await disconnectGoogleAccount(req.user?.id);
    return success(res, { disconnected: true });
});
router.post('/classroom/sync', async (_req, res) => {
    const result = await syncClassroomData();
    const overview = await getClassroomOverview();
    return success(res, {
        synced: result.synced,
        notificationsSent: result.notificationsSent,
        ...overview,
    });
});
router.get('/classroom/overview', async (req, res) => {
    const [overview, cache, googleStatus] = await Promise.all([
        getClassroomOverview(),
        getClassroomCache(),
        getGoogleConnectionStatus(req.user?.id, req),
    ]);
    return success(res, {
        ...overview,
        googleStatus,
        courses: cache.courses,
        upcomingDeadlines: cache.assignments
            .filter((a) => a.category !== 'submitted' && a.category !== 'graded')
            .slice(0, 6),
        upcomingExams: cache.exams.slice(0, 6),
    });
});
router.get('/classroom/bundle', async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const sortBy = typeof req.query.sortBy === 'string' &&
        ['deadline', 'subject', 'priority', 'status'].includes(req.query.sortBy)
        ? req.query.sortBy
        : 'deadline';
    const [overview, cache, assignments, grades] = await Promise.all([
        getClassroomOverview(),
        getClassroomCache(),
        listClassroomAssignments({ category, sortBy }),
        getGradesOverview(),
    ]);
    return success(res, {
        overview: {
            ...overview,
            courses: cache.courses,
            upcomingDeadlines: cache.assignments
                .filter((a) => a.category !== 'submitted' && a.category !== 'graded')
                .slice(0, 6),
            upcomingExams: cache.exams.slice(0, 6),
        },
        assignments,
        announcements: cache.announcements,
        grades,
        exams: cache.exams,
    });
});
router.get('/classroom/courses', async (_req, res) => {
    const cache = await getClassroomCache();
    return success(res, cache.courses);
});
router.get('/classroom/invitations', async (_req, res) => {
    const invitations = await listPendingClassroomInvitations();
    return success(res, invitations);
});
router.post('/classroom/join', validate(z.object({
    mode: z.enum(['link', 'id_code', 'invitation']).optional(),
    inviteLink: z.string().max(500).optional(),
    courseId: z.string().max(200).optional(),
    classCode: z.string().max(40).optional(),
    classUrl: z.string().max(500).optional(),
    invitationId: z.string().max(200).optional(),
    codeOrLink: z.string().max(500).optional(),
})), async (req, res) => {
    const result = await joinClassroom({
        ...req.body,
        userId: req.user?.id,
    });
    return success(res, result);
});
router.get('/classroom/assignments', async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
    const sortBy = typeof req.query.sortBy === 'string' &&
        ['deadline', 'subject', 'priority', 'status'].includes(req.query.sortBy)
        ? req.query.sortBy
        : 'deadline';
    const list = await listClassroomAssignments({ category, courseId, sortBy });
    return success(res, list);
});
router.patch('/classroom/assignments/:id/personal-status', validate(z.object({ status: z.enum(['todo', 'in_progress', 'done']) })), async (req, res) => {
    const updated = await setPersonalAssignmentStatus(String(req.params.id), req.body.status);
    if (!updated)
        return error(res, 'Assignment not found', 404);
    return success(res, updated);
});
router.post('/classroom/assignments/:id/explain', aiLimit, validate(z.object({ language: z.enum(['english', 'thanglish']).optional() })), async (req, res) => {
    const result = await explainClassroomAssignment(String(req.params.id), req.body.language || 'english');
    return success(res, result);
});
router.post('/classroom/assignments/:id/draft', aiLimit, validate(z.object({ format: z.enum(['txt', 'md']).optional() })), async (req, res) => {
    const result = await draftClassroomAssignment(String(req.params.id), req.body.format || 'md');
    return success(res, result);
});
router.get('/classroom/announcements', async (_req, res) => {
    const cache = await getClassroomCache();
    return success(res, cache.announcements);
});
router.post('/classroom/announcements/:id/summarize', aiLimit, async (req, res) => {
    const updated = await summarizeClassroomAnnouncement(String(req.params.id));
    if (!updated)
        return error(res, 'Announcement not found', 404);
    return success(res, updated);
});
router.get('/classroom/grades', async (_req, res) => {
    const grades = await getGradesOverview();
    return success(res, grades);
});
router.get('/classroom/exams', async (_req, res) => {
    const cache = await getClassroomCache();
    return success(res, cache.exams);
});
router.post('/classroom/exams', validate(z.object({
    subject: z.string().min(1).max(120),
    examDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    examTime: z.string().max(40).optional(),
    notes: z.string().max(500).optional(),
    courseId: z.string().optional(),
    topics: z.array(z.string().max(120)).optional(),
})), async (req, res) => {
    const exam = await addManualExam(req.body);
    return success(res, exam, 201);
});
router.delete('/classroom/exams/:id', async (req, res) => {
    const deleted = await deleteManualExam(String(req.params.id));
    if (!deleted)
        return error(res, 'Exam not found', 404);
    return success(res, { deleted: true });
});
router.post('/classroom/exams/:id/topics/:index/toggle', async (req, res) => {
    const idx = Number(req.params.index);
    const updated = await toggleExamTopicRevised(String(req.params.id), idx);
    if (!updated)
        return error(res, 'Exam or topic not found', 404);
    return success(res, updated);
});
router.post('/classroom/exam-prep', aiLimit, validate(z.object({
    subject: z.string().min(1).max(120),
    hoursAvailable: z.number().min(0.5).max(72).optional(),
    language: z.enum(['english', 'thanglish']).optional(),
    mode: z.enum(['plan', 'notes', 'quiz', 'mock']).optional(),
    topicFocus: z.string().max(200).optional(),
})), async (req, res) => {
    const result = await runLastMinuteExamPrep(req.body);
    return success(res, result);
});
router.get('/classroom/settings', async (_req, res) => {
    const settings = await getClassroomSettings();
    return success(res, settings);
});
router.put('/classroom/settings', async (req, res) => {
    const updated = await updateClassroomSettings(req.body || {});
    return success(res, updated);
});
export default router;
