export interface AutomationExecutorPayload {
  automationId: string;
  userId: string;
  idempotencyKey?: string;
}

export const automationExecutorJob = {
  name: 'automation-executor',
  async process(payload: AutomationExecutorPayload): Promise<{ ok: boolean; automationId: string }> {
    if (!payload.automationId || !payload.userId) {
      throw new Error('automationId and userId are required for automation-executor');
    }
    console.log(`[automationExecutor] Executing automation=${payload.automationId} key=${payload.idempotencyKey || 'none'}`);
    return { ok: true, automationId: payload.automationId };
  },
};
