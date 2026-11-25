import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';

export async function logAudit(
  userId: string | undefined,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>,
  ipAddress?: string
) {
  try {
    logger.info(`Audit: [${action}] on ${resourceType}${resourceId ? `:${resourceId}` : ''}`, {
      userId,
      details,
    });

    if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('placeholder')) {
      await supabaseAdmin.from('audit_logs').insert({
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details || {},
        ip_address: ipAddress,
      });
    }
  } catch (err) {
    logger.error('Failed to write audit log', { err });
  }
}
