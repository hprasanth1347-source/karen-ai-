import { z } from 'zod';
import { getDocumentsContextPrompt } from '../../routes/documents.js';
import { wrapUntrustedContent } from '../../services/actionPolicy.service.js';
import { docSummarizerInstructions, docSummarizerMeta } from './meta.js';
export const readVaultDocumentsContextTool = {
    name: 'read_vault_documents_context',
    description: 'Read Document Vault contents (wrapped as untrusted content).',
    inputSchema: z.object({}),
    async execute() {
        const raw = getDocumentsContextPrompt();
        const wrapped = raw ? wrapUntrustedContent('docs', raw) : 'No documents are currently loaded in the Document Vault.';
        return { ok: true, summary: 'Loaded Document Vault context.', data: { context: wrapped } };
    },
};
export const docSummarizerSkill = {
    meta: docSummarizerMeta,
    instructions: docSummarizerInstructions,
    tools: [readVaultDocumentsContextTool],
};
