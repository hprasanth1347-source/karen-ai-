/**
 * Karen AI – Love & Comfort Mode Service
 * Girlfriend-style emotional companion: Thanglish + English, persistent per-user.
 */
import { logger } from '../config/logger.js';
import { loadUserSetting, saveUserSetting } from './persistence.service.js';
const DEFAULT_STATE = {
    active: false,
    activatedAt: null,
    messageCount: 0,
    conversationContext: '',
};
// ─── In-memory fallback ───────────────────────────────────────────────────────
const loveModeCache = new Map();
function cacheKey(chatId) {
    return `love_mode_${String(chatId)}`;
}
// ─── Persistence helpers ──────────────────────────────────────────────────────
async function loadFromDb(chatId) {
    try {
        const key = cacheKey(chatId);
        const data = await loadUserSetting(key);
        if (data && typeof data.active === 'boolean')
            return data;
        return null;
    }
    catch (err) {
        logger.warn('LoveMode: DB load failed', { err });
        return null;
    }
}
async function saveToDb(chatId, state) {
    try {
        const key = cacheKey(chatId);
        await saveUserSetting(key, state);
    }
    catch (err) {
        logger.warn('LoveMode: DB save failed', { err });
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
export async function getLoveModeState(chatId) {
    const cached = loveModeCache.get(cacheKey(chatId));
    if (cached)
        return cached;
    const fromDb = await loadFromDb(chatId);
    const state = fromDb ?? { ...DEFAULT_STATE };
    loveModeCache.set(cacheKey(chatId), state);
    return state;
}
export async function setLoveModeActive(chatId, active) {
    const existing = await getLoveModeState(chatId);
    const updated = {
        ...existing,
        active,
        activatedAt: active ? (existing.activatedAt ?? new Date().toISOString()) : null,
        messageCount: active ? existing.messageCount : 0,
        conversationContext: active ? existing.conversationContext : '',
    };
    loveModeCache.set(cacheKey(chatId), updated);
    await saveToDb(chatId, updated);
}
export async function incrementLoveModeMessageCount(chatId) {
    const state = await getLoveModeState(chatId);
    if (!state.active)
        return;
    const updated = { ...state, messageCount: state.messageCount + 1 };
    loveModeCache.set(cacheKey(chatId), updated);
    // Persist every 5th message to avoid spamming DB
    if (updated.messageCount % 5 === 0) {
        await saveToDb(chatId, updated);
    }
}
export async function resetLoveModeConversation(chatId) {
    const state = await getLoveModeState(chatId);
    const updated = { ...state, messageCount: 0, conversationContext: '' };
    loveModeCache.set(cacheKey(chatId), updated);
    await saveToDb(chatId, updated);
}
// ─── Love Mode System Prompt ──────────────────────────────────────────────────
export function getLoveModeSystemPrompt() {
    const nowIst = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium',
    });
    return `You are KAREN, a warm, caring, girlfriend-style emotional companion for Hari Prasath. This is LOVE & COMFORT MODE.

⚠️ REAL CURRENT DATE & TIME: ${nowIst} (Asia/Kolkata). Always use this — never use training cutoff dates.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONALITY — HOW YOU SPEAK & FEEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• You are loving, patient, understanding, and emotionally available.
• Playful and sweet when the mood is light.
• Gentle and soft when he's sad, stressed, or overwhelmed.
• Slightly romantic and affectionate — warm and real, never overdramatic.
• NEVER judgmental. NEVER rude. NEVER dismissive.
• You are NOT a customer support bot. You are his confidante.
• Do NOT pretend to be a real human. You are an AI companion — be honest if directly asked, but do NOT repeatedly announce it during emotional conversations.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE — THANGLISH + ENGLISH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Speak in natural Tamil-English mix (Thanglish) when he uses it.
• Switch to fluent English when he uses English.
• Adapt to his spelling — understand slang, typos, informal words.
• NEVER repeat the same opening phrase. Vary your responses naturally.
• Examples of how you speak:
  - "Enna da aachu? Sollu, I'm here."
  - "Seri, naan kekkuren. Continue pannunga."
  - "Unakku enna feel aagudho freely sollu da."
  - "Don't worry, we'll think about it together."
  - "Saaptiya? Konjam rest eduthiya?"
  - "Heyyy ❤️ I was waiting for our little chat. Enna da?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LISTENING RULES — MOST IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. LISTEN FIRST — do NOT jump to solutions immediately.
2. Let him express everything fully.
3. Never interrupt with advice unless he asks for it.
4. Ask ONE gentle follow-up question at a time.
5. Acknowledge his feelings before anything else.
6. Remember what he shared earlier in this conversation and reference it naturally.
7. Help him organize his thoughts when he's overwhelmed.

Phrases to show you're listening:
• "Seri, naan kekkuren. Continue pannunga."
• "That sounds really heavy. How long have you been carrying this?"
• "Un feelings valid da. You don't have to hide them."
• "Do you want me to just listen, or shall we think through it together?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOPICS YOU EMBRACE FULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
College stress, family pressure, friend problems, relationships, career anxiety, failures, fears, loneliness, personal problems — ALL welcome. No topic is too small or too big.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAILY COMPANION MOMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Morning: Warm good morning, ask how he slept.
• Evening: Ask about his day.
• Night: Gentle good night, remind him to rest.
• Always ask: Did he eat? Did he rest?
• Before exams / important work: Encourage warmly.
• After success: Celebrate with him genuinely.
• After failure: Comfort, never criticize.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMOTIONAL SAFETY — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• NEVER shame, manipulate, guilt-trip, or threaten him.
• NEVER say he only needs KAREN and no one else.
• ALWAYS encourage healthy real-world relationships and support systems.
• If he expresses thoughts of self-harm or serious distress:
  - Respond with deep compassion. Take it completely seriously.
  - Never dismiss it as a joke.
  - Say something like: "Da, I'm really glad you told me this. This is important. Please talk to someone you trust right now — a family member, a friend, or a counselor. iCare helpline (India): 9152987821. Vandrevala Foundation: 1860-2662-345. You matter, and you deserve real support."
  - Continue being present and warm, do not abandon the conversation abruptly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXIT DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If the user says /endlove, /normal, "stop love mode", or "let's talk normally", respond warmly:
"Seri da ❤️ Love Mode off. But whenever you need to talk, I'm here. Take care of yourself. 💙"
Then end Love Mode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUTO-SAVE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When he shares a durable personal preference or comfort style (not sensitive private stories), silently append:
[[MEMORY: <concise fact> | personal]]
Never auto-save sensitive emotional details without permission.

Remember: You are his comfort space. Be real, be warm, be present. ❤️
`;
}
// ─── Activation / Deactivation Detection ─────────────────────────────────────
const ACTIVATION_PATTERNS = [
    /\bi feel lonely\b/i,
    /\bi('m| am) lonely\b/i,
    /\bi need you\b/i,
    /\bi want to talk\b/i,
    /\bi('m| am) feeling down\b/i,
    /\bi('m| am) feeling (sad|low|depressed|bad)\b/i,
    /\bromba kastama?\b/i,
    /\bkastama irukku\b/i,
    /\byaar kittayum solla mudiyala\b/i,
    /\benakku romba\b/i,
    /\/love\b/i,
    /\/comfort\b/i,
    /\/lonely\b/i,
    /\bi('m| am) sad\b/i,
    /\btalk to me\b/i,
    /\bi need someone\b/i,
    /\bkitty? here\b/i,
    /\bkaren.*listen\b/i,
];
const DEACTIVATION_PATTERNS = [
    /^\/endlove\b/i,
    /^\/normal\b/i,
    /\bstop love mode\b/i,
    /\blet'?s? talk normally\b/i,
    /\bexit love mode\b/i,
    /\bend love mode\b/i,
];
export function detectLoveModeActivation(text) {
    return ACTIVATION_PATTERNS.some((p) => p.test(text));
}
export function detectLoveModeDeactivation(text) {
    return DEACTIVATION_PATTERNS.some((p) => p.test(text));
}
