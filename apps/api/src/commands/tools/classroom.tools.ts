import { z } from 'zod';
import {
  explainClassroomAssignment,
  getClassroomCache,
  getGradesOverview,
  joinClassroom,
  listClassroomAssignments,
  parseClassroomCourseInput,
  runLastMinuteExamPrep,
  setPersonalAssignmentStatus,
  syncClassroomData,
} from '../../services/classroom.service.js';
import type { CommandToolDef, LastResultItem } from '../types.js';

async function ensureFreshClassroomCache(): Promise<{ syncedNow: boolean; ageMinutes: number }> {
  const cache = await getClassroomCache();
  const lastSync = cache.lastSyncedAt ? new Date(cache.lastSyncedAt).getTime() : 0;
  const ageMinutes = lastSync ? Math.round((Date.now() - lastSync) / 60000) : 999;
  if (!lastSync || ageMinutes > 15) {
    await syncClassroomData().catch(() => null);
    return { syncedNow: true, ageMinutes: 0 };
  }
  return { syncedNow: false, ageMinutes };
}

export const classroomListAssignmentsTool: CommandToolDef<{
  filter: 'pending' | 'overdue' | 'due_today' | 'due_tomorrow' | 'due_this_week' | 'submitted' | 'graded' | 'all';
  course?: string;
  limit?: number;
}> = {
  name: 'classroom_list_assignments',
  category: 'classroom',
  description: 'List Google Classroom assignments filtered by pending, overdue, due_today, due_tomorrow, due_this_week, submitted, graded, or all.',
  requiresConfirmation: false,
  inputSchema: z.object({
    filter: z
      .enum(['pending', 'overdue', 'due_today', 'due_tomorrow', 'due_this_week', 'submitted', 'graded', 'all'])
      .default('pending'),
    course: z.string().optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['pending', 'overdue', 'due_today', 'due_tomorrow', 'due_this_week', 'submitted', 'graded', 'all'],
      },
      course: { type: 'string' },
      limit: { type: 'number' },
    },
  },
  async execute(args) {
    const fresh = await ensureFreshClassroomCache();
    const category =
      args.filter === 'overdue'
        ? 'overdue'
        : args.filter === 'submitted' || args.filter === 'graded'
          ? 'submitted'
          : args.filter === 'all'
            ? 'all'
            : 'pending';
    let items = await listClassroomAssignments({ category, courseId: args.course });

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (args.filter === 'due_today') {
      items = items.filter((a) => a.dueIso && new Date(a.dueIso).getTime() - now <= oneDayMs && new Date(a.dueIso).getTime() >= now - 3600000);
    } else if (args.filter === 'due_tomorrow') {
      items = items.filter((a) => a.dueIso && new Date(a.dueIso).getTime() - now > oneDayMs * 0.5 && new Date(a.dueIso).getTime() - now <= oneDayMs * 2);
    } else if (args.filter === 'due_this_week') {
      items = items.filter((a) => a.dueIso && new Date(a.dueIso).getTime() - now <= oneDayMs * 7);
    }

    const capped = items.slice(0, args.limit ?? 10);
    const freshnessLine = fresh.syncedNow ? 'Updated just now' : `Updated ${fresh.ageMinutes} min ago`;

    if (capped.length === 0) {
      return {
        ok: true,
        summary: `Nothing pending for "${args.filter}". (${freshnessLine})`,
        lastResults: [],
        buttons: [[{ label: 'Refresh Classroom', callbackData: 'cmd:classroom_sync' }]],
      };
    }

    const lastResults: LastResultItem[] = capped.map((a, idx) => ({
      ordinal: idx + 1,
      type: 'assignment',
      id: a.id,
      title: a.title,
      subtitle: a.courseName,
      url: a.alternateLink,
    }));

    const lines = capped.map(
      (a, idx) => `${idx + 1}. [${a.courseName}] ${a.title} — ${a.dueIstDisplay || 'No due date'} (${a.category})`
    );

    return {
      ok: true,
      summary: `Assignments (${args.filter}) — ${freshnessLine}:\n${lines.join('\n')}`,
      lastResults,
      buttons: [
        [
          { label: 'Explain #1', callbackData: `cmd:explain_assignment:${capped[0].id}` },
          { label: 'Mark #1 Done', callbackData: `cmd:mark_done:${capped[0].id}` },
          { label: 'Refresh', callbackData: 'cmd:classroom_sync' },
        ],
      ],
    };
  },
};

