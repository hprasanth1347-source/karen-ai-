import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { error } from '../utils/response.js';
import { config } from '../config/env.js';

function isConfiguredOwner(user: {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}): boolean {
  if (config.OWNER_USER_ID) {
    return user.id === config.OWNER_USER_ID;
  }
  if (config.OWNER_EMAIL) {
    return (user.email || '').toLowerCase() === config.OWNER_EMAIL.toLowerCase();
  }
  return user.app_metadata?.role === 'owner';
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (config.NODE_ENV !== 'production' && config.DEV_AUTH_BYPASS) {
    req.user = {
      id: config.OWNER_USER_ID || '00000000-0000-0000-0000-000000000001',
      email: config.OWNER_EMAIL || 'dev-owner@local',
      role: 'owner',
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return error(res, 'Authentication required', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return error(res, 'Authentication required', 401, 'UNAUTHORIZED');
  }

  try {
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !data?.user) {
      return error(res, 'Invalid or expired token', 401, 'UNAUTHORIZED');
    }

    const user = data.user;
    req.user = {
      id: user.id,
      email: user.email || '',
      role: isConfiguredOwner(user) ? 'owner' : 'user',
    };
    return next();
  } catch {
    return error(res, 'Authentication failed', 401, 'UNAUTHORIZED');
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'owner') {
    return error(res, 'Access restricted to owner', 403, 'FORBIDDEN');
  }
  return next();
}
