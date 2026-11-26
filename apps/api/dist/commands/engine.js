import { createHash } from 'node:crypto';
import { config } from '../config/env.js';
import { logAudit } from '../utils/audit.js';
import { sendEmailOrReply } from '../services/gmail.service.js';
import { joinClassroom } from '../services/classroom.service.js';
import { resolveInstagramRecipient, sendInstagramMessage } from '../providers/instagram.js';
import { COMMAND_TOOL_MAP, COMMAND_TOOLS } from './registry.js';
import { cancelPendingForChat, claimPendingActionById, findMatchingMacro, getActivePendingAction, getLastResults, getLastUploadedFile, saveLastResults, savePendingAction, } from './state.js';
export function detectCommandLanguage(text) {
    if (/[\u0B80-\u0BFF]/.test(text))
        return 'tamil';
    if (/\b(sollu|anuppu|pannu|kaattu|enaku|enna|iruku|machan|da\b|ku\b|la\b|illa)\b/i.test(text)) {
        return 'thanglish';
    }
    return 'english';
}
function parseOrdinalIndex(text) {
    const lower = text.toLowerCase();
    if (/\b(first|1st|#1|\b1\b)\b/.test(lower))
        return 0;
    if (/\b(second|2nd|#2|\b2\b)\b/.test(lower))
        return 1;
    if (/\b(third|3rd|#3|\b3\b)\b/.test(lower))
        return 2;
    if (/\b(fourth|4th|#4|\b4\b)\b/.test(lower))
        return 3;
    if (/\b(fifth|5th|#5|\b5\b)\b/.test(lower))
        return 4;
    if (/\b(that|it|this\s+one)\b/.test(lower))
        return 0;
    return null;
}
/**
 * Deterministic NLU parser for high-reliability English, Tamil, Thanglish & typo command understanding.
 * Returns null for non-commands (general chat) or ambiguous queries that should fall back to LLM function calling.
 */
export function planDeterministicCommand(text, lastResults, hasUploadedFile) {
    const clean = text.trim();
    const lower = clean.toLowerCase();
    // 0. Non-commands (general chat / factual questions) must NOT trigger tools
    if (/^(tell\s+me\s+about|what\s+is\s+the\s+(capital|weather|price|meaning)|who\s+is|hi\b|hello\b|hey\b|thanks|thank\s+you|good\s+(morning|night)|how\s+are\s+you)/i.test(clean) &&
        !/\b(assignment|mail|email|gmail|class|classroom|drive|insta|instagram|dm|macro|exam|grade|announcement)\b/i.test(clean)) {
        return null;
    }
    // 1. Teach Karen macro
    const teachMatch = clean.match(/(?:teach\s+karen[:\s]*)?when\s+i\s+say\s+['"]([^'"]+)['"]\s*(?:,?\s*(?:then\s+)?)(.+)/i);
    if (teachMatch) {
        return [{ tool: 'macro_save', args: { triggerPhrase: teachMatch[1].trim(), instruction: teachMatch[2].trim() } }];
    }
    // 2. Save to Google Drive (uploaded file or caption)
    if (/\b(save|upload|store|put|backup)\b.*\b(drive|gdrive|google\s+drive)\b/i.test(lower) ||
        (hasUploadedFile && /\b(save\s+(this|it)|drive)\b/i.test(lower))) {
        const folderMatch = clean.match(/\bin\s+(?:the\s+)?([a-z0-9 _-]{2,40}?)\s+folder\b/i);
        return [{ tool: 'drive_upload', args: folderMatch ? { folder: folderMatch[1].trim() } : {} }];
    }
    // 3. Join Classroom
    if (/\b(join|add\s+me\s+to|enroll)\b.*\b(class|classroom)\b/i.test(lower) ||
        /\badd\s+me\s+to\s+https?:\/\/classroom\.google\.com/i.test(lower) ||
        /\bclass\s*id\b/i.test(lower) ||
        /classroom\.google\.com\/c\//i.test(clean)) {
        const linkMatches = clean.match(/https?:\/\/classroom\.google\.com\/\S+/gi);
        if (linkMatches && linkMatches.length > 0) {
            return linkMatches.map((link) => ({ tool: 'classroom_join', args: { target: link } }));
        }
        const idMatch = clean.match(/\b(?:course|class\s*id|class)\s*[:#]?\s*([0-9]{5,20})\b/i);
        const codeMatch = clean.match(/\bcode\s*[:#]?\s*([A-Za-z0-9]{5,12})\b/i);
        if (idMatch && codeMatch) {
            return [{ tool: 'classroom_join', args: { target: idMatch[1], courseId: idMatch[1], classCode: codeMatch[1] } }];
        }
        if (idMatch) {
            return [{ tool: 'classroom_join', args: { target: idMatch[1], courseId: idMatch[1] } }];
        }
        const bareCode = clean.match(/\b(?:code|join\s+class)\s*[:#]?\s*([A-Za-z0-9]{5,12})\b/i);
        return [{ tool: 'classroom_join', args: { target: bareCode ? bareCode[1] : clean } }];
    }
    // 4. Reference resolution ("open the second one", "explain assignment 2", "reply ok to that mail", "mark it done")
    if (lastResults.length > 0) {
        const ord = parseOrdinalIndex(clean);
        const targetItem = ord !== null ? lastResults[ord] || lastResults[0] : lastResults[0];
        if (/\b(mark|set)\b.*\b(done|complete|finished)\b/i.test(lower) && targetItem.type === 'assignment') {
            return [{ tool: 'classroom_set_personal_status', args: { assignmentId: targetItem.id, status: 'done' } }];
        }
        if (/\bexplain\b/i.test(lower) && targetItem.type === 'assignment') {
            return [{ tool: 'classroom_explain', args: { query: targetItem.title } }];
        }
        if (/\b(open|read|show)\b.*\b(one|first|second|third|fourth|fifth|mail|that|it)\b/i.test(lower)) {
            if (targetItem.type === 'email') {
                return [{ tool: 'gmail_read', args: { id: targetItem.id } }];
            }
            if (targetItem.type === 'assignment') {
                return [{ tool: 'classroom_explain', args: { query: targetItem.title } }];
            }
        }
        if (/\breply\b/i.test(lower) && targetItem.type === 'email') {
            const replyBodyMatch = clean.match(/\breply\s+(.+?)\s+to\s+(?:that|the\s+\w+\s+mail|it)/i);
            const body = replyBodyMatch?.[1]?.trim() || clean.replace(/^\s*reply\s*/i, '').trim() || 'OK, noted.';
            const fromEmail = targetItem.extra?.from?.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || targetItem.subtitle || '';
            return [
                {
                    tool: 'gmail_send',
                    args: {
                        to: fromEmail,
                        subject: targetItem.title.startsWith('Re:') ? targetItem.title : `Re: ${targetItem.title}`,
                        body,
                    },
                },
            ];
        }
    }
    // 5. Classroom assignments / grades / exam prep (with typo tolerance: assignmnt, assigment, pendng, overdu, tomorow)
    if (/\b(pending|pendng|overdue|overdu|due|assignments?|assigments?|assignmnts?|homework|submitted|graded|classroom)\b/i.test(lower)) {
        if (/\bexplain\b/i.test(lower)) {
            return [{ tool: 'classroom_explain', args: { query: clean } }];
        }
        if (/\bgrades?\b/i.test(lower)) {
            return [{ tool: 'classroom_grades', args: {} }];
        }
        const filter = /\boverdue|overdu\b/i.test(lower)
            ? 'overdue'
            : /\btoday\b/i.test(lower)
                ? 'due_today'
                : /\btomorrow|tomorow|tmrw|naalaiku\b/i.test(lower)
                    ? 'due_tomorrow'
                    : /\bthis\s+week\b/i.test(lower)
                        ? 'due_this_week'
                        : /\bsubmitted\b/i.test(lower)
                            ? 'submitted'
                            : /\bgraded\b/i.test(lower)
                                ? 'graded'
                                : 'pending';
        return [{ tool: 'classroom_list_assignments', args: { filter, limit: 10 } }];
    }
    if (/\bgrades?\b/i.test(lower)) {
        const courseMatch = clean.match(/\bfor\s+([a-z0-9 &_-]{2,40})$/i);
        return [{ tool: 'classroom_grades', args: courseMatch ? { course: courseMatch[1].trim() } : {} }];
    }
    if (/\b(exam|test)\b.*\b(help|prep|tomorrow|study|plan)\b/i.test(lower)) {
        return [{ tool: 'classroom_exam_prep', args: { subject: clean, hoursAvailable: 5 } }];
    }
    // 6. Email send / mail this file
    if (/\b(send|mail|email)\b.*\b(to|@)\b/i.test(lower) &&
        !/\b(show|list|unread|latest|read|check|from)\b/i.test(lower)) {
        const emailMatch = clean.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
        const aboutMatch = clean.match(/\babout\s+(.+)$/i);
        const fileNote = /\bthis\s+file\b/i.test(lower) && hasUploadedFile ? 'uploaded file' : undefined;
        return [
            {
                tool: 'gmail_send',
                args: {
                    to: emailMatch?.[0],
                    subject: aboutMatch ? aboutMatch[1].trim().slice(0, 120) : undefined,
                    body: aboutMatch ? `Hi,\n\nRegarding ${aboutMatch[1].trim()}.\n\nBest,\nHari` : undefined,
                    attachmentQuery: fileNote,
                },
            },
        ];
    }
    // 7. Email list / unread / from sender
    if (/\b(mails?|emails?|emials?|gmails?|inbox)\b/i.test(lower)) {
        const unread = /\bunread\b/i.test(lower);
        const limitMatch = clean.match(/\b(\d{1,2})\s+(?:latest\s+)?(?:mails?|emails?)\b/i);
        const fromMatch = clean.match(/\bfrom\s+([a-z0-9@._ -]{2,40})/i);
        return [
            {
                tool: 'gmail_list',
                args: {
                    unread: unread || undefined,
                    from: fromMatch?.[1]?.trim(),
                    limit: limitMatch ? Math.min(Number(limitMatch[1]), 10) : 5,
                },
            },
        ];
    }
    // 8. Instagram DM
    if (/\b(insta|instagram|dm)\b/i.test(lower)) {
        if (/\b(check|read|show|list)\b.*\b(dms?|messages?|inbox)\b/i.test(lower)) {
            return [{ tool: 'instagram_read_dms', args: { limit: 5 } }];
        }
        // Exact handle like _.raghul._.15 or @handle
        const handleMatch = clean.match(/@?([a-z0-9._]{3,30}\.[a-z0-9._]{1,20}|@[a-z0-9._]{2,30})/i);
        const sendToMatch = clean.match(/\b(?:send|tell|dm)\s+(.+?)\s+(?:to|on\s+insta)\b/i);
        const thanglishMatch = clean.match(/([a-z0-9._]+)\s+ku\s+insta(?:\s+la)?\s+(.+?)\s+sollu/i);
        const dmNameMatch = clean.match(/\b(?:dm|tell)\s+([a-z0-9._]+)\s+(.+)/i);
        let recipient = handleMatch?.[1]?.replace(/^@/, '');
        let message;
        if (thanglishMatch) {
            recipient = recipient || thanglishMatch[1];
            message = thanglishMatch[2].trim();
        }
        else if (dmNameMatch && !['on', 'to', 'about'].includes(dmNameMatch[1].toLowerCase())) {
            recipient = recipient || dmNameMatch[1];
            message = dmNameMatch[2].trim();
        }
        else if (sendToMatch) {
            message = sendToMatch[1].trim();
        }
        if (message && recipient && message.toLowerCase().includes(recipient.toLowerCase())) {
            message = message.replace(new RegExp(`to\\s+@?${recipient}.*$`, 'i'), '').trim();
        }
        return [
            {
                tool: 'instagram_send_dm',
                args: {
                    recipient,
                    message,
                    kind: handleMatch ? 'exact' : 'compose',
                },
            },
        ];
    }
    // 9. Google Calendar
    if (/\b(calendar|events?|schedule|meeting)\b/i.test(lower) && !/\b(mail|email)\b/i.test(lower)) {
        if (/\b(add|create|schedule|book)\b/i.test(lower)) {
            return [{ tool: 'calendar_create_event', args: { summary: clean, startIso: new Date(Date.now() + 24 * 3600_000).toISOString() } }];
        }
        return [{ tool: 'calendar_list_events', args: { daysAhead: 7 } }];
    }
    // 10. Google Sheets (create, read, edit/append)
    if (/\b(google\s+sheet|spreadsheet|sheets?)\b/i.test(lower)) {
        const idMatch = clean.match(/\b([a-zA-Z0-9_-]{25,})\b/);
        if (/\b(create|new|make)\b/i.test(lower)) {
            const titleMatch = clean.match(/\b(?:named|called|titled)\s+["']?([^"'\n,]+)["']?/i);
            const colsMatch = clean.match(/\b(?:columns?|headers?)\s+(.+)$/i);
            const headers = colsMatch ? colsMatch[1].split(/[,|]/).map((s) => s.trim()).filter(Boolean) : undefined;
            return [{ tool: 'sheets_create', args: { title: titleMatch?.[1]?.trim() || 'Karen Sheet', headers } }];
        }
        if (idMatch && /\b(edit|add\s+row|append|update|insert)\b/i.test(lower)) {
            const valuesMatch = clean.match(/\b(?:with|values?|row)\s+(.+)$/i);
            const row = valuesMatch ? valuesMatch[1].split(/[,|]/).map((s) => s.trim()) : ['Updated by Karen'];
            return [{ tool: 'sheets_edit', args: { spreadsheetId: idMatch[1], mode: 'append', rows: [row] } }];
        }
        if (idMatch) {
            return [{ tool: 'sheets_read', args: { spreadsheetId: idMatch[1] } }];
        }
    }
    // 11. Personal Memory & Tasks
    if (/\b(my\s+memor(y|ies)|show\s+memor(y|ies))\b/i.test(lower)) {
        return [{ tool: 'memory_list', args: {} }];
    }
    if (/\b(remember\s+that|save\s+memory)\b/i.test(lower)) {
        return [{ tool: 'memory_save', args: { content: clean.replace(/^(remember\s+that|save\s+memory)\s*/i, '').trim() || clean } }];
    }
    if (/\b(my\s+tasks|google\s+tasks|show\s+tasks|list\s+tasks)\b/i.test(lower)) {
        return [{ tool: 'google_tasks_list', args: {} }];
    }
    if (/\b(add\s+task|create\s+task|add\s+google\s+task)\b/i.test(lower)) {
        return [{ tool: 'google_tasks_create', args: { title: clean.replace(/^(add|create)\s+(google\s+)?task\s*/i, '').trim() || clean } }];
    }
    // 12. Google Contacts
    if (/\b(contacts?|phone\s+number\s+of|email\s+of)\b/i.test(lower)) {
        if (/\b(add|save|create)\b/i.test(lower)) {
            const emailMatch = clean.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
            const phoneMatch = clean.match(/\+?\d[\d\s-]{7,15}\d/);
            const nameClean = clean
                .replace(/^(add|save|create)\s+(google\s+)?contact\s*/i, '')
                .replace(emailMatch?.[0] || '', '')
                .replace(phoneMatch?.[0] || '', '')
                .trim();
            return [{ tool: 'google_contacts_create', args: { givenName: nameClean || 'New Contact', email: emailMatch?.[0], phone: phoneMatch?.[0] } }];
        }
        const qMatch = clean.match(/\b(?:find|search|for|of)\s+([a-z0-9 ._@-]{2,40})$/i);
        return [{ tool: 'google_contacts_search', args: { query: qMatch?.[1]?.trim() } }];
    }
    return null;
}
async function planWithLlmFunctionCalling(text, history, lastResults) {
    if (!config.GROQ_API_KEY && !config.GEMINI_API_KEY)
        return null;
    const toolsSpec = COMMAND_TOOLS.map((t) => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.jsonSchema,
        },
    }));
    const istNow = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const systemMsg = `You are Karen's command router. Current IST: ${istNow}.
Recent list items: ${JSON.stringify(lastResults.slice(0, 5))}.
If the user is issuing a command, call the appropriate tool(s). If it is casual chat or general knowledge (not a command), respond with plain text without calling tools.`;
    try {
        if (config.GROQ_API_KEY) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b',
                    temperature: 0.1,
                    max_tokens: 300,
                    tools: toolsSpec,
                    tool_choice: 'auto',
                    messages: [
                        { role: 'system', content: systemMsg },
                        ...history.slice(-6).map((h) => ({ role: h.role, content: h.content.slice(0, 300) })),
                        { role: 'user', content: text },
                    ],
                }),
                signal: AbortSignal.timeout(4500),
            });
            if (res.ok) {
                const json = await res.json();
                const toolCalls = json.choices?.[0]?.message?.tool_calls;
                if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                    return toolCalls.slice(0, 6).map((tc) => ({
                        tool: tc.function?.name,
                        args: JSON.parse(tc.function?.arguments || '{}'),
                    }));
                }
            }
        }
    }
    catch {
        // Fall back gracefully
    }
    return null;
}
export async function runCommandEngine(input) {
    const cleanText = input.text.trim();
    const language = detectCommandLanguage(cleanText);
    if (/^\/cancel\b/i.test(cleanText)) {
        const cancelled = await cancelPendingForChat(input.chatKey);
        return {
            handled: true,
            reply: cancelled ? 'Cancelled pending action.' : 'No pending action to cancel.',
            toolsUsed: [],
            outcome: 'done',
        };
    }
    const [lastResults, lastUploadedFile, pending] = await Promise.all([
        getLastResults(input.chatKey),
        getLastUploadedFile(input.chatKey),
        getActivePendingAction(input.chatKey),
    ]);
    const ctx = {
        chatKey: input.chatKey,
        userId: input.userId,
        channel: input.channel,
        language,
        lastResults,
        lastUploadedFile,
    };
    // Resolve pending clarification if active
    if (pending && pending.promptQuestion) {
        await claimPendingActionById(pending.id, 'confirmed');
        const tool = COMMAND_TOOL_MAP.get(pending.actionType);
        if (tool) {
            const mergedArgs = { ...pending.payload };
            if (pending.actionType === 'gmail_send' && !mergedArgs.to) {
                mergedArgs.to = cleanText;
            }
            else if (pending.actionType === 'instagram_send_dm') {
                if (!mergedArgs.recipient)
                    mergedArgs.recipient = cleanText;
                else if (!mergedArgs.message)
                    mergedArgs.message = cleanText;
            }
            else if (pending.actionType === 'classroom_join') {
                if (!mergedArgs.courseId && !/classroom\.google\.com/i.test(cleanText) && /^\d+$/.test(cleanText)) {
                    mergedArgs.courseId = cleanText;
                    mergedArgs.target = cleanText;
                }
                else if (!mergedArgs.classCode && /^[A-Za-z0-9]{5,12}$/.test(cleanText)) {
                    mergedArgs.classCode = cleanText;
                    mergedArgs.target = String(mergedArgs.courseId || cleanText);
                }
                else {
                    mergedArgs.target = cleanText;
                }
            }
            const result = await executeToolWithAudit(tool, mergedArgs, ctx);
            return await buildEngineResponseFromToolResults([result], [tool.name], input.chatKey, input.userId);
        }
    }
    // Check owner-defined macro
    const macro = await findMatchingMacro(cleanText);
    let effectiveText = cleanText;
    if (macro && macro.steps.length > 0) {
        effectiveText = macro.steps.map((s) => s.instruction).join(' and ');
    }
    // Plan tool calls (deterministic first, LLM function calling fallback)
    let planned = planDeterministicCommand(effectiveText, lastResults, Boolean(lastUploadedFile));
    if (!planned && input.useLlmFallback !== false) {
        planned = await planWithLlmFunctionCalling(effectiveText, input.history || [], lastResults);
    }
    if (!planned || planned.length === 0) {
        return {
            handled: false,
            reply: '',
            toolsUsed: [],
            outcome: 'chat',
        };
    }
    const results = [];
    const toolsUsed = [];
    for (const step of planned.slice(0, 6)) {
        const tool = COMMAND_TOOL_MAP.get(step.tool);
        if (!tool)
            continue;
        toolsUsed.push(tool.name);
        const res = await executeToolWithAudit(tool, step.args, ctx);
        results.push(res);
    }
    return await buildEngineResponseFromToolResults(results, toolsUsed, input.chatKey, input.userId);
}
async function executeToolWithAudit(tool, rawArgs, ctx) {
    const startMs = Date.now();
    const argsHash = createHash('sha256').update(JSON.stringify(rawArgs)).digest('hex').slice(0, 16);
    let res;
    try {
        const validated = tool.inputSchema.parse(rawArgs);
        res = await tool.execute(validated, ctx);
    }
    catch (err) {
        res = {
            ok: false,
            summary: `Invalid or failed command (${tool.name}): ${err instanceof Error ? err.message : 'error'}`,
        };
    }
    if (ctx.userId) {
        await logAudit(ctx.userId, 'COMMAND_TOOL_CALL', 'commands', tool.name, {
            tool: tool.name,
            argsHash,
            ok: res.ok,
            durationMs: Date.now() - startMs,
        }).catch(() => { });
    }
    return res;
}
async function buildEngineResponseFromToolResults(results, toolsUsed, chatKey, userId) {
    const replies = [];
    let buttons;
    let outcome = 'done';
    let latestResults;
    for (const r of results) {
        if (r.lastResults) {
            latestResults = r.lastResults;
            await saveLastResults(chatKey, r.lastResults);
        }
        if (r.needsClarification) {
            await savePendingAction({
                chatKey,
                userId,
                actionType: r.needsClarification.actionType,
                payload: r.needsClarification.partialPayload,
                promptQuestion: r.needsClarification.question,
            });
            replies.push(r.needsClarification.question);
            outcome = 'needs_clarification';
        }
        else if (r.pendingConfirmation) {
            const pending = await savePendingAction({
                chatKey,
                userId,
                actionType: r.pendingConfirmation.actionType,
                payload: r.pendingConfirmation.payload,
            });
            replies.push(r.pendingConfirmation.previewText);
            buttons = r.pendingConfirmation.buttons.map((row) => row.map((btn) => btn.callbackData === 'confirm'
                ? { ...btn, callbackData: `cmd_confirm:${pending.id}` }
                : btn.callbackData === 'cancel'
                    ? { ...btn, callbackData: `cmd_cancel:${pending.id}` }
                    : btn));
            outcome = 'needs_tap';
        }
        else {
            replies.push(r.summary);
            if (r.buttons)
                buttons = r.buttons;
            if (r.fixButton)
                buttons = [[r.fixButton]];
            if (!r.ok)
                outcome = 'failed';
        }
    }
    return {
        handled: true,
        reply: replies.join('\n\n'),
        buttons,
        toolsUsed,
        outcome,
        lastResults: latestResults,
    };
}
export async function executeConfirmedPendingAction(actionId, decision, userId) {
    const claimed = await claimPendingActionById(actionId, decision === 'confirm' ? 'confirmed' : 'cancelled');
    if (!claimed.claimed || !claimed.action) {
        if (claimed.reason === 'expired')
            return { ok: false, message: 'Confirmation expired. Please run the command again.' };
        if (claimed.reason === 'already_processed')
            return { ok: false, message: 'Already processed.' };
        return { ok: false, message: 'Pending action not found.' };
    }
    if (decision === 'cancel') {
        return { ok: true, message: 'Cancelled (nothing sent).' };
    }
    const { actionType, payload } = claimed.action;
    if (actionType === 'gmail_send') {
        const res = await sendEmailOrReply({
            to: String(payload.to || ''),
            subject: String(payload.subject || 'Note'),
            body: String(payload.body || ''),
            attachmentQuery: payload.attachmentQuery ? String(payload.attachmentQuery) : undefined,
        });
        const istTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        return res.success
            ? { ok: true, message: `✅ Sent to ${payload.to} at ${istTime} IST.` }
            : { ok: false, message: `❌ Email failed: ${res.error}` };
    }
    if (actionType === 'instagram_send_dm') {
        let recipientId = String(payload.recipientId || '');
        const username = String(payload.username || '');
        if (!recipientId && username) {
            const resolved = await resolveInstagramRecipient(username).catch(() => null);
            recipientId = resolved?.id || '';
        }
        if (!recipientId) {
            return { ok: false, message: `❌ Could not resolve Instagram account @${username}.` };
        }
        const res = await sendInstagramMessage(recipientId, String(payload.message || ''));
        return res.success
            ? { ok: true, message: `✅ Sent Instagram DM to @${username}.` }
            : { ok: false, message: `❌ Instagram DM failed: ${res.error}` };
    }
    if (actionType === 'classroom_join') {
        const res = await joinClassroom({
            mode: payload.mode || 'link',
            inviteLink: payload.inviteLink ? String(payload.inviteLink) : undefined,
            courseId: payload.courseId ? String(payload.courseId) : undefined,
            classCode: payload.classCode ? String(payload.classCode) : undefined,
            userId,
        });
        return { ok: res.joined, message: res.message };
    }
    if (actionType === 'drive_upload_duplicate' || actionType === 'drive_create_folder_and_upload') {
        const tool = COMMAND_TOOL_MAP.get('drive_upload');
        if (tool) {
            const lastUploadedFile = await getLastUploadedFile(claimed.action.chatKey);
            const res = await tool.execute({
                ...payload,
                keepBoth: actionType === 'drive_upload_duplicate',
                allowCreateFolder: actionType === 'drive_create_folder_and_upload',
            }, {
                chatKey: claimed.action.chatKey,
                userId,
                channel: 'telegram',
                language: 'english',
                lastResults: [],
                lastUploadedFile,
            });
            return { ok: res.ok, message: res.summary };
        }
    }
    return { ok: false, message: `Unsupported pending action type: ${actionType}` };
}
