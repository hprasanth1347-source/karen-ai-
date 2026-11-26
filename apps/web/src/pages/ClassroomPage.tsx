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

export default function ClassroomPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [assignments, setAssignments] = useState<ClassroomAssignment[]>([]);
  const [announcements, setAnnouncements] = useState<ClassroomAnnouncement[]>([]);
  const [grades, setGrades] = useState<GradeCourseSummary[]>([]);
  const [exams, setExams] = useState<ClassroomExam[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadAll = useCallback(async () => {
    try {
      const [ovRes, asRes, anRes, grRes, exRes] = await Promise.all([
        api.get<{ data: OverviewPayload }>('/classroom/overview'),
        api.get<{ data: ClassroomAssignment[] }>(`/classroom/assignments?category=${categoryFilter}&sortBy=${sortBy}`),
        api.get<{ data: ClassroomAnnouncement[] }>('/classroom/announcements'),
        api.get<{ data: GradeCourseSummary[] }>('/classroom/grades'),
        api.get<{ data: ClassroomExam[] }>('/classroom/exams'),
      ]);
      setOverview(ovRes.data.data);
      setAssignments(asRes.data.data || []);
      setAnnouncements(anRes.data.data || []);
      setGrades(grRes.data.data || []);
      setExams(exRes.data.data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load Google Classroom data.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, sortBy]);

  useEffect(() => {
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
    } catch {
      setError('Failed to prepare assignment draft.');
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

      {error && (
        <div className="p-3 border-2 border-coral bg-coral/10 text-coral text-xs font-bold">
          {error}
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
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black border-2 border-ink transition-all ${
              tab === key
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
                  className={`px-2.5 py-1 text-xs font-bold border-2 border-ink uppercase ${
                    categoryFilter === cat ? 'bg-coral text-white' : 'bg-white text-ink'
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
