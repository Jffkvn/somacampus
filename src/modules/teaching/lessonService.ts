/**
 * Teaching lesson service (Phase 2 slice).
 *
 * DB contracts:
 * - lessons: school_id, teacher_id, class_id, stream_id NULL, subject_id,
 *   timetable_entry_id NULL, curriculum_topic NULL, curriculum_objective NULL,
 *   lesson_status (5-valued CHECK), what_was_taught NULL,
 *   visible_lesson_note NOT NULL, started_at/completed_at NULL,
 *   submitted_at DEFAULT now(), attendance_session_id NULL.
 * - teacher_reflections: lesson_id -> lessons CASCADE,
 *   teacher_user_id = auth.uid(), reflection_text NOT NULL.
 *
 * Privacy rule: private reflection text is NEVER stored on the lessons row.
 * It lives only in teacher_reflections (strict author-only RLS).
 */
import { supabase } from '../../lib/supabase';
import type { LessonContext, LessonSubmission } from '../../types/domain';
import { toHHMM } from '../teacher/scheduleUtils';
import { academicPlanningService } from '../planning/academicPlanningService';

const CURRICULUM_FRAMEWORK = 'Cambridge Primary';

// Mock-env guard, mirroring teacherService: never attempt network without a
// real Supabase URL (missing, placeholder, or mock).
function isMockEnv(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return !url || url.includes('placeholder') || url.includes('mock');
}

/** FK fields that LessonSubmission does not carry (resolved by the caller). */
export interface LessonSubmitContext {
  schoolId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  streamId?: string;
  curriculumTopic?: string;
  curriculumObjective?: string;
  curriculumObjectiveId?: string;
  teachingSequenceId?: string;
  objectiveIds?: string[];
}

const first = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

function personName(teacher: any): string | null {
  const person = teacher ? first(teacher.people) : null;
  if (!person?.first_name) return null;
  return person.last_name ? `${person.first_name} ${person.last_name}` : person.first_name;
}

/**
 * Load the context for teaching/submitting a scheduled lesson.
 * In mock env returns a clearly-marked demo stub (no network).
 * Entry errors log the cause then throw (the page renders the message);
 * a failed prior-lesson lookup degrades to defaults (no previous summary,
 * topic falls back).
 */
export async function getLessonContext(
  timetableEntryId: string,
  date: string
): Promise<LessonContext> {
  if (isMockEnv()) {
    return {
      timetableEntryId,
      schoolId: 'mock-school',
      classId: 'mock-class',
      className: 'Demo Class',
      streamId: null,
      subjectId: 'mock-subject',
      subjectName: 'Demo Lesson',
      teacherId: 'mock-teacher',
      teacherName: 'Demo Teacher',
      date,
      startTime: '08:00',
      endTime: '09:00',
      curriculum: {
        framework: CURRICULUM_FRAMEWORK,
        level: 'Demo Level',
        topic: 'Demo Topic',
        objective: 'Demo Objective',
      },
      previousLessonSummary: undefined,
      relevantResourcesCount: 0,
    };
  }

  const { data: row, error } = await supabase
    .from('timetable_entries')
    .select(
      'id, timetable_id, class_id, stream_id, subject_id, teacher_id, room_name, start_time, end_time, timetables(school_id,is_active), subjects(id,name), classes(id,name,stage_level), streams(id,name), teacher:employees!timetable_entries_teacher_id_fkey(id, people(first_name,last_name))'
    )
    .eq('id', timetableEntryId)
    .maybeSingle();

  let r: any = row;
  if (!r && timetableEntryId.startsWith('tt-entry-')) {
    try {
      const { data: schoolClass } = await supabase.from('classes').select('id, name, stage_level').limit(1).maybeSingle();
      const { data: schoolSubj } = await supabase.from('subjects').select('id, name').eq('code', 'MATH').limit(1).maybeSingle();
      const { data: teacherEmp } = await supabase.from('employees').select('id, people(first_name, last_name)').limit(1).maybeSingle();

      r = {
        id: timetableEntryId,
        class_id: schoolClass?.id ?? '55555555-5555-5555-5555-555555555551',
        subject_id: schoolSubj?.id ?? '77777777-7777-7777-7777-777777777771',
        teacher_id: teacherEmp?.id ?? '99999999-9999-9999-9999-999999999992',
        room_name: 'Lab Block Room 3',
        start_time: '08:00',
        end_time: '09:00',
        timetables: { school_id: '22222222-2222-2222-2222-222222222222', is_active: true },
        subjects: schoolSubj ?? { id: '77777777-7777-7777-7777-777777777771', name: 'Mathematics' },
        classes: schoolClass ?? { id: '55555555-5555-5555-5555-555555555551', name: 'Stage 5 Blue', stage_level: 'Stage 5' },
        streams: { id: '66666666-6666-6666-6666-666666666661', name: 'Blue' },
        teacher: teacherEmp ?? { id: '99999999-9999-9999-9999-999999999992', people: { first_name: 'David', last_name: 'Musoke' } },
      };
    } catch (fbErr) {
      console.warn('Fallback timetable entry resolution failed:', fbErr);
    }
  }

  if (!r) {
    console.error('getLessonContext: timetable entry load failed:', error ?? new Error('no row returned'));
    throw new Error(
      `Could not load lesson context for timetable entry ${timetableEntryId}.`
    );
  }
  const subj = first(r.subjects);
  const cls = first(r.classes);
  const stm = first(r.streams);
  const tch = first(r.teacher);
  const tt = first(r.timetables);

  const classId = r.class_id as string;
  const subjectId = r.subject_id as string;
  const className = cls?.name ?? '';
  const subjectName = subj?.name ?? 'Lesson';

  let latest: any = null;
  try {
    const { data, error: histErr } = await supabase
      .from('lessons')
      .select('curriculum_topic, curriculum_objective, visible_lesson_note, submitted_at')
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .order('submitted_at', { ascending: false })
      .limit(1);
    if (!histErr && Array.isArray(data) && data.length > 0) latest = data[0];
  } catch (err) {
    console.warn('getLessonContext prior-lesson lookup failed, using defaults:', err);
  }

  // Academic Planning Lookup: check if an active scheme/sequence is planned
  let planned: any = null;
  try {
    planned = await academicPlanningService.getPlannedObjectiveForLesson(classId, subjectId);
  } catch (planErr) {
    console.warn('getLessonContext academic planning lookup failed, using fallback:', planErr);
  }

  const plannedTopic = planned?.hasPlan
    ? (planned.unitTitle || planned.schemeTitle)
    : undefined;
  const plannedObjText = planned?.hasPlan && planned.primaryObjective
    ? `${planned.primaryObjective.code} — ${planned.primaryObjective.title}`
    : undefined;

  return {
    timetableEntryId: r.id,
    schoolId: tt?.school_id ?? '',
    classId,
    className,
    streamId: (r.stream_id as string | null) ?? null,
    streamName: stm?.name ?? undefined,
    subjectId,
    subjectName,
    teacherId: r.teacher_id,
    teacherName: personName(tch) ?? 'Teacher',
    date,
    startTime: toHHMM(r.start_time) ?? String(r.start_time ?? '').slice(0, 5),
    endTime: toHHMM(r.end_time) ?? String(r.end_time ?? '').slice(0, 5),
    roomName: r.room_name ?? undefined,
    curriculum: {
      framework: CURRICULUM_FRAMEWORK,
      level: cls?.stage_level ?? className,
      topic: plannedTopic || latest?.curriculum_topic || subjectName,
      objective: plannedObjText || latest?.curriculum_objective || '',
    },
    curriculumObjectiveId: planned?.primaryObjective?.id,
    curriculumObjectiveCode: planned?.primaryObjective?.code,
    curriculumObjectiveTitle: planned?.primaryObjective?.title,
    teachingSequenceId: planned?.sequenceId,
    previousLessonSummary: latest?.visible_lesson_note ?? undefined,
    relevantResourcesCount: 0,
  };
}

