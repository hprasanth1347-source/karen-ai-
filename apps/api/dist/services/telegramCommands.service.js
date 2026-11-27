/**
 * Karen AI — Modular Telegram Workspace Commands & Live File/Alert Formatters
 */
import { config } from '../config/env.js';
import { getGoogleAccessToken, sendGmailMessage } from '../routes/googleDrive.js';
import { listGmailMessages } from './gmail.service.js';
import { appendGoogleSheetRows, createCalendarEvent, createGoogleContact, createGoogleSheet, createGoogleTask, listCalendarEvents, listGoogleContacts, listGoogleSheets, listGoogleTasks, readGoogleSheet, updateGoogleTask, } from './googleWorkspace.service.js';
import { listTasks } from './task.service.js';
import { searchWebWithFallback } from './search.service.js';
import { listClassroomAssignments } from './classroom.service.js';
function todayIstIso() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function tomorrowIstIso() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
    });
}
function formatDateTagIst(iso) {
    if (!iso)
        return 'No due date';
    const clean = iso.slice(0, 10);
    const today = todayIstIso();
    const tomorrow = tomorrowIstIso();
    if (clean === today)
        return `DUE TODAY (${clean})`;
    if (clean === tomorrow)
        return `Due Tomorrow (${clean})`;
    if (clean < today)
        return `OVERDUE (${clean})`;
    return clean;
}
export async function handleTelegramDriveCommand(args, chatId, sendDocument, userId) {
    const token = await getGoogleAccessToken(userId);
    if (!token) {
        return `🔌 *Google Drive is not connected yet.*\nRun /connectgoogle to sign in with Google, or link your Karen AI account with /link <code>.`;
    }
    const query = args.trim();
    const escaped = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = escaped ? `trashed = false and name contains '${escaped}'` : 'trashed = false';
    const params = new URLSearchParams({
        q,
        pageSize: '10',
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
    });
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
    });
    if (!listRes.ok) {
        return `❌ Google Drive error (HTTP ${listRes.status}). Reconnect at ${config.APP_URL}/drive`;
    }
    const json = (await listRes.json());
    const files = json.files || [];
    if (files.length === 0) {
        return query
            ? `📂 No Google Drive files matched "${query}".`
            : '📂 Your Google Drive has no files.';
    }
    // If user requested a specific file (/drive <filename>), download & send the live top match directly!
    if (query) {
        const top = files[0];
        try {
            let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(top.id)}?alt=media`;
            let outName = top.name;
            if (top.mimeType === 'application/vnd.google-apps.document') {
                downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(top.id)}/export?mimeType=application/pdf`;
                if (!outName.toLowerCase().endsWith('.pdf'))
                    outName += '.pdf';
            }
            else if (top.mimeType === 'application/vnd.google-apps.spreadsheet') {
                downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(top.id)}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
                if (!outName.toLowerCase().endsWith('.xlsx'))
                    outName += '.xlsx';
            }
            else if (top.mimeType === 'application/vnd.google-apps.presentation') {
                downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(top.id)}/export?mimeType=application/pdf`;
                if (!outName.toLowerCase().endsWith('.pdf'))
                    outName += '.pdf';
            }
            if (top.mimeType !== 'application/vnd.google-apps.folder') {
                const dlRes = await fetch(downloadUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(12000),
                });
                if (dlRes.ok) {
                    const buf = Buffer.from(await dlRes.arrayBuffer());
                    if (buf.length > 0 && buf.length <= 20 * 1024 * 1024) {
                        const sent = await sendDocument(chatId, buf, outName, `📁 Live Drive File: ${top.name}`);
                        if (sent) {
                            const others = files
                                .slice(1, 5)
                                .map((f, idx) => `${idx + 2}. ${f.name}${f.webViewLink ? ` — ${f.webViewLink}` : ''}`)
                                .join('\n');
                            return others
                                ? `✅ Sent live Drive file: *${outName}*\n\nOther matches:\n${others}`
                                : `✅ Sent live Drive file: *${outName}*`;
                        }
                    }
                }
            }
        }
        catch {
            // Fall back cleanly to returning live metadata + links
        }
    }
    const lines = files.slice(0, 8).map((f, i) => {
        const kb = f.size ? ` (${Math.max(1, Math.round(Number(f.size) / 1024))} KB)` : '';
        return `${i + 1}. *${f.name}*${kb}${f.webViewLink ? `\n   🔗 ${f.webViewLink}` : ''}`;
    });
    return `📁 *Live Google Drive Files (${files.length}):*\n\n${lines.join('\n\n')}\n\nTip: Use \`/drive <filename>\` to send any file directly here.`;
}
export async function handleTelegramSheetsCommand(args, userId) {
    const clean = args.trim();
    if (!clean) {
        const list = await listGoogleSheets(undefined, userId);
        if (!list.ok)
            return `❌ ${list.error || 'Could not load Google Sheets.'}`;
        if (list.sheets.length === 0) {
            return `📊 No Google Sheets found. Create one with:\n\`/sheets create Expenses | Item,Amount\``;
        }
        return `📊 *Live Google Sheets (${list.sheets.length}):*\n\n${list.sheets
            .slice(0, 8)
            .map((s, i) => `${i + 1}. *${s.name}*\n   ID: \`${s.id}\`${s.webViewLink ? `\n   🔗 ${s.webViewLink}` : ''}`)
            .join('\n\n')}\n\nCommands:\n• \`/sheets create <title> | col1,col2\`\n• \`/sheets read <id_or_name>\`\n• \`/sheets add <id_or_name> | val1,val2\``;
    }
    if (clean.toLowerCase().startsWith('create ')) {
        const body = clean.slice(7).trim();
        const [titlePart, colsPart] = body.split('|').map((s) => s.trim());
        const headers = colsPart ? colsPart.split(',').map((c) => c.trim()).filter(Boolean) : undefined;
        const created = await createGoogleSheet({ title: titlePart || 'Karen Sheet', headers });
        if (!created.ok)
            return `❌ ${created.error}`;
        return `📊 Created Google Sheet *${created.title}*!\nID: \`${created.spreadsheetId}\`\n🔗 ${created.spreadsheetUrl}`;
    }
    if (clean.toLowerCase().startsWith('read ')) {
        const target = clean.slice(5).trim();
        const resolvedId = await resolveSheetId(target);
        if (!resolvedId)
            return `⚠️ Could not find sheet "${target}".`;
        const res = await readGoogleSheet({ spreadsheetId: resolvedId, range: 'A1:Z20' });
        if (!res.ok)
            return `❌ ${res.error}`;
        if (!res.values.length)
            return '📊 Sheet is empty.';
        return `📊 *Sheet Preview:*\n${res.values.slice(0, 12).map((r) => r.join(' | ')).join('\n')}`;
    }
    if (clean.toLowerCase().startsWith('add ')) {
        const body = clean.slice(4).trim();
        const [target, rowText] = body.split('|').map((s) => s.trim());
        if (!target || !rowText)
            return '⚠️ Usage: `/sheets add <sheet_id_or_name> | val1, val2`';
        const resolvedId = await resolveSheetId(target);
        if (!resolvedId)
            return `⚠️ Could not find sheet "${target}".`;
        const row = rowText.split(',').map((v) => v.trim());
        const res = await appendGoogleSheetRows({ spreadsheetId: resolvedId, range: 'A1', rows: [row] });
        if (!res.ok)
            return `❌ ${res.error}`;
        return `✅ Added row to Sheet (\`${resolvedId}\`).`;
    }
    const resolvedId = await resolveSheetId(clean);
    if (!resolvedId)
        return `⚠️ Sheet "${clean}" not found. Run \`/sheets\` to list all spreadsheets.`;
    const res = await readGoogleSheet({ spreadsheetId: resolvedId, range: 'A1:Z15' });
    if (!res.ok)
        return `❌ ${res.error}`;
    return res.values.length
        ? `📊 *Sheet Preview:*\n${res.values.slice(0, 12).map((r) => r.join(' | ')).join('\n')}`
        : '📊 Sheet is empty.';
}
async function resolveSheetId(idOrName) {
    if (/^[a-zA-Z0-9_-]{25,}$/.test(idOrName))
        return idOrName;
    const list = await listGoogleSheets(idOrName);
    return list.ok && list.sheets[0] ? list.sheets[0].id : null;
}
export async function handleTelegramCalendarCommand(args, userId) {
    const clean = args.trim();
    if (clean.toLowerCase().startsWith('add ')) {
        const title = clean.slice(4).trim();
        if (!title)
            return '⚠️ Usage: `/calendar add Team Meeting`';
        const startIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const res = await createCalendarEvent({ summary: title, startIso, userId });
        if (!res.ok)
            return `❌ ${res.error}`;
        return `📅 Added Calendar Event: *${res.event?.summary}*\n🕒 ${new Date(startIso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
    }
    const days = /^\d+$/.test(clean) ? Math.min(Number(clean), 30) : 7;
    const res = await listCalendarEvents(days, userId);
    if (!res.ok)
        return `❌ ${res.error || 'Could not load Google Calendar.'}`;
    if (!res.events.length)
        return `📅 No upcoming Google Calendar events in the next ${days} days.`;
    const lines = res.events.slice(0, 12).map((e, i) => {
        const startStr = e.start
            ? new Date(e.start).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            })
            : 'All day';
        return `${i + 1}. *${e.summary}*\n   🕒 ${startStr}${e.location ? ` · 📍 ${e.location}` : ''}`;
    });
    return `📅 *Live Google Calendar (Next ${days}d):*\n\n${lines.join('\n\n')}`;
}
export async function handleTelegramContactsCommand(args, userId) {
    const clean = args.trim();
    if (clean.toLowerCase().startsWith('add ')) {
        const body = clean.slice(4).trim();
        const emailMatch = body.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
        const phoneMatch = body.match(/\+?\d[\d\s-]{7,15}\d/);
        const name = body.replace(emailMatch?.[0] || '', '').replace(phoneMatch?.[0] || '', '').trim() || 'New Contact';
        const res = await createGoogleContact({ givenName: name, email: emailMatch?.[0], phone: phoneMatch?.[0], userId });
        if (!res.ok)
            return `❌ ${res.error}`;
        return `📇 Saved *${res.contact?.name}* to Google Contacts.`;
    }
    const res = await listGoogleContacts(clean || undefined, userId);
    if (!res.ok)
        return `❌ ${res.error || 'Could not load Google Contacts.'}`;
    if (!res.contacts.length)
        return '📇 No matching Google Contacts found.';
    return `📇 *Google Contacts (${res.contacts.length}):*\n\n${res.contacts
        .slice(0, 12)
        .map((c, i) => `${i + 1}. *${c.name}*${c.phones[0] ? ` · ${c.phones[0]}` : ''}${c.emails[0] ? `\n   ✉️ ${c.emails[0]}` : ''}`)
        .join('\n\n')}`;
}
export async function handleTelegramGmailCommand(args, userId) {
    const clean = args.trim();
    if (clean.toLowerCase().startsWith('send ')) {
        const body = clean.slice(5).trim();
        const parts = body.split('|').map((s) => s.trim());
        if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
            return '⚠️ Usage: `/gmail send to@example.com | Subject | Message body`';
        }
        const [to, subject, message] = parts;
        const sent = await sendGmailMessage(to, subject, message);
        if (!sent.success) {
            return `❌ Failed to send email: ${sent.error || 'Gmail send error'}`;
        }
        return `✅ Email sent via Gmail to *${to}*\nSubject: ${subject}`;
    }
    const isUnreadOnly = clean.toLowerCase() === 'unread';
    const res = await listGmailMessages({
        query: isUnreadOnly ? undefined : clean || undefined,
        unread: isUnreadOnly || undefined,
        limit: 8,
        userId,
    });
    if (!res.ok)
        return `🔌 ${res.error || 'Gmail is not connected.'}\nRun /connectgoogle to connect your Google account.`;
    if (!res.items.length)
        return '✉️ No matching emails found.';
    return `✉️ *Live Gmail Messages (${res.items.length}):*\n\n${res.items
        .slice(0, 8)
        .map((m, i) => `${i + 1}. ${m.unread ? '🔵 ' : ''}*${m.subject}*\n   From: ${m.from} (${m.dateIst})\n   ${m.snippet.slice(0, 100)}`)
        .join('\n\n')}`;
}
export async function handleTelegramSearchCommand(args) {
    const q = args.trim();
    if (!q)
        return '⚠️ Usage: `/search <your custom query>`';
    const res = await searchWebWithFallback(q, {
        limit: 5,
        freshness: 'breaking',
        bypassCache: true,
        enrichPages: false,
    });
    if (!res.ok || !res.results.length) {
        return `🔎 Live search returned no results for "${q}".`;
    }
    return `🔎 *Live Search: ${q}*\n\n${res.results
        .map((r, i) => `${i + 1}. *${r.title}*\n   ${r.snippet.slice(0, 140)}\n   🔗 ${r.link}`)
        .join('\n\n')}`;
}
export async function handleTelegramTasksCommand(args) {
    const clean = args.trim();
    if (clean.toLowerCase().startsWith('add ')) {
        const title = clean.slice(4).trim();
        if (!title)
            return '⚠️ Usage: `/tasks add Submit report`';
        const gRes = await createGoogleTask({ title, dueIso: todayIstIso() });
        if (!gRes.ok)
            return `❌ ${gRes.error}`;
        return `✅ Added to Live Google Tasks: *${gRes.task?.title}* (Due Today ${todayIstIso()})`;
    }
    if (clean.toLowerCase().startsWith('done ')) {
        const target = clean.slice(5).trim().toLowerCase();
        if (!target)
            return '⚠️ Usage: `/tasks done <task name>`';
        const gList = await listGoogleTasks();
        if (!gList.ok)
            return `❌ ${gList.error || 'Could not load Google Tasks.'}`;
        const match = gList.tasks.find((t) => t.status !== 'completed' && (t.id === target || t.title.toLowerCase().includes(target)));
        if (!match)
            return `⚠️ No open Google Task matched "${clean.slice(5).trim()}".`;
        const doneRes = await updateGoogleTask({ taskId: match.id, status: 'completed' });
        if (!doneRes.ok)
            return `❌ ${doneRes.error || 'Could not complete task.'}`;
        return `✅ Completed Google Task: *${match.title}*`;
    }
    const [gRes, localTasks] = await Promise.all([
        listGoogleTasks().catch(() => ({ ok: false, tasks: [], error: 'Unavailable' })),
        listTasks().catch(() => []),
    ]);
    const googleOpen = gRes.ok ? gRes.tasks.filter((t) => t.status !== 'completed') : [];
    const localOpen = localTasks.filter((t) => t.status !== 'done');
    if (googleOpen.length === 0 && localOpen.length === 0) {
        return gRes.ok
            ? '✅ No pending live Google Tasks right now!'
            : `🔌 ${gRes.error || 'Google Tasks not connected.'}\nRun /connectgoogle to connect.`;
    }
    const lines = [];
    for (const t of googleOpen.slice(0, 10)) {
        lines.push(`${lines.length + 1}. *${t.title}* — ${formatDateTagIst(t.due)} [Google]`);
    }
    for (const t of localOpen.slice(0, Math.max(0, 12 - lines.length))) {
        lines.push(`${lines.length + 1}. *${t.title}* — ${formatDateTagIst(t.due)}`);
    }
    return `📋 *Live Tasks (${googleOpen.length + localOpen.length}):*\n\n${lines.join('\n')}\n\nTip: \`/tasks add <title>\` or \`/tasks done <title>\``;
}
export async function buildLiveAlertsDigest() {
    const today = todayIstIso();
    const tomorrow = tomorrowIstIso();
    const [tasks, calRes, classroom] = await Promise.all([
        listTasks().catch(() => []),
        listCalendarEvents(2).catch(() => ({ ok: false, events: [] })),
        listClassroomAssignments({ category: 'pending', sortBy: 'deadline' }).catch(() => []),
    ]);
    const activeTasks = tasks.filter((t) => t.status !== 'done');
    const dueTodayTasks = activeTasks.filter((t) => !t.due || t.due.slice(0, 10) <= today);
    const classroomToday = classroom.filter((a) => {
        if (!a.dueIso)
            return false;
        return new Date(a.dueIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today;
    });
    const classroomTomorrow = classroom.filter((a) => {
        if (!a.dueIso)
            return false;
        return new Date(a.dueIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === tomorrow;
    });
    const sections = [`🔔 *Karen Live Workspace Alerts (${today} IST)*`];
    if (calRes.ok && calRes.events.length > 0) {
        sections.push(`📅 *Google Calendar (Next 48h):*\n${calRes.events
            .slice(0, 5)
            .map((e) => `• *${e.summary}* — ${new Date(e.start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`)
            .join('\n')}`);
    }
    else {
        sections.push('📅 *Google Calendar:* No upcoming events in the next 48h.');
    }
    if (dueTodayTasks.length > 0) {
        sections.push(`📋 *Google Tasks Due Today / Overdue:*\n${dueTodayTasks
            .slice(0, 6)
            .map((t) => `• *${t.title}* (${formatDateTagIst(t.due)})`)
            .join('\n')}`);
    }
    else {
        sections.push('📋 *Google Tasks:* No tasks due today.');
    }
    if (classroomToday.length > 0) {
        sections.push(`🚨 *Classroom Due TODAY (${classroomToday.length}):*\n${classroomToday
            .slice(0, 5)
            .map((a) => `• *${a.title}* (${a.courseName}) — ${a.dueIstDisplay}`)
            .join('\n')}`);
    }
    if (classroomTomorrow.length > 0) {
        sections.push(`⏰ *Classroom Due Tomorrow (${classroomTomorrow.length}):*\n${classroomTomorrow
            .slice(0, 5)
            .map((a) => `• *${a.title}* (${a.courseName}) — ${a.dueIstDisplay}`)
            .join('\n')}`);
    }
    return sections.join('\n\n');
}
