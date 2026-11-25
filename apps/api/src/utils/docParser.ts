/**
 * Extracts readable UTF-8 text from PDF, DOCX, or plain text buffers.
 * Uses lazy dynamic imports + lightweight DOM polyfills so Vercel/Node
 * serverless cold starts never crash on pdfjs-dist / @napi-rs/canvas.
 */
function ensurePdfJsPolyfills(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      is2D = true;
      isIdentity = true;
      multiply() { return new (g.DOMMatrix as new () => unknown)(); }
      translate() { return new (g.DOMMatrix as new () => unknown)(); }
      scale() { return new (g.DOMMatrix as new () => unknown)(); }
      invertSelf() { return this; }
    };
  }
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(width = 1, height = 1) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      rect() {}
    };
  }
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType = ''
): Promise<string> {
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    try {
      ensurePdfJsPolyfills();
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        return (parsed.text || '').trim();
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch {
      // Fallback: extract basic ASCII/UTF-8 readable strings if pdfjs fails in serverless
      const raw = buffer.toString('latin1');
      const textChunks = raw.match(/\(([^()]{3,})\)/g) || [];
      const fallbackText = textChunks
        .map((c) => c.slice(1, -1).replace(/\\[nrt]/g, ' '))
        .join(' ')
        .replace(/[^\x20-\x7E\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return fallbackText.slice(0, 15000);
    }
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    try {
      const mammoth = await import('mammoth');
      const parsed = await mammoth.default.extractRawText({ buffer });
      return (parsed.value || '').trim();
    } catch {
      return '';
    }
  }

  return buffer.toString('utf8').trim();
}
