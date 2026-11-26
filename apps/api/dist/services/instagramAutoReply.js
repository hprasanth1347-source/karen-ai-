import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { analyzeInstagramMediaWithGemini } from './geminiMultimodal.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { addNotification } from './approval.service.js';
import { loadUserSetting, saveUserSetting } from './persistence.service.js';
import { sendInstagramMessage, getInstagramConversations, getInstagramProfile, } from '../providers/instagram.js';
function getThanglishFallback(senderUsername, intent) {
    const fallbacks = {
        greeting: `Hey @${senderUsername}! Naan Karen, Hari oda AI assistant. Sollunga, enna help venum?`,
        availability: `Hey @${senderUsername}! Hari ippo konjam busy-a irukaaru. Ungalukku entha date and time convenient-a irukum nu sollunga, naan pass panniduren.`,
        project: `Hey @${senderUsername}! Project details & deadline enna nu share pannunga, naan Hari kitta immediate-a forward panniduren.`,
        help: `Hey @${senderUsername}! Naan Karen. Enna help venum nu konjam clear-a sollunga, udane assist pannuren.`,
        thanks: `No worries @${senderUsername}! Vera ethavathu help venumna eppo venumnalum message pannunga.`,
        general: `Hey @${senderUsername}! Unga message-a Hari kitta pass panniten. Vera ethavathu detail share pannanum na sollunga.`,
    };
    return fallbacks[intent];
}
export function classifyIncomingIntent(text) {
    const value = text.toLowerCase().trim();
    if (/\b(thanks|thank|thx|nandri|rigth|helpful)\b/i.test(value))
        return 'thanks';
    if (/\b(available|free|busy|reach|time|call|meet|schedule)\b/i.test(value))
        return 'availability';
    if (/\b(project|assignment|presentation|slides|submit|deadline|work|college)\b/i.test(value))
        return 'project';
    if (/\b(help|need|problem|issue|support|question|ask)\b/i.test(value))
        return 'help';
    if (/\b(hi|hii|hiii|hello|helo|hey|heyy|vanakkam|karen|halo|hai)\b/i.test(value))
        return 'greeting';
    return 'general';
}
function isUnwantedOrNoisyDm(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return false;
    // Meta reaction / like notifications
    if (/^(liked a message|reacted\s+.+\s+to your message)$/i.test(trimmed))
        return true;
    // Pure emoji / punctuation only (no letters or digits)
    if (!/[\p{L}\p{N}]/u.test(trimmed) && trimmed.length <= 16)
        return true;
    // Tiny low-signal acknowledgments that don't need an AI reply
    if (/^(ok|okk|okay|k|kk|hmm|hmmm|hm|yup|yep|yeah|ya|tq|ty|thx|lol|lmao|nice|cool|good|done|noted|fine|👍|👌|❤️|😂|🙏)+[.!]*$/i.test(trimmed)) {
        return true;
    }
    // Common Instagram bot / promo spam
    if (/(free followers|buy followers|dm for promo|dm for collab|brand ambassador|crypto signal|forex|guaranteed profit)/i.test(trimmed)) {
        return true;
    }
    return false;
}
export function classifyUrgentDm(text, hasMedia, isStoryReply) {
    const clean = (text || '').trim();
    if (/\b(medical|hospital|ambulance|accident|injured|bleeding|chest\s*pain|breathing|icu|doctor|emergency|blood|clinic|unconscious|stroke|heart\s*attack|poison|burn|fracture|health\s+emergency|medicine\s+urgent)\b/i.test(clean)) {
        return { important: true, category: 'MEDICAL_EMERGENCY', critical: true };
    }
    if (/(?:your|ur|hari'?s?|owner'?s?|his)\s*(?:no|num|number|phone|mobile|cell|whatsapp|contact)|\b(?:phone|mobile|contact|whatsapp)\s*(?:no|num|number|id)\b|(?:give|send|share|drop|tell)\s+(?:me\s+)?(?:your|hari'?s?|his)?\s*(?:no|num|number)\b|\bcall\s+(?:me|now|urgently|asap)\b/i.test(clean)) {
        return { important: true, category: 'PHONE_REQUEST', critical: true };
    }
    if (/\b(urgent|important|asap|help\s+me|need\s+help|please\s+help|problem|issue|trouble|stuck|crisis|payment|invoice|deadline|exam|interview|job|offer|sir|boss|immediately)\b/i.test(clean)) {
        return { important: true, category: 'URGENT_HELP', critical: false };
    }
    if (hasMedia || isStoryReply) {
        return { important: true, category: 'MEDIA_OR_STORY', critical: false };
    }
    return { important: false, category: 'NORMAL', critical: false };
}
async function generateFastDmReply(prompt, history = [], provider = 'groq', model) {
    const systemMsg = 'You are Karen AI, Hari Prasath’s personal female assistant handling his Instagram DMs in natural Chennai Thanglish. ' +
        'Never share phone numbers, OTPs, passwords, or make financial promises. Keep replies under 2 short, warm sentences.';
    try {
        if (provider !== 'gemini' && config.GROQ_API_KEY) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: model || config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b',
                    messages: [
                        { role: 'system', content: systemMsg },
                        ...history.slice(-5).map((h) => ({ role: h.role, content: h.content.slice(0, 300) })),
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.55,
                    max_tokens: 160,
                }),
                signal: AbortSignal.timeout(3500),
            });
            if (res.ok) {
                const json = await res.json();
                const txt = json.choices?.[0]?.message?.content?.trim();
                if (txt)
                    return txt;
            }
        }
        if (config.GEMINI_API_KEY) {
            const modelName = provider === 'gemini' && model ? model : 'gemini-flash-lite-latest';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemMsg }] },
                    contents: [
                        ...history.slice(-5).map((h) => ({
                            role: h.role === 'assistant' ? 'model' : 'user',
                            parts: [{ text: h.content.slice(0, 300) }],
                        })),
                        { role: 'user', parts: [{ text: prompt }] },
                    ],
                }),
                signal: AbortSignal.timeout(3500),
            });
            if (res.ok) {
                const json = await res.json();
                const txt = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (txt)
                    return txt;
            }
        }
    }
    catch (err) {
        logger.warn('Fast DM AI reply error', { err });
    }
    return null;
}
class InstagramAutoReplyService {
    config = {
        enabled: true,
        triggerMode: 'all',
        aiProvider: 'groq',
        aiModel: 'qwen/qwen3.8-27b',
    };
    repliedMessageIds = new Set();
    processingMessageIds = new Set();
    lastRepliedPerSender = new Map();
    logs = [];
    pollIntervalTimer = null;
    scanInProgress = false;
    hydrated = false;
    constructor() {
        if (config.INSTAGRAM_AUTO_REPLY_POLLING_ENABLED) {
            this.startBackgroundPoller();
        }
    }
    async ensureHydrated() {
        if (this.hydrated)
            return;
        this.hydrated = true;
        const savedConfig = await loadUserSetting('instagram_auto_reply_config');
        if (savedConfig && typeof savedConfig === 'object') {
            this.config = { ...this.config, ...savedConfig };
        }
        const savedLogs = await loadUserSetting('instagram_auto_reply_logs');
        if (Array.isArray(savedLogs) && savedLogs.length > 0) {
            this.logs = savedLogs.slice(0, 30);
            for (const l of this.logs) {
                if (l.status === 'SENT') {
                    if (l.incomingMessageId)
                        this.repliedMessageIds.add(l.incomingMessageId);
                    if (l.id)
                        this.repliedMessageIds.add(l.id);
                }
            }
        }
    }
    async getConfig() {
        await this.ensureHydrated();
        return { ...this.config };
    }
    async updateConfig(newConfig) {
        await this.ensureHydrated();
        this.config = { ...this.config, ...newConfig };
        await saveUserSetting('instagram_auto_reply_config', this.config);
        logger.info('Updated Instagram Auto-Reply config:', this.config);
        return { ...this.config };
    }
    async getLogs() {
        await this.ensureHydrated();
        return [...this.logs].slice(0, 30);
    }
    async clearLogs() {
        this.logs = [];
        await saveUserSetting('instagram_auto_reply_logs', []);
    }
    /**
     * Evaluates if incoming text matches auto-reply criteria
     */
    shouldAutoReply(text) {
        if (!this.config.enabled)
            return false;
        if (!text || text.trim().length === 0)
            return false;
        if (this.config.triggerMode === 'all')
            return true;
        // Check for "hi", "hello", "hey", "vanakkam", "karen", "hi karen"
        const lower = text.toLowerCase().trim();
        const hiRegex = /\b(hi|hii|hiii|hello|helo|hey|heyy|vanakkam|karen|halo|hai)\b/i;
        return hiRegex.test(lower);
    }
    humanTakeoverIds = new Set();
    setHumanTakeover(id, active) {
        if (active)
            this.humanTakeoverIds.add(id);
        else
            this.humanTakeoverIds.delete(id);
        return active;
    }
    isHumanTakeover(id) {
        return this.humanTakeoverIds.has(id);
    }
    /**
     * Processes a single incoming message from Meta Webhook or Poller
     */
    async handleIncomingMessage(senderId, senderUsername, messageId, messageText, bypassRateLimit = false, mediaMeta) {
        await this.ensureHydrated();
        const ownerId = config.INSTAGRAM_ACCOUNT_ID;
        const ownerUsername = config.INSTAGRAM_USERNAME;
        // 1. Skip if message is from the owner or human takeover is active
        if (senderId === ownerId || senderUsername === ownerUsername) {
            return { autoReplied: false };
        }
        if (this.isHumanTakeover(senderId) || this.isHumanTakeover(senderUsername)) {
            logger.info(`Human takeover active for @${senderUsername}; skipping AI auto-reply.`);
            return { autoReplied: false };
        }
        // 2. Skip if already replied
        if (this.repliedMessageIds.has(messageId)) {
            return { autoReplied: false };
        }
        if (this.processingMessageIds.has(messageId)) {
            return { autoReplied: false };
        }
        // 3. Rate-limit per sender (prevent spam loop - minimum 10 seconds between auto-replies)
        const lastTime = this.lastRepliedPerSender.get(senderId) || 0;
        const now = Date.now();
        if (!bypassRateLimit && now - lastTime < 10000) {
            logger.info(`Auto-reply rate limit for sender ${senderUsername} (${senderId})`);
            return { autoReplied: false };
        }
        // 3a. Skip unwanted/noisy DMs (reactions, tiny "ok"/"hmm" acks, promo spam) unless there is media
        const hasAttachment = Boolean(mediaMeta?.attachments?.length);
        if (!hasAttachment && !mediaMeta?.replyToStoryId && isUnwantedOrNoisyDm(messageText)) {
            logger.info(`Skipping unwanted/low-signal DM from @${senderUsername}: "${messageText}"`);
            this.repliedMessageIds.add(messageId);
            return { autoReplied: false };
        }
        // 3b. Identify attachments & analyze accessible media with Gemini Multimodal
        const firstAtt = mediaMeta?.attachments?.[0];
        let detectedType = mediaMeta?.replyToStoryId ? 'story_reply' : 'text';
        let mediaContextNote = '';
        if (firstAtt) {
            const rawType = (firstAtt.type || '').toLowerCase();
            const kind = rawType === 'ig_reel' || rawType === 'reel'
                ? 'reel'
                : rawType === 'video'
                    ? 'video'
                    : rawType === 'audio'
                        ? 'audio'
                        : rawType === 'ig_post' || rawType === 'share'
                            ? 'ig_post'
                            : 'image';
            detectedType = kind;
            const analysis = await Promise.race([
                analyzeInstagramMediaWithGemini({
                    mediaUrl: firstAtt.payload?.url,
                    kind,
                    caption: firstAtt.payload?.title,
                    senderUsername,
                }),
                new Promise((resolve) => setTimeout(() => resolve({ accessible: false, summary: '' }), 1800)),
            ]);
            if (analysis.accessible && analysis.summary) {
                mediaContextNote = `\n[Accessible ${kind} analysis]: ${analysis.summary}`;
            }
            else {
                mediaContextNote = `\n[Attachment type=${kind}${firstAtt.payload?.title ? `, title="${firstAtt.payload.title}"` : ''}; media binary not accessible via API — do NOT pretend you saw/heard it; acknowledge naturally and ask if needed.]`;
            }
        }
        else if (mediaMeta?.replyToStoryId) {
            mediaContextNote = `\n[Context: This message is a reply to Hari's Instagram Story ID ${mediaMeta.replyToStoryId}.]`;
        }
        const effectiveText = `${messageText}${mediaContextNote}`.trim();
        // Safety control: never auto-share OTPs, passwords, bank/UPI details, or financial commitments
        if (/\b(otp|password|pin\b|cvv|bank\s+account|upi\s+pin|send\s+money|transfer\s+\d+)\b/i.test(messageText)) {
            await sendTelegramMessage(`KAREN AI - INSTAGRAM SAFETY HOLD\n\nSender: @${senderUsername}\nReason: Sensitive request (OTP/password/financial) — auto-reply paused for human review.`).catch(() => { });
            return { autoReplied: false };
        }
        // 4. Check if trigger matches (allow media/story replies when enabled)
        if (!firstAtt && !mediaMeta?.replyToStoryId && !this.shouldAutoReply(messageText)) {
            logger.info(`Message "${messageText}" from @${senderUsername} does not match trigger criteria.`);
            return { autoReplied: false };
        }
        this.processingMessageIds.add(messageId);
        logger.info(`Generating auto-reply for @${senderUsername} (${detectedType})`);
        // 5. Generate Karen's response
        let replyText = '';
        const provider = this.config.aiProvider || 'groq';
        const intent = classifyIncomingIntent(messageText || detectedType);
        const urgentInfo = classifyUrgentDm(messageText, Boolean(firstAtt), Boolean(mediaMeta?.replyToStoryId));
        const urgentInstruction = urgentInfo.category === 'MEDICAL_EMERGENCY'
            ? '\nURGENT: Sender describes a medical/health emergency. Respond urgently & empathetically in natural Thanglish confirming Hari is being alerted RIGHT NOW and will contact them immediately.'
            : urgentInfo.category === 'PHONE_REQUEST'
                ? '\nPRIVACY RULE: Sender is asking for Hari’s phone/contact number. NEVER invent or share any phone number! Tell them warmly in Thanglish that you have passed their message urgently to Hari and he will reach out personally.'
                : '';
        if (this.config.customTemplate && this.config.customTemplate.trim()) {
            replyText = this.config.customTemplate.replace('{name}', senderUsername);
        }
        else {
            const intentInstructions = {
                greeting: 'Warmly acknowledge the greeting, say Hari will see the message shortly, and invite the sender to share what they need.',
                availability: 'Acknowledge the scheduling or availability question, explain that Hari manages his calendar and cannot confirm instantly, and ask for the preferred date/time.',
                project: 'Acknowledge the project or deadline context, explain that Hari will review the details, and ask for the specific task or deadline only if needed.',
                help: 'Acknowledge the problem or request, offer brief assistance, and ask one clear follow-up question about what help is needed.',
                thanks: 'Respond warmly and briefly, and leave the conversation open for any other need.',
                general: 'Understand the sender’s actual need from the message/media context, answer only what can be answered safely, and ask one concise follow-up question if more context is required.',
            };
            const customTraining = this.config.customInstructions?.trim()
                ? `\nOwner's Custom DM Training Rules (follow strictly):\n${this.config.customInstructions.trim()}\n`
                : '';
            const prompt = `User @${senderUsername} sent this Instagram DM (${detectedType}) to Hari: "${effectiveText}".
Hari is currently away. You are Karen AI, Hari's personal female AI assistant.
Detected intent: ${intent}.
Goal: ${intentInstructions[intent]}${urgentInstruction}
${customTraining}
Thanglish Style Guide (CRITICAL):
- Reply in natural, everyday Chennai/Tamil conversational Thanglish (Tamil written in Latin script mixed naturally with English).
- Keep it warm, friendly, and under 2 sentences. Do not invent facts or share private phone numbers/details.`;
            const fastReply = await generateFastDmReply(prompt, mediaMeta?.history || [], provider, this.config.aiModel);
            replyText = fastReply || getThanglishFallback(senderUsername, intent);
        }
        // 6. Send message live to Instagram via Meta Graph API (fast <10s SLA)
        let sendRes;
        try {
            sendRes = await sendInstagramMessage(senderId, replyText);
            if (sendRes.success) {
                this.repliedMessageIds.add(messageId);
                this.lastRepliedPerSender.set(senderId, Date.now());
                this.rateLimitCooldownUntil = 0;
            }
            else if (sendRes.error?.includes('limit reached') || sendRes.error?.includes('code 4')) {
                this.rateLimitCooldownUntil = Date.now() + 180000;
                logger.warn('Meta Graph API rate limit hit. Backing off for 3 minutes.');
            }
        }
        finally {
            this.processingMessageIds.delete(messageId);
        }
        const istTime = new Date().toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        const logEntry = {
            id: `reply-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            incomingMessageId: messageId,
            senderId,
            senderUsername,
            incomingText: messageText,
            replyText,
            intent,
            metaMessageId: sendRes.messageId,
            status: sendRes.success ? 'SENT' : 'FAILED',
            timestamp: istTime,
            provider,
            error: sendRes.error,
        };
        this.logs.unshift(logEntry);
        if (this.logs.length > 30)
            this.logs.length = 30;
        const persistPromise = saveUserSetting('instagram_auto_reply_logs', this.logs).catch(() => { });
        const badge = urgentInfo.category === 'MEDICAL_EMERGENCY'
            ? '🚨 MEDICAL EMERGENCY (INSTAGRAM DM)'
            : urgentInfo.category === 'PHONE_REQUEST'
                ? '📞 PHONE NUMBER REQUEST (INSTAGRAM DM)'
                : urgentInfo.category === 'URGENT_HELP'
                    ? '⚠️ URGENT HELP REQUEST (INSTAGRAM DM)'
                    : '⚡ IMPORTANT INSTAGRAM DM';
        if (sendRes.success) {
            logger.info(`Auto-reply sent successfully to @${senderUsername}: "${replyText}"`);
            if (urgentInfo.important) {
                await Promise.all([
                    persistPromise,
                    addNotification('instagram', `${badge}: @${senderUsername}`, `${(messageText || '[Media]').slice(0, 180)} — Replied: "${replyText.slice(0, 120)}"`, urgentInfo.critical ? 'critical' : 'high', 'instagram').catch(() => { }),
                    sendTelegramMessage(`${badge}\n\n` +
                        `👤 From: *@${senderUsername}*\n` +
                        `🕒 Time: ${istTime} IST\n` +
                        `💬 Message: "${(messageText || '[Media]').slice(0, 260)}"\n` +
                        `🤖 Auto-Reply Sent: "${replyText.slice(0, 220)}"`).catch(() => { }),
                ]);
            }
            else {
                await persistPromise;
            }
            return { autoReplied: true, replyText };
        }
        else {
            logger.error(`Failed to send auto-reply to @${senderUsername}:`, sendRes.error);
            if (urgentInfo.important) {
                await Promise.all([
                    persistPromise,
                    sendTelegramMessage(`${badge} (AUTO-REPLY FAILED)\n\n👤 From: *@${senderUsername}*\n🕒 Time: ${istTime} IST\n💬 Message: "${(messageText || '[Media]').slice(0, 260)}"\n❌ Error: ${sendRes.error || 'Meta send failed'}`).catch(() => { }),
                ]);
            }
            else {
                await persistPromise;
            }
            return { autoReplied: false, replyText, error: sendRes.error };
        }
    }
    rateLimitCooldownUntil = 0;
    /**
     * Scans latest incoming conversation threads to catch unreplied messages
     */
    async scanAndAutoReply() {
        await this.ensureHydrated();
        if (!this.config.enabled)
            return 0;
        if (this.scanInProgress)
            return 0;
        // Check if in rate limit backoff cooldown
        if (this.rateLimitCooldownUntil > Date.now()) {
            const waitSec = Math.ceil((this.rateLimitCooldownUntil - Date.now()) / 1000);
            logger.info(`Auto-reply poller in cooldown (${waitSec}s remaining). Waiting for Meta rate limit reset.`);
            return 0;
        }
        this.scanInProgress = true;
        let repliesCount = 0;
        try {
            const [threads, profile] = await Promise.all([
                getInstagramConversations(),
                getInstagramProfile().catch(() => null),
            ]);
            const ownerUsername = config.INSTAGRAM_USERNAME || profile?.username || '';
            const ownerId = config.INSTAGRAM_ACCOUNT_ID || profile?.id || '';
            for (const t of threads) {
                if (!t.participant?.id || !t.participant?.username)
                    continue;
                if (ownerUsername && t.participant.username === ownerUsername)
                    continue;
                if (ownerId && t.participant.id === ownerId)
                    continue;
                // Use messages already fetched in the single-call query
                const msgs = t.messages || [];
                if (!msgs || msgs.length === 0)
                    continue;
                const latestMsg = msgs[0];
                if (!latestMsg || !latestMsg.from)
                    continue;
                // Only reply if the latest message is FROM the external user (not from Hari)
                // and within the 24-hour Meta messaging window
                const msgTime = latestMsg.created_time ? new Date(latestMsg.created_time).getTime() : Date.now();
                if (Date.now() - msgTime > 24 * 60 * 60 * 1000)
                    continue;
                if ((!ownerUsername || latestMsg.from.username !== ownerUsername) &&
                    (!ownerId || latestMsg.from.id !== ownerId)) {
                    if (!this.repliedMessageIds.has(latestMsg.id)) {
                        const history = msgs
                            .slice(1, 7)
                            .reverse()
                            .map((m) => ({
                            role: ((ownerUsername && m.from?.username === ownerUsername) ||
                                (ownerId && m.from?.id === ownerId)
                                ? 'assistant'
                                : 'user'),
                            content: m.message || '[Media]',
                        }));
                        const mediaMeta = {
                            ...(Array.isArray(latestMsg.attachments) && latestMsg.attachments.length > 0
                                ? {
                                    attachments: latestMsg.attachments.map((att) => ({
                                        type: att.type,
                                        payload: { url: att.url, title: att.title },
                                    })),
                                }
                                : {}),
                            history,
                        };
                        const res = await this.handleIncomingMessage(t.participant.id, t.participant.username, latestMsg.id, latestMsg.message, false, mediaMeta);
                        if (res.autoReplied) {
                            repliesCount++;
                        }
                    }
                }
            }
        }
        catch (err) {
            if (err?.message?.includes('limit reached')) {
                this.rateLimitCooldownUntil = Date.now() + 180000;
            }
            logger.warn('Scan and auto-reply error:', err?.message || err);
        }
        finally {
            this.scanInProgress = false;
        }
        return repliesCount;
    }
    /**
     * Background poller that periodically checks for incoming DMs
     */
    startBackgroundPoller() {
        if (this.pollIntervalTimer)
            clearInterval(this.pollIntervalTimer);
        void this.scanAndAutoReply();
        this.pollIntervalTimer = setInterval(async () => {
            try {
                if (this.config.enabled) {
                    await this.scanAndAutoReply();
                }
            }
            catch (err) {
                logger.warn('Background auto-reply poller error:', err);
            }
        }, 10000);
    }
}
export const instagramAutoReplyService = new InstagramAutoReplyService();
