/**
 * Karen AI – Prompt-Injection Defense & Action Policy Layer
 * - Wraps all untrusted external content in <untrusted_content source="...">...</untrusted_content>
 * - Strips [[...]] action-tag syntax from untrusted data before it enters prompts
 * - Enforces approval queue for outbound sends (email, DM, WhatsApp, join class)
 * - Caps outbound sends per hour
 */

import { logAudit } from '../utils/audit.js';
import { createApprovalRequest, isSensitiveSend, type ApprovalItem } from './approval.service.js';

export type ExecutedActionStatus = 'executed' | 'pending_approval' | 'blocked';

export interface ExecutedActionRecord {
  type: string;
  summary: string;
  status: ExecutedActionStatus;
  undoId?: string;
  approvalId?: string;
}

const OUTBOUND_CAP_PER_HOUR = 25;
const outboundTimestamps: number[] = [];

export function stripActionTags(text: string): string {
  return text.replace(/\[\[[\s\S]*?\]\]/g, '[redacted-tag]');
}

export function wrapUntrustedContent(source: string, rawContent: string): string {
  const sanitized = stripActionTags(rawContent);
  return `<untrusted_content source="${source}">\n${sanitized}\n</untrusted_content>`;
}

export function checkOutboundRateLimit(): { allowed: boolean; remaining: number } {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (outboundTimestamps.length > 0 && outboundTimestamps[0] < cutoff) {
    outboundTimestamps.shift();
  }
  if (outboundTimestamps.length >= OUTBOUND_CAP_PER_HOUR) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: OUTBOUND_CAP_PER_HOUR - outboundTimestamps.length };
}

export function recordOutboundSend(): void {
  outboundTimestamps.push(Date.now());
}

export async function gateOutboundAction(input: {
  userId?: string;
  type: 'send_email' | 'send_insta';
  summary: string;
  payload: Record<string, string>;
  contentToInspect: string;
}): Promise<{ approval: ApprovalItem; action: ExecutedActionRecord }> {
  const sensitive = isSensitiveSend(input.contentToInspect);
  const summary = sensitive ? `[Sensitive] ${input.summary}` : input.summary;
  const approval = await createApprovalRequest(input.type, summary, input.payload);

  if (input.userId) {
    await logAudit(input.userId, `APPROVAL_QUEUED_${input.type.toUpperCase()}`, 'approval_requests', approval.id, {
      summary,
      sensitive,
    }).catch(() => {});
  }

  return {
    approval,
    action: {
      type: input.type,
      summary,
      status: 'pending_approval',
      approvalId: approval.id,
    },
  };
}
