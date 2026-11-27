export type TriggerNodeType =
  | 'trigger.manual'
  | 'trigger.schedule'
  | 'trigger.webhook'
  | 'trigger.new_message'
  | 'trigger.new_assignment'
  | 'trigger.new_rss'
  | 'trigger.file_uploaded'
  | 'trigger.db_event'
  | 'trigger.integration_event';

export type ActionNodeType =
  | 'action.send_telegram'
  | 'action.send_notification'
  | 'action.generate_ai_text'
  | 'action.generate_image'
  | 'action.fetch_rss'
  | 'action.process_news'
  | 'action.generate_pdf'
  | 'action.send_email'
  | 'action.create_reminder'
  | 'action.update_record'
  | 'action.run_integration';

export type LogicNodeType =
  | 'logic.if_else'
  | 'logic.switch'
  | 'logic.filter'
  | 'logic.delay'
  | 'logic.wait_event'
  | 'logic.loop'
  | 'logic.batch'
  | 'logic.parallel'
  | 'logic.merge'
  | 'logic.ai_classify';

export type ReliabilityNodeType =
  | 'reliability.retry'
  | 'reliability.error_handler'
  | 'reliability.timeout'
  | 'reliability.fallback'
  | 'reliability.human_approval'
  | 'reliability.stop';

export type WorkflowNodeType = TriggerNodeType | ActionNodeType | LogicNodeType | ReliabilityNodeType;

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

export interface WorkflowDefinition {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  version: number;
  timezone: string;
  scheduleCron?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string | null;
}

export interface ExecutionStepLog {
  nodeId: string;
  nodeType: WorkflowNodeType;
  label: string;
  status: 'succeeded' | 'failed' | 'skipped';
  durationMs: number;
  outputSummary: string;
  errorMessage?: string;
}

export interface WorkflowExecution {
  id: string;
  automationId: string;
  automationName: string;
  userId: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'awaiting_approval';
  triggerType: string;
  durationMs: number;
  steps: ExecutionStepLog[];
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}
