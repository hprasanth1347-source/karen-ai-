export interface DocumentIngestionPayload {
  documentId: string;
  userId: string;
  storagePath?: string;
}

export const documentIngestionJob = {
  name: 'document-ingestion',
  async process(payload: DocumentIngestionPayload): Promise<{ ok: boolean; documentId: string }> {
    if (!payload.documentId || !payload.userId) {
      throw new Error('documentId and userId are required for document-ingestion');
    }
    console.log(`[documentIngestion] Processing document=${payload.documentId} user=${payload.userId}`);
    return { ok: true, documentId: payload.documentId };
  },
};
