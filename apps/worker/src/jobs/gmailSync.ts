// Karen Ultra — Gmail Sync Job
// Syncs the user's Gmail inbox: fetches new messages, indexes them,
// and stores summaries/metadata in Supabase for search and AI context.

export interface GmailSyncPayload {
  user_id: string;
  integration_id: string;
  full_sync?: boolean;
  max_messages?: number;
}

export const gmailSyncJob = {
  name: 'gmail-sync',

  async process(payload: GmailSyncPayload): Promise<void> {
    console.log(`[gmailSync] Syncing Gmail for user ${payload.user_id}`);

    // TODO: Phase 5 — Google Services Integration
    // 1. Load user's Google OAuth token from integrations table
    // 2. Refresh token if expired
    // 3. Call Gmail API: users.messages.list (using historyId for incremental sync)
    // 4. For each new message: fetch full message, parse headers & body
    // 5. Upsert into email_messages table
    // 6. Optionally ingest attachments as documents
    // 7. Update integration.last_sync_at

    throw new Error('TODO: Implement Gmail sync — Phase 5');
  },
};
