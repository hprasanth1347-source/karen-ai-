import { getGoogleAccessToken, sendGmailMessage } from '../routes/googleDrive.js';
import { wrapUntrustedContent } from './actionPolicy.service.js';

export interface GmailSummaryItem {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  dateIst: string;
  snippet: string;
  unread: boolean;
}

function formatIstTime(dateStr?: string): string {
  if (!dateStr) return 'Unknown time';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 22);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function listGmailMessages(input: {
  query?: string;
  unread?: boolean;
  from?: string;
  label?: string;
  newer_than?: string;
  limit?: number;
  userId?: string;
}): Promise<{ ok: boolean; items: GmailSummaryItem[]; error?: string }> {
  const token = await getGoogleAccessToken(input.userId);
  if (!token) {
    return { ok: false, items: [], error: 'Google is not connected. Please connect Google first.' };
  }

  const qParts: string[] = [];
  if (input.query) qParts.push(input.query);
  if (input.unread) qParts.push('is:unread');
  if (input.from) qParts.push(`from:${input.from}`);
  if (input.label) qParts.push(`label:${input.label}`);
  if (input.newer_than) qParts.push(`newer_than:${input.newer_than}`);

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const listParams = new URLSearchParams({
    maxResults: String(limit),
    ...(qParts.length > 0 ? { q: qParts.join(' ') } : {}),
  });

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
  );
  if (!listRes.ok) {
    return { ok: false, items: [], error: `Gmail list failed (${listRes.status})` };
  }
  const listJson = (await listRes.json()) as { messages?: Array<{ id: string; threadId?: string }> };
  const ids = (listJson.messages || []).slice(0, limit);
  if (ids.length === 0) return { ok: true, items: [] };

  const details = await Promise.all(
    ids.map(async (m): Promise<GmailSummaryItem | null> => {
      const metaParams = new URLSearchParams({ format: 'metadata' });
      metaParams.append('metadataHeaders', 'From');
      metaParams.append('metadataHeaders', 'Subject');
      metaParams.append('metadataHeaders', 'Date');
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?${metaParams.toString()}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
      );
      if (!r.ok) return null;
      const msg = (await r.json()) as {
        id: string;
        threadId?: string;
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const headers = msg.payload?.headers || [];
      const getH = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getH('From') || 'Unknown sender',
        subject: getH('Subject') || '(No subject)',
        dateIst: formatIstTime(getH('Date')),
        snippet: (msg.snippet || '').slice(0, 110),
        unread: Boolean(msg.labelIds?.includes('UNREAD')),
      } satisfies GmailSummaryItem;
    })
  );

  return {
    ok: true,
    items: details.filter((d): d is GmailSummaryItem => d !== null),
  };
}

export async function readGmailMessage(
  id: string,
  userId?: string
): Promise<{
  ok: boolean;
  message?: {
    id: string;
    threadId?: string;
    from: string;
    subject: string;
    dateIst: string;
    messageIdHeader?: string;
    bodyText: string;
  };
  error?: string;
}> {
  const token = await getGoogleAccessToken(userId);
  if (!token) return { ok: false, error: 'Google is not connected.' };

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return { ok: false, error: `Failed to read email (${res.status})` };
  const json = (await res.json()) as any;
  const headers: Array<{ name: string; value: string }> = json.payload?.headers || [];
  const getH = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';

  const extractText = (part: any): string => {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    if (Array.isArray(part.parts)) {
      for (const p of part.parts) {
        const found = extractText(p);
        if (found) return found;
      }
    }
    return '';
  };

  const rawBody = extractText(json.payload) || json.snippet || '';
  return {
    ok: true,
    message: {
      id: json.id,
      threadId: json.threadId,
      from: getH('From'),
      subject: getH('Subject') || '(No subject)',
      dateIst: formatIstTime(getH('Date')),
      messageIdHeader: getH('Message-ID'),
      bodyText: wrapUntrustedContent('gmail', rawBody.slice(0, 6000)),
    },
  };
}

export async function sendEmailOrReply(input: {
  to: string;
  subject: string;
  body: string;
  attachmentQuery?: string;
}): Promise<{ success: boolean; error?: string; attachedFile?: string }> {
  return sendGmailMessage(input.to, input.subject, input.body, input.attachmentQuery);
}
