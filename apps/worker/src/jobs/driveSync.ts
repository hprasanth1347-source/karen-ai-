// Karen Ultra — Google Drive Sync Job
// Syncs the user's Google Drive: indexes files, fetches content for supported
// types, and makes them searchable within Karen Ultra.

export interface DriveSyncPayload {
  user_id: string;
  integration_id: string;
  folder_id?: string;
  full_sync?: boolean;
}

export const driveSyncJob = {
  name: 'drive-sync',

  async process(payload: DriveSyncPayload): Promise<void> {
    console.log(`[driveSync] Syncing Drive for user ${payload.user_id}`);

    // TODO: Phase 5 — Google Services Integration
    // 1. Load user's Google OAuth token
    // 2. Call Drive API: files.list with mimeType filter and modifiedTime > last_sync
    // 3. For Google Docs/Sheets/Slides: export as plain text
    // 4. For PDF/Office: download and queue documentIngestion job
    // 5. Update file metadata in documents table
    // 6. Update integration.last_sync_at

    throw new Error('TODO: Implement Drive sync — Phase 5');
  },
};
