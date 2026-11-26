import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import {
  addNotification,
  getApprovalById,
  listApprovals,
  listNotifications,
  markAllNotificationsRead,
  setApprovalStatus,
} from '../services/approval.service.js';
import { syncAndNotifyLiveWorkspaceAlerts } from '../services/notificationEngine.service.js';
import { hydrateGoogleTokensFromRequest, sendGmailMessage } from './googleDrive.js';
import { getInstagramConversations, sendInstagramMessage } from '../providers/instagram.js';
import { success, error } from '../utils/response.js';

const router = Router();

function authGuard(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) {
  return requireAuth(req, res, () => requireOwner(req, res, next));
}

router.get('/notifications', authGuard, async (_req, res) => {
  const items = await listNotifications();
  return success(res, items);
});

router.post('/notifications/mark-all-read', authGuard, async (_req, res) => {
  await markAllNotificationsRead();
  return success(res, { message: 'All notifications marked as read' });
});

router.post('/notifications/sync-live', authGuard, async (req, res) => {
  await hydrateGoogleTokensFromRequest(req);
  const result = await syncAndNotifyLiveWorkspaceAlerts({
    forceSummary: Boolean(req.body?.forceSummary),
  });
  return success(res, result);
});

router.get('/approvals', authGuard, async (_req, res) => {
  const items = await listApprovals();
  return success(res, items);
});

router.post('/approvals/:id/approve', authGuard, async (req, res) => {
  await hydrateGoogleTokensFromRequest(req);
  const item = await getApprovalById(String(req.params.id));
  if (!item) {
    return error(res, 'Approval request not found', 404, 'NOT_FOUND');
  }
  if (item.status !== 'pending') {
    return error(res, `Request already ${item.status}`, 400, 'ALREADY_DECIDED');
  }

  if (item.action_type === 'send_email') {
    const { to, subject, body, attachmentQuery } = item.action_data;
    const result = await sendGmailMessage(to, subject, body, attachmentQuery || undefined);
    if (!result.success) {
      return error(res, result.error || 'Failed to send approved email', 502);
    }
    await setApprovalStatus(item.id, 'approved');
    await addNotification('gmail', 'Approved Email Sent', `Sent "${subject}" to ${to}.`, 'normal', 'web');
    return success(res, { approved: true, executed: true, attachedFile: result.attachedFile });
  }

  if (item.action_type === 'send_insta') {
    const { username, message } = item.action_data;
    const threads = await getInstagramConversations();
    const target = username.replace(/^@/, '').toLowerCase();
    const found = threads.find(
      (t) => t.participant?.username?.toLowerCase().includes(target) || t.participant?.id === target
    );
    if (!found?.participant?.id) {
      return error(res, `Could not find Instagram DM thread for @${target}`, 404);
    }
    const result = await sendInstagramMessage(found.participant.id, message);
    if (!result.success) {
      return error(res, result.error || 'Failed to send approved Instagram DM', 502);
    }
    await setApprovalStatus(item.id, 'approved');
    await addNotification('instagram', 'Approved Instagram DM Sent', `Sent DM to @${target}.`, 'normal', 'web');
    return success(res, { approved: true, executed: true });
  }

  await setApprovalStatus(item.id, 'approved');
  return success(res, { approved: true });
});

router.post('/approvals/:id/reject', authGuard, async (req, res) => {
  const item = await getApprovalById(String(req.params.id));
  if (!item) {
    return error(res, 'Approval request not found', 404, 'NOT_FOUND');
  }
  await setApprovalStatus(item.id, 'rejected');
  return success(res, { rejected: true });
});

export default router;
