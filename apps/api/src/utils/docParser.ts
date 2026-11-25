import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

/**
 * Extracts readable UTF-8 text from PDF, DOCX, or plain text buffers.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType = ''
): Promise<string> {
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return (parsed.text || '').trim();
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    return (parsed.value || '').trim();
  }

  return buffer.toString('utf8').trim();
}
