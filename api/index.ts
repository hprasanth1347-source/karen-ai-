// Polyfill web standards for serverless Node runtime (e.g. pdfjs-dist / canvas)
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

import type { Request, Response } from 'express';
import app from '../apps/api/src/app.js';

export default function handler(req: Request, res: Response): void {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const originalPath = url.searchParams.get('__path');

    if (originalPath) {
      url.searchParams.delete('__path');
      req.url = `${originalPath}${url.search}`;
    }

    app(req, res);
  } catch (err: unknown) {
    console.error('[serverless-handler] Unhandled function error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Server function error',
      });
    }
  }
}
