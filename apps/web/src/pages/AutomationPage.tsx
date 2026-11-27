import React, { useCallback, useEffect, useState } from 'react';
import {
  Cpu,
  Play,
  Pause,
  Plus,
  Sparkles,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  version: number;
  timezone: string;
  scheduleCron?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  requiresApproval: boolean;
  updatedAt: string;
}

interface ExecutionStep {
  nodeId: string;
  nodeType: string;
  label: string;
  status: string;
  durationMs: number;
  outputSummary: string;
  errorMessage?: string;
}

interface ExecutionRec {
  id: string;
  automationName: string;
  status: string;
  triggerType: string;
  durationMs: number;
  steps: ExecutionStep[];
  startedAt: string;
}

interface TemplateRec {
  id: string;
  name: string;
  description: string;
  category: string;
  scheduleCron?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface StatsRec {
  totalWorkflows: number;
  activeWorkflows: number;
  pausedWorkflows: number;
  totalExecutions: number;
  succeededExecutions: number;
  failedExecutions: number;
  avgDurationMs: number;
  templatesCount: number;
}

type TabId = 'workflows' | 'ai_builder' | 'visual_builder' | 'templates' | 'history';

export const AutomationPage: React.FC = () => {
  const [tab, setTab] = useState<TabId>('workflows');
  const [stats, setStats] = useState<StatsRec | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [executions, setExecutions] = useState<ExecutionRec[]>([]);
  const [templates, setTemplates] = useState<TemplateRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // AI Builder state
  const [aiInstruction, setAiInstruction] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plannedPreview, setPlannedPreview] = useState<{
    workflow: Omit<WorkflowDef, 'id' | 'status' | 'version' | 'updatedAt'>;
    validation: { valid: boolean; errors: string[]; requiresApproval: boolean };
  } | null>(null);

  // Visual Builder state
  const [vbName, setVbName] = useState('Custom Visual Workflow');
  const [vbNodes, setVbNodes] = useState<WorkflowNode[]>([
    { id: 'n1', type: 'trigger.manual', label: 'Manual Trigger', config: {} },
    { id: 'n2', type: 'action.send_notification', label: 'Send Dashboard Alert', config: {} },
  ]);

