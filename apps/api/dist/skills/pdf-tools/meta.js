export const pdfToolsMeta = {
    name: 'pdf-tools',
    description: 'Create PDFs, extract PDF text, merge, split, rotate, watermark, and inspect/fill AcroForm fields.',
    triggerIntents: ['pdf', 'make this a pdf', 'export pdf', 'merge pdf', 'watermark pdf', 'extract pdf'],
    allowedAgentTools: ['create_pdf', 'extract_pdf_text', 'transform_pdf'],
    pageAffinity: ['/documents', '/chat'],
    outputTypes: ['pdf'],
};
export const pdfToolsInstructions = `# PDF Tools Skill
- Create clean branded PDFs with \`create_pdf\` (uses pdfkit and verifies page count with pdf-lib).
- Extract text with \`extract_pdf_text\`. For scanned PDFs with no extractable text, state clearly that OCR is not available.
- Merge, rotate, or watermark PDFs with \`transform_pdf\` using pdf-lib.`;
