import { supabase } from '../../lib/supabase';
import { LeadershipLessonSummary } from '../../types/domain';
import { toDayOfWeek, toHHMM } from '../teacher/scheduleUtils';

export interface LeadershipDashboardViewModel {
  schoolName: string;
  academicTerm: string;
  stats: {
    enrolledStudents: number;
    activeTeachers: number;
    attendanceRate: number;
    lessonsExpected: number;
    lessonsCompleted: number;
  };
  attendanceTrend: Array<{ day: string; studentRate: number; staffRate: number }>;
  activeLessons: LeadershipLessonSummary[];
  alerts: Array<{
    id: string;
    type: 'critical' | 'warning' | 'pending';
    title: string;
    description: string;
    actionRoute?: string;
  }>;
}

const FALLBACK_SCHOOL_NAME = "Grace's Cambridge Centre";
const FALLBACK_TERM = 'Term 1, 2026-2027';
const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

const one = (v: unknown): any => (Array.isArray(v) ? v[0] : v);

function personName(tch: any, fallback: string): string {
  const person = tch ? one(tch.people) : null;
  if (person?.first_name) {
    return `${person.first_name}${person.last_name ? ` ${person.last_name}` : ''}`;
  }
  return fallback;
}

function formatSubmittedAt(v: unknown): string {
  if (!v) return '—';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function shortWeekday(dateStr: string): string {
  try {
    const label = new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
    if (label && label !== 'Invalid Date') return label;
  } catch {
    // fall through
  }
  return String(dateStr ?? '').slice(0, 10);
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const VALID_STATUSES = new Set(['completed', 'partial', 'not_completed', 'struggled', 'advanced']);

export const leadershipService = {
  async getSchoolLeadershipDashboard(schoolId: string, date: string): Promise<LeadershipDashboardViewModel> {
    const isMockEnv = !import.meta.env.VITE_SUPABASE_URL ||
      import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
      import.meta.env.VITE_SUPABASE_URL.includes('mock') ||
      schoolId.startsWith('school-');

    if (isMockEnv) {
    const mockLessons: LeadershipLessonSummary[] = [
      {
        lessonId: 'les-001',
        schoolId,
        teacherId: 'teacher-sarah',
        teacherName: 'Sarah Namukasa',
        classId: 'class-p5-blue',
        className: 'Stage 5 Blue',
        subjectName: 'Mathematics',
        scheduledTime: '08:00 - 09:00',
        submittedAt: '08:58 AM',
        status: 'completed',
        curriculumTopic: 'Fractions & Decimals',
        visibleLessonNote: 'Covered mixed numbers conversion. Class responded actively; 4 students needed assistance with simplified fractions.',
        hasAttendanceRecorded: true,
        studentCount: 24,
      },
      {
        lessonId: 'les-002',
        schoolId,
        teacherId: 'teacher-david',
        teacherName: 'David Ochieng',
        classId: 'class-p6-red',
        className: 'Stage 6 Red',
        subjectName: 'English',
        scheduledTime: '08:00 - 09:00',
        submittedAt: '09:05 AM',
        status: 'completed',
        curriculumTopic: 'Persuasive Writing',
        visibleLessonNote: 'Introductory essay outlining arguments. All 26 students drafted thesis statements.',
        hasAttendanceRecorded: true,
        studentCount: 26,
      },
      {
        lessonId: 'les-003',
        schoolId,
        teacherId: 'teacher-james',
        teacherName: 'James Kato',
        classId: 'class-p4-green',
        className: 'Stage 4 Green',
        subjectName: 'Science',
        scheduledTime: '09:00 - 10:00',
        submittedAt: '—',
        status: 'not_completed',
        curriculumTopic: 'Habitats & Adaptations',
        visibleLessonNote: 'Lesson submission pending.',
        hasAttendanceRecorded: false,
        studentCount: 22,
      },
    ];

    return {
      schoolName: "Grace's Cambridge Centre",
      academicTerm: 'Term 1, 2026-2027',
      stats: {
        enrolledStudents: 1204,
        activeTeachers: 84,
        attendanceRate: 96.4,
        lessonsExpected: 86,
        lessonsCompleted: 82,
      },
      attendanceTrend: [
        { day: 'Mon', studentRate: 95.8, staffRate: 98.0 },
        { day: 'Tue', studentRate: 96.4, staffRate: 98.5 },
        { day: 'Wed', studentRate: 94.9, staffRate: 97.0 },
        { day: 'Thu', studentRate: 96.8, staffRate: 99.0 },
        { day: 'Fri', studentRate: 95.2, staffRate: 96.5 },
      ],
      activeLessons: mockLessons,
      alerts: [
        {
          id: 'alert-1',
          type: 'critical',
          title: '3 Unmatched Payment Records',
          description: 'Recent bank import has 3 rows requiring admission number resolution.',
          actionRoute: '/fees/reconciliation',
        },
        {
          id: 'alert-2',
          type: 'warning',
          title: 'Missing Lesson Note (Stage 4 Green)',
          description: 'James Kato has not submitted the 09:00 Science lesson note.',
          actionRoute: '/dashboard/school/teaching',
        },
      ],
    };
    }

    try {
      const effectiveSchool = schoolId || PILOT_SCHOOL_ID;

      // School name (graceful fallback)
      let schoolName = FALLBACK_SCHOOL_NAME;
      try {
        const { data: schoolRow } = await supabase
          .from('schools')
          .select('name')
          .eq('id', effectiveSchool)
          .maybeSingle();
        const row = one(schoolRow);
        if (typeof row?.name === 'string' && row.name.trim()) {
          schoolName = row.name;
        }
      } catch {
        schoolName = FALLBACK_SCHOOL_NAME;
      }

      // Academic term, scoped to this school (graceful fallback)
      let academicTerm = FALLBACK_TERM;
      try {
        const { data: termRows } = await supabase
          .from('terms')
          .select('name, term_number, academic_years!inner(school_id, name)')
          .eq('is_current', true)
          .eq('academic_years.school_id', effectiveSchool)
          .limit(1);
        const list = Array.isArray(termRows) ? termRows : termRows ? [termRows] : [];
        const scoped = list.filter((t: any) => {
          const year = one(t?.academic_years);
          return !year || !year.school_id || year.school_id === effectiveSchool;
        });
        const term = one(scoped[0] ?? null);
        if (term?.name) {
          const yearName = one(term.academic_years)?.name ?? '';
          const year = String(yearName).replace(/^Academic Year\s+/i, '').trim();
          academicTerm = year ? `${term.name}, ${year}` : String(term.name);
        }
      } catch {
        academicTerm = FALLBACK_TERM;
      }

      // Enrolments (stats + per-class counts, batched once)
      let enrolRows: any[] = [];
      try {
        const { data } = await supabase
          .from('student_enrolments')
          .select('id, class_id')
          .eq('school_id', effectiveSchool)
          .eq('status', 'active');
        if (Array.isArray(data)) enrolRows = data;
      } catch {
        enrolRows = [];
      }
      const enrolledStudents = enrolRows.length;
      const classCounts = new Map<string, number>();
      for (const r of enrolRows) {
        if (r?.class_id) classCounts.set(r.class_id, (classCounts.get(r.class_id) ?? 0) + 1);
      }

      // Active teachers
      let activeTeachers = 0;
      try {
        const { data } = await supabase
          .from('employees')
          .select('id')
          .eq('school_id', effectiveSchool)
          .eq('is_teacher', true)
          .eq('status', 'active');
        if (Array.isArray(data)) activeTeachers = data.length;
      } catch {
        activeTeachers = 0;
      }

      // Lessons expected (active timetable, school, dow)
      let lessonsExpected = 0;
      try {
        const dow = toDayOfWeek(date);
        const { data } = await supabase
          .from('timetable_entries')
          .select('id, day_of_week, timetables!inner(is_active, school_id)')
          .eq('timetables.is_active', true)
          .eq('timetables.school_id', effectiveSchool)
          .eq('day_of_week', dow);
        const rows = Array.isArray(data) ? data : [];
        lessonsExpected = rows.filter((r: any) => Number(r?.day_of_week) === dow).length;
      } catch {
        lessonsExpected = 0;
      }

      // Sessions: one query serves today's rate, trend, and entry-id batch
      let sessionRows: any[] = [];
      try {
        const { data } = await supabase
          .from('student_attendance_sessions')
          .select('id, date, present_count, total_students, absent_count, timetable_entry_id, contextual_timetable_entry_id')
          .eq('school_id', effectiveSchool)
          .order('date', { ascending: false })
          .limit(30);
        if (Array.isArray(data)) sessionRows = data;
      } catch {
        sessionRows = [];
      }
      const todaySessions = sessionRows.filter((r) => r?.date === date);
      const presentTotal = todaySessions.reduce((s, r) => s + (Number(r?.present_count) || 0), 0);
      const studentTotal = todaySessions.reduce((s, r) => s + (Number(r?.total_students) || 0), 0);
      const attendanceRate = studentTotal > 0 ? Math.round((presentTotal / studentTotal) * 100) : 0;
      const sessionEntryIds = new Set<string>();
      for (const s of todaySessions) {
        if (typeof s?.timetable_entry_id === 'string' && s.timetable_entry_id) {
          sessionEntryIds.add(s.timetable_entry_id);
        }
        if (typeof s?.contextual_timetable_entry_id === 'string' && s.contextual_timetable_entry_id) {
          sessionEntryIds.add(s.contextual_timetable_entry_id);
        }
      }

      // Teacher attendance per day (staffRate)
      let clockRows: any[] = [];
      try {
        const { data } = await supabase
          .from('teacher_attendance')
          .select('date, employee_id')
          .eq('school_id', effectiveSchool)
          .order('date', { ascending: false })
          .limit(30);
        if (Array.isArray(data)) clockRows = data;
      } catch {
        clockRows = [];
      }
      const clockByDate = new Map<string, number>();
      for (const r of clockRows) {
        if (r?.date) clockByDate.set(r.date, (clockByDate.get(r.date) ?? 0) + 1);
      }

      // Attendance trend: last 5 days with sessions
      let attendanceTrend: Array<{ day: string; studentRate: number; staffRate: number }> = [];
      try {
        const byDate = new Map<string, { present: number; total: number }>();
        for (const r of sessionRows) {
          if (!r?.date) continue;
          const cur = byDate.get(r.date) ?? { present: 0, total: 0 };
          cur.present += Number(r?.present_count) || 0;
          cur.total += Number(r?.total_students) || 0;
          byDate.set(r.date, cur);
        }
        const dates = [...byDate.keys()].sort().reverse().slice(0, 5).reverse();
        attendanceTrend = dates.map((d) => {
          const agg = byDate.get(d)!;
          const studentRate = agg.total > 0 ? Math.round((agg.present / agg.total) * 100) : 0;
          const clocked = clockByDate.get(d) ?? 0;
          const raw = activeTeachers > 0 ? Math.round((clocked / activeTeachers) * 100) : 0;
          return { day: shortWeekday(d), studentRate, staffRate: Math.min(100, raw) };
        });
      } catch {
        attendanceTrend = [];
      }

      // Today's lessons with joins (visible note only — never teacher_reflections)
      let lessonRows: any[] = [];
      try {
        const { data } = await supabase
          .from('lessons')
          .select('id, school_id, teacher_id, class_id, subject_id, timetable_entry_id, attendance_session_id, curriculum_topic, visible_lesson_note, lesson_status, submitted_at, classes(id, name), subjects(id, name), streams(id, name), timetable_entries(id, start_time, end_time), teacher:employees!lessons_teacher_id_fkey(id, people(first_name, last_name))')
          .eq('school_id', effectiveSchool)
          .gte('submitted_at', `${date}T00:00:00`)
          .lt('submitted_at', `${nextDay(date)}T00:00:00`)
          .order('submitted_at', { ascending: false });
        if (Array.isArray(data)) lessonRows = data;
      } catch {
        lessonRows = [];
      }
      lessonRows.sort((a: any, b: any) => String(b?.submitted_at ?? '').localeCompare(String(a?.submitted_at ?? '')));

      const activeLessons: LeadershipLessonSummary[] = lessonRows.map((r: any) => {
        const tch = one(r?.teacher);
        const cls = one(r?.classes);
        const subj = one(r?.subjects);
        const stm = one(r?.streams);
        const tt = one(r?.timetable_entries);
        const classBase = cls?.name ?? 'Class';
        const className = stm?.name ? `${classBase} ${stm.name}` : classBase;
        const subjectName = subj?.name ?? 'Lesson';
        const start = toHHMM(tt?.start_time);
        const end = toHHMM(tt?.end_time);
        const scheduledTime = start && end ? `${start} - ${end}` : '—';
        const status = VALID_STATUSES.has(String(r?.lesson_status)) ? r.lesson_status : 'completed';
        return {
          lessonId: String(r?.id ?? ''),
          schoolId: String(r?.school_id ?? effectiveSchool),
          teacherId: String(r?.teacher_id ?? ''),
          teacherName: personName(tch, 'Teacher'),
          classId: String(r?.class_id ?? ''),
          className,
          subjectName,
          scheduledTime,
          submittedAt: formatSubmittedAt(r?.submitted_at),
          status,
          curriculumTopic: String(r?.curriculum_topic ?? subjectName ?? 'Lesson'),
          visibleLessonNote: String(r?.visible_lesson_note ?? 'Lesson submission pending.'),
          hasAttendanceRecorded: Boolean(
            r?.attendance_session_id ||
              (typeof r?.timetable_entry_id === 'string' && sessionEntryIds.has(r.timetable_entry_id))
          ),
          studentCount: classCounts.get(String(r?.class_id ?? '')) ?? 0,
        };
      });
      const lessonsCompleted = lessonRows.length;

      // Alerts: not_completed lessons + optional unmatched fee imports
      const alerts: LeadershipDashboardViewModel['alerts'] = [];
      for (const lesson of activeLessons) {
        if (lesson.status === 'not_completed') {
          alerts.push({
            id: `alert-lesson-${lesson.lessonId}`,
            type: 'warning',
            title: `Missing Lesson Note (${lesson.className})`,
            description: `${lesson.teacherName} has not submitted the ${lesson.scheduledTime} ${lesson.subjectName} lesson note.`,
            actionRoute: '/dashboard/school',
          });
        }
      }
      try {
        const { data } = await supabase
          .from('fee_payment_imports')
          .select('unmatched_count')
          .eq('school_id', effectiveSchool);
        const rows = Array.isArray(data) ? data : [];
        const unmatched = rows.reduce((s: number, r: any) => s + (Number(r?.unmatched_count) || 0), 0);
        if (unmatched > 0) {
          alerts.push({
            id: 'alert-fees-unmatched',
            type: 'warning',
            title: `${unmatched} Unmatched Payment Records`,
            description: 'Recent bank import has rows requiring admission number resolution.',
            actionRoute: '/fees',
          });
        }
      } catch {
        // Fees tables have no policies — omit alert silently.
      }

      return {
        schoolName,
        academicTerm,
        stats: {
          enrolledStudents,
          activeTeachers,
          attendanceRate,
          lessonsExpected,
          lessonsCompleted,
        },
        attendanceTrend,
        activeLessons,
        alerts,
      };
    } catch {
      return {
        schoolName: FALLBACK_SCHOOL_NAME,
        academicTerm: FALLBACK_TERM,
        stats: {
          enrolledStudents: 0,
          activeTeachers: 0,
          attendanceRate: 0,
          lessonsExpected: 0,
          lessonsCompleted: 0,
        },
        attendanceTrend: [],
        activeLessons: [],
        alerts: [],
      };
    }
  },
};

export interface LiveLessonPeriod extends LeadershipLessonSummary {
  periodState: 'submitted' | 'pending';
  startTime: string;
  endTime: string;
}

export interface LiveLessonsMonitorResult {
  expected: number;
  submitted: number;
  pending: number;
  missingAttendance: number;
  periods: LiveLessonPeriod[];
}

export async function getLiveLessonsMonitor(schoolId: string, date: string): Promise<LiveLessonsMonitorResult> {
  const isMockEnv = !import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
    import.meta.env.VITE_SUPABASE_URL.includes('mock') ||
    schoolId.startsWith('school-');

  if (isMockEnv) {
    const mockLessons: LeadershipLessonSummary[] = [
      {
        lessonId: 'les-001',
        schoolId,
        teacherId: 'teacher-sarah',
        teacherName: 'Sarah Namukasa',
        classId: 'class-p5-blue',
        className: 'Stage 5 Blue',
        subjectName: 'Mathematics',
        scheduledTime: '08:00 - 09:00',
        submittedAt: '08:58 AM',
        status: 'completed',
        curriculumTopic: 'Fractions & Decimals',
        visibleLessonNote: 'Covered mixed numbers conversion. Class responded actively; 4 students needed assistance with simplified fractions.',
        hasAttendanceRecorded: true,
        studentCount: 24,
      },
      {
        lessonId: 'les-002',
        schoolId,
        teacherId: 'teacher-david',
        teacherName: 'David Ochieng',
        classId: 'class-p6-red',
        className: 'Stage 6 Red',
        subjectName: 'English',
        scheduledTime: '08:00 - 09:00',
        submittedAt: '09:05 AM',
        status: 'completed',
        curriculumTopic: 'Persuasive Writing',
        visibleLessonNote: 'Introductory essay outlining arguments. All 26 students drafted thesis statements.',
        hasAttendanceRecorded: true,
        studentCount: 26,
      },
    ];
    const periods: LiveLessonPeriod[] = [
      { ...mockLessons[0], periodState: 'submitted', startTime: '08:00', endTime: '09:00' },
      { ...mockLessons[1], periodState: 'submitted', startTime: '08:00', endTime: '09:00' },
      {
        lessonId: 'pending-mock-tt-3',
        schoolId,
        teacherId: 'teacher-james',
        teacherName: 'James Kato',
        classId: 'class-p4-green',
        className: 'Stage 4 Green',
        subjectName: 'Science',
        scheduledTime: '09:00 - 10:00',
        submittedAt: '—',
        status: 'not_completed',
        curriculumTopic: 'Habitats & Adaptations',
        visibleLessonNote: 'Lesson submission pending.',
        hasAttendanceRecorded: false,
        studentCount: 22,
        periodState: 'pending',
        startTime: '09:00',
        endTime: '10:00',
      },
    ];
    return { expected: 3, submitted: 2, pending: 1, missingAttendance: 0, periods };
  }

  try {
    const effectiveSchool = schoolId || PILOT_SCHOOL_ID;
    const dow = toDayOfWeek(date);

    // Enrolment class counts (batched once)
    let classCounts = new Map<string, number>();
    try {
      const { data } = await supabase
        .from('student_enrolments')
        .select('id, class_id')
        .eq('school_id', effectiveSchool)
        .eq('status', 'active');
      if (Array.isArray(data)) {
        for (const r of data) {
          if (r?.class_id) classCounts.set(r.class_id, (classCounts.get(r.class_id) ?? 0) + 1);
        }
      }
    } catch {
      classCounts = new Map<string, number>();
    }

    // Scheduled periods: active timetable, school, dow
    let scheduledRows: any[] = [];
    try {
      const { data } = await supabase
        .from('timetable_entries')
        .select('id, day_of_week, start_time, end_time, class_id, subject_id, teacher_id, classes(id, name), subjects(id, name), streams(id, name), teacher:employees(id, people(first_name, last_name)), timetables!inner(is_active, school_id)')
        .eq('timetables.is_active', true)
        .eq('timetables.school_id', effectiveSchool)
        .eq('day_of_week', dow);
      const rows = Array.isArray(data) ? data : [];
      scheduledRows = rows.filter((r: any) => Number(r?.day_of_week) === dow);
    } catch {
      scheduledRows = [];
    }

    // NOTE: today's-lessons query intentionally duplicated inline from
    // getSchoolLeadershipDashboard (~15 lines) — dashboard left untouched.
    let lessonRows: any[] = [];
    try {
      const { data } = await supabase
        .from('lessons')
        .select('id, school_id, teacher_id, class_id, subject_id, timetable_entry_id, attendance_session_id, curriculum_topic, visible_lesson_note, lesson_status, submitted_at, classes(id, name), subjects(id, name), streams(id, name), timetable_entries(id, start_time, end_time), teacher:employees!lessons_teacher_id_fkey(id, people(first_name, last_name))')
        .eq('school_id', effectiveSchool)
        .gte('submitted_at', `${date}T00:00:00`)
        .lt('submitted_at', `${nextDay(date)}T00:00:00`)
        .order('submitted_at', { ascending: false });
      if (Array.isArray(data)) lessonRows = data;
    } catch {
      lessonRows = [];
    }
    lessonRows.sort((a: any, b: any) => String(b?.submitted_at ?? '').localeCompare(String(a?.submitted_at ?? '')));

    // Session entry-ids batched once
    const sessionEntryIds = new Set<string>();
    try {
      const { data } = await supabase
        .from('student_attendance_sessions')
        .select('id, date, timetable_entry_id, contextual_timetable_entry_id')
        .eq('school_id', effectiveSchool)
        .eq('date', date);
      const rows = Array.isArray(data) ? data : [];
      for (const s of rows) {
        if (typeof s?.timetable_entry_id === 'string' && s.timetable_entry_id) {
          sessionEntryIds.add(s.timetable_entry_id);
        }
        if (typeof s?.contextual_timetable_entry_id === 'string' && s.contextual_timetable_entry_id) {
          sessionEntryIds.add(s.contextual_timetable_entry_id);
        }
      }
    } catch {
      // empty set — every submitted lesson counts as missing attendance
    }

    const toSummary = (r: any): LeadershipLessonSummary => {
      const tch = one(r?.teacher);
      const cls = one(r?.classes);
      const subj = one(r?.subjects);
      const stm = one(r?.streams);
      const tt = one(r?.timetable_entries);
      const classBase = cls?.name ?? 'Class';
      const className = stm?.name ? `${classBase} ${stm.name}` : classBase;
      const subjectName = subj?.name ?? 'Lesson';
      const start = toHHMM(tt?.start_time);
      const end = toHHMM(tt?.end_time);
      const scheduledTime = start && end ? `${start} - ${end}` : '—';
      const status = VALID_STATUSES.has(String(r?.lesson_status)) ? r.lesson_status : 'completed';
      return {
        lessonId: String(r?.id ?? ''),
        schoolId: String(r?.school_id ?? effectiveSchool),
        teacherId: String(r?.teacher_id ?? ''),
        teacherName: personName(tch, 'Teacher'),
        classId: String(r?.class_id ?? ''),
        className,
        subjectName,
        scheduledTime,
        submittedAt: formatSubmittedAt(r?.submitted_at),
        status,
        curriculumTopic: String(r?.curriculum_topic ?? subjectName ?? 'Lesson'),
        visibleLessonNote: String(r?.visible_lesson_note ?? 'Lesson submission pending.'),
        hasAttendanceRecorded: Boolean(
          r?.attendance_session_id ||
            (typeof r?.timetable_entry_id === 'string' && sessionEntryIds.has(r.timetable_entry_id))
        ),
        studentCount: classCounts.get(String(r?.class_id ?? '')) ?? 0,
      };
    };

    const lessonByEntry = new Map<string, any>();
    const orphanLessons: any[] = [];
    for (const r of lessonRows) {
      if (typeof r?.timetable_entry_id === 'string' && r.timetable_entry_id) {
        if (!lessonByEntry.has(r.timetable_entry_id)) lessonByEntry.set(r.timetable_entry_id, r);
      } else {
        orphanLessons.push(r);
      }
    }

    const periods: LiveLessonPeriod[] = [];
    for (const e of scheduledRows) {
      const entryId = String(e?.id ?? '');
      const lesson = lessonByEntry.get(entryId);
      const schedStart = toHHMM(e?.start_time);
      const schedEnd = toHHMM(e?.end_time);
      if (lesson) {
        const summary = toSummary(lesson);
        const tt = one(lesson?.timetable_entries);
        const start = schedStart ?? toHHMM(tt?.start_time) ?? '—';
        const end = schedEnd ?? toHHMM(tt?.end_time) ?? '—';
        periods.push({
          ...summary,
          scheduledTime: start !== '—' && end !== '—' ? `${start} - ${end}` : summary.scheduledTime,
          periodState: 'submitted',
          startTime: start,
          endTime: end,
        });
      } else {
        const tch = one(e?.teacher);
        const cls = one(e?.classes);
        const subj = one(e?.subjects);
        const stm = one(e?.streams);
        const classBase = cls?.name ?? 'Class';
        const className = stm?.name ? `${classBase} ${stm.name}` : classBase;
        const subjectName = subj?.name ?? 'Lesson';
        const start = schedStart ?? '—';
        const end = schedEnd ?? '—';
        periods.push({
          lessonId: `pending-${entryId}`,
          schoolId: effectiveSchool,
          teacherId: String(e?.teacher_id ?? one(e?.teacher)?.id ?? ''),
          teacherName: personName(tch, 'Teacher'),
          classId: String(e?.class_id ?? ''),
          className,
          subjectName,
          scheduledTime: start !== '—' && end !== '—' ? `${start} - ${end}` : '—',
          submittedAt: '—',
          status: 'not_completed',
          curriculumTopic: subjectName,
          visibleLessonNote: 'Lesson submission pending.',
          hasAttendanceRecorded: sessionEntryIds.has(entryId),
          studentCount: classCounts.get(String(e?.class_id ?? '')) ?? 0,
          periodState: 'pending',
          startTime: start,
          endTime: end,
        });
      }
    }
    for (const r of orphanLessons) {
      const summary = toSummary(r);
      periods.push({ ...summary, scheduledTime: '—', periodState: 'submitted', startTime: '—', endTime: '—' });
    }
    periods.sort((a, b) => {
      if (a.startTime === '—' && b.startTime === '—') return 0;
      if (a.startTime === '—') return 1;
      if (b.startTime === '—') return -1;
      return a.startTime.localeCompare(b.startTime);
    });

    const submitted = periods.filter((p) => p.periodState === 'submitted').length;
    const pending = periods.filter((p) => p.periodState === 'pending').length;
    const missingAttendance = periods.filter((p) => p.periodState === 'submitted' && !p.hasAttendanceRecorded).length;
    return { expected: scheduledRows.length, submitted, pending, missingAttendance, periods };
  } catch {
    return { expected: 0, submitted: 0, pending: 0, missingAttendance: 0, periods: [] };
  }
}
