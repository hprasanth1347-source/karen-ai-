import test from 'node:test';
import assert from 'node:assert/strict';
import { appendGoogleSheetRows, createCalendarEvent, createGoogleSheet, createGoogleTask, listCalendarEvents, listGoogleTasks, readGoogleSheet, } from './googleWorkspace.service.js';
import { saveGoogleTokensToDb } from './persistence.service.js';
import { planDeterministicCommand } from '../commands/engine.js';
test('Command Engine routes Calendar, Google Tasks, Google Sheets, and Memory commands', () => {
    assert.equal(planDeterministicCommand('show my calendar', [], false)?.[0]?.tool, 'calendar_list_events');
    assert.equal(planDeterministicCommand('schedule meeting tomorrow', [], false)?.[0]?.tool, 'calendar_create_event');
    assert.equal(planDeterministicCommand('show my google tasks', [], false)?.[0]?.tool, 'google_tasks_list');
    assert.equal(planDeterministicCommand('add google task submit lab', [], false)?.[0]?.tool, 'google_tasks_create');
    assert.equal(planDeterministicCommand('create a google sheet named Expenses with columns Item, Amount', [], false)?.[0]?.tool, 'sheets_create');
    assert.equal(planDeterministicCommand('edit google sheet 1AbCdEfGhIjKlMnOpQrStUvWxYz123456 with Coffee, 120', [], false)?.[0]?.tool, 'sheets_edit');
    assert.equal(planDeterministicCommand('show my memories', [], false)?.[0]?.tool, 'memory_list');
});
test('Google Calendar, Tasks, and Sheets API calls work with mocked Google endpoints', async () => {
    await saveGoogleTokensToDb({
        accessToken: 'mock-workspace-token',
        refreshToken: 'mock-refresh',
        expiresAt: Date.now() + 3600_000,
    });
    const origFetch = globalThis.fetch;
    try {
        // 1. Calendar list & create
        globalThis.fetch = (async (url, init) => {
            const u = String(url);
            if (u.includes('calendar/v3') && init?.method === 'POST') {
                return new Response(JSON.stringify({ id: 'ev1', summary: 'Standup', start: { dateTime: '2026-11-27T10:00:00Z' } }), { status: 200 });
            }
            if (u.includes('calendar/v3')) {
                return new Response(JSON.stringify({ items: [{ id: 'ev1', summary: 'Standup', start: { dateTime: '2026-11-27T10:00:00Z' } }] }), { status: 200 });
            }
            if (u.includes('tasks.googleapis.com') && init?.method === 'POST') {
                return new Response(JSON.stringify({ id: 'gt1', title: 'Buy milk', status: 'needsAction' }), { status: 200 });
            }
            if (u.includes('tasks.googleapis.com')) {
                return new Response(JSON.stringify({ items: [{ id: 'gt1', title: 'Buy milk', status: 'needsAction' }] }), { status: 200 });
            }
            if (u.includes('sheets.googleapis.com') && u.endsWith('/spreadsheets')) {
                return new Response(JSON.stringify({ spreadsheetId: 'sheet123', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet123', properties: { title: 'Expenses' } }), { status: 200 });
            }
            if (u.includes('sheets.googleapis.com') && u.includes(':append')) {
                return new Response(JSON.stringify({ updates: { updatedRange: 'Sheet1!A1:B2', updatedRows: 2 } }), { status: 200 });
            }
            if (u.includes('sheets.googleapis.com')) {
                return new Response(JSON.stringify({ values: [['Item', 'Amount'], ['Coffee', '120']] }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        });
        const calList = await listCalendarEvents(7);
        assert.equal(calList.ok, true);
        assert.equal(calList.events[0].summary, 'Standup');
        const calAdd = await createCalendarEvent({ summary: 'Standup', startIso: '2026-11-27T10:00:00Z' });
        assert.equal(calAdd.ok, true);
        const tList = await listGoogleTasks();
        assert.equal(tList.ok, true);
        assert.equal(tList.tasks[0].title, 'Buy milk');
        const tAdd = await createGoogleTask({ title: 'Buy milk' });
        assert.equal(tAdd.ok, true);
        const sCreate = await createGoogleSheet({ title: 'Expenses', headers: ['Item', 'Amount'], rows: [['Coffee', 120]] });
        assert.equal(sCreate.ok, true);
        assert.equal(sCreate.spreadsheetId, 'sheet123');
        const sAppend = await appendGoogleSheetRows({ spreadsheetId: 'sheet123', rows: [['Tea', 40]] });
        assert.equal(sAppend.ok, true);
        const sRead = await readGoogleSheet({ spreadsheetId: 'sheet123' });
        assert.equal(sRead.ok, true);
        assert.equal(sRead.values.length, 2);
    }
    finally {
        globalThis.fetch = origFetch;
    }
});
import { createGoogleContact, listGoogleContacts } from './googleWorkspace.service.js';
test('Google Contacts (People API) list and create work with mocked responses', async () => {
    await saveGoogleTokensToDb({
        accessToken: 'mock-contacts-token',
        refreshToken: 'mock-refresh',
        expiresAt: Date.now() + 3600_000,
    });
    const origFetch = globalThis.fetch;
    try {
        globalThis.fetch = (async (url, init) => {
            const u = String(url);
            if (u.includes('people.googleapis.com') && init?.method === 'POST') {
                return new Response(JSON.stringify({ resourceName: 'people/c1', names: [{ displayName: 'Raghul' }], emailAddresses: [{ value: 'raghul@x.com' }] }), { status: 200 });
            }
            if (u.includes('people.googleapis.com')) {
                return new Response(JSON.stringify({ connections: [{ resourceName: 'people/c1', names: [{ displayName: 'Raghul' }], emailAddresses: [{ value: 'raghul@x.com' }], phoneNumbers: [{ value: '+919876543210' }] }] }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        });
        const listRes = await listGoogleContacts();
        assert.equal(listRes.ok, true);
        assert.equal(listRes.contacts[0].name, 'Raghul');
        assert.equal(listRes.contacts[0].emails[0], 'raghul@x.com');
        const addRes = await createGoogleContact({ givenName: 'Raghul', email: 'raghul@x.com' });
        assert.equal(addRes.ok, true);
        assert.equal(addRes.contact?.name, 'Raghul');
    }
    finally {
        globalThis.fetch = origFetch;
    }
});
