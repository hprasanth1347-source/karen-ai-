import { createHash } from 'node:crypto';
import { logAudit } from '../utils/audit.js';
import { loadBrandSettings } from './my-brand/index.js';
import type { GeneratedSkillFile, SkillModule, SkillToolContext, SkillToolDefinition, SkillToolResult } from './types.js';

export const MAX_AGENT_STEPS = 8;

export interface ExecutedSkillCall {
  skill: string;
  tool: string;
  ok: boolean;
  summary: string;
  durationMs: number;
}

export interface AgentLoopOutcome {
  toolResultsText: string;
  files: GeneratedSkillFile[];
  pendingApproval?: { id: string; summary: string };
  executedCalls: ExecutedSkillCall[];
}

export function buildSkillsPromptSection(skills: SkillModule[]): string {
  if (skills.length === 0) return '';
  const sections = skills.map((s) => {
    const toolSpecs = s.tools
      .map((t) => `  - ${t.name}: ${t.description}`)
      .join('\n');
    return `[SKILL: ${s.meta.name}]\n${s.instructions}\nAllowed tools:\n${toolSpecs || '  (none)'}\n[/SKILL]`;
  });

  return `\n\nActive Playbooks (use ONLY the tools listed in these active playbooks via [[TOOL_CALL: <tool_name> | <json_args>]] when needed):\n${sections.join('\n\n')}`;
}

export async function executeSkillToolCalls(
  rawReply: string,
  activeSkills: SkillModule[],
  ctxInput: { userId?: string; currentPage?: string; loveMode?: boolean }
): Promise<{ cleanedReply: string; outcome: AgentLoopOutcome }> {
  const allowedTools = new Map<string, { skillName: string; tool: SkillToolDefinition }>();
  for (const s of activeSkills) {
    if (ctxInput.loveMode && s.meta.name !== 'comfort-mode-safe') continue;
    for (const t of s.tools) {
      if (s.meta.allowedAgentTools.includes(t.name)) {
        allowedTools.set(t.name, { skillName: s.meta.name, tool: t });
      }
    }
  }

  const brand = await loadBrandSettings(ctxInput.userId);
  const ctx: SkillToolContext = {
    userId: ctxInput.userId,
    currentPage: ctxInput.currentPage,
    loveMode: ctxInput.loveMode,
    brand,
  };

  let cleanedReply = rawReply;
  const files: GeneratedSkillFile[] = [];
  const executedCalls: ExecutedSkillCall[] = [];
  const summaryLines: string[] = [];
  let pendingApproval: { id: string; summary: string } | undefined;

  const toolRegex = /\[\[TOOL_CALL:\s*([a-zA-Z0-9_-]+)\s*\|\s*(\{[\s\S]*?\})\s*\]\]/g;
  let stepCount = 0;

  for (const match of rawReply.matchAll(toolRegex)) {
    cleanedReply = cleanedReply.replace(match[0], '').trim();
    if (stepCount >= MAX_AGENT_STEPS) {
      summaryLines.push('Reached maximum 8 tool steps.');
      break;
    }
    stepCount += 1;

    const toolName = match[1].trim();
    const rawJson = match[2].trim();
    const entry = allowedTools.get(toolName);
    if (!entry) {
      summaryLines.push(`Blocked tool "${toolName}": not in active skill allowlist.`);
      continue;
    }

    const startMs = Date.now();
    const inputsHash = createHash('sha256').update(rawJson).digest('hex').slice(0, 16);
    let result: SkillToolResult;

    try {
      const parsedJson = JSON.parse(rawJson);
      const validated = entry.tool.inputSchema.parse(parsedJson);
      result = await entry.tool.execute(validated, ctx);
    } catch (err) {
      result = {
        ok: false,
        summary: `Tool ${toolName} failed: ${err instanceof Error ? err.message : 'Invalid arguments'}`,
        error: err instanceof Error ? err.message : 'Execution failed',
      };
    }

    const durationMs = Date.now() - startMs;
    executedCalls.push({
      skill: entry.skillName,
      tool: toolName,
      ok: result.ok,
      summary: result.summary,
      durationMs,
    });

    if (result.files?.length) {
      files.push(...result.files);
    }
    if (result.pendingApproval && !pendingApproval) {
      pendingApproval = result.pendingApproval;
    }
    summaryLines.push(result.ok ? result.summary : `⚠️ ${result.summary}`);

    if (ctxInput.userId) {
      await logAudit(ctxInput.userId, 'SKILL_TOOL_CALL', 'skills', entry.skillName, {
        skill: entry.skillName,
        tool: toolName,
        inputsHash,
        durationMs,
        ok: result.ok,
      }).catch(() => {});
    }
  }

  return {
    cleanedReply: summaryLines.length > 0 ? `${cleanedReply}\n\n${summaryLines.join('\n')}`.trim() : cleanedReply,
    outcome: {
      toolResultsText: summaryLines.join('\n'),
      files,
      pendingApproval,
      executedCalls,
    },
  };
}
