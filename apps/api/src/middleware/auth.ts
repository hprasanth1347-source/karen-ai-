import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { error } from '../utils/response.js';
import { config } from '../config/env.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return error(res, 'Authorization token required', 401, 'UNAUTHENTICATED');
  }

  const token = authHeader.slice(7);

  try {
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !data?.user) {
      return error(res, 'Invalid or expired token', 401, 'INVALID_TOKEN');
    }

    const user = data.user;
    req.user = {
      id: user.id,
      email: user.email || 'owner@karen-ultra.local',
      role: user.app_metadata?.role === 'owner' ? 'owner' : 'user',
    };
    next();
  } catch (err) {
    return error(res, 'Authentication verification failed', 401, 'AUTH_FAILED');
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'owner') {
    return error(res, 'Access restricted to owner', 403, 'FORBIDDEN');
  }
  next();
}
