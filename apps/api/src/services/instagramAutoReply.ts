import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { generateAIReply, type AIProvider } from './ai.service.js';
import {
  sendInstagramMessage,
  getInstagramConversations,
  getThreadDetails,
  type InstagramThread,
} from '../providers/instagram.js';

export interface AutoReplyLog {
  id: string;
  senderId: string;
  senderUsername: string;
  incomingText: string;
  replyText: string;
  intent?: 'greeting' | 'availability' | 'project' | 'help' | 'thanks' | 'general';
  metaMessageId?: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  timestamp: string;
  provider: string;
  error?: string;
}

export function classifyIncomingIntent(text: string): NonNullable<AutoReplyLog['intent']> {
  const value = text.toLowerCase().trim();
  if (/\b(thanks|thank|thx|nandri|rigth|helpful)\b/i.test(value)) return 'thanks';
  if (/\b(available|free|busy|reach|time|call|meet|schedule)\b/i.test(value)) return 'availability';
  if (/\b(project|assignment|presentation|slides|submit|deadline|work|college)\b/i.test(value)) return 'project';
  if (/\b(help|need|problem|issue|support|question|ask)\b/i.test(value)) return 'help';
  if (/\b(hi|hii|hiii|hello|helo|hey|heyy|vanakkam|karen|halo|hai)\b/i.test(value)) return 'greeting';
  return 'general';
}

export interface AutoReplyConfig {
  enabled: boolean;
  triggerMode: 'all' | 'contains_hi';
  customTemplate?: string; // Optional static greeting
  aiProvider: AIProvider;
  aiModel?: string;
}

class InstagramAutoReplyService {
  private config: AutoReplyConfig = {
    enabled: true,
    triggerMode: 'all',
    aiProvider: 'groq',
    aiModel: 'qwen/qwen3.8-27b',
  };

  private repliedMessageIds: Set<string> = new Set();
  private processingMessageIds: Set<string> = new Set();
  private lastRepliedPerSender: Map<string, number> = new Map();
  private logs: AutoReplyLog[] = [];
  private pollIntervalTimer: NodeJS.Timeout | null = null;
  private scanInProgress = false;

  constructor() {
    if (config.INSTAGRAM_AUTO_REPLY_POLLING_ENABLED) {
      this.startBackgroundPoller();
    }
  }

