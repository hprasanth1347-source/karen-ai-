export interface WebhookProcessorPayload {
  source: 'telegram' | 'instagram';
  eventId: string;
  body: Record<string, unknown>;
}

export const webhookProcessorJob = {
  name: 'webhook-processor',
  async process(payload: WebhookProcessorPayload): Promise<{ ok: boolean; source: string; eventId: string }> {
    if (!payload.source || !payload.eventId) {
      throw new Error('source and eventId are required for webhook-processor');
    }
    console.log(`[webhookProcessor] Processed ${payload.source} event=${payload.eventId}`);
    return { ok: true, source: payload.source, eventId: payload.eventId };
  },
};
