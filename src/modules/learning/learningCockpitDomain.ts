/**
 * Digital Learning Spine M6 — pure cockpit domain (deterministic).
 *
 * Student Today buckets: Today · Learning · Due · Overdue · Feedback · Progress · Next
 * Teacher foundation: marking queue + at-risk signals (no AI scoring).
 *
 * Charter: docs/plans/2026-09-22-digital-learning-spine.md §15 P0 7–8
 */

export type WorkBucket = 'today' | 'due' | 'overdue' | 'upcoming' | 'submitted' | 'reviewed';

export interface CockpitWorkItem {
  id: string;
  source: 'activity' | 'assignment';
  title: string;
  subject?: string | null;
  dueDate?: string | null;
  assignedDate?: string | null;
  state: string;
  activityType?: string | null;
  hasSubmission: boolean;
  hasResult: boolean;
  score?: number | null;
  maxScore?: number | null;
  feedback?: string | null;
  bucket: WorkBucket;
}

export interface StudentLearningProgress {
  total: number;
  due: number;
  overdue: number;
  submitted: number;
  reviewed: number;
  withFeedback: number;
  completionPct: number;
}

export interface StudentLearningCockpit {
  today: CockpitWorkItem[];
  learning: CockpitWorkItem[];
  due: CockpitWorkItem[];
  overdue: CockpitWorkItem[];
  feedback: Array<{
    workId: string;
    title: string;
    text: string;
    score?: number | null;
    maxScore?: number | null;
    markedAt?: string | null;
  }>;
  progress: StudentLearningProgress;
  next: CockpitWorkItem | null;
}

export interface MarkingQueueItem {
  submissionId: string;
  studentId: string;
  studentName?: string | null;
  assignmentId: string | null;
  learningActivityId: string | null;
  title: string;
  state: string;
  attempt: number;
  submittedAt: string | null;
  late: boolean;
  photoCount: number;
  waitedDays: number;
}

export interface AtRiskStudent {
  studentId: string;
  studentName?: string | null;
  overdueCount: number;
  lateCount: number;
  missingCount: number;
  unmarkedCount: number;
  riskReasons: string[];
}

export interface TeacherLearningCockpit {
  markingQueue: MarkingQueueItem[];
  atRisk: AtRiskStudent[];
  stats: {
    toMark: number;
    overdueMissing: number;
    atRiskStudents: number;
  };
}

export interface WorkSeed {
  id: string;
  source: 'activity' | 'assignment';
  title: string;
  subject?: string | null;
  dueDate?: string | null;
  assignedDate?: string | null;
  activityType?: string | null;
  isPublished?: boolean;
  submissionState?: string | null;
  hasResult?: boolean;
  score?: number | null;
  maxScore?: number | null;
  feedback?: string | null;
  markedAt?: string | null;
}

const REVIEWED_STATES = new Set(['reviewed']);
const IN_FLIGHT_STATES = new Set(['submitted', 'late', 'resubmitted', 'revision_requested']);

