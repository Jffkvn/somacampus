import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLessonContext, submitLesson } from '../modules/teaching/lessonService';

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, auth: { getUser: mockGetUser } },
}));

const ENTRY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

const entryRow = () => ({
  id: ENTRY_ID,
  timetable_id: 'tt-1',
  class_id: 'class-1',
  stream_id: null,
  subject_id: 'subj-math',
  teacher_id: 'teacher-1',
  room_name: 'Room 3',
  start_time: '08:00:00',
  end_time: '09:00:00',
  timetables: { is_active: true, school_id: 'school-1' },
  subjects: { id: 'subj-math', name: 'Mathematics' },
  classes: { id: 'class-1', name: 'Stage 5', stage_level: 'Stage 5' },
  streams: null,
  teacher: { id: 'teacher-1', people: { first_name: 'David', last_name: 'Musoke' } },
});

const latestLessonRow = () => ({
  curriculum_topic: 'Fractions',
  curriculum_objective: 'Add fractions with like denominators',
  visible_lesson_note: 'We covered halves and quarters.',
  submitted_at: '2026-09-02T10:00:00Z',
});

// Minimal thenable query-builder stub (copied from teacher-schedule-live.test.ts approach).
let tableResponses: Record<string, unknown> = {};
let insertedPayloads: Record<string, unknown> = {};
const builderFor = (table: string) => {
  const respond = () => {
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.lte = () => builder;
  builder.is = () => builder;
  builder.insert = (payload: unknown) => {
    insertedPayloads[table] = payload;
    return builder;
  };
  builder.single = () => respond();
  builder.maybeSingle = () => respond();
  builder.then = (resolve: any, reject: any) => respond().then(resolve, reject);
  return builder;
};

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  mockFrom.mockImplementation((table: string) => builderFor(table));
  mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
  insertedPayloads = {};
  tableResponses = {
    timetable_entries: { data: entryRow(), error: null },
    lessons: { data: [latestLessonRow()], error: null },
    teacher_reflections: { data: { id: 'refl-1' }, error: null },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('lesson context (Phase 2 Task 2)', () => {
  it('resolves entry fields (Mathematics, David Musoke)', async () => {
    const ctx = await getLessonContext(ENTRY_ID, '2026-09-03');
    expect(ctx.timetableEntryId).toBe(ENTRY_ID);
    expect(ctx.subjectName).toBe('Mathematics');
    expect(ctx.teacherName).toBe('David Musoke');
    expect(ctx.startTime).toBe('08:00');
    expect(ctx.endTime).toBe('09:00');
    expect(ctx.date).toBe('2026-09-03');
    expect(ctx.relevantResourcesCount).toBe(0);
  });

  it('previousLessonSummary is undefined when no prior lessons exist', async () => {
    tableResponses.lessons = { data: [], error: null };
    const ctx = await getLessonContext(ENTRY_ID, '2026-09-03');
    expect(ctx.previousLessonSummary).toBeUndefined();
    expect(ctx.curriculum.topic).toBe('Mathematics');
    expect(ctx.curriculum.objective).toBe('');
  });
});

describe('lesson submit (Phase 2 Task 2)', () => {
  it('inserts lessons row WITHOUT reflection text and writes teacher_reflections WITH the text', async () => {
    tableResponses.lessons = { data: { id: 'lesson-1' }, error: null };
    const sub = {
      lessonId: 'lesson-1',
      timetableEntryId: ENTRY_ID,
      status: 'completed' as const,
      whatWasTaught: 'Fractions intro',
      visibleLessonNote: 'Class went well.',
      privateReflection: 'I need to slow down next time.',
      submittedAt: '2026-09-03T10:00:00Z',
      submittedBy: 'teacher-1',
    };
    await submitLesson(sub, {
      schoolId: 'school-1',
      classId: 'class-1',
      subjectId: 'subj-math',
      teacherId: 'teacher-1',
    });

    const lessonPayload: any = insertedPayloads.lessons;
    expect(lessonPayload).toBeDefined();
    expect(JSON.stringify(lessonPayload)).not.toContain('I need to slow down');
    expect(JSON.stringify(lessonPayload)).not.toContain('privateReflection');
    expect(JSON.stringify(lessonPayload)).not.toContain('reflection_text');

    const reflectionPayload: any = insertedPayloads.teacher_reflections;
    expect(reflectionPayload).toBeDefined();
    expect(JSON.stringify(reflectionPayload)).toContain('I need to slow down');
  });

  it('still resolves when the reflection insert fails (warn path)', async () => {
    tableResponses.lessons = { data: { id: 'lesson-2' }, error: null };
    tableResponses.teacher_reflections = { data: null, error: { message: 'denied' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sub = {
      lessonId: 'lesson-2',
      timetableEntryId: ENTRY_ID,
      status: 'completed' as const,
      whatWasTaught: 'Fractions intro',
      visibleLessonNote: 'Class went well.',
      privateReflection: 'Private thought.',
      submittedAt: '2026-09-03T10:00:00Z',
      submittedBy: 'teacher-1',
    };
    await expect(
      submitLesson(sub, {
        schoolId: 'school-1',
        classId: 'class-1',
        subjectId: 'subj-math',
        teacherId: 'teacher-1',
      })
    ).resolves.toBeDefined();
    warn.mockRestore();
  });
});
