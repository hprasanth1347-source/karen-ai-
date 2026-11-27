import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAssignmentPendingForReminder,
  detectClassroomAssignmentChanges,
} from '../../apps/api/dist/services/classroomReminderPolicy.js';

test('isAssignmentPendingForReminder skips submitted, excused, done, and excluded courses', () => {
  assert.equal(
    isAssignmentPendingForReminder({ id: '1', courseId: 'c1', title: 'Lab 1', submissionState: 'CREATED', category: 'pending' }),
    true
  );
  assert.equal(
    isAssignmentPendingForReminder({ id: '2', courseId: 'c1', title: 'Lab 2', submissionState: 'TURNED_IN', category: 'submitted' }),
    false
  );
  assert.equal(
    isAssignmentPendingForReminder({ id: '3', courseId: 'c1', title: 'Lab 3', submissionState: 'CREATED', excused: true, category: 'pending' }),
    false
  );
  assert.equal(
    isAssignmentPendingForReminder({ id: '4', courseId: 'c2', title: 'Lab 4', submissionState: 'CREATED', category: 'pending' }, ['c2']),
    false
  );
});

test('detectClassroomAssignmentChanges identifies new, deadline-changed, and newly-submitted cancellations', () => {
  const prev = [
    { id: 'a1', courseId: 'c1', title: 'HW 1', dueIso: '2026-11-28T10:00:00Z', submissionState: 'CREATED', category: 'pending' },
    { id: 'a2', courseId: 'c1', title: 'HW 2', dueIso: '2026-11-29T10:00:00Z', submissionState: 'CREATED', category: 'pending' },
  ];
  const curr = [
    { id: 'a1', courseId: 'c1', title: 'HW 1', dueIso: '2026-11-28T10:00:00Z', submissionState: 'TURNED_IN', category: 'submitted' },
    { id: 'a2', courseId: 'c1', title: 'HW 2', dueIso: '2026-12-01T10:00:00Z', submissionState: 'CREATED', category: 'pending' },
    { id: 'a3', courseId: 'c1', title: 'HW 3', dueIso: '2026-12-03T10:00:00Z', submissionState: 'NEW', category: 'new' },
  ];

  const diff = detectClassroomAssignmentChanges(prev, curr);
  assert.equal(diff.newAssignments.length, 1);
  assert.equal(diff.newAssignments[0].id, 'a3');
  assert.equal(diff.deadlineChanged.length, 1);
  assert.equal(diff.deadlineChanged[0].assignment.id, 'a2');
  assert.deepEqual(diff.cancelledAssignmentIds, ['a1']);
});