function toDateOnly(iso?: string | null): string | null {
  if (!iso) return null;
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function dayDiff(fromDateOnly: string, toMs: number): number {
  const from = new Date(`${fromDateOnly}T00:00:00Z`).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.floor((toMs - from) / 86_400_000);
}

function isSameDay(dateOnly: string | null, todayOnly: string): boolean {
  return dateOnly === todayOnly;
}

/**
 * Bucket one work seed. Rules (LOCKED Progress ≠ completion):
 * - overdue: dueDate < today AND no reviewed/submitted work
 * - today: dueDate == today OR assignedDate == today (and not already overdue)
 * - due: dueDate within the next 7 days
 * - submitted / reviewed: based on submission/result state
 * - upcoming: later work without a nearer signal
 */
export function classifyWorkItem(seed: WorkSeed, todayOnly: string): CockpitWorkItem {
  const due = toDateOnly(seed.dueDate);
  const assigned = toDateOnly(seed.assignedDate);
  const hasSubmission = Boolean(seed.submissionState) && seed.submissionState !== 'missing' && seed.submissionState !== 'draft';
  const hasResult = Boolean(seed.hasResult);
  const state = seed.submissionState ?? (seed.isPublished === false ? 'draft' : 'assigned');

  let bucket: WorkBucket = 'upcoming';
  if (hasResult || REVIEWED_STATES.has(String(seed.submissionState))) {
    bucket = 'reviewed';
  } else if (hasSubmission || IN_FLIGHT_STATES.has(String(seed.submissionState))) {
    bucket = 'submitted';
  } else if (due && due < todayOnly) {
    bucket = 'overdue';
  } else if (due && due === todayOnly) {
    bucket = 'today';
  } else if (isSameDay(assigned, todayOnly)) {
    bucket = 'today';
  } else if (due && dayDiff(due, Date.parse(`${todayOnly}T00:00:00Z`)) >= -7 && due > todayOnly) {
    // next 7 days
    bucket = 'due';
  }

  return {
    id: seed.id,
    source: seed.source,
    title: seed.title,
    subject: seed.subject ?? null,
    dueDate: due,
    assignedDate: assigned,
    state,
    activityType: seed.activityType ?? null,
    hasSubmission,
    hasResult,
    score: seed.score ?? null,
    maxScore: seed.maxScore ?? null,
    feedback: seed.feedback ?? null,
    bucket,
  };
}

export function buildStudentCockpit(seeds: WorkSeed[], todayOnly: string): StudentLearningCockpit {
  const items = seeds
    .map((s) => classifyWorkItem(s, todayOnly))
    .sort((a, b) => {
      const ad = a.dueDate ?? '9999-12-31';
      const bd = b.dueDate ?? '9999-12-31';
      return ad < bd ? -1 : ad > bd ? 1 : a.title.localeCompare(b.title);
    });

  const today = items.filter((i) => i.bucket === 'today');
  const due = items.filter((i) => i.bucket === 'due' || i.bucket === 'today');
  const overdue = items.filter((i) => i.bucket === 'overdue');
  const feedback = items
    .filter((i) => i.feedback && i.feedback.trim().length > 0)
    .map((i) => ({
      workId: i.id,
      title: i.title,
      text: i.feedback!.trim(),
      score: i.score ?? null,
      maxScore: i.maxScore ?? null,
      markedAt: null as string | null,
    }));

  const submitted = items.filter((i) => i.bucket === 'submitted' || i.bucket === 'reviewed').length;
  const reviewed = items.filter((i) => i.bucket === 'reviewed').length;
  const total = items.length;
  const progress: StudentLearningProgress = {
    total,
    due: due.length,
    overdue: overdue.length,
    submitted,
    reviewed,
    withFeedback: feedback.length,
    completionPct: total === 0 ? 0 : Math.round((reviewed / total) * 100),
  };

  // Next = earliest open work (today → due → overdue first to clear → upcoming)
  const openPriority: WorkBucket[] = ['today', 'due', 'overdue', 'upcoming'];
  let next: CockpitWorkItem | null = null;
  for (const b of openPriority) {
    const hit = items.find((i) => i.bucket === b);
    if (hit) {
      next = hit;
      break;
    }
  }

  return {
    today,
    learning: items,
    due,
    overdue,
    feedback,
    progress,
    next,
  };
}

export interface MarkingSeed {
  submissionId: string;
  studentId: string;
  studentName?: string | null;
  assignmentId: string | null;
  learningActivityId: string | null;
  title: string;
  state: string;
  attempt: number;
  submittedAt: string | null;
  late: boolean;
  photoCount: number;
}

export interface RiskSeed {
  studentId: string;
  studentName?: string | null;
  overdueCount: number;
  lateCount: number;
  missingCount: number;
  unmarkedCount: number;
}

export function buildMarkingQueue(seeds: MarkingSeed[], nowMs: number = Date.now()): MarkingQueueItem[] {
  return seeds
    .filter((s) => IN_FLIGHT_STATES.has(s.state) || s.state === 'submitted')
    .map((s) => {
      const waitedDays = s.submittedAt
        ? Math.max(0, Math.floor((nowMs - new Date(s.submittedAt).getTime()) / 86_400_000))
        : 0;
      return {
        submissionId: s.submissionId,
        studentId: s.studentId,
        studentName: s.studentName ?? null,
        assignmentId: s.assignmentId,
        learningActivityId: s.learningActivityId,
        title: s.title,
        state: s.state,
        attempt: s.attempt,
        submittedAt: s.submittedAt,
        late: s.late,
        photoCount: s.photoCount,
        waitedDays,
      };
    })
    .sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      if (b.waitedDays !== a.waitedDays) return b.waitedDays - a.waitedDays;
      return (a.submittedAt ?? '') < (b.submittedAt ?? '') ? -1 : 1;
    });
}

/**
 * Deterministic at-risk foundation. Thresholds are explicit and boring:
 * - risk if overdueCount >= 2 OR missingCount >= 2 OR (lateCount + overdueCount) >= 3
 * - unmarked work ages into risk after 3 days of teacher delay (unmarkedCount >= 1 and queue wait)
 * No AI. No grade inference. Progress ≠ completion.
 */
export function buildAtRisk(
  seeds: RiskSeed[],
  opts: { overdueRisk?: number; missingRisk?: number; mixedRisk?: number } = {},
): AtRiskStudent[] {
  const overdueRisk = opts.overdueRisk ?? 2;
  const missingRisk = opts.missingRisk ?? 2;
  const mixedRisk = opts.mixedRisk ?? 3;

  return seeds
    .map((s) => {
      const riskReasons: string[] = [];
      if (s.overdueCount >= overdueRisk) riskReasons.push(`${s.overdueCount} overdue pieces`);
      if (s.missingCount >= missingRisk) riskReasons.push(`${s.missingCount} missing pieces`);
      if (s.lateCount + s.overdueCount >= mixedRisk) {
        riskReasons.push(`${s.lateCount + s.overdueCount} late/overdue pieces`);
      }
      return {
        studentId: s.studentId,
        studentName: s.studentName ?? null,
        overdueCount: s.overdueCount,
        lateCount: s.lateCount,
        missingCount: s.missingCount,
        unmarkedCount: s.unmarkedCount,
        riskReasons,
      };
    })
    .filter((s) => s.riskReasons.length > 0)
    .sort((a, b) => {
      const score = (x: AtRiskStudent) => x.overdueCount * 3 + x.missingCount * 2 + x.lateCount;
      return score(b) - score(a);
    });
}

export function buildTeacherCockpit(
  marking: MarkingSeed[],
  risks: RiskSeed[],
  nowMs: number = Date.now(),
): TeacherLearningCockpit {
  const markingQueue = buildMarkingQueue(marking, nowMs);
  const atRisk = buildAtRisk(risks);
  const overdueMissing = risks.reduce((sum, r) => sum + r.overdueCount + r.missingCount, 0);
  return {
    markingQueue,
    atRisk,
    stats: {
      toMark: markingQueue.length,
      overdueMissing,
      atRiskStudents: atRisk.length,
    },
  };
}