  const loadAll = useCallback(async () => {
    try {
      const res = await api.get<{
        data: {
          stats: StatsRec;
          workflows: WorkflowDef[];
          executions: ExecutionRec[];
          templates: TemplateRec[];
        };
      }>('/automations');
      if (res.data?.data) {
        setStats(res.data.data.stats);
        setWorkflows(res.data.data.workflows || []);
        setExecutions(res.data.data.executions || []);
        setTemplates(res.data.data.templates || []);
      }
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to load Automation Center');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handlePlanAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInstruction.trim() || planning) return;
    setPlanning(true);
    setErrMsg(null);
    setNotice(null);
    try {
      const res = await api.post<{ data: NonNullable<typeof plannedPreview> }>('/automations/plan', {
        instruction: aiInstruction.trim(),
      });
      setPlannedPreview(res.data?.data || null);
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to plan workflow');
    } finally {
      setPlanning(false);
    }
  };

  const handleSavePlanned = async () => {
    if (!plannedPreview) return;
    setBusyId('save-plan');
    try {
      await api.post('/automations', { ...plannedPreview.workflow, status: 'paused' });
      setNotice(`Workflow "${plannedPreview.workflow.name}" saved!`);
      setPlannedPreview(null);
      setAiInstruction('');
      setTab('workflows');
      await loadAll();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleUseTemplate = async (tplId: string) => {
    setBusyId(tplId);
    setErrMsg(null);
    try {
      await api.post(`/automations/from-template/${tplId}`, {});
      setNotice('Workflow created from template!');
      setTab('workflows');
      await loadAll();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Template create failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleRunNow = async (id: string) => {
    setBusyId(id);
    setErrMsg(null);
    try {
      const res = await api.post<{ data: ExecutionRec }>(`/automations/${id}/run`, {});
      const ex = res.data?.data;
      setNotice(`Execution ${ex?.status?.toUpperCase()} in ${ex?.durationMs ?? 0}ms`);
      await loadAll();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = async (wf: WorkflowDef) => {
    setBusyId(wf.id);
    try {
      await api.post(`/automations/${wf.id}/toggle`, {
        status: wf.status === 'active' ? 'paused' : 'active',
      });
      await loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await api.delete(`/automations/${id}`);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveVisual = async () => {
    if (!vbName.trim() || vbNodes.length === 0) return;
    setBusyId('save-vb');
    setErrMsg(null);
    const edges: WorkflowEdge[] = vbNodes.slice(0, -1).map((n, i) => ({
      id: `e-${i}`,
      source: n.id,
      target: vbNodes[i + 1].id,
    }));
    try {
      await api.post('/automations', {
        name: vbName.trim(),
        description: 'Built in Visual Workflow Builder',
        status: 'paused',
        timezone: 'Asia/Kolkata',
        nodes: vbNodes,
        edges,
      });
      setNotice(`Visual workflow "${vbName.trim()}" saved!`);
      setTab('workflows');
      await loadAll();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Invalid workflow graph');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Cpu className="w-3.5 h-3.5" />
            <span>KAREN AUTOMATION CENTER • ASIA/KOLKATA</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Workflows, AI Builder &amp; Scheduler</h1>
          <p className="text-xs text-ink-muted mt-1">
            Create, validate, schedule, and monitor real Karen AI automations across Telegram, Instagram, Google &amp; KAREN TIMES.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="btn-ghost text-xs flex items-center gap-1.5 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Monitoring KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border-2 border-ink p-3 shadow-brutal-sm">
          <div className="text-[10px] font-mono text-ink-muted">TOTAL WORKFLOWS</div>
          <div className="text-xl font-black">{stats?.totalWorkflows ?? 0}</div>
        </div>
        <div className="bg-white border-2 border-ink p-3 shadow-brutal-sm">
          <div className="text-[10px] font-mono text-ink-muted">ACTIVE / PAUSED</div>
          <div className="text-xl font-black">
            {stats?.activeWorkflows ?? 0} / {stats?.pausedWorkflows ?? 0}
          </div>
        </div>
        <div className="bg-white border-2 border-ink p-3 shadow-brutal-sm">
          <div className="text-[10px] font-mono text-ink-muted">EXECUTIONS (OK / FAIL)</div>
          <div className="text-xl font-black">
            {stats?.succeededExecutions ?? 0} / {stats?.failedExecutions ?? 0}
          </div>
        </div>
        <div className="bg-white border-2 border-ink p-3 shadow-brutal-sm">
          <div className="text-[10px] font-mono text-ink-muted">AVG DURATION</div>
          <div className="text-xl font-black">{stats?.avgDurationMs ?? 0} ms</div>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-mint border-2 border-ink text-xs font-bold flex justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="underline font-mono">Dismiss</button>
        </div>
      )}
      {errMsg && (
        <div className="p-3 bg-red-100 text-red-900 border-2 border-ink text-xs font-bold flex justify-between">
          <span>{errMsg}</span>
          <button onClick={() => setErrMsg(null)} className="underline font-mono">Dismiss</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'workflows', label: `My Workflows (${workflows.length})` },
          { id: 'ai_builder', label: 'AI Workflow Builder' },
          { id: 'visual_builder', label: 'Visual Node Builder' },
          { id: 'templates', label: `Templates (${templates.length})` },
          { id: 'history', label: `Execution History (${executions.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as TabId)}
            className={`px-3 py-1.5 text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm ${
              tab === t.id ? 'bg-ink text-white' : 'bg-white hover:bg-cream-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: My Workflows */}
      {tab === 'workflows' && (
        <div className="space-y-3">
          {workflows.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-ink p-8 text-center text-xs font-mono text-ink-muted space-y-2">
              <p className="font-bold text-ink">No workflows created yet.</p>
              <p>Use the AI Workflow Builder, Visual Node Builder, or pick from 12 ready-made Templates.</p>
            </div>
          ) : (
            workflows.map((wf) => (
              <div key={wf.id} className="bg-white border-2 border-ink p-4 shadow-brutal-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm">{wf.name}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold border border-ink ${wf.status === 'active' ? 'bg-mint' : 'bg-yellow'}`}>
                      {wf.status.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted">v{wf.version} • {wf.nodes.length} nodes</span>
                  </div>
                  <p className="text-xs text-ink-muted">{wf.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRunNow(wf.id)}
                    disabled={busyId !== null}
                    className="btn-brutal bg-coral text-white text-xs px-3 py-1.5 flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{busyId === wf.id ? 'Running…' : 'Run Now'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggle(wf)}
                    disabled={busyId !== null}
                    className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
                  >
                    {wf.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{wf.status === 'active' ? 'Pause' : 'Activate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(wf.id)}
                    disabled={busyId !== null}
                    className="p-1.5 border-2 border-ink bg-cream-50 hover:bg-red-100"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-700" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: AI Workflow Builder */}
      {tab === 'ai_builder' && (
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
          <h2 className="font-black text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-coral" />
            NATURAL-LANGUAGE AI WORKFLOW BUILDER
          </h2>
          <form onSubmit={handlePlanAI} className="space-y-3">
            <textarea
              rows={3}
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder='e.g. "Every morning at 7 AM generate my KAREN TIMES newspaper and send it to Telegram"'
              className="w-full p-3 border-2 border-ink bg-cream-50 font-mono text-xs outline-none"
            />
            <button type="submit" disabled={planning || !aiInstruction.trim()} className="btn-brutal bg-coral text-white text-xs">
              {planning ? 'Planning Workflow…' : 'Generate & Validate Workflow'}
            </button>
          </form>

          {plannedPreview && (
            <div className="p-4 border-2 border-ink bg-cream-50 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-black text-sm">{plannedPreview.workflow.name}</span>
                <span className={`px-2 py-0.5 font-mono font-bold border border-ink ${plannedPreview.validation.valid ? 'bg-mint' : 'bg-red-200'}`}>
                  {plannedPreview.validation.valid ? 'VALID GRAPH' : 'INVALID'}
                </span>
              </div>
              <div className="space-y-1 font-mono">
                {plannedPreview.workflow.nodes.map((n, i) => (
                  <div key={n.id} className="p-2 bg-white border border-ink">
                    {i + 1}. <strong>[{n.type}]</strong> {n.label}
                  </div>
                ))}
              </div>
              {plannedPreview.validation.valid && (
                <button
                  type="button"
                  onClick={() => void handleSavePlanned()}
                  disabled={busyId !== null}
                  className="btn-brutal bg-teal text-white text-xs"
                >
                  Confirm &amp; Save Workflow
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Visual Node Builder */}
      {tab === 'visual_builder' && (
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            <input
              type="text"
              value={vbName}
              onChange={(e) => setVbName(e.target.value)}
              className="flex-1 p-2 border-2 border-ink bg-cream-50 font-bold"
              placeholder="Workflow name..."
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setVbNodes((prev) => [
                    ...prev,
                    { id: `n${prev.length + 1}`, type: 'action.send_telegram', label: 'Send Telegram Message', config: {} },
                  ])
                }
                className="btn-ghost text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Telegram Node
              </button>
              <button
                type="button"
                onClick={() =>
                  setVbNodes((prev) => [
                    ...prev,
                    { id: `n${prev.length + 1}`, type: 'action.generate_ai_text', label: 'Generate AI Summary', config: {} },
                  ])
                }
                className="btn-ghost text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add AI Node
              </button>
              <button
                type="button"
                onClick={() => void handleSaveVisual()}
                disabled={busyId !== null}
                className="btn-brutal bg-teal text-white text-xs"
              >
                Save Visual Workflow
              </button>
            </div>
          </div>

          <div className="space-y-2 font-mono">
            {vbNodes.map((n, idx) => (
              <div key={n.id} className="p-3 border-2 border-ink bg-cream-50 flex items-center justify-between">
                <div>
                  <span className="px-1.5 py-0.5 bg-ink text-white text-[10px] mr-2">STEP {idx + 1}</span>
                  <strong>{n.label}</strong> <span className="text-ink-muted">({n.type})</span>
                </div>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => setVbNodes((prev) => prev.filter((x) => x.id !== n.id))}
                    className="text-red-700 underline text-[11px]"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Templates */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div key={tpl.id} className="bg-white border-2 border-ink p-4 shadow-brutal-sm flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.5 bg-cream-100 border border-ink font-mono text-[10px] font-bold">{tpl.category}</span>
                  <span className="font-mono text-[10px] text-ink-muted flex items-center gap-1">
                    <Layers className="w-3 h-3" /> {tpl.nodes.length} steps
                  </span>
                </div>
                <h3 className="font-black text-sm">{tpl.name}</h3>
                <p className="text-xs text-ink-muted">{tpl.description}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleUseTemplate(tpl.id)}
                disabled={busyId !== null}
                className="btn-brutal bg-yellow text-ink text-xs w-full"
              >
                {busyId === tpl.id ? 'Creating…' : 'Use Template'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 5: Execution History */}
      {tab === 'history' && (
        <div className="space-y-3">
          {executions.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-ink p-8 text-center text-xs font-mono text-ink-muted">
              No workflow executions recorded yet. Click "Run Now" on any workflow.
            </div>
          ) : (
            executions.map((ex) => (
              <div key={ex.id} className="bg-white border-2 border-ink p-4 shadow-brutal-sm space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {ex.status === 'succeeded' ? (
                      <CheckCircle2 className="w-4 h-4 text-mint" />
                    ) : (
                      <XCircle className="w-4 h-4 text-coral" />
                    )}
                    <span className="font-black">{ex.automationName}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 border border-ink">{ex.status.toUpperCase()}</span>
                  </div>
                  <span className="font-mono text-[10px] text-ink-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {ex.durationMs}ms
                  </span>
                </div>
                <div className="space-y-1 font-mono text-[11px]">
                  {ex.steps.map((s) => (
                    <div key={s.nodeId} className="p-1.5 bg-cream-50 border border-ink flex justify-between gap-2">
                      <span>[{s.status}] {s.label}: {s.outputSummary}</span>
                      <span className="text-ink-muted shrink-0">{s.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AutomationPage;
