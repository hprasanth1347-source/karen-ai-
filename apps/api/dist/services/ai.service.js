import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { addMemory, getMemoryContextPrompt } from './memory.service.js';
import { formatSearchContext, rewriteSearchQuery, searchWebWithGoogle, shouldSearchWeb, } from './search.service.js';
import { getGoogleContextForPrompt, sendGmailMessage } from '../routes/googleDrive.js';
import { getDocumentsContextPrompt } from '../routes/documents.js';
import { addTask, getTasksContextPrompt } from './task.service.js';
import { sendInstagramMessage, resolveInstagramRecipient } from '../providers/instagram.js';
import { isSensitiveSend, } from './approval.service.js';
import { getLoveModeSystemPrompt } from './loveMode.service.js';
import { addManualExam, getClassroomContextPrompt, joinClassroomByCodeOrLink, syncClassroomData, } from './classroom.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { routeSkills } from '../skills/router.js';
import { buildSkillsPromptSection, executeSkillToolCalls } from '../skills/executor.js';
import { gateOutboundAction, wrapUntrustedContent, } from './actionPolicy.service.js';
export class AIProviderError extends Error {
    statusCode;
    constructor(message, statusCode = 502) {
        super(message);
        this.name = 'AIProviderError';
        this.statusCode = statusCode;
    }
}
export function getDefaultAIModel(provider) {
    switch (provider) {
        case 'groq':
            return config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b';
        case 'gemini':
            return 'gemini-flash-lite-latest';
        case 'copilot':
            return 'gpt-4o-mini';
        default:
            return 'qwen/qwen3.8-27b';
    }
}
export async function listAIModels(provider) {
    if (provider === 'groq') {
        const defaultModel = config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b';
        return [
            { id: defaultModel, name: 'Qwen 3.8 27B (Ultra Fast)' },
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
            { id: 'allam-2-7b', name: 'Allam 2 7B' },
        ];
    }
    if (provider === 'gemini') {
        return [
            { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite (High Reliability)' },
            { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
            { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        ];
    }
    if (provider === 'copilot') {
        return [
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini (GitHub)' },
            { id: 'gpt-4o', name: 'GPT-4o (GitHub)' },
            { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
        ];
    }
    return [];
}
async function finalizeAIReply(rawReply, provider, model, meta = {}) {
    const toolExec = await executeSkillToolCalls(rawReply, meta.activeSkills || [], {
        userId: meta.userId,
        currentPage: meta.currentPage,
        loveMode: meta.loveMode,
    });
    let cleaned = toolExec.cleanedReply;
    let pendingApproval = toolExec.outcome.pendingApproval
        ? {
            id: toolExec.outcome.pendingApproval.id,
            action_type: 'send_email',
            summary: toolExec.outcome.pendingApproval.summary,
            action_data: {},
            status: 'pending',
            created_at: new Date().toISOString(),
        }
        : undefined;
    const generatedFiles = toolExec.outcome.files.map((f) => ({
        name: f.name,
        url: f.url,
        mimeType: f.mimeType,
    }));
    const actions = toolExec.outcome.executedCalls.map((c) => ({
        type: c.tool,
        summary: c.summary,
        status: c.ok ? 'executed' : 'blocked',
    }));
    const taskTagRegex = /\[\[TASK:\s*([^|\]]+?)(?:\s*\|\s*([^|\]]*?))?(?:\s*\|\s*(low|medium|high|urgent))?\s*\]\]/gi;
    for (const match of rawReply.matchAll(taskTagRegex)) {
        const title = match[1]?.trim();
        const due = match[2]?.trim() || undefined;
        const priority = match[3]?.toLowerCase() || 'medium';
        if (title) {
            await addTask(title, due, priority, 'ai_scheduled');
        }
        cleaned = cleaned.replace(match[0], '').trim();
    }
    const memoryTagRegex = /\[\[MEMORY:\s*([^|\]]+?)(?:\s*\|\s*(personal|work|preference|fact|instruction|reminder|other))?\s*\]\]/gi;
    for (const match of rawReply.matchAll(memoryTagRegex)) {
        const content = match[1]?.trim();
        const category = match[2]?.toLowerCase() || 'personal';
        if (content) {
            await addMemory(content, category, undefined, 'ai_inference');
        }
        cleaned = cleaned.replace(match[0], '').trim();
    }
    const emailTagRegex = /\[\[SEND_EMAIL:\s*([^|\]]+?)\s*\|\s*([^|\]]+?)\s*\|\s*([^|\]]+?)(?:\s*\|\s*([^\]]*?))?\s*\]\]/gi;
    for (const match of rawReply.matchAll(emailTagRegex)) {
        const to = match[1]?.trim();
        const subject = match[2]?.trim();
        const body = match[3]?.trim();
        const attachmentQuery = match[4]?.trim() || '';
        if (to && subject && body) {
            if (isSensitiveSend(`${subject} ${body} ${attachmentQuery}`)) {
                const gated = await gateOutboundAction({
                    userId: meta.userId,
                    type: 'send_email',
                    summary: `Send sensitive email "${subject}"${attachmentQuery ? ` (file: ${attachmentQuery})` : ''} to ${to}`,
                    payload: { to, subject, body, attachmentQuery },
                    contentToInspect: `${subject} ${body} ${attachmentQuery}`,
                });
                pendingApproval = gated.approval;
                actions.push(gated.action);
                cleaned += `\n\n⚠ Approval required before sending sensitive file/email to ${to}. Click "Approve & Send" below to confirm.`;
            }
            else {
                const res = await sendGmailMessage(to, subject, body, attachmentQuery || undefined);
                if (res.success) {
                    actions.push({ type: 'send_email', summary: `Sent email to ${to}`, status: 'executed' });
                    cleaned += `\n\n✓ Email sent to ${to}${res.attachedFile ? ` (attached: ${res.attachedFile})` : ''}`;
                }
                else {
                    actions.push({ type: 'send_email', summary: `Email to ${to} failed`, status: 'blocked' });
                    cleaned += `\n\n(Note: Email to ${to} could not be sent: ${res.error})`;
                }
            }
        }
        cleaned = cleaned.replace(match[0], '').trim();
    }
    const instaTagRegex = /\[\[SEND_INSTA:\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]\]/gi;
    for (const match of rawReply.matchAll(instaTagRegex)) {
        const targetUser = match[1]?.trim().replace(/^@/, '').toLowerCase();
        const msg = match[2]?.trim();
        if (targetUser && msg) {
            if (isSensitiveSend(msg)) {
                const gated = await gateOutboundAction({
                    userId: meta.userId,
                    type: 'send_insta',
                    summary: `Send sensitive Instagram DM to @${targetUser}`,
                    payload: { username: targetUser, message: msg },
                    contentToInspect: msg,
                });
                pendingApproval = gated.approval;
                actions.push(gated.action);
                cleaned += `\n\n⚠ Approval required before sending sensitive Instagram DM to @${targetUser}. Click "Approve & Send" below to confirm.`;
            }
            else {
                try {
                    // Use resolveInstagramRecipient: checks KNOWN_CONTACTS dict first, then live threads
                    const recipient = await resolveInstagramRecipient(targetUser);
                    if (recipient?.id) {
                        const res = await sendInstagramMessage(recipient.id, msg);
                        if (res.success) {
                            cleaned += `\n\n✅ Instagram DM sent to @${recipient.username}.`;
                        }
                        else {
                            cleaned += `\n\n(Note: Instagram DM to @${recipient.username} failed: ${res.error})`;
                        }
                    }
                    else {
                        cleaned += `\n\n(Note: Could not find Instagram account for "${targetUser}". Try the exact handle like "@_.raghul._.15".)`;
                    }
                }
                catch (err) {
                    logger.warn('AI chat Instagram send failed', { err });
                }
            }
        }
        cleaned = cleaned.replace(match[0], '').trim();
    }
    // Google Classroom: Sync
    if (/\[\[CLASSROOM_SYNC\]\]/i.test(rawReply)) {
        const syncRes = await syncClassroomData().catch(() => null);
        if (syncRes?.synced) {
            cleaned += `\n\n✅ Synced Google Classroom (${syncRes.cache.courses.length} courses, ${syncRes.cache.assignments.length} assignments).`;
        }
        else {
            cleaned += `\n\n(Note: ${syncRes?.cache.lastError || 'Could not sync Google Classroom.'})`;
        }
        cleaned = cleaned.replace(/\[\[CLASSROOM_SYNC\]\]/gi, '').trim();
    }
    // Google Classroom: Join Class
    const joinClassRegex = /\[\[JOIN_CLASS:\s*([^|\]]+?)(?:\s*\|\s*([^\]]*?))?\s*\]\]/gi;
    for (const match of rawReply.matchAll(joinClassRegex)) {
        const codeOrLink = match[1]?.trim();
        const courseId = match[2]?.trim() || undefined;
        if (codeOrLink) {
            const res = await joinClassroomByCodeOrLink({ codeOrLink, courseId });
            cleaned += res.joined ? `\n\n✅ ${res.message}` : `\n\n⚠️ ${res.message}`;
        }
        cleaned = cleaned.replace(match[0], '').trim();
    }
    // Google Classroom: Add Exam
    const addExamRegex = /\[\[ADD_EXAM:\s*([^|\]]+?)\s*\|\s*(\d{4}-\d{2}-\d{2})(?:\s*\|\s*([^\]]*?))?\s*\]\]/gi;
    for (const match of rawReply.matchAll(addExamRegex)) {
        const subject = match[1]?.trim();
        const examDateIso = match[2]?.trim();
        const examTime = match[3]?.trim() || undefined;
        if (subject && examDateIso) {
            await addManualExam({ subject, examDateIso, examTime });
            cleaned += `\n\n📅 Exam added: ${subject} on ${examDateIso}${examTime ? ` (${examTime})` : ''}.`;
        }
        cleaned = cleaned.replace(match[0], '').trim();
    }
    // Telegram: Send message to owner's Telegram
    const tgRegex = /\[\[SEND_TELEGRAM:\s*([^\]]+?)\s*\]\]/gi;
    for (const match of rawReply.matchAll(tgRegex)) {
        const msg = match[1]?.trim();
        if (msg) {
            const ok = await sendTelegramMessage(msg);
            cleaned += ok ? `\n\n✅ Sent to your Telegram.` : `\n\n(Note: Telegram message could not be sent.)`;
        }
        cleaned = cleaned.replace(match[0], '').trim();
    }
    if (meta.searchUnavailable && (!meta.sources || meta.sources.length === 0)) {
        cleaned += '\n\nLive search was unavailable, so this may be out of date.';
    }
    return {
        reply: cleaned.trim(),
        provider,
        model,
        pendingApproval,
        generatedFiles,
        sources: meta.sources || [],
        actions,
    };
}
export async function generateAIReply(prompt, history = [], preferredProvider, preferredModel, signal, options) {
    // ── Love Mode detection (server-verified only; strip any spoofed client prefix) ──
    const isLoveMode = options?.loveMode === true;
    const cleanPrompt = prompt.replace(/^\[LOVE_MODE\]\s*/i, '');
    const provider = preferredProvider || config.DEFAULT_AI_PROVIDER || 'groq';
    const reqSignal = signal ?? AbortSignal.timeout(15000);
    const needsSearch = shouldSearchWeb(cleanPrompt, { loveMode: isLoveMode });
    const searchPromise = needsSearch
        ? (async () => {
            const rewritten = await rewriteSearchQuery(cleanPrompt, history);
            return searchWebWithGoogle(rewritten.query, { limit: 5, freshness: rewritten.freshness }, reqSignal);
        })()
        : Promise.resolve(null);
    const needsGoogleCtx = !isLoveMode &&
        (/\b(gmail|mail|email|drive|gdrive|file|pdf|doc|sheet|calendar|schedule|meeting|aadhar|pan|resume|contact)\b/i.test(cleanPrompt) ||
            options?.currentPage === '/drive' ||
            options?.currentPage === '/gmail');
    const needsClassroomCtx = !isLoveMode &&
        (/\b(classroom|assignment|homework|exam|grade|course|syllabus|due|study|cram)\b/i.test(cleanPrompt) ||
            options?.currentPage === '/classroom');
    const withFastTimeout = (p, fallback, ms = 700) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]).catch(() => fallback);
    const [searchRes, googleContext, memoryContext, tasksContext, classroomContext, routeResult] = await Promise.all([
        searchPromise,
        needsGoogleCtx ? withFastTimeout(getGoogleContextForPrompt(cleanPrompt), '', 2500) : Promise.resolve(''),
        withFastTimeout(getMemoryContextPrompt(), ''),
        isLoveMode ? Promise.resolve('') : withFastTimeout(getTasksContextPrompt(), ''),
        needsClassroomCtx ? withFastTimeout(getClassroomContextPrompt(cleanPrompt), '', 2000) : Promise.resolve(''),
        options?.skipSkills
            ? Promise.resolve({ skills: [], skillNames: [], confidence: 1, latencyMs: 0, lowConfidence: false })
            : routeSkills(cleanPrompt, { currentPage: options?.currentPage, loveMode: isLoveMode, useLlmFallback: false }),
    ]);
    const docsContext = isLoveMode ? '' : getDocumentsContextPrompt();
    const activeSkills = routeResult.skills;
    const skillsPromptSection = buildSkillsPromptSection(activeSkills);
    const searchResults = searchRes?.ok ? searchRes.results : [];
    const searchSources = searchRes?.ok ? searchRes.sources : [];
    const searchUnavailable = needsSearch && (!searchRes || !searchRes.ok || searchResults.length === 0);
    const replyMeta = {
        activeSkills,
        userId: options?.userId,
        currentPage: options?.currentPage,
        loveMode: isLoveMode,
        sources: searchSources,
        searchUnavailable,
    };
    const wrappedGoogle = googleContext ? `\n${wrapUntrustedContent('google', googleContext)}` : '';
    const wrappedDocs = docsContext ? `\n${wrapUntrustedContent('docs', docsContext)}` : '';
    const wrappedClassroom = classroomContext ? `\n${wrapUntrustedContent('classroom', classroomContext)}` : '';
    const formattedSearch = formatSearchContext(searchResults);
    const nowIst = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium',
    });
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const systemPrompt = isLoveMode
        ? getLoveModeSystemPrompt() + memoryContext + skillsPromptSection
        :
            `You are Karen AI, a sharp, loyal, and friendly female personal AI assistant for your owner Hari Prasath with full access across Personal Memory, Tasks, Document Vault, Google Drive, Gmail, Instagram, and Live Web Search.

⚠️ CRITICAL DATE OVERRIDE — IGNORE YOUR TRAINING CUTOFF DATE COMPLETELY:
The REAL current date and time right now is: ${nowIst} (ISO: ${todayIso}).
Your training data may reference an older year — that is STALE and WRONG. This server-injected date is ground truth. Always answer date/time questions using the date above. Never claim you lack real-time date access.

Web Grounding Rule:
Web results below (when present before the user's message) were fetched just now (${nowIst}). For any fact about people, products, prices, news, versions, scores, or dates, answer ONLY from these results. If they do not contain the answer, say you could not confirm it. Never answer such facts from memory. Mention the source name for each fact.

Language Rule: Communicate in clear, natural English by default. Only reply in Thanglish or Tamil if the user writes in Tamil/Thanglish or the prompt explicitly requests Thanglish (e.g., Instagram DMs).
Live Actions & Auto-Learning (append tags silently at the very end when applicable):
- Auto-Learn Rule: Whenever the user shares a useful, durable personal detail, preference, business rule, contact, or instruction (not already in Personal Details above, and not transient small talk), automatically save it by appending [[MEMORY: <concise standalone fact> | <personal|work|preference|fact|instruction|other>]].
- Schedule/create a task: [[TASK: <title> | <YYYY-MM-DD> | <low|medium|high|urgent>]]
- Send an email (or share/attach a Google Drive file like "aadhar" by email): [[SEND_EMAIL: <recipient_email(s)> | <subject> | <body with Drive link if found> | <optional_drive_filename_to_attach>]]
- Send an Instagram DM (or share a Drive file link via Instagram): [[SEND_INSTA: <instagram_username> | <message with Drive link if applicable>]]
- Send a message/reminder to the owner's Telegram: [[SEND_TELEGRAM: <message>]]
- Sync Google Classroom courses/assignments: [[CLASSROOM_SYNC]]
- Join a Google Classroom by invite link or courseId+code: [[JOIN_CLASS: <invite_link_or_code> | <optional_course_id>]]
- Track an exam date: [[ADD_EXAM: <subject> | <YYYY-MM-DD> | <optional_time>]]` +
                skillsPromptSection +
                memoryContext +
                tasksContext +
                wrappedDocs +
                wrappedGoogle +
                wrappedClassroom;
    // Use cleaned prompt (strips [LOVE_MODE] prefix if present) and place web search results right before the latest user message
    const effectivePrompt = isLoveMode ? cleanPrompt : prompt;
    const userMessageWithSearch = formattedSearch
        ? `${formattedSearch}\n\nUser message: ${effectivePrompt}`
        : effectivePrompt;
    // 1. Groq Cloud (Qwen 3.8 27B) - Verified & Operational
    if (provider === 'groq' && config.GROQ_API_KEY) {
        try {
            const messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                ...history.map((h) => ({ role: h.role, content: h.content })),
                { role: 'user', content: userMessageWithSearch },
            ];
            const modelId = preferredModel || getDefaultAIModel('groq');
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: modelId,
                    messages,
                    temperature: 0.6,
                    max_tokens: 1024,
                }),
                signal: reqSignal,
            });
            if (res.ok) {
                const json = await res.json();
                const reply = json.choices?.[0]?.message?.content;
                if (reply) {
                    return await finalizeAIReply(reply, 'groq', modelId, replyMeta);
                }
            }
            else {
                const errJson = await res.json().catch(() => ({}));
                logger.warn('Groq error, falling back:', errJson);
            }
        }
        catch (err) {
            logger.warn('Groq call failed, trying fallback', { err });
        }
    }
    // 2. Google Gemini API (gemini-flash-lite-latest) - Verified & Operational
    if ((provider === 'gemini' || !preferredProvider) && config.GEMINI_API_KEY) {
        try {
            const modelName = preferredModel || getDefaultAIModel('gemini');
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.GEMINI_API_KEY}`;
            const basePayload = {
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                contents: [
                    ...history.map((h) => ({
                        role: h.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: h.content }],
                    })),
                    { role: 'user', parts: [{ text: userMessageWithSearch }] },
                ],
            };
            let res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(needsSearch ? { ...basePayload, tools: [{ google_search: {} }] } : basePayload),
                signal: reqSignal,
            });
            if (!res.ok && needsSearch) {
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(basePayload),
                    signal: reqSignal,
                });
            }
            if (res.ok) {
                const json = await res.json();
                const reply = json.candidates?.[0]?.content?.parts?.[0]?.text;
                const groundingChunks = json.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
                const geminiSources = groundingChunks
                    .filter((c) => c.web?.uri)
                    .map((c) => {
                    const url = c.web.uri;
                    let displayLink = url;
                    try {
                        displayLink = new URL(url).hostname;
                    }
                    catch {
                        // keep raw
                    }
                    return { title: c.web?.title || displayLink, url, displayLink };
                });
                const mergedSources = [...(replyMeta.sources || [])];
                for (const gs of geminiSources) {
                    if (!mergedSources.some((s) => s.url === gs.url)) {
                        mergedSources.push(gs);
                    }
                }
                if (reply) {
                    return await finalizeAIReply(reply, 'gemini', modelName, {
                        ...replyMeta,
                        sources: mergedSources,
                        searchUnavailable: replyMeta.searchUnavailable && mergedSources.length === 0,
                    });
                }
            }
        }
        catch (err) {
            logger.warn('Gemini provider call failed', { err });
        }
    }
    // 3. GitHub Models / Copilot (gpt-4o-mini)
    const ghToken = config.GITHUB_TOKEN || config.COPILOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    if ((provider === 'copilot' || (!config.GROQ_API_KEY && !config.GEMINI_API_KEY)) && ghToken) {
        try {
            const model = preferredModel || 'gpt-4o-mini';
            const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ghToken}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt,
                        },
                        ...history.map((h) => ({ role: h.role, content: h.content })),
                        { role: 'user', content: userMessageWithSearch },
                    ],
                }),
                signal: reqSignal,
            });
            if (res.ok) {
                const json = await res.json();
                const reply = json.choices?.[0]?.message?.content;
                if (reply) {
                    return await finalizeAIReply(reply, 'copilot', model, replyMeta);
                }
            }
            else {
                const errJson = await res.json().catch(() => ({}));
                logger.warn('GitHub Models call error:', errJson);
            }
        }
        catch (err) {
            logger.warn('GitHub Models call failed', { err });
        }
    }
    // 4. Default graceful fallback
    return {
        reply: `Hi Hari! I received your message: "${prompt}". I am ready to help whenever you need.${searchUnavailable ? '\n\nLive search was unavailable, so this may be out of date.' : ''}`,
        provider: 'local-karen',
        model: 'karen-core-v1',
        sources: searchSources,
    };
}
