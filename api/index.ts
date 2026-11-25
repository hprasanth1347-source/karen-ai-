import type { Request, Response } from 'express';
import app from '../apps/api/src/app.js';

export default function handler(req: Request, res: Response): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const originalPath = url.searchParams.get('__path');

  if (originalPath) {
    url.searchParams.delete('__path');
    req.url = `${originalPath}${url.search}`;
  }

  app(req, res);
}
