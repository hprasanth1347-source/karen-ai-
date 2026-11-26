import type { SkillMeta } from '../types.js';

export const docSummarizerMeta: SkillMeta = {
  name: 'doc-summarizer',
  description: 'Summarize PDFs and DOCX documents from the Document Vault with page/section citations.',
  triggerIntents: ['summarize document', 'summarize pdf', 'vault document', 'key takeaways from doc'],
  allowedAgentTools: ['read_vault_documents_context'],
  pageAffinity: ['/documents', '/chat'],
  outputTypes: ['text'],
};

export const docSummarizerInstructions = `# Document Summarizer Skill
- Call \`read_vault_documents_context\` to inspect uploaded vault documents (wrapped as untrusted data).
- Provide a structured summary with key takeaways and page/section citations.`;
