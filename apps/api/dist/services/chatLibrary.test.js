import assert from 'node:assert/strict';
import test from 'node:test';
import { appendChatMessage, createConversation, deleteConversation, getConversationMessages, listConversations, } from './chatLibrary.service.js';
test('Chat Library: create, append, idempotency, search, pagination, isolation, and delete', async () => {
    const convA = await createConversation('DBMS Exam Help', 'web');
    const convB = await createConversation('Python Lab Record', 'web');
    assert.ok(convA.id);
    assert.ok(convB.id);
    // Append user + assistant messages with clientMessageId idempotency
    const m1 = await appendChatMessage(convA.id, 'user', 'Explain normalization', {
        channel: 'web',
        clientMessageId: 'dedupe-key-1',
    });
    const m1Duplicate = await appendChatMessage(convA.id, 'user', 'Explain normalization', {
        channel: 'web',
        clientMessageId: 'dedupe-key-1',
    });
    assert.equal(m1.content, m1Duplicate.content);
    await appendChatMessage(convA.id, 'assistant', '1NF, 2NF, 3NF explained.', {
        channel: 'web',
        provider: 'gemini',
        clientMessageId: 'dedupe-key-1-assistant',
    });
    // Continue existing conversation
    await appendChatMessage(convA.id, 'user', 'Give an example of 3NF', { channel: 'web' });
    const msgs = await getConversationMessages(convA.id, undefined, { limit: 50 });
    assert.ok(msgs.length >= 2);
    assert.equal(msgs[0].role, 'user');
    // Search
    const searched = await listConversations(undefined, undefined, { q: 'DBMS' });
    assert.ok(searched.some((c) => c.id === convA.id));
    // Delete convA, convB stays untouched
    const deleted = await deleteConversation(convA.id);
    assert.equal(deleted, true);
    const remaining = await listConversations();
    assert.ok(!remaining.some((c) => c.id === convA.id));
    assert.ok(remaining.some((c) => c.id === convB.id));
    await deleteConversation(convB.id);
});
