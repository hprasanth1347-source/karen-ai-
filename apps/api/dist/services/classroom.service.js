/**
 * Karen AI – Google Classroom Service (Student Edition)
 * Official Google Classroom API integration:
 *  - Courses, assignments, student submissions, grades, announcements
 *  - Persistent cache & settings in Supabase `user_settings`
 *  - Asia/Kolkata deadline tracking & Telegram inline notifications (deduplicated)
 *  - Gemini AI assignment explanations, structured drafts, and Last-Minute Exam Prep ONLY
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { logAudit } from '../utils/audit.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { generateAIReply } from './ai.service.js';
import { addNotification } from './approval.service.js';
import { loadUserSetting, saveUserSetting } from './persistence.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { getValidGoogleAccessToken } from '../routes/googleDrive.js';
const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';
const CACHE_KEY = 'google_classroom_cache_v1';
const SETTINGS_KEY = 'google_classroom_settings_v1';
const DEFAULT_SETTINGS = {
    syncEnabled: config.GOOGLE_CLASSROOM_SYNC_ENABLED,
    syncIntervalMs: config.GOOGLE_CLASSROOM_SYNC_INTERVAL || 900000,
    timezone: config.GOOGLE_CLASSROOM_TIMEZONE || 'Asia/Kolkata',
    reminders: {
        threeDaysBefore: true,
        oneDayBefore: true,
        threeHoursBefore: true,
        afterDeadline: true,
        examThreeDaysBefore: false, // optional per student preference
        examOneDayBefore: true,
        examDayMorning: true,
    },
    quietHours: {
        enabled: false,
        startHour: 23,
        endHour: 7,
    },
    notifiedKeys: {},
    snoozedUntil: {},
};
const DEFAULT_CACHE = {
    courses: [],
    assignments: [],
    announcements: [],
    exams: [],
    personalStatuses: {},
    lastSyncedAt: null,
    lastError: null,
    accountRestrictedNote: null,
};
let memoryCache = null;
let memorySettings = null;
// ─── Persistence ──────────────────────────────────────────────────────────────
export async function getClassroomSettings() {
    if (memorySettings)
        return memorySettings;
    const saved = await loadUserSetting(SETTINGS_KEY);
    memorySettings = {
        ...DEFAULT_SETTINGS,
        ...saved,
        reminders: { ...DEFAULT_SETTINGS.reminders, ...(saved?.reminders || {}) },
        quietHours: { ...DEFAULT_SETTINGS.quietHours, ...(saved?.quietHours || {}) },
        notifiedKeys: saved?.notifiedKeys || {},
        snoozedUntil: saved?.snoozedUntil || {},
    };
    return memorySettings;
}
export async function updateClassroomSettings(patch) {
    const current = await getClassroomSettings();
    const updated = {
        ...current,
        ...patch,
        reminders: { ...current.reminders, ...(patch.reminders || {}) },
        quietHours: { ...current.quietHours, ...(patch.quietHours || {}) },
        notifiedKeys: patch.notifiedKeys ?? current.notifiedKeys,
        snoozedUntil: patch.snoozedUntil ?? current.snoozedUntil,
    };
    memorySettings = updated;
    await saveUserSetting(SETTINGS_KEY, updated);
    return updated;
}
export async function getClassroomCache() {
    if (memoryCache)
        return memoryCache;
    const saved = await loadUserSetting(CACHE_KEY);
    memoryCache = {
        ...DEFAULT_CACHE,
        ...saved,
        courses: Array.isArray(saved?.courses) ? saved.courses : [],
        assignments: Array.isArray(saved?.assignments) ? saved.assignments : [],
        announcements: Array.isArray(saved?.announcements) ? saved.announcements : [],
        exams: Array.isArray(saved?.exams) ? saved.exams : [],
        personalStatuses: saved?.personalStatuses || {},
    };
    return memoryCache;
}
async function saveClassroomCache(cache) {
    memoryCache = cache;
    await saveUserSetting(CACHE_KEY, cache);
}
// ─── Timezone & Helpers ───────────────────────────────────────────────────────
function getIstHour() {
    const str = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        hour12: false,
    });
    return Number(str) || 0;
}
function isQuietHours(settings) {
    if (!settings.quietHours.enabled)
        return false;
    const h = getIstHour();
    const { startHour, endHour } = settings.quietHours;
    if (startHour <= endHour)
        return h >= startHour && h < endHour;
    return h >= startHour || h < endHour;
}
function getIstDateIsoFromDate(d) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function formatDueIst(iso) {
    if (!iso)
        return 'No due date';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return 'No due date';
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
function parseGoogleDueDate(dueDate, dueTime) {
    if (!dueDate?.year || !dueDate?.month || !dueDate?.day)
        return null;
    const month = String(dueDate.month).padStart(2, '0');
    const day = String(dueDate.day).padStart(2, '0');
    // If Classroom omits dueTime, treat deadline as 23:59:00 Asia/Kolkata (NOT 23:59 UTC which shifts into tomorrow IST)
    if (dueTime?.hours === undefined) {
        const isoIst = `${dueDate.year}-${month}-${day}T23:59:00+05:30`;
        const parsed = new Date(isoIst);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    const hh = String(dueTime.hours).padStart(2, '0');
    const mm = String(dueTime.minutes ?? 0).padStart(2, '0');
    const ss = String(dueTime.seconds ?? 0).padStart(2, '0');
    const iso = `${dueDate.year}-${month}-${day}T${hh}:${mm}:${ss}.000Z`;
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}
function categorizeAssignment(submissionState, assignedGrade, dueIso, creationTime) {
    if (typeof assignedGrade === 'number')
        return 'graded';
    if (submissionState === 'TURNED_IN' || submissionState === 'RETURNED')
        return 'submitted';
    if (dueIso && new Date(dueIso).getTime() < Date.now())
        return 'overdue';
    if (creationTime && Date.now() - new Date(creationTime).getTime() < 48 * 60 * 60 * 1000) {
        return 'new';
    }
    return 'pending';
}
function extractMaterials(rawMaterials) {
    if (!Array.isArray(rawMaterials))
        return [];
    const list = [];
    for (const m of rawMaterials) {
        if (m.driveFile?.driveFile) {
            list.push({
                type: 'driveFile',
                title: m.driveFile.driveFile.title || 'Drive File',
                url: m.driveFile.driveFile.alternateLink,
            });
        }
        else if (m.youtubeVideo) {
            list.push({
                type: 'youtubeVideo',
                title: m.youtubeVideo.title || 'YouTube Video',
                url: m.youtubeVideo.alternateLink,
            });
        }
        else if (m.link) {
            list.push({
                type: 'link',
                title: m.link.title || m.link.url || 'Link',
                url: m.link.url,
            });
        }
        else if (m.form) {
            list.push({
                type: 'form',
                title: m.form.title || 'Google Form',
                url: m.form.formUrl,
            });
        }
    }
    return list;
}
// ─── Classroom REST Client (Pagination + Quota Retry) ─────────────────────────
async function classroomGet(path, accessToken, attempt = 0) {
    const res = await fetch(`${CLASSROOM_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(6000),
    });
    if (res.status === 429 && attempt < 1) {
        await new Promise((r) => setTimeout(r, 800));
        return classroomGet(path, accessToken, attempt + 1);
    }
    const json = (await res.json().catch(() => ({})));
    if (!res.ok) {
        const msg = json.error?.message || `Google Classroom API error (${res.status})`;
        throw new Error(msg);
    }
    return json;
}
async function fetchAllPages(basePath, listKey, accessToken, maxPages = 5) {
    const results = [];
    let pageToken = '';
    for (let i = 0; i < maxPages; i++) {
        const sep = basePath.includes('?') ? '&' : '?';
        const url = pageToken
            ? `${basePath}${sep}pageToken=${encodeURIComponent(pageToken)}`
            : basePath;
        const data = await classroomGet(url, accessToken);
        const items = data[listKey];
        if (Array.isArray(items)) {
            results.push(...items);
        }
        pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
        if (!pageToken)
            break;
    }
    return results;
}
// ─── Full Synchronization ─────────────────────────────────────────────────────
export async function syncClassroomData() {
    const existingCache = await getClassroomCache();
    const token = await getValidGoogleAccessToken();
    if (!token) {
        const updated = {
            ...existingCache,
            lastError: 'Google account is not connected. Connect via /classroom or /connectclassroom.',
        };
        await saveClassroomCache(updated);
        return { synced: false, cache: updated, notificationsSent: 0 };
    }
    try {
        let rawCourses = await fetchAllPages('/courses?pageSize=50', 'courses', token);
        if (rawCourses.length === 0) {
            rawCourses = await fetchAllPages('/courses?studentId=me&pageSize=50', 'courses', token).catch(() => []);
        }
        const courses = [];
        const assignments = [];
        const announcements = [];
        let firstCourseWorkError = null;
        await Promise.all(rawCourses.map(async (c) => {
            const courseId = String(c.id);
            const courseName = String(c.name || 'Untitled Course');
            const isArchived = c.courseState === 'ARCHIVED';
            const [teachersRes, workRes, subsRes, annRes] = await Promise.all([
                fetchAllPages(`/courses/${encodeURIComponent(courseId)}/teachers?pageSize=10`, 'teachers', token, 1).catch(() => []),
                isArchived
                    ? Promise.resolve([])
                    : fetchAllPages(`/courses/${encodeURIComponent(courseId)}/courseWork?pageSize=50`, 'courseWork', token, 2).catch((err) => {
                        if (!firstCourseWorkError) {
                            firstCourseWorkError = err instanceof Error ? err.message : 'Failed to fetch assignments';
                        }
                        logger.warn('Classroom courseWork fetch error', { courseId, err });
                        return [];
                    }),
                isArchived
                    ? Promise.resolve([])
                    : fetchAllPages(`/courses/${encodeURIComponent(courseId)}/courseWork/-/studentSubmissions?userId=me&pageSize=100`, 'studentSubmissions', token, 2).catch(() => []),
                isArchived
                    ? Promise.resolve([])
                    : fetchAllPages(`/courses/${encodeURIComponent(courseId)}/announcements?pageSize=25`, 'announcements', token, 1).catch(() => []),
            ]);
            const teacherNames = teachersRes
                .map((t) => t.profile?.name?.fullName || t.profile?.emailAddress)
                .filter((n) => Boolean(n));
            courses.push({
                id: courseId,
                name: courseName,
                section: c.section,
                description: c.descriptionHeading || c.description,
                room: c.room,
                courseState: c.courseState || 'ACTIVE',
                alternateLink: c.alternateLink,
                teacherNames,
                updateTime: c.updateTime,
            });
            const submissionsByWorkId = new Map();
            for (const sub of subsRes) {
                if (sub.courseWorkId) {
                    submissionsByWorkId.set(String(sub.courseWorkId), sub);
                }
            }
            for (const w of workRes) {
                const workId = String(w.id);
                const sub = submissionsByWorkId.get(workId);
                const subState = sub?.state || 'UNKNOWN';
                const assignedGrade = typeof sub?.assignedGrade === 'number' ? sub.assignedGrade : null;
                const draftGrade = typeof sub?.draftGrade === 'number' ? sub.draftGrade : null;
                const dueIso = parseGoogleDueDate(w.dueDate, w.dueTime);
                assignments.push({
                    id: workId,
                    courseId,
                    courseName,
                    title: String(w.title || 'Untitled Assignment'),
                    description: w.description,
                    creationTime: w.creationTime,
                    updateTime: w.updateTime,
                    dueIso,
                    dueIstDisplay: formatDueIst(dueIso),
                    maxPoints: typeof w.maxPoints === 'number' ? w.maxPoints : null,
                    materials: extractMaterials(w.materials),
                    alternateLink: w.alternateLink,
                    submissionState: subState,
                    submissionUpdatedAt: sub?.updateTime,
                    assignedGrade,
                    draftGrade,
                    late: Boolean(sub?.late),
                    category: categorizeAssignment(subState, assignedGrade, dueIso, w.creationTime),
                    personalStatus: existingCache.personalStatuses[workId] || 'todo',
                });
            }
            for (const a of annRes) {
                const prev = existingCache.announcements.find((old) => old.id === String(a.id));
                announcements.push({
                    id: String(a.id),
                    courseId,
                    courseName,
                    text: String(a.text || ''),
                    creationTime: String(a.creationTime || new Date().toISOString()),
                    updateTime: a.updateTime,
                    alternateLink: a.alternateLink,
                    teacherName: teacherNames[0],
                    materials: extractMaterials(a.materials),
                    summary: prev?.summary,
                });
            }
        }));
        // Sort assignments nearest deadline first (nulls last)
        assignments.sort((a, b) => {
            if (!a.dueIso && !b.dueIso)
                return 0;
            if (!a.dueIso)
                return 1;
            if (!b.dueIso)
                return -1;
            return new Date(a.dueIso).getTime() - new Date(b.dueIso).getTime();
        });
        // Sort announcements newest first
        announcements.sort((a, b) => new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime());
        const updatedCache = {
            courses,
            assignments,
            announcements,
            exams: existingCache.exams,
            personalStatuses: existingCache.personalStatuses,
            lastSyncedAt: new Date().toISOString(),
            lastError: assignments.length === 0 && firstCourseWorkError ? firstCourseWorkError : null,
            accountRestrictedNote: null,
        };
        await saveClassroomCache(updatedCache);
        const notificationsSent = await evaluateClassroomNotifications(existingCache, updatedCache);
        return { synced: true, cache: updatedCache, notificationsSent };
    }
    catch (err) {
        const rawMsg = err instanceof Error ? err.message : 'Classroom sync failed';
        const isScopeOrAdminError = /insufficient|permission|scope|403|disabled|classroom/i.test(rawMsg);
        const message = /insufficient.*scope/i.test(rawMsg)
            ? 'Google token is missing Classroom permissions. Go to Settings → Disconnect & Reconnect Google Classroom.'
            : rawMsg;
        const preserved = {
            ...existingCache,
            lastError: message,
            accountRestrictedNote: isScopeOrAdminError
                ? 'If your college Google Workspace account restricts Classroom API access, or if you connected Drive before Classroom was added, click Disconnect & Reconnect in Settings.'
                : existingCache.accountRestrictedNote,
        };
        await saveClassroomCache(preserved);
        logger.warn('Classroom sync error (preserved last cache)', { err });
        return { synced: false, cache: preserved, notificationsSent: 0 };
    }
}
// ─── Join Class by Invite Link / Class ID + Code / Invitation ────────────────
export function decodeCourseIdFromClassroomSlug(slug) {
    const trimmed = slug.trim();
    if (!trimmed)
        return '';
    if (/^\d+$/.test(trimmed))
        return trimmed;
    try {
        let b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4;
        if (pad > 0) {
            b64 += '='.repeat(4 - pad);
        }
        const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
        if (/^\d+$/.test(decoded))
            return decoded;
    }
    catch {
        // Fallback to raw slug
    }
    return trimmed;
}
export function parseClassroomCourseInput(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return { courseId: '' };
    if (/classroom\.google\.com/i.test(trimmed)) {
        try {
            const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
            const cjc = url.searchParams.get('cjc')?.trim() || undefined;
            const pathMatch = url.pathname.match(/\/c\/([^/]+)/i);
            const courseId = pathMatch?.[1] ? decodeCourseIdFromClassroomSlug(pathMatch[1]) : '';
            return { courseId, cjc };
        }
        catch {
            return { courseId: '' };
        }
    }
    return { courseId: decodeCourseIdFromClassroomSlug(trimmed) };
}
export async function listPendingClassroomInvitations() {
    const token = await getValidGoogleAccessToken();
    if (!token)
        return [];
    try {
        const res = await fetch(`${CLASSROOM_BASE}/invitations?userId=me`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok)
            return [];
        const json = (await res.json());
        return json.invitations || [];
    }
    catch {
        return [];
    }
}
const classCodeSchema = z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{5,12}$/, 'Class code must be 5–12 alphanumeric characters.');
export async function joinClassroom(input) {
    const token = await getValidGoogleAccessToken();
    if (!token) {
        return {
            joined: false,
            errorCode: 'NOT_CONNECTED',
            message: 'Google Classroom is not connected. Connect your Google account first.',
        };
    }
    let mode = input.mode;
    let courseId = '';
    let enrollmentCode = input.classCode?.trim() || '';
    const rawLinkOrCode = (input.inviteLink || input.classUrl || input.codeOrLink || '').trim();
    const rawIdOrUrl = (input.courseId || input.classUrl || '').trim();
    if (!mode) {
        if (input.invitationId)
            mode = 'invitation';
        else if (/classroom\.google\.com/i.test(rawLinkOrCode) && !input.courseId)
            mode = 'link';
        else if (rawIdOrUrl)
            mode = 'id_code';
        else
            mode = 'link';
    }
    if (mode === 'invitation') {
        const invitations = await listPendingClassroomInvitations();
        const targetInv = input.invitationId
            ? invitations.find((i) => i.id === input.invitationId)
            : invitations.find((i) => i.role === 'STUDENT') || invitations[0];
        if (!targetInv) {
            return {
                joined: false,
                errorCode: 'COURSE_NOT_FOUND',
                message: 'No matching pending Classroom invitation found.',
            };
        }
        const acceptRes = await fetch(`${CLASSROOM_BASE}/invitations/${encodeURIComponent(targetInv.id)}:accept`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
        });
        if (!acceptRes.ok) {
            return {
                joined: false,
                errorCode: 'JOIN_FAILED',
                message: `Could not accept invitation (${acceptRes.status}).`,
            };
        }
        void syncClassroomData().catch(() => { });
        const cache = await getClassroomCache();
        const course = cache.courses.find((c) => c.id === targetInv.courseId);
        const courseName = course?.name || targetInv.courseId;
        if (input.userId) {
            await logAudit(input.userId, 'CLASSROOM_JOIN', 'classroom', targetInv.courseId, { mode, courseName }).catch(() => { });
        }
        await sendTelegramMessage(`🎓 Joined Google Classroom: *${courseName}* (via invitation).`).catch(() => { });
        return {
            joined: true,
            courseId: targetInv.courseId,
            courseName,
            teacher: course?.teacherNames?.[0],
            message: `Joined "${courseName}" via your pending Classroom invitation!`,
        };
    }
    if (mode === 'link') {
        if (/classroom\.google\.com/i.test(rawLinkOrCode)) {
            const parsed = parseClassroomCourseInput(rawLinkOrCode);
            courseId = parsed.courseId;
            if (parsed.cjc && !enrollmentCode)
                enrollmentCode = parsed.cjc;
        }
        else if (/^[A-Za-z0-9]{5,12}$/.test(rawLinkOrCode)) {
            return {
                joined: false,
                errorCode: 'BARE_CODE_UNSUPPORTED',
                message: `Google Classroom does not allow joining by a 5–12 character code ("${rawLinkOrCode}") alone. Switch to "Class ID + code" or paste the full invite link (classroom.google.com/c/...?cjc=${rawLinkOrCode}).`,
            };
        }
    }
    else if (mode === 'id_code') {
        const parsed = parseClassroomCourseInput(rawIdOrUrl || rawLinkOrCode);
        courseId = parsed.courseId;
        if (parsed.cjc && !enrollmentCode) {
            enrollmentCode = parsed.cjc;
        }
    }
    if (!/^\d+$/.test(courseId)) {
        return {
            joined: false,
            errorCode: 'INVALID_INPUT',
            message: 'Course ID must be numeric (or a valid Classroom course URL / base64 slug).',
        };
    }
    const parsedCode = classCodeSchema.safeParse(enrollmentCode);
    if (!parsedCode.success) {
        return {
            joined: false,
            errorCode: 'INVALID_INPUT',
            message: parsedCode.error.errors[0]?.message || 'Class code must be 5–12 alphanumeric characters.',
        };
    }
    enrollmentCode = parsedCode.data;
    // Preflight: check if owner is already enrolled in cache
    const cache = await getClassroomCache();
    const existingCourse = cache.courses.find((c) => c.id === courseId);
    if (existingCourse) {
        if (existingCourse.courseState === 'ARCHIVED') {
            return {
                joined: false,
                courseId,
                courseName: existingCourse.name,
                errorCode: 'COURSE_ARCHIVED',
                message: `Course "${existingCourse.name}" is archived and cannot accept new enrollments.`,
            };
        }
        return {
            joined: true,
            alreadyEnrolled: true,
            courseId,
            courseName: existingCourse.name,
            teacher: existingCourse.teacherNames?.[0],
            message: `Already in "${existingCourse.name}".`,
        };
    }
    const enrollUrl = `${CLASSROOM_BASE}/courses/${encodeURIComponent(courseId)}/students?enrollmentCode=${encodeURIComponent(enrollmentCode)}`;
    let res = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            res = await fetch(enrollUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: 'me' }),
                signal: AbortSignal.timeout(10000),
            });
            if (res.status >= 500 && attempt === 0) {
                await new Promise((r) => setTimeout(r, 350));
                continue;
            }
            break;
        }
        catch (err) {
            lastErr = err;
            if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 350));
                continue;
            }
        }
    }
    if (!res) {
        const isTimeout = lastErr instanceof Error && (lastErr.name === 'TimeoutError' || lastErr.name === 'AbortError');
        return {
            joined: false,
            errorCode: isTimeout ? 'TIMEOUT' : 'JOIN_FAILED',
            message: isTimeout
                ? 'Google Classroom timed out while joining. Please try again.'
                : 'Network error while joining Google Classroom.',
        };
    }
    const json = (await res.json().catch(() => ({})));
    if (!res.ok) {
        const errMsg = json.error?.message || `Failed to join class (${res.status})`;
        if (/insufficient.*scope|permission/i.test(errMsg)) {
            return {
                joined: false,
                errorCode: 'MISSING_ROSTER_SCOPE',
                message: 'Missing Classroom roster write permission. Click "Reconnect Google" to grant join-class permission, then try again.',
            };
        }
        if (res.status === 409 || /already.*exists|already.*enrolled/i.test(errMsg)) {
            return {
                joined: true,
                alreadyEnrolled: true,
                courseId,
                courseName: courseId,
                message: `Already in course ${courseId}.`,
            };
        }
        if (res.status === 404 || /not found/i.test(errMsg)) {
            return {
                joined: false,
                errorCode: 'COURSE_NOT_FOUND',
                message: `Course ${courseId} was not found. Double-check the Class ID or invite link.`,
            };
        }
        if (/archived/i.test(errMsg)) {
            return {
                joined: false,
                errorCode: 'COURSE_ARCHIVED',
                message: 'This course is archived and cannot be joined.',
            };
        }
        if (/domain|policy|not allowed/i.test(errMsg)) {
            return {
                joined: false,
                errorCode: 'DOMAIN_RESTRICTION',
                message: 'Your Google account domain is restricted from joining this class.',
            };
        }
        if (/enrollment.*code|invalid.*code|precondition/i.test(errMsg)) {
            return {
                joined: false,
                errorCode: 'WRONG_CODE',
                message: 'Wrong class code for this Course ID. Check the code (case-sensitive) and try again.',
            };
        }
        return { joined: false, errorCode: 'JOIN_FAILED', message: errMsg };
    }
    void syncClassroomData().catch(() => { });
    const updatedCache = await getClassroomCache();
    const joinedCourse = updatedCache.courses.find((c) => c.id === courseId);
    const courseName = joinedCourse?.name || courseId;
    if (input.userId) {
        await logAudit(input.userId, 'CLASSROOM_JOIN', 'classroom', courseId, { mode, courseName }).catch(() => { });
    }
    await sendTelegramMessage(`🎓 Successfully joined Google Classroom: *${courseName}*!`).catch(() => { });
    return {
        joined: true,
        courseId,
        courseName,
        teacher: joinedCourse?.teacherNames?.[0],
        message: `Successfully joined "${courseName}"!`,
    };
}
export async function joinClassroomByCodeOrLink(input) {
    return joinClassroom({
        codeOrLink: input.codeOrLink,
        courseId: input.courseId,
    });
}
// ─── Notifications (Deduplicated + Inline Buttons) ────────────────────────────
async function evaluateClassroomNotifications(prev, next) {
    const settings = await getClassroomSettings();
    if (isQuietHours(settings))
        return 0;
    let sent = 0;
    const now = Date.now();
    const prevAssignmentIds = new Set(prev.assignments.map((a) => a.id));
    const prevAnnouncementIds = new Set(prev.announcements.map((a) => a.id));
    const prevGrades = new Map(prev.assignments.map((a) => [a.id, a.assignedGrade]));
    const notifyOnce = async (dedupeKey, text, title, buttons) => {
        if (settings.notifiedKeys[dedupeKey])
            return;
        settings.notifiedKeys[dedupeKey] = new Date().toISOString();
        sent++;
        await addNotification('ai_message', title, text, 'high', 'telegram').catch(() => { });
        await sendTelegramMessage(text, undefined, buttons ? { inlineKeyboard: buttons } : undefined).catch(() => { });
    };
    for (const a of next.assignments) {
        const snoozedUntil = settings.snoozedUntil[a.id];
        if (snoozedUntil && new Date(snoozedUntil).getTime() > now)
            continue;
        // 1. New assignment (only notify if we already had a previous sync so initial sync doesn't spam)
        if (prev.lastSyncedAt && !prevAssignmentIds.has(a.id) && a.category !== 'submitted' && a.category !== 'graded') {
            const msg = `KAREN 📚\n\nHey! New assignment detected.\n\n` +
                `Subject: ${a.courseName}\n` +
                `Assignment: ${a.title}\n` +
                `Due: ${a.dueIstDisplay}\n` +
                `Status: Pending\n\n` +
                `Don't forget to complete it!`;
            await notifyOnce(`new_${a.id}`, msg, `New Assignment: ${a.title}`, [
                [
                    ...(a.alternateLink ? [{ text: 'View Assignment', url: a.alternateLink }] : []),
                    { text: 'Explain', callback_data: `classroom_explain:${a.id}` },
                    { text: 'Remind Later', callback_data: `classroom_remind:${a.id}` },
                ],
            ]);
        }
        // 2. New grade posted
        const oldGrade = prevGrades.get(a.id);
        if (prev.lastSyncedAt &&
            typeof a.assignedGrade === 'number' &&
            oldGrade !== a.assignedGrade) {
            const maxStr = a.maxPoints ? ` / ${a.maxPoints}` : '';
            const msg = `KAREN 🎓\n\nGrade published!\n\n` +
                `Subject: ${a.courseName}\n` +
                `Assignment: ${a.title}\n` +
                `Score: ${a.assignedGrade}${maxStr}`;
            await notifyOnce(`grade_${a.id}_${a.assignedGrade}`, msg, `Grade: ${a.title}`);
        }
        // 3. Deadline reminders (for pending/new/overdue only — use exact Asia/Kolkata calendar dates)
        if (a.dueIso && a.category !== 'submitted' && a.category !== 'graded') {
            const dueMs = new Date(a.dueIso).getTime();
            const diffMs = dueMs - now;
            const diffHours = diffMs / (1000 * 60 * 60);
            const dueIstDate = getIstDateIsoFromDate(new Date(dueMs));
            const todayIstDate = getIstDateIsoFromDate(new Date(now));
            const tomorrowIstDate = getIstDateIsoFromDate(new Date(now + 24 * 60 * 60 * 1000));
            if (settings.reminders.threeHoursBefore && diffHours <= 3 && diffHours > 0) {
                await notifyOnce(`due_3h_${a.id}`, `KAREN 🚨\n\nOnly ~${Math.max(1, Math.round(diffHours))} hour(s) left TODAY!\nSubject: ${a.courseName}\nAssignment: ${a.title}\nDue: ${a.dueIstDisplay}`, `3-Hour Urgent: ${a.title}`);
            }
            else if (dueIstDate === todayIstDate && diffHours > 0) {
                await notifyOnce(`due_today_${a.id}_${todayIstDate}`, `KAREN ⏰\n\nAssignment due TODAY!\nSubject: ${a.courseName}\nAssignment: ${a.title}\nDue: ${a.dueIstDisplay}`, `Due Today: ${a.title}`, [[{ text: 'Explain', callback_data: `classroom_explain:${a.id}` }]]);
            }
            else if (settings.reminders.oneDayBefore && dueIstDate === tomorrowIstDate && diffHours > 0) {
                await notifyOnce(`due_1d_${a.id}`, `KAREN ⏰\n\nAssignment due tomorrow!\nSubject: ${a.courseName}\nAssignment: ${a.title}\nDue: ${a.dueIstDisplay}`, `1-Day Reminder: ${a.title}`, [[{ text: 'Explain', callback_data: `classroom_explain:${a.id}` }]]);
            }
            else if (settings.reminders.threeDaysBefore &&
                diffHours <= 72 &&
                diffHours > 24 &&
                dueIstDate !== todayIstDate &&
                dueIstDate !== tomorrowIstDate) {
                await notifyOnce(`due_3d_${a.id}`, `KAREN ⏰\n\nAssignment due in ~3 days!\nSubject: ${a.courseName}\nAssignment: ${a.title}\nDue: ${a.dueIstDisplay}`, `3-Day Reminder: ${a.title}`);
            }
            else if (settings.reminders.afterDeadline && diffHours < 0 && diffHours > -48) {
                await notifyOnce(`overdue_${a.id}`, `KAREN ⚠️\n\nAssignment is overdue & still pending in Classroom.\nSubject: ${a.courseName}\nAssignment: ${a.title}\nDue was: ${a.dueIstDisplay}`, `Overdue: ${a.title}`);
            }
        }
    }
    // 4. New announcements
    if (prev.lastSyncedAt) {
        for (const ann of next.announcements) {
            if (!prevAnnouncementIds.has(ann.id)) {
                const snippet = ann.text.slice(0, 260) + (ann.text.length > 260 ? '...' : '');
                await notifyOnce(`ann_${ann.id}`, `KAREN 📢\n\nNew announcement in *${ann.courseName}*:\n\n${snippet}`, `Announcement: ${ann.courseName}`, ann.alternateLink ? [[{ text: 'Open in Classroom', url: ann.alternateLink }]] : undefined);
            }
        }
    }
    // 5. Exam reminders (1 day before & exam day morning — NO daily study spam)
    const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const tomorrowIst = new Date(now + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
    });
    const threeDaysIst = new Date(now + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
    });
    for (const exam of next.exams) {
        if (settings.reminders.examOneDayBefore && exam.examDateIso === tomorrowIst) {
            await notifyOnce(`exam_1d_${exam.id}_${exam.examDateIso}`, `KAREN ❤️ EXAM ALERT\n\nYour *${exam.subject}* exam is tomorrow!\n\nWould you like to start last-minute preparation?`, `Exam Tomorrow: ${exam.subject}`, [
                [
                    { text: 'Start Preparation', callback_data: `classroom_examprep:${exam.subject}` },
                    { text: 'View Topics', callback_data: `classroom_topics:${exam.id}` },
                ],
            ]);
        }
        else if (settings.reminders.examDayMorning && exam.examDateIso === todayIst && getIstHour() >= 6) {
            await notifyOnce(`exam_day_${exam.id}_${exam.examDateIso}`, `KAREN 💙\n\nAll the best for your *${exam.subject}* exam today! Stay calm and do your best.`, `Exam Today: ${exam.subject}`);
        }
        else if (settings.reminders.examThreeDaysBefore && exam.examDateIso === threeDaysIst) {
            await notifyOnce(`exam_3d_${exam.id}_${exam.examDateIso}`, `KAREN 📅\n\nHeads up: Your *${exam.subject}* exam is in 3 days (${exam.examDateIso}).`, `Exam in 3 Days: ${exam.subject}`);
        }
    }
    if (sent > 0) {
        await updateClassroomSettings({ notifiedKeys: settings.notifiedKeys });
    }
    return sent;
}
// ─── Overview, Filtering & Personal Tasks ─────────────────────────────────────
export async function getClassroomOverview() {
    const [cache, settings] = await Promise.all([getClassroomCache(), getClassroomSettings()]);
    const token = await getValidGoogleAccessToken();
    const activeCourses = cache.courses.filter((c) => c.courseState === 'ACTIVE');
    const stats = {
        totalCourses: cache.courses.length,
        activeCourses: activeCourses.length,
        totalAssignments: cache.assignments.length,
        newAssignments: cache.assignments.filter((a) => a.category === 'new').length,
        pendingAssignments: cache.assignments.filter((a) => a.category === 'pending' || a.category === 'new').length,
        submittedAssignments: cache.assignments.filter((a) => a.category === 'submitted').length,
        overdueAssignments: cache.assignments.filter((a) => a.category === 'overdue').length,
        gradedAssignments: cache.assignments.filter((a) => a.category === 'graded').length,
        upcomingExams: cache.exams.filter((e) => e.examDateIso >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).length,
    };
    return {
        connected: Boolean(token),
        lastSyncedAt: cache.lastSyncedAt,
        lastError: cache.lastError,
        accountRestrictedNote: cache.accountRestrictedNote,
        stats,
        settings,
    };
}
export async function listClassroomAssignments(options) {
    const cache = await getClassroomCache();
    let list = [...cache.assignments];
    if (options?.courseId) {
        list = list.filter((a) => a.courseId === options.courseId);
    }
    if (options?.category && options.category !== 'all') {
        if (options.category === 'in_progress') {
            list = list.filter((a) => a.personalStatus === 'in_progress');
        }
        else if (options.category === 'pending') {
            list = list.filter((a) => a.category === 'pending' || a.category === 'new');
        }
        else {
            list = list.filter((a) => a.category === options.category);
        }
    }
    const sortBy = options?.sortBy || 'deadline';
    if (sortBy === 'subject') {
        list.sort((a, b) => a.courseName.localeCompare(b.courseName));
    }
    else if (sortBy === 'status') {
        const order = {
            overdue: 0,
            new: 1,
            pending: 2,
            submitted: 3,
            graded: 4,
        };
        list.sort((a, b) => order[a.category] - order[b.category]);
    }
    else if (sortBy === 'priority') {
        const weight = (a) => {
            if (a.category === 'overdue')
                return 0;
            if (a.category === 'submitted' || a.category === 'graded')
                return 3;
            if (a.dueIso && new Date(a.dueIso).getTime() - Date.now() < 48 * 3600 * 1000)
                return 1;
            return 2;
        };
        list.sort((a, b) => weight(a) - weight(b));
    }
    return list;
}
export async function setPersonalAssignmentStatus(assignmentId, status) {
    const cache = await getClassroomCache();
    cache.personalStatuses[assignmentId] = status;
    const target = cache.assignments.find((a) => a.id === assignmentId);
    if (target) {
        target.personalStatus = status;
    }
    await saveClassroomCache(cache);
    return target || null;
}
export async function snoozeAssignmentReminder(assignmentId, hours = 4) {
    const settings = await getClassroomSettings();
    settings.snoozedUntil[assignmentId] = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    await updateClassroomSettings({ snoozedUntil: settings.snoozedUntil });
}
// ─── Exam Management (NO daily study plans) ───────────────────────────────────
export async function addManualExam(input) {
    const cache = await getClassroomCache();
    const exam = {
        id: randomUUID(),
        subject: input.subject.trim(),
        courseId: input.courseId,
        examDateIso: input.examDateIso,
        examTime: input.examTime,
        notes: input.notes,
        source: 'manual',
        topics: (input.topics || []).filter(Boolean).map((t) => ({ title: t.trim(), revised: false })),
        createdAt: new Date().toISOString(),
    };
    cache.exams.push(exam);
    cache.exams.sort((a, b) => a.examDateIso.localeCompare(b.examDateIso));
    await saveClassroomCache(cache);
    return exam;
}
export async function deleteManualExam(examId) {
    const cache = await getClassroomCache();
    const prevLen = cache.exams.length;
    cache.exams = cache.exams.filter((e) => e.id !== examId);
    if (cache.exams.length === prevLen)
        return false;
    await saveClassroomCache(cache);
    return true;
}
export async function toggleExamTopicRevised(examId, topicIndex) {
    const cache = await getClassroomCache();
    const exam = cache.exams.find((e) => e.id === examId);
    if (!exam || !exam.topics[topicIndex])
        return null;
    exam.topics[topicIndex].revised = !exam.topics[topicIndex].revised;
    await saveClassroomCache(cache);
    return exam;
}
// ─── Grades Overview ──────────────────────────────────────────────────────────
export async function getGradesOverview() {
    const cache = await getClassroomCache();
    const byCourse = new Map();
    for (const a of cache.assignments) {
        const entry = byCourse.get(a.courseId) || {
            courseId: a.courseId,
            courseName: a.courseName,
            gradedCount: 0,
            ungradedCount: 0,
            submittedCount: 0,
            pendingCount: 0,
            earnedPoints: 0,
            possiblePoints: 0,
            items: [],
        };
        const isGraded = typeof a.assignedGrade === 'number';
        if (isGraded) {
            entry.gradedCount++;
            entry.earnedPoints += a.assignedGrade;
            if (typeof a.maxPoints === 'number')
                entry.possiblePoints += a.maxPoints;
        }
        else {
            entry.ungradedCount++;
        }
        if (a.category === 'submitted' || a.category === 'graded')
            entry.submittedCount++;
        else
            entry.pendingCount++;
        entry.items.push({
            id: a.id,
            title: a.title,
            submissionState: a.submissionState,
            assignedGrade: a.assignedGrade ?? null,
            draftGrade: a.draftGrade ?? null,
            maxPoints: a.maxPoints ?? null,
            submissionUpdatedAt: a.submissionUpdatedAt,
        });
        byCourse.set(a.courseId, entry);
    }
    return Array.from(byCourse.values());
}
// ─── Gemini AI Academic Assistants ────────────────────────────────────────────
export async function explainClassroomAssignment(assignmentIdOrQuery, language = 'english') {
    const cache = await getClassroomCache();
    const q = assignmentIdOrQuery.toLowerCase().trim();
    const assignment = cache.assignments.find((a) => a.id === assignmentIdOrQuery) ||
        cache.assignments.find((a) => a.title.toLowerCase().includes(q) ||
            a.courseName.toLowerCase().includes(q)) ||
        null;
    if (!assignment) {
        return {
            assignment: null,
            explanation: 'I could not find that assignment in your synced Google Classroom list. Try syncing Classroom first or specify the subject/title.',
        };
    }
    const langInstruction = language === 'thanglish'
        ? 'Explain in natural, friendly Thanglish (Tamil words in English letters + simple English).'
        : 'Explain in clear, simple English.';
    const prompt = `${langInstruction}
You are KAREN, helping a college student understand a Google Classroom assignment.
STRICT GROUNDING RULES:
- Never invent requirements, marks, deadlines, or teacher instructions that are not provided below.
- If instructions or deadline are missing, explicitly state what is missing.

Course: ${assignment.courseName}
Title: ${assignment.title}
Due (Asia/Kolkata): ${assignment.dueIstDisplay}
Max Marks: ${assignment.maxPoints ?? 'Not specified'}
Submission Status: ${assignment.submissionState}
Instructions:
${assignment.description || 'No instructions text provided by teacher.'}
Attachments: ${assignment.materials.map((m) => `${m.title} (${m.type})`).join(', ') || 'None'}

Provide:
1. Simple summary of what to do
2. Step-by-step breakdown & deliverables
3. Key concepts & helpful example/resources`;
    const ai = await generateAIReply(prompt, [], 'gemini');
    return { assignment, explanation: ai.reply };
}
export async function draftClassroomAssignment(assignmentId, format = 'md') {
    const cache = await getClassroomCache();
    const assignment = cache.assignments.find((a) => a.id === assignmentId) || null;
    if (!assignment) {
        return {
            assignment: null,
            draft: 'Assignment not found. Please sync Google Classroom first.',
            filename: 'assignment-draft.md',
        };
    }
    const prompt = `Prepare a structured ${format.toUpperCase()} assignment draft for a student.
STRICT ACADEMIC INTEGRITY RULES:
- Clearly mark the document header as "[AI-GENERATED STUDY DRAFT — REVIEW, UNDERSTAND & VERIFY BEFORE SUBMISSION]".
- Never fabricate citations, lab observations, experiment outputs, or personal results.
- Follow only the provided instructions; mark missing personal inputs as [INSERT YOUR ...].

Course: ${assignment.courseName}
Title: ${assignment.title}
Max Marks: ${assignment.maxPoints ?? 'Not specified'}
Instructions:
${assignment.description || 'No detailed instructions provided.'}

Include:
1. Title & Course Header
2. Structured Outline matching required sections
3. Draft content with clear explanations
4. Pre-submission checklist`;
    const ai = await generateAIReply(prompt, [], 'gemini');
    const safeName = assignment.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'assignment';
    return {
        assignment,
        draft: ai.reply,
        filename: `${safeName}-draft.${format}`,
    };
}
export async function summarizeClassroomAnnouncement(announcementId) {
    const cache = await getClassroomCache();
    const ann = cache.announcements.find((a) => a.id === announcementId);
    if (!ann)
        return null;
    const prompt = `Summarize this Google Classroom announcement in 2-4 crisp bullet points. Do not invent dates or facts not in the text:\n\nCourse: ${ann.courseName}\nText:\n${ann.text}`;
    const ai = await generateAIReply(prompt, [], 'gemini');
    ann.summary = ai.reply;
    await saveClassroomCache(cache);
    return ann;
}
export async function runLastMinuteExamPrep(input) {
    const cache = await getClassroomCache();
    const q = input.subject.toLowerCase().trim();
    const matchedExam = cache.exams.find((e) => e.subject.toLowerCase().includes(q));
    const matchedCourse = cache.courses.find((c) => c.name.toLowerCase().includes(q));
    const relatedWork = cache.assignments
        .filter((a) => a.courseName.toLowerCase().includes(q))
        .slice(0, 8)
        .map((a) => `- ${a.title}`)
        .join('\n');
    const relatedAnns = cache.announcements
        .filter((a) => a.courseName.toLowerCase().includes(q))
        .slice(0, 4)
        .map((a) => `- ${a.text.slice(0, 200)}`)
        .join('\n');
    const hours = input.hoursAvailable ?? 5;
    const langRule = input.language === 'thanglish'
        ? 'Use clear, natural Thanglish + English.'
        : 'Use clear, concise English.';
    const mode = input.mode || 'plan';
    const prompt = `${langRule}
You are KAREN in LAST-MINUTE EXAM PREPARATION MODE.
IMPORTANT: The student studies right before exams. Do NOT generate daily study timetables or guilt-trip them.
Do NOT claim to know the actual exam paper or guarantee exact questions.

Subject: ${matchedCourse?.name || input.subject}
Exam Date: ${matchedExam?.examDateIso || 'Not specified'}
Time Available: ${hours} hours
Requested Mode: ${mode}
${input.topicFocus ? `Topic Focus: ${input.topicFocus}` : ''}

Available Classroom Topics/Assignments:
${relatedWork || 'None cached'}

Recent Course Announcements:
${relatedAnns || 'None cached'}

Generate a focused, high-yield last-minute cram kit for ${hours} hours containing:
${mode === 'quiz' ? '- 5 MCQs + 3 two-mark questions + 2 five-mark questions with concise answer keys' : ''}
${mode === 'mock' ? '- A timed mini mock test (MCQs, 2-mark, 5-mark, 10-mark questions) + answer hints' : ''}
${mode === 'notes' ? '- High-yield short notes, crisp definitions, and quick revision cheat-sheet' : ''}
${mode === 'plan' ? '- Realistic hour-by-hour cram plan for the available hours\n- High-priority core concepts & crisp definitions\n- Quick practice questions (MCQs, 2-mark, 5-mark, 10-mark)' : ''}`;
    const ai = await generateAIReply(prompt, [], 'gemini');
    return {
        subject: matchedCourse?.name || input.subject,
        examDateIso: matchedExam?.examDateIso || null,
        plan: ai.reply,
    };
}
export async function getClassroomContextPrompt(query = '') {
    const cache = await getClassroomCache();
    if (!cache.courses.length && !cache.assignments.length && !cache.exams.length) {
        return '\n\n[Google Classroom]: No courses cached yet (user can sync or share a Classroom invite link).';
    }
    const coursesList = cache.courses
        .slice(0, 15)
        .map((c) => `- ${c.name} (${c.courseState}, id: ${c.id})`)
        .join('\n');
    const pending = cache.assignments
        .filter((a) => a.category !== 'submitted' && a.category !== 'graded')
        .slice(0, 12)
        .map((a) => `- [${a.category.toUpperCase()}] ${a.title} (${a.courseName}) | Due: ${a.dueIstDisplay}`)
        .join('\n');
    const exams = cache.exams
        .slice(0, 8)
        .map((e) => `- ${e.subject} on ${e.examDateIso}${e.examTime ? ` (${e.examTime})` : ''}`)
        .join('\n');
    const isAcademicQuery = /\b(class|course|classroom|assignment|homework|due|deadline|grade|exam|announcement|study|prep)\b/i.test(query);
    if (!isAcademicQuery) {
        return `\n\n[Google Classroom Summary]: ${cache.courses.length} courses, ${cache.assignments.filter((a) => a.category !== 'submitted' && a.category !== 'graded').length} pending assignments, ${cache.exams.length} exams.`;
    }
    return `\n\n[Google Classroom Live Data]:\nCourses (${cache.courses.length}):\n${coursesList || 'None'}\n\nPending/Overdue Assignments:\n${pending || 'None'}\n\nTracked Exams:\n${exams || 'None'}`;
}
