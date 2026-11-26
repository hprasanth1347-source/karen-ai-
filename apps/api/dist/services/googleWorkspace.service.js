import { getGoogleAccessToken } from '../routes/googleDrive.js';
export async function listCalendarEvents(daysAhead = 7, userId, req) {
    const token = await getGoogleAccessToken(userId, req);
    if (!token)
        return { ok: false, events: [], error: 'Google is not connected.' };
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '15',
    });
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
        return {
            ok: false,
            events: [],
            error: res.status === 403 ? 'Missing Google Calendar permission. Reconnect Google once.' : `Calendar API error (${res.status})`,
        };
    }
    const json = (await res.json());
    const events = (json.items || []).map((e) => ({
        id: e.id,
        summary: e.summary || '(No title)',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || '',
        location: e.location,
        htmlLink: e.htmlLink,
    }));
    return { ok: true, events };
}
export async function createCalendarEvent(input) {
    const token = await getGoogleAccessToken(input.userId, input.req);
    if (!token)
        return { ok: false, error: 'Google is not connected.' };
    const startMs = new Date(input.startIso).getTime();
    const endIso = input.endIso ||
        new Date((Number.isNaN(startMs) ? Date.now() : startMs) + 60 * 60 * 1000).toISOString();
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            summary: input.summary,
            description: input.description,
            start: { dateTime: input.startIso, timeZone: 'Asia/Kolkata' },
            end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
        }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
        return {
            ok: false,
            error: res.status === 403 ? 'Missing Google Calendar write permission. Reconnect Google once.' : `Calendar create failed (${res.status})`,
        };
    }
    const e = (await res.json());
    return {
        ok: true,
        event: {
            id: e.id,
            summary: e.summary,
            start: e.start?.dateTime || e.start?.date || input.startIso,
            end: e.end?.dateTime || e.end?.date || endIso,
            htmlLink: e.htmlLink,
        },
    };
}
export async function listGoogleTasks(userId, req) {
    const token = await getGoogleAccessToken(userId, req);
    if (!token)
        return { ok: false, tasks: [], error: 'Google is not connected.' };
    const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=20', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
        return {
            ok: false,
            tasks: [],
            error: res.status === 403 ? 'Missing Google Tasks permission. Reconnect Google once.' : `Google Tasks error (${res.status})`,
        };
    }
    const json = (await res.json());
    return {
        ok: true,
        tasks: (json.items || []).map((t) => ({
            id: t.id,
            title: t.title || '(Untitled)',
            notes: t.notes,
            due: t.due,
            status: t.status || 'needsAction',
        })),
    };
}
export async function createGoogleTask(input) {
    const token = await getGoogleAccessToken(input.userId, input.req);
    if (!token)
        return { ok: false, error: 'Google is not connected.' };
    const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: input.title,
            notes: input.notes,
            ...(input.dueIso ? { due: new Date(input.dueIso).toISOString() } : {}),
        }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
        return {
            ok: false,
            error: res.status === 403 ? 'Missing Google Tasks write permission. Reconnect Google once.' : `Google Task create failed (${res.status})`,
        };
    }
    const t = (await res.json());
    return { ok: true, task: { id: t.id, title: t.title, notes: t.notes, due: t.due, status: t.status } };
}
export async function createGoogleSheet(input) {
    const token = await getGoogleAccessToken(input.userId, input.req);
    if (!token)
        return { ok: false, error: 'Google is not connected.' };
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: { title: input.title } }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
        return {
            ok: false,
            error: res.status === 403 ? 'Missing Google Sheets permission. Reconnect Google once.' : `Sheets create failed (${res.status})`,
        };
    }
    const sheet = (await res.json());
    const initialValues = [
        ...(input.headers && input.headers.length > 0 ? [input.headers] : []),
        ...(input.rows || []),
    ];
    if (initialValues.length > 0) {
        await appendGoogleSheetRows({
            spreadsheetId: sheet.spreadsheetId,
            range: 'A1',
            rows: initialValues,
            userId: input.userId,
            req: input.req,
        });
    }
    return {
        ok: true,
        spreadsheetId: sheet.spreadsheetId,
        spreadsheetUrl: sheet.spreadsheetUrl,
        title: sheet.properties?.title || input.title,
    };
}
export async function readGoogleSheet(input) {
    const token = await getGoogleAccessToken(input.userId, input.req);
    if (!token)
        return { ok: false, values: [], error: 'Google is not connected.' };
    const range = encodeURIComponent(input.range || 'A1:Z50');
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${range}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok)
        return { ok: false, values: [], error: `Sheets read failed (${res.status})` };
    const json = (await res.json());
    return { ok: true, values: json.values || [] };
}
export async function appendGoogleSheetRows(input) {
    const token = await getGoogleAccessToken(input.userId, input.req);
    if (!token)
        return { ok: false, error: 'Google is not connected.' };
    const range = encodeURIComponent(input.range || 'A1');
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: input.rows }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
        return { ok: false, error: `Sheets append failed (${res.status})` };
    const json = (await res.json());
    return {
        ok: true,
        updatedRange: json.updates?.updatedRange,
        updatedRows: json.updates?.updatedRows,
    };
}
export async function updateGoogleSheetRange(input) {
    const token = await getGoogleAccessToken(input.userId, input.req);
    if (!token)
        return { ok: false, error: 'Google is not connected.' };
    const range = encodeURIComponent(input.range);
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: input.values }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
        return { ok: false, error: `Sheets update failed (${res.status})` };
    const json = (await res.json());
    return { ok: true, updatedCells: json.updatedCells };
}
export async function listGoogleContacts(query, userId, req) {
    const token = await getGoogleAccessToken(userId, req);
    if (!token)
        return { ok: false, contacts: [], needsReconnect: true, error: 'Google is not connected.' };
    const url = query?.trim()
        ? `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query.trim())}&readMask=names,emailAddresses,phoneNumbers&pageSize=30`
        : 'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=100&sortOrder=FIRST_NAME_ASCENDING';
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
        return {
            ok: false,
            contacts: [],
            needsReconnect: res.status === 401 || res.status === 403,
            error: res.status === 403
                ? 'Missing Google Contacts permission (People API). Reconnect Google once.'
                : `Google Contacts API error (${res.status})`,
        };
    }
    const json = (await res.json());
    let people = json.connections || (json.results || []).map((r) => r.person) || [];
    if (people.length === 0 && !query?.trim()) {
        const otherRes = await fetch('https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses,phoneNumbers&pageSize=100', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (otherRes?.ok) {
            const otherJson = (await otherRes.json().catch(() => ({})));
            people = otherJson.otherContacts || [];
        }
    }
    const contacts = people.map((p) => ({
        resourceName: p.resourceName || '',
        name: p.names?.[0]?.displayName || 'Unnamed',
        emails: (p.emailAddresses || []).map((e) => e.value).filter(Boolean),
        phones: (p.phoneNumbers || []).map((ph) => ph.value).filter(Boolean),
    }));
    return { ok: true, contacts };
}
export async function createGoogleContact(input) {
    const token = await getGoogleAccessToken(input.userId, input.req);
    if (!token)
        return { ok: false, error: 'Google is not connected.' };
    const res = await fetch('https://people.googleapis.com/v1/people:createContact', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            names: [{ givenName: input.givenName, familyName: input.familyName || '' }],
            ...(input.email ? { emailAddresses: [{ value: input.email }] } : {}),
            ...(input.phone ? { phoneNumbers: [{ value: input.phone }] } : {}),
        }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
        return {
            ok: false,
            error: res.status === 403 ? 'Missing Google Contacts write permission. Reconnect Google once.' : `Create contact failed (${res.status})`,
        };
    }
    const p = (await res.json());
    return {
        ok: true,
        contact: {
            resourceName: p.resourceName || '',
            name: p.names?.[0]?.displayName || input.givenName,
            emails: (p.emailAddresses || []).map((e) => e.value).filter(Boolean),
            phones: (p.phoneNumbers || []).map((ph) => ph.value).filter(Boolean),
        },
    };
}
