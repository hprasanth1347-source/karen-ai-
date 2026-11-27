import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendContactTurnAndMemories,
  deleteContactData,
  getContactCompanionProfile,
  setContactBlocked,
} from '../../apps/api/dist/services/instagramCompanion.service.js';

test('Instagram companion isolates memory per (accountId, senderId) and excludes sensitive facts', () => {
  appendContactTurnAndMemories('acc1', 'user-1', 'arun', 'I love filter coffee', 'Nice!', [
    { key: 'drink', value: 'filter coffee', sensitivity: 'normal' },
    { key: 'otp', value: '123456', sensitivity: 'sensitive' },
  ]);
  appendContactTurnAndMemories('acc1', 'user-2', 'priya', 'Exam tomorrow', 'All the best!', [
    { key: 'exam', value: 'DBMS', sensitivity: 'normal' },
  ]);

  const p1 = getContactCompanionProfile('acc1', 'user-1');
  const p2 = getContactCompanionProfile('acc1', 'user-2');

  assert.equal(p1.memories.length, 1);
  assert.equal(p1.memories[0].key, 'drink');
  assert.equal(p2.memories.length, 1);
  assert.equal(p2.memories[0].key, 'exam');

  setContactBlocked('acc1', 'user-1', true);
  assert.equal(getContactCompanionProfile('acc1', 'user-1').blocked, true);
  assert.equal(getContactCompanionProfile('acc1', 'user-2').blocked, false);

  assert.equal(deleteContactData('acc1', 'user-1'), true);
  assert.equal(getContactCompanionProfile('acc1', 'user-1').memories.length, 0);
});
