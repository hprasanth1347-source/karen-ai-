import React, { useCallback, useEffect, useState } from 'react';
import {
  GraduationCap,
  RefreshCw,
  BookOpen,
  ClipboardList,
  Sparkles,
  Award,
  Bell,
  Settings,
  ExternalLink,
  Link2,
  Unlink,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Download,
} from 'lucide-react';
import { api } from '../lib/api';

type TabKey =
  | 'overview'
  | 'classes'
  | 'assignments'
  | 'examprep'
  | 'grades'
  | 'notifications'
  | 'settings';

interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  description?: string;
  courseState: string;
  alternateLink?: string;
  teacherNames: string[];
}

interface ClassroomAssignment {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  description?: string;
  dueIso?: string | null;
  dueIstDisplay?: string;
  maxPoints?: number | null;
  alternateLink?: string;
  submissionState: string;
  assignedGrade?: number | null;
  draftGrade?: number | null;
  category: 'new' | 'pending' | 'submitted' | 'graded' | 'overdue';
  personalStatus: 'todo' | 'in_progress' | 'done';
}

interface ClassroomAnnouncement {
  id: string;
  courseName: string;
  text: string;
  creationTime: string;
  alternateLink?: string;
  teacherName?: string;
  summary?: string;
}

interface ClassroomExam {
  id: string;
  subject: string;
  examDateIso: string;
  examTime?: string;
  notes?: string;
  topics: Array<{ title: string; revised: boolean }>;
}

interface ClassroomSettings {
  syncEnabled: boolean;
  syncIntervalMs: number;
  timezone: string;
  reminders: {
    threeDaysBefore: boolean;
    oneDayBefore: boolean;
    threeHoursBefore: boolean;
    afterDeadline: boolean;
    examThreeDaysBefore: boolean;
    examOneDayBefore: boolean;
    examDayMorning: boolean;
  };
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
}

interface OverviewPayload {
  connected: boolean;
  configured?: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  accountRestrictedNote?: string | null;
  stats: {
    totalCourses: number;
    activeCourses: number;
    totalAssignments: number;
    newAssignments: number;
    pendingAssignments: number;
    submittedAssignments: number;
    overdueAssignments: number;
    gradedAssignments: number;
    upcomingExams: number;
  };
  courses: ClassroomCourse[];
  upcomingDeadlines: ClassroomAssignment[];
  upcomingExams: ClassroomExam[];
  settings: ClassroomSettings;
}

interface GradeCourseSummary {
  courseId: string;
  courseName: string;
  gradedCount: number;
  ungradedCount: number;
  submittedCount: number;
  pendingCount: number;
  earnedPoints: number;
  possiblePoints: number;
  items: Array<{
    id: string;
    title: string;
    submissionState: string;
    assignedGrade: number | null;
    draftGrade: number | null;
    maxPoints: number | null;
  }>;
}

const CLASSROOM_LOCAL_KEY = 'karen_classroom_bundle_v1';

interface ClassroomBundle {
  overview: OverviewPayload;
  assignments: ClassroomAssignment[];
  announcements: ClassroomAnnouncement[];
  grades: GradeCourseSummary[];
  exams: ClassroomExam[];
}

function readClassroomLocal(): ClassroomBundle | null {
  try {
    const raw = localStorage.getItem(CLASSROOM_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as ClassroomBundle) : null;
  } catch {
    return null;
  }
}