export const classroomGradesTool: CommandToolDef<{ course?: string }> = {
  name: 'classroom_grades',
  category: 'classroom',
  description: 'Show Google Classroom grades (never shows missing grade as 0).',
  requiresConfirmation: false,
  inputSchema: z.object({ course: z.string().optional() }),
  jsonSchema: { type: 'object', properties: { course: { type: 'string' } } },
  async execute(args) {
    const overview = await getGradesOverview();
    const list = args.course
      ? overview.filter((c) => c.courseName.toLowerCase().includes(args.course!.toLowerCase()))
      : overview;
    if (list.length === 0) {
      return { ok: true, summary: 'No graded coursework found yet.' };
    }
    const lines = list.slice(0, 10).map((c) => {
      const avg =
        c.gradedCount > 0 && c.possiblePoints > 0
          ? `${Math.round((c.earnedPoints / c.possiblePoints) * 100)}%`
          : 'Not graded yet';
      return `• ${c.courseName}: ${avg} (${c.gradedCount} graded)`;
    });
    return { ok: true, summary: `Classroom Grades:\n${lines.join('\n')}`, data: list };
  },
};

export const classroomJoinTool: CommandToolDef<{
  target: string;
  courseId?: string;
  classCode?: string;
  skipConfirm?: boolean;
}> = {
  name: 'classroom_join',
  category: 'classroom',
  description: 'Join a Google Classroom by invite link (classroom.google.com/c/...?cjc=...) or courseId + classCode.',
  requiresConfirmation: true,
  inputSchema: z.object({
    target: z.string().min(2).max(500),
    courseId: z.string().optional(),
    classCode: z.string().optional(),
    skipConfirm: z.boolean().optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      target: { type: 'string' },
      courseId: { type: 'string' },
      classCode: { type: 'string' },
    },
    required: ['target'],
  },
  async execute(args, ctx) {
    const rawTarget = args.target.trim();
    const parsedFromTarget = parseClassroomCourseInput(rawTarget);
    const resolvedId =
      (args.courseId ? parseClassroomCourseInput(args.courseId).courseId : '') ||
      (/^\d+$/.test(parsedFromTarget.courseId) ? parsedFromTarget.courseId : '');
    const resolvedCode = args.classCode?.trim() || parsedFromTarget.cjc || '';

    // Bare code only (5-12 alphanumeric chars, no course ID)
    const isBareCode = /^[A-Za-z0-9]{5,12}$/.test(rawTarget) && !resolvedId;
    if (isBareCode) {
      return {
        ok: false,
        summary:
          'Google Classroom does not allow joining by a bare class code alone. Please reply with the full invite link (classroom.google.com/c/...) or the numeric Class ID.',
        fixButton: { label: 'Open Classroom to join', url: 'https://classroom.google.com/u/0/h' },
        needsClarification: {
          actionType: 'classroom_join',
          question:
            'Google Classroom does not allow joining by a bare class code alone. Please reply with the Class ID or full invite link (or tap Open Classroom to join).',
          partialPayload: { classCode: rawTarget },
        },
      };
    }

    // Course ID only (missing code)
    if (resolvedId && !resolvedCode && !/classroom\.google\.com/i.test(rawTarget)) {
      return {
        ok: true,
        summary: `Got Class ID ${resolvedId}. What is the 5–12 character Class Code?`,
        needsClarification: {
          actionType: 'classroom_join',
          question: `Got Class ID ${resolvedId}. What is the 5–12 character Class Code?`,
          partialPayload: { courseId: resolvedId, target: resolvedId },
        },
      };
    }

    if (!args.skipConfirm) {
      const label = resolvedId ? `Class ID ${resolvedId}` : rawTarget;
      return {
        ok: true,
        summary: `Confirm joining ${label}?`,
        pendingConfirmation: {
          actionType: 'classroom_join',
          payload: {
            mode: resolvedId && resolvedCode && !/classroom\.google\.com/i.test(rawTarget) ? 'id_code' : 'link',
            inviteLink: /classroom\.google\.com/i.test(rawTarget) ? rawTarget : undefined,
            courseId: resolvedId || undefined,
            classCode: resolvedCode || undefined,
          },
          previewText: `🎓 *Join Google Classroom?*\nCourse: ${label}${resolvedCode ? `\nCode: \`${resolvedCode}\`` : ''}`,
          buttons: [[{ label: 'Join', callbackData: 'confirm' }, { label: 'Cancel', callbackData: 'cancel' }]],
        },
      };
    }

    const res = await joinClassroom({
      mode: resolvedId && resolvedCode && !/classroom\.google\.com/i.test(rawTarget) ? 'id_code' : 'link',
      inviteLink: /classroom\.google\.com/i.test(rawTarget) ? rawTarget : undefined,
      courseId: resolvedId || undefined,
      classCode: resolvedCode || undefined,
      userId: ctx.userId,
    });
    if (!res.joined) {
      return {
        ok: false,
        summary: res.message,
        fixButton:
          res.errorCode === 'MISSING_ROSTER_SCOPE'
            ? { label: 'Reconnect Google', url: '/classroom' }
            : { label: 'Open Classroom', url: 'https://classroom.google.com/u/0/h' },
      };
    }
    return {
      ok: true,
      summary: res.message,
      buttons: [[{ label: 'Assignments', callbackData: 'cmd:classroom_sync' }]],
    };
  },
};

export const classroomExplainTool: CommandToolDef<{ query: string; language?: 'english' | 'thanglish' }> = {
  name: 'classroom_explain',
  category: 'classroom',
  description: 'Explain a Classroom assignment in English or Thanglish.',
  requiresConfirmation: false,
  inputSchema: z.object({
    query: z.string().min(1),
    language: z.enum(['english', 'thanglish']).default('english'),
  }),
  jsonSchema: {
    type: 'object',
    properties: { query: { type: 'string' }, language: { type: 'string', enum: ['english', 'thanglish'] } },
    required: ['query'],
  },
  async execute(args, ctx) {
    const lang = args.language || (ctx.language === 'thanglish' ? 'thanglish' : 'english');
    const res = await explainClassroomAssignment(args.query, lang);
    return { ok: true, summary: res.explanation };
  },
};

export const classroomExamPrepTool: CommandToolDef<{ subject: string; hoursAvailable?: number }> = {
  name: 'classroom_exam_prep',
  category: 'classroom',
  description: 'Generate a last-minute exam prep plan for a subject.',
  requiresConfirmation: false,
  inputSchema: z.object({
    subject: z.string().min(1),
    hoursAvailable: z.number().min(0.5).max(168).default(5),
  }),
  jsonSchema: {
    type: 'object',
    properties: { subject: { type: 'string' }, hoursAvailable: { type: 'number' } },
    required: ['subject'],
  },
  async execute(args, ctx) {
    const prep = await runLastMinuteExamPrep({
      subject: args.subject,
      hoursAvailable: args.hoursAvailable ?? 5,
      language: ctx.language === 'thanglish' ? 'thanglish' : 'english',
      mode: 'plan',
    });
    return { ok: true, summary: `Exam Prep (${prep.subject}):\n${prep.plan}` };
  },
};

export const classroomSetPersonalStatusTool: CommandToolDef<{ assignmentId: string; status: 'done' | 'todo' | 'in_progress' }> = {
  name: 'classroom_set_personal_status',
  category: 'classroom',
  description: 'Mark an assignment as done personally (does not submit officially to Google Classroom).',
  requiresConfirmation: false,
  inputSchema: z.object({
    assignmentId: z.string().min(1),
    status: z.enum(['done', 'todo', 'in_progress']).default('done'),
  }),
  jsonSchema: {
    type: 'object',
    properties: { assignmentId: { type: 'string' }, status: { type: 'string' } },
    required: ['assignmentId'],
  },
  async execute(args) {
    await setPersonalAssignmentStatus(args.assignmentId, args.status);
    return { ok: true, summary: `Marked assignment ${args.assignmentId} as ${args.status} (personal status only).` };
  },
};
