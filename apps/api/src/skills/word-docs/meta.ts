import type { SkillMeta } from '../types.js';

export const wordDocsMeta: SkillMeta = {
  name: 'word-docs',
  description: 'Create, format, and read .docx Word documents with headings, lists, tables, headers/footers, and brand styling.',
  triggerIntents: ['docx', 'word doc', 'word document', 'make a doc', 'create document', 'report docx'],
  allowedAgentTools: ['create_word_doc', 'read_word_doc'],
  pageAffinity: ['/documents', '/chat'],
  outputTypes: ['docx'],
};

export const wordDocsInstructions = `# Word Docs Skill
Use this playbook to create, format, or read .docx Word documents.
- Apply the owner's brand colors and fonts automatically.
- Structure into title, subtitle, headings, paragraphs, bullets, and tables, with header/footer page numbers.
- Call \`create_word_doc\`; it reopens the file with mammoth to verify structure before reporting success.
- Call \`read_word_doc\` to extract text from an existing .docx buffer.`;
