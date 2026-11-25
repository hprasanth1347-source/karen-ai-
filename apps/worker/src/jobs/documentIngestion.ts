// Karen Ultra — Document Ingestion Job
// Processes uploaded documents: extracts text, chunks, generates embeddings,
// and stores them in Supabase for semantic search.

export interface DocumentIngestionPayload {
  document_id: string;
  user_id: string;
  source_url?: string;
  mime_type?: string;
}

export const documentIngestionJob = {
  name: 'document-ingestion',

  async process(payload: DocumentIngestionPayload): Promise<void> {
    console.log(`[documentIngestion] Processing document ${payload.document_id}`);

    // TODO: Phase 4 — Document Intelligence
    // 1. Fetch document from Supabase Storage
    // 2. Extract text (pdf-parse / mammoth / plain text)
    // 3. Split into chunks (tiktoken / simple splitter)
    // 4. Generate embeddings via Gemini embed-004 or OpenAI ada-002
    // 5. Upsert chunk rows into document_chunks with embedding vectors
    // 6. Update document status to 'ready'
    // 7. Trigger semantic summary generation

    throw new Error('TODO: Implement document ingestion — Phase 4');
  },
};