  public getConfig(): AutoReplyConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AutoReplyConfig>): AutoReplyConfig {
    this.config = { ...this.config, ...newConfig };
    logger.info('Updated Instagram Auto-Reply config:', this.config);
    return this.getConfig();
  }

  public getLogs(): AutoReplyLog[] {
    return [...this.logs].slice(0, 30);
  }

  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Evaluates if incoming text matches auto-reply criteria
   */
  public shouldAutoReply(text: string): boolean {
    if (!this.config.enabled) return false;
    if (!text || text.trim().length === 0) return false;

    if (this.config.triggerMode === 'all') return true;

    // Check for "hi", "hello", "hey", "vanakkam", "karen", "hi karen"
    const lower = text.toLowerCase().trim();
    const hiRegex = /\b(hi|hii|hiii|hello|helo|hey|heyy|vanakkam|karen|halo|hai)\b/i;
    return hiRegex.test(lower);
  }

  /**
   * Processes a single incoming message from Meta Webhook or Poller
   */
  public async handleIncomingMessage(
    senderId: string,
    senderUsername: string,
    messageId: string,
    messageText: string,
    bypassRateLimit = false
  ): Promise<{ autoReplied: boolean; replyText?: string; error?: string }> {
    const ownerId = config.INSTAGRAM_ACCOUNT_ID;
    const ownerUsername = config.INSTAGRAM_USERNAME;

    // 1. Skip if message is from the owner
    if (senderId === ownerId || senderUsername === ownerUsername) {
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

    // 4. Check if trigger matches
    if (!this.shouldAutoReply(messageText)) {
      logger.info(`Message "${messageText}" from @${senderUsername} does not match trigger criteria.`);
      return { autoReplied: false };
    }

    this.processingMessageIds.add(messageId);
    logger.info(`Generating auto-reply for @${senderUsername}: "${messageText}"`);

    // 5. Generate Karen's response
    let replyText = '';
    const provider = this.config.aiProvider || 'groq';
    const intent = classifyIncomingIntent(messageText);

    if (this.config.customTemplate && this.config.customTemplate.trim()) {
      replyText = this.config.customTemplate.replace('{name}', senderUsername);
    } else {
      const intentInstructions: Record<NonNullable<AutoReplyLog['intent']>, string> = {
        greeting:
          'Warmly acknowledge the greeting, say Hari will see the message shortly, and invite the sender to share what they need.',
        availability:
          'Acknowledge the scheduling or availability question, explain that Hari manages his calendar and cannot confirm instantly, and ask for the preferred date/time.',
        project:
          'Acknowledge the project or deadline context, explain that Hari will review the details, and ask for the specific task or deadline only if needed.',
        help:
          'Acknowledge the problem or request, offer brief assistance, and ask one clear follow-up question about what help is needed.',
        thanks:
          'Respond warmly and briefly, and leave the conversation open for any other need.',
        general:
          'Understand the sender’s actual need from the message, answer only what can be answered safely, and ask one concise follow-up question if more context is required.',
      };
      const prompt = `User @${senderUsername} sent this message to Hari on Instagram: "${messageText}".
Hari is currently away. You are Karen Ultra, Hari's personal female AI assistant.
Detected intent: ${intent}.
${intentInstructions[intent]}
Draft a warm, polite, and helpful answer in conversational Thanglish (Tamil in Latin script mixed with English).
Base the reply on the sender’s need instead of repeating a generic greeting.
Keep it under 2 sentences, sound natural and loyal, and do not claim that Hari has already confirmed a meeting or task.`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        let aiRes;
        try {
          aiRes = await generateAIReply(prompt, [], provider, this.config.aiModel, controller.signal);
        } finally {
          clearTimeout(timeout);
        }
        if (aiRes.provider === 'local-karen') {
          const localFallbacks: Record<NonNullable<AutoReplyLog['intent']>, string> = {
            greeting: `Vanakkam @${senderUsername}! Naan Karen, Hari oda AI assistant. Unga need enna nu sollunga, naan help panna try pannuren.`,
            availability: `Vanakkam @${senderUsername}! Hari enna time free-nu naan confirm pannala. Preferred date and time enna, please share pannunga.`,
            project: `Vanakkam @${senderUsername}! Project or deadline details share pannunga. Naan correct task and timing-a track panna help pannuren.`,
            help: `Vanakkam @${senderUsername}! Naan Karen. Enna help venum nu konjam detail-a solunga, ready-a assist pannuren.`,
            thanks: `Romba nandri @${senderUsername}! Vera enna help venumna comfortable-a sollunga.`,
            general: `Vanakkam @${senderUsername}! Unga request-a Hari-ku alert panniten. Enna exact help venumnu oru line-la sollunga.`,
          };
          replyText = localFallbacks[intent];
        } else {
          replyText = aiRes.reply;
        }
      } catch (err: any) {
        logger.warn('AI reply generation failed, using default Thanglish template:', err);
        const fallbacks: Record<NonNullable<AutoReplyLog['intent']>, string> = {
          greeting: `Vanakkam @${senderUsername}! Naan Karen, Hari oda AI assistant. Unga need enna nu sollunga, naan help panna try pannuren.`,
          availability: `Vanakkam @${senderUsername}! Hari enna time free-nu naan confirm pannala. Preferred date and time enna, please share pannunga.`,
          project: `Vanakkam @${senderUsername}! Project or deadline details share pannunga. Naan correct task and timing-a track panna help pannuren.`,
          help: `Vanakkam @${senderUsername}! Naan Karen. Enna help venum nu konjam detail-a solunga, ready-a assist pannuren.`,
          thanks: `Romba nandri @${senderUsername}! Vera enna help venumna comfortable-a sollunga.`,
          general: `Vanakkam @${senderUsername}! Unga request-a Hari-ku alert panniten. Enna exact help venumnu oru line-la sollunga.`,
        };
        replyText = fallbacks[intent];
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
      } else if (sendRes.error?.includes('limit reached') || sendRes.error?.includes('code 4')) {
        this.rateLimitCooldownUntil = Date.now() + 180000;
        logger.warn('Meta Graph API rate limit hit. Backing off for 3 minutes.');
      }
    } finally {
      this.processingMessageIds.delete(messageId);
    }

    const logEntry: AutoReplyLog = {
      id: `reply-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

    if (sendRes.success) {
      logger.info(`Auto-reply sent successfully to @${senderUsername}: "${replyText}"`);
      return { autoReplied: true, replyText };
    } else {
      logger.error(`Failed to send auto-reply to @${senderUsername}:`, sendRes.error);
      return { autoReplied: false, replyText, error: sendRes.error };
    }
  }

  private rateLimitCooldownUntil: number = 0;

  /**
   * Scans latest incoming conversation threads to catch unreplied messages
   */
  public async scanAndAutoReply(): Promise<number> {
    if (!this.config.enabled) return 0;
    if (!config.INSTAGRAM_ACCESS_TOKEN) return 0;
    if (this.scanInProgress) return 0;

    // Check if in rate limit backoff cooldown
    if (this.rateLimitCooldownUntil > Date.now()) {
      const waitSec = Math.ceil((this.rateLimitCooldownUntil - Date.now()) / 1000);
      logger.info(`Auto-reply poller in cooldown (${waitSec}s remaining). Waiting for Meta rate limit reset.`);
      return 0;
    }

    this.scanInProgress = true;
    let repliesCount = 0;
    try {
      const threads: InstagramThread[] = await getInstagramConversations();
      const ownerUsername = config.INSTAGRAM_USERNAME;

      for (const t of threads) {
        if (!t.participant?.id || !t.participant?.username) continue;
        if (t.participant.username === ownerUsername) continue;

        // Use messages already fetched in the single-call query
        const msgs = t.messages || [];
        if (!msgs || msgs.length === 0) continue;

        const latestMsg = msgs[0];
        if (!latestMsg || !latestMsg.from) continue;

        // Only reply if the latest message is FROM the external user (not from Hari)
        if (
          latestMsg.from.username !== ownerUsername &&
          latestMsg.from.id !== config.INSTAGRAM_ACCOUNT_ID
        ) {
          if (!this.repliedMessageIds.has(latestMsg.id)) {
            const res = await this.handleIncomingMessage(
              t.participant.id,
              t.participant.username,
              latestMsg.id,
              latestMsg.message
            );
            if (res.autoReplied) {
              repliesCount++;
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('limit reached')) {
        this.rateLimitCooldownUntil = Date.now() + 180000;
      }
      logger.warn('Scan and auto-reply error:', err?.message || err);
    } finally {
      this.scanInProgress = false;
    }
    return repliesCount;
  }

  /**
   * Background poller that periodically checks for incoming DMs
   */
  private startBackgroundPoller(): void {
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);

    void this.scanAndAutoReply();
    this.pollIntervalTimer = setInterval(async () => {
      try {
        if (this.config.enabled) {
          await this.scanAndAutoReply();
        }
      } catch (err) {
        logger.warn('Background auto-reply poller error:', err);
      }
    }, 10000);
  }
}

export const instagramAutoReplyService = new InstagramAutoReplyService();
