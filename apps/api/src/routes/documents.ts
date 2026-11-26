import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimit } from '../middleware/rateLimit.js';
import { generateAIReply } from '../services/ai.service.js';
import { extractTextFromBuffer } from '../utils/docParser.js';
import { success, error } from '../utils/response.js';

interface StoredDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
  status: 'READY';
  source: 'Upload' | 'Paste';
  created_at: string;
}

const documentsStore: StoredDocument[] = [];
const router = Router();

router.use('/documents', requireAuth, requireOwner);

router.get('/documents', (_req, res) => {
  const items = documentsStore.map(({ content, ...meta }) => ({
    ...meta,
    charCount: content.length,
    preview: content.slice(0, 180),
  }));
  return success(res, items);
});

const uploadDocumentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  content: z.string().trim().max(200000).optional(),
  contentBase64: z.string().max(6000000).optional(),
  mimeType: z.string().trim().max(120).optional().default('text/plain'),
  size: z.number().int().nonnegative().optional(),
  source: z.enum(['Upload', 'Paste']).optional().default('Upload'),
});

router.post('/documents', validate(uploadDocumentSchema), async (req, res) => {
  let extractedText = (req.body.content || '').trim();
  if (!extractedText && req.body.contentBase64) {
    try {
      const buf = Buffer.from(req.body.contentBase64, 'base64');
      extractedText = await extractTextFromBuffer(buf, req.body.name, req.body.mimeType);
    } catch (err) {
      return error(
        res,
        err instanceof Error ? err.message : 'Could not parse uploaded PDF/DOCX file',
        400,
        'DOCUMENT_PARSE_ERROR'
      );
    }
  }

  if (!extractedText) {
    return error(res, 'Could not extract readable text from document.', 400, 'EMPTY_DOCUMENT');
  }

  const doc: StoredDocument = {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: req.body.name,
    mimeType: req.body.mimeType,
    size: req.body.size ?? extractedText.length,
    content: extractedText.slice(0, 200000),
    status: 'READY',
    source: req.body.source,
    created_at: new Date().toISOString(),
  };
  documentsStore.unshift(doc);
  const { content: _content, ...meta } = doc;
  return success(res, { ...meta, content: doc.content.slice(0, 50000), charCount: doc.content.length }, 201);
});

router.delete('/documents/:id', (req, res) => {
  const index = documentsStore.findIndex((d) => d.id === req.params.id);
  if (index === -1) {
    return error(res, 'Document not found', 404, 'NOT_FOUND');
  }
  documentsStore.splice(index, 1);
  return success(res, { deleted: true });
});

const analyzeSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  documentId: z.string().trim().optional(),
  inlineDocs: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        content: z.string().trim().min(1).max(100000),
      })
    )
    .max(5)
    .optional(),
});

router.post('/documents/analyze', aiLimit, validate(analyzeSchema), async (req, res) => {
  const { query, documentId, inlineDocs } = req.body as z.infer<typeof analyzeSchema>;

  let targets: Array<{ name: string; content: string }> = [];
  if (documentId) {
    const found = documentsStore.find((d) => d.id === documentId);
    if (found) targets = [{ name: found.name, content: found.content }];
  } else if (documentsStore.length > 0) {
    targets = documentsStore.slice(0, 5).map((d) => ({ name: d.name, content: d.content }));
  }

  if (targets.length === 0 && Array.isArray(inlineDocs) && inlineDocs.length > 0) {
    targets = inlineDocs
      .filter((d): d is { name: string; content: string } => Boolean(d && typeof d.name === 'string' && typeof d.content === 'string'))
      .map((d) => ({ name: String(d.name), content: String(d.content) }));
  }

  if (targets.length === 0) {
    return error(
      res,
      'No uploaded documents found. Please upload or paste a document first.',
      400,
      'NO_DOCUMENTS'
    );
  }

  const contextBlock = targets
    .map((doc, idx) => `--- DOCUMENT ${idx + 1}: ${doc.name} ---\n${doc.content.slice(0, 12000)}`)
    .join('\n\n');

  const prompt = `Analyze the following uploaded document(s) and answer the user's question accurately.
Always cite the exact document name when quoting or referencing facts. If the answer is not present in the document(s), clearly say so.

${contextBlock}

User Question: ${query}`;

  try {
    const result = await generateAIReply(prompt, []);
    return success(res, {
      answer: result.reply,
      provider: result.provider,
      model: result.model,
      sources: targets.map((t) => t.name),
    });
  } catch (err) {
    return error(
      res,
      err instanceof Error ? err.message : 'Document analysis failed',
      502,
      'DOCUMENT_ANALYZE_ERROR'
    );
  }
});

export function getDocumentsContextPrompt(): string {
  if (documentsStore.length === 0) return '';
  const lines = documentsStore
    .slice(0, 5)
    .map((d) => `- ${d.name}: ${d.content.slice(0, 600).replace(/\s+/g, ' ')}`);
  return `\n\nUploaded Documents in Vault:\n${lines.join('\n')}`;
}

export default router;
