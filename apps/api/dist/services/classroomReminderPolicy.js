export function isAssignmentPendingForReminder(a, excludedCourseIds = []) {
    if (excludedCourseIds.includes(a.courseId))
        return false;
    if (a.excused)
        return false;
    if (a.personalStatus === 'done')
        return false;
    if (a.submissionState === 'TURNED_IN' || a.submissionState === 'RETURNED')
        return false;
    if (a.category === 'submitted' || a.category === 'graded')
        return false;
    return true;
}
export function detectClassroomAssignmentChanges(previous, current, excludedCourseIds = []) {
    const prevMap = new Map(previous.map((a) => [a.id, a]));
    const newAssignments = [];
    const deadlineChanged = [];
    const cancelledAssignmentIds = [];
    for (const curr of current) {
        const prev = prevMap.get(curr.id);
        const pendingNow = isAssignmentPendingForReminder(curr, excludedCourseIds);
        if (!prev) {
            if (pendingNow)
                newAssignments.push(curr);
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