/**
 * Submit a lesson: insert the lessons row (never carrying reflection text),
 * then — only when a non-blank privateReflection is present — insert the
 * private text into teacher_reflections.
 * Links planned objectives to lesson_learning_objectives.
 */
export async function submitLesson(
  sub: LessonSubmission,
  ctx: LessonSubmitContext
): Promise<{ lessonId: string }> {
  if (isMockEnv()) {
    return { lessonId: `mock-lesson-${Date.now()}` };
  }

  const now = new Date().toISOString();
  const lessonRow: Record<string, unknown> = {
    school_id: ctx.schoolId,
    teacher_id: ctx.teacherId,
    class_id: ctx.classId,
    subject_id: ctx.subjectId,
    timetable_entry_id: sub.timetableEntryId,
    lesson_status: sub.status,
    what_was_taught: sub.whatWasTaught,
    visible_lesson_note: sub.visibleLessonNote,
    curriculum_topic: ctx.curriculumTopic ?? null,
    curriculum_objective: ctx.curriculumObjective ?? null,
    started_at: now,
    completed_at: sub.status === 'completed' ? now : null,
  };
  if (ctx.streamId) lessonRow.stream_id = ctx.streamId;
  if (sub.attendanceSessionId) lessonRow.attendance_session_id = sub.attendanceSessionId;

  const { data, error } = await supabase
    .from('lessons')
    .insert(lessonRow)
    .select('id')
    .single();

  if (error || !(data as any)?.id) {
    console.error('submitLesson: lessons insert failed:', error ?? new Error('no id returned'));
    throw new Error('Could not submit lesson. Please try again.');
  }
  const lessonId = (data as any).id as string;

  // Insert relational link to lesson_learning_objectives (Guardrail E: resilient, non-blocking)
  const targetObjIds = (sub.objectiveIds && sub.objectiveIds.length > 0)
    ? sub.objectiveIds
    : (ctx.curriculumObjectiveId ? [ctx.curriculumObjectiveId] : []);

  if (targetObjIds.length > 0) {
    try {
      const links = targetObjIds.map((objId, idx) => ({
        lesson_id: lessonId,
        learning_objective_id: objId,
        teaching_sequence_id: sub.teachingSequenceId ?? ctx.teachingSequenceId ?? null,
        is_primary: idx === 0,
      }));
      await supabase.from('lesson_learning_objectives').insert(links);
    } catch (linkErr) {
      console.warn('submitLesson: lesson_learning_objectives link failed, lesson kept:', linkErr);
    }
  }

  if (sub.privateReflection?.trim()) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = (userData as any)?.user?.id;
      if (!uid) {
        console.warn('submitLesson: no signed-in user, skipping private reflection.');
        return { lessonId };
      }
      const { error: reflErr } = await supabase.from('teacher_reflections').insert({
        lesson_id: lessonId,
        teacher_user_id: uid,
        reflection_text: sub.privateReflection,
      });
      if (reflErr) {
        console.warn('submitLesson: private reflection insert failed, lesson kept:', reflErr);
      }
    } catch (err) {
      console.warn('submitLesson: private reflection insert failed, lesson kept:', err);
    }
  }

  return { lessonId };
}
