import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { generateAIReply } from './ai.service.js';
import { analyzeInstagramMediaWithGemini } from './geminiMultimodal.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { loadUserSetting, saveUserSetting } from './persistence.service.js';
import { sendInstagramMessage, getInstagramConversations, } from '../providers/instagram.js';
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
            const analysis = await analyzeInstagramMediaWithGemini({
                mediaUrl: firstAtt.payload?.url,
                kind,
                caption: firstAtt.payload?.title,
                senderUsername,
            });
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
Goal: ${intentInstructions[intent]}
${customTraining}
Thanglish Style Guide (CRITICAL):
- Reply in natural, everyday Chennai/Tamil conversational Thanglish (Tamil written in Latin script mixed naturally with English).
- Use natural spoken connectors like: "sollunga", "irukaaru", "panniduren", "venumna", "konjam", "kitta", "eppo", "udane", "check panni solren".
- Do NOT use stiff/bookish Tamil or robotic phrasing like "Unga request-a alert panniten".
- Examples of good natural Thanglish:
  * "Hey @${senderUsername}! Hari ippo konjam busy-a irukaaru, enna vishayam nu sollunga naan kitta pass panniduren."
  * "Sure! Ungalukku entha time convenient-a irukum nu sollunga, naan Hari kitta check panni solren."
- Keep it warm, friendly, and under 2 sentences. Do not invent facts or claim Hari already confirmed anything.`;
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4000);
                let aiRes;
                try {
                    aiRes = await generateAIReply(prompt, [], provider, this.config.aiModel, controller.signal);
                }
                finally {
                    clearTimeout(timeout);
                }
                if (aiRes.provider === 'local-karen') {
                    replyText = getThanglishFallback(senderUsername, intent);
                }
                else {
                    replyText = aiRes.reply;
                }
            }
            catch (err) {
                logger.warn('AI reply generation failed, using default Thanglish template:', err);
                replyText = getThanglishFallback(senderUsername, intent);
            }
        }
        // 6. Send message live to Instagram via Meta Graph API
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
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            provider,
            error: sendRes.error,
        };
        this.logs.unshift(logEntry);
        if (this.logs.length > 30)
            this.logs.length = 30;
        await saveUserSetting('instagram_auto_reply_logs', this.logs);
        if (sendRes.success) {
            logger.info(`Auto-reply sent successfully to @${senderUsername}: "${replyText}"`);
            return { autoReplied: true, replyText };
        }
        else {
            logger.error(`Failed to send auto-reply to @${senderUsername}:`, sendRes.error);
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
            const threads = await getInstagramConversations();
            const ownerUsername = config.INSTAGRAM_USERNAME;
            for (const t of threads) {
                if (!t.participant?.id || !t.participant?.username)
                    continue;
                if (t.participant.username === ownerUsername)
                    continue;
                // Use messages already fetched in the single-call query
                const msgs = t.messages || [];
                if (!msgs || msgs.length === 0)
                    continue;
                const latestMsg = msgs[0];
                if (!latestMsg || !latestMsg.from)
                    continue;
                // Only reply if the latest message is FROM the external user (not from Hari)
                if (latestMsg.from.username !== ownerUsername &&
                    latestMsg.from.id !== config.INSTAGRAM_ACCOUNT_ID) {
                    if (!this.repliedMessageIds.has(latestMsg.id)) {
                        const mediaMeta = Array.isArray(latestMsg.attachments) && latestMsg.attachments.length > 0
                            ? {
                                attachments: latestMsg.attachments.map((att) => ({
                                    type: att.type,
                                    payload: { url: att.url, title: att.title },
                                })),
                            }
                            : undefined;
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
