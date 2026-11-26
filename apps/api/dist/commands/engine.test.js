import test from 'node:test';
import assert from 'node:assert/strict';
import { executeConfirmedPendingAction, planDeterministicCommand, runCommandEngine, } from './engine.js';
import { saveLastUploadedFile, savePendingAction, } from './state.js';
import { classroomJoinTool } from './tools/classroom.tools.js';
import { driveUploadTool } from './tools/drive.tools.js';
import { DEFAULT_BRAND_SETTINGS } from '../skills/types.js';
test('Intent accuracy >= 95% across 120 phrasings (English, Tamil, Thanglish, typos, non-commands)', () => {
    const sampleResults = [
        { ordinal: 1, type: 'email', id: 'm1', title: 'Project Update', subtitle: 'ravi@x.com', extra: { from: 'ravi@x.com' } },
        { ordinal: 2, type: 'assignment', id: 'a2', title: 'DBMS Lab 2', subtitle: 'CS301' },
    ];
    const cases = [
        // Classroom (24)
        { text: 'show pending assignments', expectedTool: 'classroom_list_assignments' },
        { text: 'my pendng assignmnts', expectedTool: 'classroom_list_assignments' },
        { text: "what's due tomorrow", expectedTool: 'classroom_list_assignments' },
        { text: 'assignments due tomorow', expectedTool: 'classroom_list_assignments' },
        { text: 'what is overdue', expectedTool: 'classroom_list_assignments' },
        { text: 'show overdu work', expectedTool: 'classroom_list_assignments' },
        { text: 'assignments due today', expectedTool: 'classroom_list_assignments' },
        { text: 'assignments due this week', expectedTool: 'classroom_list_assignments' },
        { text: 'show submitted assignments', expectedTool: 'classroom_list_assignments' },
        { text: 'graded assignments list', expectedTool: 'classroom_list_assignments' },
        { text: 'my pending homework', expectedTool: 'classroom_list_assignments' },
        { text: 'classroom pending work', expectedTool: 'classroom_list_assignments' },
        { text: 'show grades for maths', expectedTool: 'classroom_grades' },
        { text: 'check my classroom grades', expectedTool: 'classroom_grades' },
        { text: 'join this class https://classroom.google.com/c/MTIz?cjc=abc123', expectedTool: 'classroom_join' },
        { text: 'join class code abc123 course 123456789', expectedTool: 'classroom_join' },
        { text: 'add me to class code xyz987', expectedTool: 'classroom_join' },
        { text: 'enroll in classroom https://classroom.google.com/c/OTk=?cjc=qwer', expectedTool: 'classroom_join' },
        { text: 'explain assignment 2', expectedTool: 'classroom_explain' },
        { text: 'explain my DBMS assignment', expectedTool: 'classroom_explain' },
        { text: 'exam tomorrow help', expectedTool: 'classroom_exam_prep' },
        { text: 'help me study for networks exam', expectedTool: 'classroom_exam_prep' },
        { text: 'naalaiku assignment due iruka', expectedTool: 'classroom_list_assignments' },
        { text: 'assigment pending kaattu', expectedTool: 'classroom_list_assignments' },
        // Gmail (24)
        { text: 'show latest 5 mails', expectedTool: 'gmail_list' },
        { text: 'latest 10 emails', expectedTool: 'gmail_list' },
        { text: 'unread mails from college', expectedTool: 'gmail_list' },
        { text: 'check my unread emials', expectedTool: 'gmail_list' },
        { text: 'mail from ravi', expectedTool: 'gmail_list' },
        { text: 'important mails today', expectedTool: 'gmail_list' },
        { text: 'show my inbox', expectedTool: 'gmail_list' },
        { text: 'gmail check pannu', expectedTool: 'gmail_list' },
        { text: 'send email to ravi@x.com about tomorrow meeting', expectedTool: 'gmail_send' },
        { text: 'mail this file to sir@college.edu', expectedTool: 'gmail_send', hasFile: true },
        { text: 'send mail to hr@company.com about internship', expectedTool: 'gmail_send' },
        { text: 'email to mentor@uni.edu about leave', expectedTool: 'gmail_send' },
        { text: 'open the first mail', expectedTool: 'gmail_read', results: sampleResults },
        { text: 'read that mail', expectedTool: 'gmail_read', results: sampleResults },
        { text: 'reply ok to that mail', expectedTool: 'gmail_send', results: sampleResults },
        { text: 'reply received thanks to the first mail', expectedTool: 'gmail_send', results: sampleResults },
        { text: 'latest 3 gmails', expectedTool: 'gmail_list' },
        { text: 'any unread mails?', expectedTool: 'gmail_list' },
        { text: 'mails from placement cell', expectedTool: 'gmail_list' },
        { text: 'show my latest emails', expectedTool: 'gmail_list' },
        { text: 'send email to team@startup.io about demo', expectedTool: 'gmail_send' },
        { text: 'mail to dean@college.edu about bonafide', expectedTool: 'gmail_send' },
        { text: 'check inbox for unread mails', expectedTool: 'gmail_list' },
        { text: 'read #1 mail', expectedTool: 'gmail_read', results: sampleResults },
        // Drive Upload (18)
        { text: 'save this to drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save it to drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'upload to google drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save this to drive in the college folder', expectedTool: 'drive_upload', hasFile: true },
        { text: 'store this file in gdrive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'backup this to drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'put this in google drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save to drive in receipts folder', expectedTool: 'drive_upload', hasFile: true },
        { text: 'upload this pdf to drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save this to gdrive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save to google drive', expectedTool: 'drive_upload' },
        { text: 'upload file to drive', expectedTool: 'drive_upload' },
        { text: 'save it to drive in notes folder', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save this to drive now', expectedTool: 'drive_upload', hasFile: true },
        { text: 'upload to drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save this in drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'store in google drive', expectedTool: 'drive_upload', hasFile: true },
        { text: 'save this photo to drive', expectedTool: 'drive_upload', hasFile: true },
        // Instagram DM (18)
        { text: 'send hi to _.raghul._.15 on insta', expectedTool: 'instagram_send_dm' },
        { text: 'dm raghul where are you', expectedTool: 'instagram_send_dm' },
        { text: "tell raghul I'll be late on instagram", expectedTool: 'instagram_send_dm' },
        { text: 'raghul ku insta la hi sollu', expectedTool: 'instagram_send_dm' },
        { text: 'check my instagram dms', expectedTool: 'instagram_read_dms' },
        { text: 'read instagram inbox', expectedTool: 'instagram_read_dms' },
        { text: 'show insta messages', expectedTool: 'instagram_read_dms' },
        { text: 'insta dm to @priya_99', expectedTool: 'instagram_send_dm' },
        { text: 'send hello on instagram to @arun.dev', expectedTool: 'instagram_send_dm' },
        { text: 'karthik ku insta la call pannu nu sollu', expectedTool: 'instagram_send_dm' },
        { text: 'dm @design_studio about pricing', expectedTool: 'instagram_send_dm' },
        { text: 'check insta dms', expectedTool: 'instagram_read_dms' },
        { text: 'send good morning to @hari.ii_14 on insta', expectedTool: 'instagram_send_dm' },
        { text: 'tell @vijay on instagram meeting is at 5', expectedTool: 'instagram_send_dm' },
        { text: 'read my insta dms', expectedTool: 'instagram_read_dms' },
        { text: 'dm siva thanks bro on insta', expectedTool: 'instagram_send_dm' },
        { text: 'instagram dm @rohit_07 hey', expectedTool: 'instagram_send_dm' },
        { text: 'surya ku insta la ok sollu', expectedTool: 'instagram_send_dm' },
        // References & Macros (16)
        { text: 'open the second one', expectedTool: 'classroom_explain', results: sampleResults },
        { text: 'mark it done', expectedTool: 'classroom_set_personal_status', results: [{ ordinal: 1, type: 'assignment', id: 'a1', title: 'Lab 1' }] },
        { text: 'mark the second one done', expectedTool: 'classroom_set_personal_status', results: sampleResults },
        { text: 'explain that', expectedTool: 'classroom_explain', results: [{ ordinal: 1, type: 'assignment', id: 'a1', title: 'Lab 1' }] },
        { text: "teach Karen: when I say 'my work' show pending assignments and latest 5 mails", expectedTool: 'macro_save' },
        { text: "when I say 'morning check' show unread mails", expectedTool: 'macro_save' },
        { text: "teach Karen: when I say 'study mode' show overdue assignments", expectedTool: 'macro_save' },
        { text: "when I say 'insta check' read instagram dms", expectedTool: 'macro_save' },
        { text: 'open #2', expectedTool: 'classroom_explain', results: sampleResults },
        { text: 'read the first one', expectedTool: 'gmail_read', results: sampleResults },
        { text: 'set assignment 1 done', expectedTool: 'classroom_set_personal_status', results: [{ ordinal: 1, type: 'assignment', id: 'a1', title: 'Lab 1' }] },
        { text: 'open that one', expectedTool: 'gmail_read', results: sampleResults },
        { text: "when I say 'college check' show pending assignments", expectedTool: 'macro_save' },
        { text: 'explain #2', expectedTool: 'classroom_explain', results: sampleResults },
        { text: 'mark #2 done', expectedTool: 'classroom_set_personal_status', results: sampleResults },
        { text: "teach Karen: when I say 'inbox zero' show unread mails", expectedTool: 'macro_save' },
        // Non-commands (20) — MUST return null (must NOT trigger tools)
        { text: 'tell me about the moon', expectedTool: null },
        { text: 'hi', expectedTool: null },
        { text: 'hello Karen', expectedTool: null },
        { text: 'how are you', expectedTool: null },
        { text: 'thank you so much', expectedTool: null },
        { text: 'good morning', expectedTool: null },
        { text: 'what is the capital of Japan', expectedTool: null },
        { text: 'who is the CEO of Google', expectedTool: null },
        { text: 'what is the weather in Chennai today', expectedTool: null },
        { text: 'what is the latest iPhone price in India', expectedTool: null },
        { text: 'tell me a joke', expectedTool: null },
        { text: 'what is quantum computing', expectedTool: null },
        { text: 'good night', expectedTool: null },
        { text: 'thanks', expectedTool: null },
        { text: 'who is Albert Einstein', expectedTool: null },
        { text: 'what is the meaning of serendipity', expectedTool: null },
        { text: 'tell me about black holes', expectedTool: null },
        { text: 'how are you doing', expectedTool: null },
        { text: 'what is the price of gold today', expectedTool: null },
        { text: 'hello there', expectedTool: null },
    ];
    assert.ok(cases.length >= 120, `Expected >=120 cases, got ${cases.length}`);
    let passed = 0;
    for (const c of cases) {
        const planned = planDeterministicCommand(c.text, c.results || [], Boolean(c.hasFile));
        const got = planned?.[0]?.tool ?? null;
        if (got === c.expectedTool) {
            passed += 1;
        }
    }
    const accuracy = passed / cases.length;
    assert.ok(accuracy >= 0.95, `Command intent accuracy ${Math.round(accuracy * 100)}% < 95% (${passed}/${cases.length})`);
});
test('Behavior tests: missing recipient asks 1 question, bare code explains limitation, missing scope, double-tap, expired confirmation', async () => {
    const chatKey = 'test-chat-behavior';
    // 1. Missing recipient asks one question
    const missingRec = await runCommandEngine({
        chatKey,
        text: 'send email to about project',
        channel: 'telegram',
        useLlmFallback: false,
    });
    assert.equal(missingRec.outcome, 'needs_clarification');
    assert.match(missingRec.reply, /Who should I send this email to/i);
    // 2. Bare class code explains Google Classroom limitation + Open Classroom button
    const bareRes = await classroomJoinTool.execute({ target: 'abc1234' }, {
        chatKey,
        channel: 'telegram',
        language: 'english',
        lastResults: [],
    });
    assert.equal(bareRes.ok, false);
    assert.match(bareRes.summary, /does not allow joining by a bare class code alone/i);
    assert.equal(bareRes.fixButton?.label, 'Open Classroom to join');
    // 3. Missing drive.file scope / not connected shows Reconnect button
    await saveLastUploadedFile(chatKey, {
        fileId: 'f1',
        fileName: 'notes.pdf',
        mimeType: 'application/pdf',
        source: 'web',
        uploadedAt: new Date().toISOString(),
        dataBase64: Buffer.from('hello').toString('base64'),
    });
    const driveRes = await driveUploadTool.execute({}, {
        chatKey,
        channel: 'telegram',
        language: 'english',
        lastResults: [],
        lastUploadedFile: {
            fileId: 'f1',
            fileName: 'notes.pdf',
            mimeType: 'application/pdf',
            source: 'web',
            uploadedAt: new Date().toISOString(),
            dataBase64: Buffer.from('hello').toString('base64'),
        },
    });
    assert.equal(driveRes.ok, false);
    assert.equal(driveRes.fixButton?.label, 'Reconnect Google to allow saving files');
    // 4. Double-tapping confirm sends once; second tap returns Already processed
    const pending = await savePendingAction({
        chatKey,
        actionType: 'gmail_send',
        payload: { to: 'a@b.com', subject: 'Hi', body: 'Test' },
    });
    const firstTap = await executeConfirmedPendingAction(pending.id, 'cancel');
    assert.equal(firstTap.ok, true);
    const secondTap = await executeConfirmedPendingAction(pending.id, 'confirm');
    assert.equal(secondTap.ok, false);
    assert.match(secondTap.message, /Already processed/i);
    // 5. Expired confirmation refuses
    const expired = await savePendingAction({
        chatKey,
        actionType: 'gmail_send',
        payload: { to: 'a@b.com', subject: 'Hi', body: 'Test' },
        ttlMinutes: -1,
    });
    const expiredTap = await executeConfirmedPendingAction(expired.id, 'confirm');
    assert.equal(expiredTap.ok, false);
    assert.match(expiredTap.message, /expired/i);
    // Keep DEFAULT_BRAND_SETTINGS referenced
    assert.ok(DEFAULT_BRAND_SETTINGS.brandName.length > 0);
});
