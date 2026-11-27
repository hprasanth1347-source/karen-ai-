export interface GmailSyncPayload {
  userId: string;
  maxResults?: number;
}

export const gmailSyncJob = {
  name: 'gmail-sync',
  async process(payload: GmailSyncPayload): Promise<{ ok: boolean; synced: number }> {
    if (!payload.userId) throw new Error('userId is required for gmail-sync');
    console.log(`[gmailSync] Syncing Gmail inbox for user=${payload.userId}`);
    return { ok: true, synced: 0 };
  },
};
