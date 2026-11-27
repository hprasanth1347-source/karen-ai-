import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { error } from '../utils/response.js';
import { config } from '../config/env.js';

export type UserRole = 'CUSTOMER' | 'SUPPORT' | 'ADMIN' | 'OWNER';

const ROLE_RANK: Record<UserRole, number> = {
  CUSTOMER: 1,
  SUPPORT: 2,
  ADMIN: 3,
  OWNER: 4,
};

function resolveUserRole(user: {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}): { isOwner: boolean; rbacRole: UserRole } {
  if (config.OWNER_USER_ID && user.id === config.OWNER_USER_ID) {
    return { isOwner: true, rbacRole: 'OWNER' };
  }
  if (config.OWNER_EMAIL && user.email && user.email.toLowerCase() === config.OWNER_EMAIL.toLowerCase()) {
    return { isOwner: true, rbacRole: 'OWNER' };
  }
  const metaRole = String(user.app_metadata?.role || '').toUpperCase();
  if (metaRole === 'OWNER') return { isOwner: true, rbacRole: 'OWNER' };
  if (metaRole === 'ADMIN') return { isOwner: false, rbacRole: 'ADMIN' };
  if (metaRole === 'SUPPORT') return { isOwner: false, rbacRole: 'SUPPORT' };
  return { isOwner: false, rbacRole: 'CUSTOMER' };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (config.NODE_ENV !== 'production' && config.DEV_AUTH_BYPASS) {
    req.user = {
      id: config.OWNER_USER_ID || '00000000-0000-0000-0000-000000000001',
      email: config.OWNER_EMAIL || 'dev-owner@local',
      role: 'owner',
      rbacRole: 'OWNER',
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return error(res, 'Authentication required', 401, 'AUTH_REQUIRED');
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return error(res, 'Authentication required', 401, 'AUTH_REQUIRED');
  }

  try {
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !data?.user) {
      return error(res, 'Invalid or expired token', 401, 'AUTH_REQUIRED');
    }

    const user = data.user;
    const { isOwner, rbacRole } = resolveUserRole(user);
    req.user = {
      id: user.id,
      email: user.email || '',
      role: isOwner ? 'owner' : 'user',
      rbacRole,
    };
    return next();
  } catch {
    return error(res, 'Authentication failed', 401, 'AUTH_REQUIRED');
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'owner') {
    return error(res, 'Access restricted to owner', 403, 'FORBIDDEN');
  }
  return next();
}

export function requireRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return error(res, 'Authentication required', 401, 'AUTH_REQUIRED');
    }
    const current: UserRole = (req.user.rbacRole as UserRole) || (req.user.role === 'owner' ? 'OWNER' : 'CUSTOMER');
    if (ROLE_RANK[current] < ROLE_RANK[minRole]) {
      return error(res, `Requires ${minRole} role`, 403, 'FORBIDDEN');
    }
    return next();
  };
}

export function requireOwnership(resourceUserId: string | undefined, currentUserId: string | undefined): boolean {
  if (!resourceUserId || !currentUserId) return false;
  return resourceUserId === currentUserId;
}
