import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { generateAIReply } from '../services/ai.service.js';
import { hydrateGoogleTokensFromRequest } from '../routes/googleDrive.js';
import { addNotification } from '../services/approval.service.js';
import { logger } from '../config/logger.js';

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !owner) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: owner, text: text.slice(0, 4000) }),
    });
    return res.ok;
  } catch (err) {
    logger.warn('Failed to send Telegram message', { err });
    return false;
  }
}

export async function telegramWebhook(req: Request, res: Response) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const received = req.header('x-telegram-bot-api-secret-token');
  if (!expected || !received) return res.sendStatus(401);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return res.sendStatus(401);
  }

  const msg = req.body?.message;
  if (!msg?.chat?.id || !msg?.text) return res.sendStatus(200);
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!owner || String(msg.chat.id) !== String(owner)) return res.sendStatus(200);
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.sendStatus(503);

  const text = String(msg.text).slice(0, 4000);
  try {
    await hydrateGoogleTokensFromRequest();
    const aiRes = await generateAIReply(text, []);
    let reply = aiRes.reply;
    if (aiRes.pendingApproval) {
      reply += `\n\n[Approval Required] ${aiRes.pendingApproval.summary}\nApprove in Karen Web (/notifications or AI Chat) before sending.`;
    }
    await addNotification('telegram', 'Telegram Command Processed', `"${text.slice(0, 80)}"`, 'normal', 'telegram');
    await sendTelegramMessage(reply);
  } catch (err) {
    logger.error('Telegram AI command error:', err);
    await sendTelegramMessage('Sorry, I hit an error processing your request. Please try again.');
  }
  return res.sendStatus(200);
}
