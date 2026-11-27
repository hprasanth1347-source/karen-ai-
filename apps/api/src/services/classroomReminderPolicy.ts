export interface TrackedClassroomAssignment {
  id: string;
  courseId: string;
  title: string;
  dueIso?: string | null;
  submissionState: string;
  excused?: boolean;
  category: string;
  personalStatus?: string;
}

export function isAssignmentPendingForReminder(
  a: TrackedClassroomAssignment,
  excludedCourseIds: string[] = []
): boolean {
  if (excludedCourseIds.includes(a.courseId)) return false;
  if (a.excused) return false;
  if (a.personalStatus === 'done') return false;
  if (a.submissionState === 'TURNED_IN' || a.submissionState === 'RETURNED') return false;
  if (a.category === 'submitted' || a.category === 'graded') return false;
  return true;
}

export function detectClassroomAssignmentChanges(
  previous: TrackedClassroomAssignment[],
  current: TrackedClassroomAssignment[],
  excludedCourseIds: string[] = []
): {
  newAssignments: TrackedClassroomAssignment[];
  deadlineChanged: Array<{ assignment: TrackedClassroomAssignment; previousDueIso?: string | null }>;
  cancelledAssignmentIds: string[];
} {
  const prevMap = new Map(previous.map((a) => [a.id, a]));
  const newAssignments: TrackedClassroomAssignment[] = [];
  const deadlineChanged: Array<{ assignment: TrackedClassroomAssignment; previousDueIso?: string | null }> = [];
  const cancelledAssignmentIds: string[] = [];

  for (const curr of current) {
    const prev = prevMap.get(curr.id);
    const pendingNow = isAssignmentPendingForReminder(curr, excludedCourseIds);

    if (!prev) {
      if (pendingNow) newAssignments.push(curr);
      continue;
    }

    const wasPending = isAssignmentPendingForReminder(prev, excludedCourseIds);
    if (wasPending && !pendingNow) {
      cancelledAssignmentIds.push(curr.id);
      continue;
    }

    if (pendingNow && (prev.dueIso || null) !== (curr.dueIso || null)) {
      deadlineChanged.push({ assignment: curr, previousDueIso: prev.dueIso });
    }
  }

  return { newAssignments, deadlineChanged, cancelledAssignmentIds };
}
