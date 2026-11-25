import type {Request,Response} from 'express';
import {timingSafeEqual} from 'node:crypto';
export async function telegramWebhook(req:Request,res:Response){
 const expected=process.env.TELEGRAM_WEBHOOK_SECRET;
 const received=req.header('x-telegram-bot-api-secret-token');
 if(!expected || !received) return res.sendStatus(401);
 const expectedBuffer=Buffer.from(expected);
 const receivedBuffer=Buffer.from(received);
 if(expectedBuffer.length!==receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer,receivedBuffer)) return res.sendStatus(401);
 const msg=req.body?.message;
 if(!msg?.chat?.id || !msg?.text) return res.sendStatus(200);
 const owner=process.env.TELEGRAM_OWNER_CHAT_ID;
 if(!owner || String(msg.chat.id)!==String(owner)) return res.sendStatus(200);
 const text=String(msg.text).slice(0,4000);
 // Owner-only tunnel endpoint. Reply delivery is handled through the Telegram Bot API.
 if(!process.env.TELEGRAM_BOT_TOKEN) return res.sendStatus(503);
 const reply=`Karen received: ${text}\\n\\nTunnel is connected. Add an approved command handler to enable actions.`;
 await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:msg.chat.id,text:reply})});
 return res.sendStatus(200);
}
