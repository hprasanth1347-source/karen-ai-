export interface DriveSyncPayload {
  userId: string;
  cursor?: string;
}

export const driveSyncJob = {
  name: 'drive-sync',
  async process(payload: DriveSyncPayload): Promise<{ ok: boolean; synced: number }> {
    if (!payload.userId) throw new Error('userId is required for drive-sync');
    console.log(`[driveSync] Syncing Drive metadata for user=${payload.userId}`);
    return { ok: true, synced: 0 };
  },
};