export default function ClassroomPage() {
  const initialLocal = readClassroomLocal();
  const [tab, setTab] = useState<TabKey>('overview');
  const [overview, setOverview] = useState<OverviewPayload | null>(initialLocal?.overview ?? null);
  const [assignments, setAssignments] = useState<ClassroomAssignment[]>(initialLocal?.assignments ?? []);
  const [announcements, setAnnouncements] = useState<ClassroomAnnouncement[]>(initialLocal?.announcements ?? []);
  const [grades, setGrades] = useState<GradeCourseSummary[]>(initialLocal?.grades ?? []);
  const [exams, setExams] = useState<ClassroomExam[]>(initialLocal?.exams ?? []);
  const [loading, setLoading] = useState(!initialLocal);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assignment filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'subject' | 'priority' | 'status'>('deadline');

  // AI modal/panel output
  const [aiOutput, setAiOutput] = useState<{ title: string; content: string; filename?: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Exam form + Last-Minute Exam Prep
  const [examSubject, setExamSubject] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('');
  const [examTopicsRaw, setExamTopicsRaw] = useState('');
  const [prepSubject, setPrepSubject] = useState('');
  const [prepHours, setPrepHours] = useState(5);
  const [prepLanguage, setPrepLanguage] = useState<'english' | 'thanglish'>('english');
  const [prepMode, setPrepMode] = useState<'plan' | 'notes' | 'quiz' | 'mock'>('plan');
  const [prepResult, setPrepResult] = useState<string | null>(null);

  // Join Class: 3 segmented modes ("link" | "id_code" | "invitation")
  const [joinMode, setJoinMode] = useState<'link' | 'id_code' | 'invitation'>('link');
  const [inviteLinkInput, setInviteLinkInput] = useState('');
  const [classIdInput, setClassIdInput] = useState('');
  const [classCodeInput, setClassCodeInput] = useState('');
  const [showIdHelp, setShowIdHelp] = useState(false);
  const [invitations, setInvitations] = useState<Array<{ id: string; courseId: string; role?: string }>>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinResult, setJoinResult] = useState<{
    joined: boolean;
    alreadyEnrolled?: boolean;
    courseId?: string;
    courseName?: string;
    errorCode?: string;
    message: string;
  } | null>(null);
  const [recentJoins, setRecentJoins] = useState<Array<{ courseId: string; courseName: string; at: string }>>([]);

  const detectCourseIdFromInput = (raw: string): { id: string; cjc?: string } => {
    const trimmed = raw.trim();
    if (!trimmed) return { id: '' };
    if (/^\d+$/.test(trimmed)) return { id: trimmed };
    let slug = trimmed;
    let cjc: string | undefined;
    if (/classroom\.google\.com/i.test(trimmed)) {
      try {
        const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        cjc = u.searchParams.get('cjc')?.trim() || undefined;
        const m = u.pathname.match(/\/c\/([^/]+)/i);
        slug = m?.[1] || '';
      } catch {
        return { id: '' };
      }
    }
    if (/^\d+$/.test(slug)) return { id: slug, cjc };
    try {
      let b64 = slug.replace(/-/g, '+').replace(/_/g, '/');
      if (b64.length % 4 > 0) b64 += '='.repeat(4 - (b64.length % 4));
      const decoded = atob(b64).trim();
      if (/^\d+$/.test(decoded)) return { id: decoded, cjc };
    } catch {
      // ignore
    }
    return { id: '', cjc };
  };

  const detectedFromIdField = detectCourseIdFromInput(classIdInput);
  const effectiveCode = classCodeInput.trim() || detectedFromIdField.cjc || '';
  const isLinkValid = /classroom\.google\.com\/c\//i.test(inviteLinkInput.trim());
  const isIdCodeValid = /^\d+$/.test(detectedFromIdField.id) && /^[A-Za-z0-9]{5,12}$/.test(effectiveCode);

  const loadInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const res = await api.get<{ data: Array<{ id: string; courseId: string; role?: string }> }>('/classroom/invitations');
      setInvitations(res.data?.data || []);
    } catch {
      setInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const loadAll = useCallback(async () => {
    try {
      const res = await api.get<{ data: ClassroomBundle }>(
        `/classroom/bundle?category=${categoryFilter}&sortBy=${sortBy}`
      );
      const bundle = res.data.data;
      setOverview(bundle.overview);
      setAssignments(bundle.assignments || []);
      setAnnouncements(bundle.announcements || []);
      setGrades(bundle.grades || []);
      setExams(bundle.exams || []);
      try {
        localStorage.setItem(CLASSROOM_LOCAL_KEY, JSON.stringify(bundle));
      } catch {
        // Ignore storage quota errors
      }
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load Google Classroom data.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, sortBy]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
      void (async () => {
        setSyncing(true);
        try {
          await api.post('/classroom/sync');
        } catch {
          // loadAll will display lastError if sync failed
        } finally {
          setSyncing(false);
          await loadAll();
        }
      })();
      return;
    }
    void loadAll();
  }, [loadAll]);

  const handleConnect = async () => {
    try {
      const res = await api.get<{ data: { url: string } }>('/classroom/auth-url');
      if (res.data?.data?.url) {
        window.location.href = res.data.data.url;
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to get Google Classroom auth URL.');
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.post('/classroom/disconnect');
      await loadAll();
    } catch {
      setError('Failed to disconnect Google Classroom.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.post('/classroom/sync');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Classroom sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleJoinClass = async (e?: React.FormEvent, invitationId?: string) => {
    if (e) e.preventDefault();
    setJoining(true);
    setJoinResult(null);
    try {
      const payload = invitationId
        ? { mode: 'invitation', invitationId }
        : joinMode === 'link'
          ? { mode: 'link', inviteLink: inviteLinkInput.trim() }
          : {
              mode: 'id_code',
              courseId: detectedFromIdField.id || classIdInput.trim(),
              classCode: effectiveCode,
              classUrl: /classroom\.google\.com/i.test(classIdInput) ? classIdInput.trim() : undefined,
            };

      const res = await api.post<{
        data: {
          joined: boolean;
          alreadyEnrolled?: boolean;
          courseId?: string;
          courseName?: string;
          errorCode?: string;
          message: string;
        };
      }>('/classroom/join', payload);
      const data = res.data.data;
      setJoinResult(data);
      if (data.joined) {
        setInviteLinkInput('');
        setClassIdInput('');
        setClassCodeInput('');
        if (data.courseId) {
          setRecentJoins((prev) => [
            {
              courseId: data.courseId!,
              courseName: data.courseName || data.courseId!,
              at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
            ...prev.slice(0, 4),
          ]);
        }
        await loadAll();
      }
    } catch (err: any) {
      setJoinResult({
        joined: false,
        message: err?.response?.data?.error || 'Could not join class.',
      });
    } finally {
      setJoining(false);
    }
  };

  const handlePersonalStatus = async (id: string, status: 'todo' | 'in_progress' | 'done') => {
    try {
      await api.patch(`/classroom/assignments/${id}/personal-status`, { status });
      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, personalStatus: status } : a))
      );
    } catch {
      setError('Failed to update personal task status.');
    }
  };

  const handleExplain = async (a: ClassroomAssignment, language: 'english' | 'thanglish') => {
    setAiBusy(true);
    try {
      const res = await api.post<{ data: { explanation: string } }>(
        `/classroom/assignments/${a.id}/explain`,
        { language }
      );
      setAiOutput({
        title: `${a.title} (${language === 'thanglish' ? 'Thanglish' : 'English'})`,
        content: res.data.data.explanation,
      });
    } catch {
      setError('Failed to generate assignment explanation.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleDraft = async (a: ClassroomAssignment, format: 'md' | 'txt') => {
    setAiBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: { draft: string; filename: string } }>(
        `/classroom/assignments/${a.id}/draft`,
        { format }
      );
      setAiOutput({
        title: `Draft: ${a.title}`,
        content: res.data.data.draft,
        filename: res.data.data.filename,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to prepare assignment draft.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleDownloadDraft = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSummarizeAnnouncement = async (id: string) => {
    try {
      const res = await api.post<{ data: ClassroomAnnouncement }>(
        `/classroom/announcements/${id}/summarize`
      );
      setAnnouncements((prev) => prev.map((a) => (a.id === id ? res.data.data : a)));
    } catch {
      setError('Failed to summarize announcement.');
    }
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examSubject.trim() || !examDate) return;
    try {
      await api.post('/classroom/exams', {
        subject: examSubject.trim(),
        examDateIso: examDate,
        examTime: examTime.trim() || undefined,
        topics: examTopicsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setExamSubject('');
      setExamDate('');
      setExamTime('');
      setExamTopicsRaw('');
      await loadAll();
    } catch {
      setError('Failed to add exam.');
    }
  };

  const handleDeleteExam = async (id: string) => {
    try {
      await api.delete(`/classroom/exams/${id}`);
      await loadAll();
    } catch {
      setError('Failed to delete exam.');
    }
  };

  const handleToggleTopic = async (examId: string, idx: number) => {
    try {
      const res = await api.post<{ data: ClassroomExam }>(
        `/classroom/exams/${examId}/topics/${idx}/toggle`
      );
      setExams((prev) => prev.map((e) => (e.id === examId ? res.data.data : e)));
    } catch {
      setError('Failed to update topic status.');
    }
  };

  const handleRunExamPrep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prepSubject.trim()) return;
    setAiBusy(true);
    try {
      const res = await api.post<{ data: { plan: string } }>('/classroom/exam-prep', {
        subject: prepSubject.trim(),
        hoursAvailable: prepHours,
        language: prepLanguage,
        mode: prepMode,
      });
      setPrepResult(res.data.data.plan);
    } catch {
      setError('Failed to generate last-minute exam prep.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleUpdateSettings = async (patch: Partial<ClassroomSettings>) => {
    try {
      const res = await api.put<{ data: ClassroomSettings }>('/classroom/settings', patch);
      setOverview((prev) => (prev ? { ...prev, settings: res.data.data } : prev));
    } catch {
      setError('Failed to update Classroom settings.');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-xs font-mono text-ink/50 animate-pulse">
          Loading Google Classroom...
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ComponentType<any> }> = [
    { key: 'overview', label: 'Overview', icon: GraduationCap },
    { key: 'classes', label: 'My Classes', icon: BookOpen },
    { key: 'assignments', label: 'Assignments', icon: ClipboardList },
    { key: 'examprep', label: 'Exam Prep', icon: Sparkles },
    { key: 'grades', label: 'Grades', icon: Award },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const stats = overview?.stats;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-coral" />
            Google Classroom — Student Edition
          </h1>
          <p className="text-xs font-mono text-ink/50">
            Courses, deadlines (Asia/Kolkata), Gemini explanations &amp; Last-Minute Exam Prep
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {overview?.connected ? (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="btn-coral text-xs flex items-center gap-1.5 px-3 py-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Classroom'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              className="btn-coral text-xs flex items-center gap-1.5 px-3 py-2"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Connect Google Classroom</span>
            </button>
          )}
        </div>
      </div>

      {(error || overview?.lastError) && (
        <div className="p-3 border-2 border-coral bg-coral/10 text-coral text-xs font-bold flex items-center justify-between gap-3">
          <span>{error || overview?.lastError}</span>
          {/scope|permission|reconnect|insufficient|403|restricted/i.test(error || overview?.lastError || '') && (
            <button
              type="button"
              onClick={handleConnect}
              className="px-2.5 py-1 border-2 border-ink bg-white text-ink text-[11px] font-black shrink-0"
            >
              Reconnect Google Classroom
            </button>
          )}
        </div>
      )}

      {overview?.accountRestrictedNote && (
        <div className="p-3 border-2 border-ink bg-yellow/25 text-xs font-medium">
          ⚠️ {overview.accountRestrictedNote}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b-2 border-ink pb-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black border-2 border-ink transition-all ${tab === key
                ? 'bg-ink text-cream shadow-brutal-sm'
                : 'bg-white text-ink hover:bg-cream-100'
              }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* AI Output Drawer */}
      {aiOutput && (
        <div className="border-3 border-ink bg-cream-50 p-4 shadow-brutal space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-black flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-coral" />
              {aiOutput.title}
            </h3>
            <div className="flex items-center gap-2">
              {aiOutput.filename && (
                <button
                  type="button"
                  onClick={() => handleDownloadDraft(aiOutput.filename!, aiOutput.content)}
                  className="px-2.5 py-1 border-2 border-ink bg-white text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              )}
              <button
                type="button"
                onClick={() => setAiOutput(null)}
                className="px-2.5 py-1 border-2 border-ink bg-ink text-cream text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink bg-white border-2 border-ink p-3 max-h-96 overflow-y-auto">
            {aiOutput.content}
          </pre>
        </div>
      )}

      {/* TAB A: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Active Courses', stats?.activeCourses ?? 0],
              ['Pending Work', stats?.pendingAssignments ?? 0],
              ['Overdue', stats?.overdueAssignments ?? 0],
              ['Graded / Submitted', `${stats?.gradedAssignments ?? 0} / ${stats?.submittedAssignments ?? 0}`],
            ].map(([label, val]) => (
              <div key={String(label)} className="border-2 border-ink bg-white p-4 shadow-brutal-sm">
                <div className="text-[11px] font-mono text-ink/50 uppercase">{label}</div>
                <div className="text-2xl font-black text-ink mt-1">{val}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border-2 border-ink bg-white p-4 space-y-3">
              <h2 className="text-sm font-black flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-coral" />
                Upcoming Deadlines
              </h2>
              {(overview?.upcomingDeadlines || []).length === 0 ? (
                <p className="text-xs text-ink/50">No pending deadlines synced yet.</p>
              ) : (
                <div className="space-y-2">
                  {overview!.upcomingDeadlines.map((a) => (
                    <div key={a.id} className="border border-ink/20 p-2.5 text-xs flex justify-between gap-2">
                      <div>
                        <div className="font-bold">{a.title}</div>
                        <div className="text-ink/50">{a.courseName}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] shrink-0">
                        <div>{a.dueIstDisplay}</div>
                        <span className="uppercase font-black text-coral">{a.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-2 border-ink bg-white p-4 space-y-3">
              <h2 className="text-sm font-black flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-coral" />
                Upcoming Exams (Last-Minute Prep Ready)
              </h2>
              {exams.length === 0 ? (
                <p className="text-xs text-ink/50">
                  No exam dates added. Add them in the Exam Prep tab when an exam is coming up!
                </p>
              ) : (
                <div className="space-y-2">
                  {exams.slice(0, 5).map((ex) => (
                    <div key={ex.id} className="border border-ink/20 p-2.5 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold">{ex.subject}</div>
                        <div className="text-ink/50 font-mono">
                          {ex.examDateIso} {ex.examTime || ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPrepSubject(ex.subject);
                          setTab('examprep');
                        }}
                        className="px-2.5 py-1 border-2 border-ink bg-coral text-white font-black text-[11px]"
                      >
                        Prepare
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB B: MY CLASSES */}
      {tab === 'classes' && (
        <div className="space-y-6">
          <div className="border-2 border-ink bg-white p-4 shadow-brutal-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-sm font-black">Join a Class</h2>
              <div className="inline-flex border-2 border-ink bg-cream-50" role="tablist" aria-label="Join class method">
                {[
                  { id: 'link', label: 'Invite link' },
                  { id: 'id_code', label: 'Class ID + code' },
                  { id: 'invitation', label: 'Pending invitations' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={joinMode === opt.id}
                    onClick={() => {
                      setJoinMode(opt.id as 'link' | 'id_code' | 'invitation');
                      setJoinResult(null);
                      if (opt.id === 'invitation') void loadInvitations();
                    }}
                    className={`px-3 py-1.5 text-xs font-bold border-r border-ink last:border-r-0 ${
                      joinMode === opt.id ? 'bg-coral text-white' : 'bg-white text-ink hover:bg-yellow/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {joinMode === 'link' && (
              <form onSubmit={handleJoinClass} className="space-y-3">
                <div>
                  <label htmlFor="classroom-invite-link" className="block text-xs font-bold mb-1">
                    Google Classroom Invite Link
                  </label>
                  <input
                    id="classroom-invite-link"
                    type="url"
                    value={inviteLinkInput}
                    onChange={(e) => setInviteLinkInput(e.target.value)}
                    placeholder="https://classroom.google.com/c/...?cjc=abc1234"
                    className="w-full border-2 border-ink p-2.5 text-base sm:text-xs"
                  />
                  {inviteLinkInput.trim() && !isLinkValid && (
                    <p className="mt-1 text-xs font-semibold text-coral">
                      Paste a full classroom.google.com/c/... invite link.
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={joining || !isLinkValid}
                  className="btn-coral text-xs px-4 py-2 font-black disabled:opacity-50"
                >
                  {joining ? 'Joining...' : 'Join Class'}
                </button>
              </form>
            )}

            {joinMode === 'id_code' && (
              <form onSubmit={handleJoinClass} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-ink/70">
                    Google Classroom cannot join by class code alone — enter both the Class ID (or course URL) and the 5–12 character Class Code.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowIdHelp((v) => !v)}
                    className="text-xs font-bold underline shrink-0"
                    aria-expanded={showIdHelp}
                  >
                    Where do I find the Class ID?
                  </button>
                </div>

                {showIdHelp && (
                  <div className="border-2 border-ink bg-cream-50 p-3 text-xs space-y-1">
                    <p className="font-bold">How to find the Class ID:</p>
                    <p>
                      Open the class in Google Classroom or copy the teacher&apos;s invite URL (`classroom.google.com/c/...`). Paste the full URL or the numeric ID directly into the Class ID field below — Karen decodes it automatically.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="classroom-class-id" className="block text-xs font-bold mb-1">
                      Class ID (number or class URL)
                    </label>
                    <input
                      id="classroom-class-id"
                      type="text"
                      value={classIdInput}
                      onChange={(e) => setClassIdInput(e.target.value)}
                      placeholder="123456789 or classroom.google.com/c/..."
                      className="w-full border-2 border-ink p-2.5 text-base sm:text-xs"
                    />
                    {detectedFromIdField.id && (
                      <p className="mt-1 text-[11px] font-mono font-bold text-green-700">
                        Detected ID: {detectedFromIdField.id}
                      </p>
                    )}
                    {classIdInput.trim() && !detectedFromIdField.id && (
                      <p className="mt-1 text-xs font-semibold text-coral">
                        Enter a numeric Class ID or a valid Classroom URL/slug.
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="classroom-class-code" className="block text-xs font-bold mb-1">
                      Class code
                    </label>
                    <input
                      id="classroom-class-code"
                      type="text"
                      value={classCodeInput}
                      onChange={(e) => setClassCodeInput(e.target.value)}
                      placeholder={detectedFromIdField.cjc ? `Auto-detected: ${detectedFromIdField.cjc}` : 'e.g. abc1234'}
                      className="w-full border-2 border-ink p-2.5 text-base sm:text-xs"
                    />
                    {effectiveCode && !/^[A-Za-z0-9]{5,12}$/.test(effectiveCode) && (
                      <p className="mt-1 text-xs font-semibold text-coral">
                        Class code must be 5–12 alphanumeric characters.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={joining || !isIdCodeValid}
                  className="btn-coral text-xs px-4 py-2 font-black disabled:opacity-50"
                >
                  {joining ? 'Joining...' : 'Join Class'}
                </button>
              </form>
            )}

            {joinMode === 'invitation' && (
              <div className="space-y-2">
                {loadingInvitations ? (
                  <p className="text-xs font-mono text-ink/60">Loading pending invitations...</p>
                ) : invitations.length === 0 ? (
                  <p className="text-xs text-ink/70">No pending Classroom invitations found.</p>
                ) : (
                  <div className="space-y-2">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between border-2 border-ink p-2.5 bg-cream-50 text-xs">
                        <span className="font-bold">Course ID: {inv.courseId} ({inv.role || 'STUDENT'})</span>
                        <button
                          type="button"
                          disabled={joining}
                          onClick={() => void handleJoinClass(undefined, inv.id)}
                          className="btn-teal px-3 py-1 text-xs font-black"
                        >
                          Accept
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div aria-live="polite">
              {joinResult && (
                <div
                  className={`border-2 border-ink p-3 text-xs space-y-2 ${
                    joinResult.joined ? 'bg-mint/40' : 'bg-coral/15'
                  }`}
                >
                  <p className="font-bold">{joinResult.message}</p>
                  <div className="flex flex-wrap gap-2">
                    {joinResult.joined && joinResult.courseId && (
                      <a
                        href={`https://classroom.google.com/c/${joinResult.courseId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-teal px-3 py-1 text-xs font-black inline-block"
                      >
                        Open class
                      </a>
                    )}
                    {joinResult.errorCode === 'MISSING_ROSTER_SCOPE' && (
                      <button
                        type="button"
                        onClick={handleConnect}
                        className="btn-coral px-3 py-1 text-xs font-black"
                      >
                        Reconnect Google
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {recentJoins.length > 0 && (
              <div className="border-t border-ink/20 pt-3 space-y-1">
                <p className="text-[11px] font-mono font-bold text-ink/60 uppercase">Recent Joins</p>
                <ul className="space-y-1 text-xs">
                  {recentJoins.map((rj, i) => (
                    <li key={`${rj.courseId}-${i}`} className="flex items-center justify-between">
                      <span className="font-bold">{rj.courseName}</span>
                      <span className="font-mono text-ink/60">{rj.at}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {(overview?.courses || []).length === 0 ? (
            <div className="border-2 border-ink bg-white p-6 text-center space-y-3">
              <p className="text-xs font-bold text-ink/70">
                {overview?.connected
                  ? 'No Google Classroom courses found yet.'
                  : 'Connect your Google account to load your Classroom courses.'}
              </p>
              <div className="flex justify-center gap-2">
                {overview?.connected ? (
                  <>
                    <button type="button" onClick={handleSync} disabled={syncing} className="btn-coral text-xs px-3 py-1.5">
                      {syncing ? 'Syncing...' : 'Sync Courses Now'}
                    </button>
                    <button type="button" onClick={handleConnect} className="px-3 py-1.5 border-2 border-ink bg-white text-xs font-bold">
                      Reconnect Google
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={handleConnect} className="btn-coral text-xs px-3 py-1.5">
                    Connect Google Classroom
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(overview?.courses || []).map((c) => (
                <div key={c.id} className="border-2 border-ink bg-white p-4 shadow-brutal-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-black text-sm">{c.name}</h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 border border-ink bg-cream-100">
                      {c.courseState}
                    </span>
                  </div>
                  {c.section && <p className="text-xs text-ink/60">{c.section}</p>}
                  {c.teacherNames.length > 0 && (
                    <p className="text-xs font-mono text-ink/70">👤 {c.teacherNames.join(', ')}</p>
                  )}
                  {c.alternateLink && (
                    <a
                      href={c.alternateLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-coral hover:underline"
                    >
                      Open in Classroom <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border-2 border-ink bg-white p-4 space-y-3">
            <h2 className="text-sm font-black">Recent Course Announcements</h2>
            {announcements.length === 0 ? (
              <p className="text-xs text-ink/50">No announcements cached yet.</p>
            ) : (
              <div className="space-y-3">
                {announcements.map((ann) => (
                  <div key={ann.id} className="border border-ink/20 p-3 space-y-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-black">{ann.courseName}</span>
                      <span className="font-mono text-ink/50">
                        {new Date(ann.creationTime).toLocaleDateString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-ink/80">{ann.text}</p>
                    {ann.summary && (
                      <div className="bg-yellow/20 border border-ink/20 p-2 text-xs">
                        <strong>Summary:</strong> {ann.summary}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSummarizeAnnouncement(ann.id)}
                      className="px-2 py-1 border border-ink bg-cream-100 font-bold text-[11px]"
                    >
                      Summarize with Gemini
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB C: ASSIGNMENTS */}
      {tab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {['all', 'new', 'pending', 'in_progress', 'overdue', 'submitted', 'graded'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-bold border-2 border-ink uppercase ${categoryFilter === cat ? 'bg-coral text-white' : 'bg-white text-ink'
                    }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border-2 border-ink bg-white px-2.5 py-1 text-xs font-bold"
            >
              <option value="deadline">Sort: Nearest Deadline</option>
              <option value="subject">Sort: Subject</option>
              <option value="priority">Sort: Priority</option>
              <option value="status">Sort: Submission Status</option>
            </select>
          </div>

          <div className="space-y-3">
            {assignments.length === 0 ? (
              <div className="border-2 border-ink bg-white p-6 text-center text-xs text-ink/50">
                No assignments match this filter.
              </div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="border-2 border-ink bg-white p-4 shadow-brutal-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-sm">{a.title}</h3>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 border border-ink bg-cream-100 uppercase">
                          Classroom: {a.submissionState}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 border border-ink bg-yellow/30 uppercase">
                          {a.category}
                        </span>
                      </div>
                      <p className="text-xs text-ink/60 mt-0.5">
                        {a.courseName} · Due: {a.dueIstDisplay}
                        {typeof a.maxPoints === 'number' ? ` · Max Marks: ${a.maxPoints}` : ''}
                      </p>
                    </div>

                    <select
                      value={a.personalStatus}
                      onChange={(e) => handlePersonalStatus(a.id, e.target.value as any)}
                      className="border-2 border-ink bg-cream-50 px-2 py-1 text-xs font-bold"
                      title="Personal task tracker (separate from Classroom submission)"
                    >
                      <option value="todo">My Task: To Do</option>
                      <option value="in_progress">My Task: In Progress</option>
                      <option value="done">My Task: Done</option>
                    </select>
                  </div>

                  {a.description && (
                    <p className="text-xs text-ink/80 bg-cream-50 border border-ink/15 p-2.5 whitespace-pre-wrap">
                      {a.description.slice(0, 400)}
                      {a.description.length > 400 ? '...' : ''}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => handleExplain(a, 'english')}
                      className="px-2.5 py-1 border-2 border-ink bg-white text-xs font-bold flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-coral" /> Explain (English)
                    </button>
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => handleExplain(a, 'thanglish')}
                      className="px-2.5 py-1 border-2 border-ink bg-white text-xs font-bold flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-coral" /> Explain (Thanglish)
                    </button>
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => handleDraft(a, 'md')}
                      className="px-2.5 py-1 border-2 border-ink bg-cream-100 text-xs font-bold flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" /> Prepare Draft (.md)
                    </button>
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => handleDraft(a, 'txt')}
                      className="px-2.5 py-1 border-2 border-ink bg-cream-100 text-xs font-bold flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" /> Prepare Draft (.txt)
                    </button>
                    {a.alternateLink && (
                      <a
                        href={a.alternateLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 border-2 border-ink bg-ink text-cream text-xs font-bold flex items-center gap-1"
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB D: LAST-MINUTE EXAM PREP ONLY */}
      {tab === 'examprep' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <form onSubmit={handleRunExamPrep} className="border-2 border-ink bg-white p-4 shadow-brutal-sm space-y-3">
              <h2 className="text-sm font-black">Last-Minute Exam Preparation Mode</h2>
              <p className="text-xs text-ink/60">
                No daily study timetable — intensive cram mode only when you have an upcoming exam.
              </p>
              <input
                type="text"
                required
                value={prepSubject}
                onChange={(e) => setPrepSubject(e.target.value)}
                placeholder="Subject (e.g. DBMS, Python, Operating Systems)"
                className="w-full border-2 border-ink p-2 text-xs"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  min={0.5}
                  max={72}
                  step={0.5}
                  value={prepHours}
                  onChange={(e) => setPrepHours(Number(e.target.value))}
                  className="border-2 border-ink p-2 text-xs"
                  title="Hours available"
                />
                <select
                  value={prepMode}
                  onChange={(e) => setPrepMode(e.target.value as any)}
                  className="border-2 border-ink p-2 text-xs font-bold"
                >
                  <option value="plan">Cram Plan</option>
                  <option value="notes">Short Notes</option>
                  <option value="quiz">Quick Quiz</option>
                  <option value="mock">Mock Test</option>
                </select>
                <select
                  value={prepLanguage}
                  onChange={(e) => setPrepLanguage(e.target.value as any)}
                  className="border-2 border-ink p-2 text-xs font-bold"
                >
                  <option value="english">English</option>
                  <option value="thanglish">Thanglish</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={aiBusy}
                className="w-full btn-coral py-2 text-xs font-black"
              >
                {aiBusy ? 'Generating Cram Kit...' : 'Start Last-Minute Prep'}
              </button>
            </form>

            {prepResult && (
              <div className="border-2 border-ink bg-cream-50 p-4 space-y-2">
                <h3 className="text-xs font-black uppercase">Generated Revision Kit</h3>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed max-h-96 overflow-y-auto">
                  {prepResult}
                </pre>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <form onSubmit={handleAddExam} className="border-2 border-ink bg-white p-4 space-y-3">
              <h2 className="text-sm font-black">Add Exam Date</h2>
              <input
                type="text"
                required
                value={examSubject}
                onChange={(e) => setExamSubject(e.target.value)}
                placeholder="Subject name"
                className="w-full border-2 border-ink p-2 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="border-2 border-ink p-2 text-xs"
                />
                <input
                  type="text"
                  value={examTime}
                  onChange={(e) => setExamTime(e.target.value)}
                  placeholder="Time (e.g. 9:30 AM)"
                  className="border-2 border-ink p-2 text-xs"
                />
              </div>
              <input
                type="text"
                value={examTopicsRaw}
                onChange={(e) => setExamTopicsRaw(e.target.value)}
                placeholder="Topics (comma-separated, optional)"
                className="w-full border-2 border-ink p-2 text-xs"
              />
              <button type="submit" className="px-3 py-2 border-2 border-ink bg-ink text-cream text-xs font-black flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Save Exam Date
              </button>
            </form>

            <div className="space-y-2">
              {exams.map((ex) => (
                <div key={ex.id} className="border-2 border-ink bg-white p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-black">{ex.subject}</span>
                      <span className="ml-2 font-mono text-ink/50">{ex.examDateIso}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteExam(ex.id)}
                      className="text-coral p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {ex.topics.length > 0 && (
                    <div className="space-y-1">
                      {ex.topics.map((t, idx) => (
                        <label key={idx} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={t.revised}
                            onChange={() => handleToggleTopic(ex.id, idx)}
                          />
                          <span className={t.revised ? 'line-through text-ink/40' : ''}>{t.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB E: GRADES */}
      {tab === 'grades' && (
        <div className="space-y-4">
          {grades.length === 0 ? (
            <div className="border-2 border-ink bg-white p-6 text-center text-xs text-ink/50">
              No grade or submission records cached yet.
            </div>
          ) : (
            grades.map((g) => (
              <div key={g.courseId} className="border-2 border-ink bg-white p-4 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h3 className="font-black text-sm">{g.courseName}</h3>
                  <div className="text-xs font-mono">
                    Graded: {g.gradedCount} · Ungraded: {g.ungradedCount} · Pending: {g.pendingCount}
                    {g.gradedCount > 0 ? ` · Total: ${g.earnedPoints}/${g.possiblePoints}` : ''}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-xs border-t border-ink/10 pt-1.5">
                      <span>{item.title}</span>
                      <span className="font-mono">
                        {typeof item.assignedGrade === 'number'
                          ? `${item.assignedGrade}${item.maxPoints ? ` / ${item.maxPoints}` : ''}`
                          : item.submissionState}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB F: NOTIFICATIONS */}
      {tab === 'notifications' && (
        <div className="border-2 border-ink bg-white p-5 space-y-3 text-xs">
          <h2 className="text-sm font-black">Telegram Academic Alert Rules</h2>
          <ul className="space-y-1.5 list-disc list-inside text-ink/70">
            <li>New assignment &amp; announcement alerts with inline Telegram buttons</li>
            <li>Default deadline reminders: 3 days before, 1 day before, 3 hours before, and after deadline if still pending</li>
            <li>Exam alerts: 1 day before (with Start Preparation button) &amp; exam morning only — no daily study spam</li>
            <li>Deduplicated automatically so unchanged items never trigger repeat alerts</li>
          </ul>
        </div>
      )}

      {/* TAB G: SETTINGS */}
      {tab === 'settings' && overview?.settings && (
        <div className="border-2 border-ink bg-white p-5 space-y-4 max-w-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black">Google Account Connection</h2>
              <p className="text-xs text-ink/50 font-mono">
                {overview.connected ? 'Connected (Read-Only Classroom Scopes)' : 'Not Connected'}
              </p>
            </div>
            {overview.connected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-3 py-1.5 border-2 border-ink bg-ink text-cream text-xs font-black flex items-center gap-1"
              >
                <Unlink className="w-3.5 h-3.5" /> Disconnect &amp; Revoke
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className="btn-coral text-xs flex items-center gap-1"
              >
                <Link2 className="w-3.5 h-3.5" /> Connect
              </button>
            )}
          </div>

          <div className="border-t-2 border-ink/10 pt-4 space-y-2 text-xs">
            <h3 className="font-black uppercase">Reminder Schedule ({overview.settings.timezone})</h3>
            {(
              [
                ['threeDaysBefore', '3 days before assignment deadline'],
                ['oneDayBefore', '1 day before assignment deadline'],
                ['threeHoursBefore', '3 hours before assignment deadline'],
                ['afterDeadline', 'After deadline if still pending'],
                ['examOneDayBefore', '1 day before exam (Last-Minute Prep prompt)'],
                ['examDayMorning', 'Exam day morning wish'],
                ['examThreeDaysBefore', '3 days before exam (optional)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overview.settings.reminders[key]}
                  onChange={(e) =>
                    handleUpdateSettings({
                      reminders: {
                        ...overview.settings.reminders,
                        [key]: e.target.checked,
                      },
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="border-t-2 border-ink/10 pt-4 space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-bold">
              <input
                type="checkbox"
                checked={overview.settings.quietHours.enabled}
                onChange={(e) =>
                  handleUpdateSettings({
                    quietHours: {
                      ...overview.settings.quietHours,
                      enabled: e.target.checked,
                    },
                  })
                }
              />
              <span>
                Enable Quiet Hours ({overview.settings.quietHours.startHour}:00 –{' '}
                {overview.settings.quietHours.endHour}:00 IST)
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
