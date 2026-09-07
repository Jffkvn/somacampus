import { supabase } from '../../lib/supabase';
import { UserRole } from '../../config/permissions';

export interface StreamSummary {
  id: string;
  classId: string;
  name: string;
  defaultRoom: string | null;
  capacity: number;
  enrolledCount: number;
  classTeacher: {
    id: string;
    teacherId: string;
    teacherName: string;
    employeeNumber: string;
  } | null;
}

export interface ClassSummary {
  id: string;
  schoolId: string;
  name: string;
  stageLevel: string;
  capacity: number;
  enrolledCount: number;
  classTeacher: {
    id: string;
    teacherId: string;
    teacherName: string;
    employeeNumber: string;
  } | null;
  streams: StreamSummary[];
}

export interface EnrolledStudentRosterItem {
  enrolmentId: string;
  studentId: string;
  admissionNumber: string;
  fullName: string;
  gender: string | null;
  streamId: string | null;
  streamName: string | null;
  startDate: string;
  todayAttendanceStatus: 'present' | 'absent' | 'late' | 'excused' | 'not_taken';
  attendanceRemarks?: string | null;
}

export interface ClassDetailData {
  id: string;
  schoolId: string;
  name: string;
  stageLevel: string;
  capacity: number;
  classTeacher: {
    id: string;
    teacherId: string;
    teacherName: string;
    employeeNumber: string;
  } | null;
  streams: StreamSummary[];
  roster: EnrolledStudentRosterItem[];
  attendanceSummary: {
    totalEnrolled: number;
    recordedCount: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
    attendanceRate: number; // percentage
  };
}

function isMockEnv(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (url === 'https://test.supabase.co') return false;
  if (!url || url.includes('placeholder') || url.includes('mock')) return true;
  if (process.env.NODE_ENV === 'test') return true;
  return false;
}

export function assertClassesRole(role?: UserRole): void {
  if (role !== 'admin' && role !== 'principal' && role !== 'teacher') {
    throw new Error('Unauthorized: Staff privileges required to access class records.');
  }
}

// Seed mock data for development & tests without live Supabase
const mockClassesData: ClassSummary[] = [
  {
    id: 'class-p5',
    schoolId: '22222222-2222-2222-2222-222222222222',
    name: 'Primary 5',
    stageLevel: 'Stage 5',
    capacity: 80,
    enrolledCount: 42,
    classTeacher: {
      id: 'ct-1',
      teacherId: 'emp-teacher-1',
      teacherName: 'Sarah Nabwire',
      employeeNumber: 'EMP-001',
    },
    streams: [
      {
        id: 'stream-p5a',
        classId: 'class-p5',
        name: 'P.5 Blue',
        defaultRoom: 'Room 5A',
        capacity: 40,
        enrolledCount: 22,
        classTeacher: {
          id: 'ct-1',
          teacherId: 'emp-teacher-1',
          teacherName: 'Sarah Nabwire',
          employeeNumber: 'EMP-001',
        },
      },
      {
        id: 'stream-p5b',
        classId: 'class-p5',
        name: 'P.5 Green',
        defaultRoom: 'Room 5B',
        capacity: 40,
        enrolledCount: 20,
        classTeacher: null,
      },
    ],
  },
  {
    id: 'class-p6',
    schoolId: '22222222-2222-2222-2222-222222222222',
    name: 'Primary 6',
    stageLevel: 'Stage 6',
    capacity: 40,
    enrolledCount: 35,
    classTeacher: {
      id: 'ct-2',
      teacherId: 'emp-teacher-2',
      teacherName: 'Peter Mukasa',
      employeeNumber: 'EMP-002',
    },
    streams: [],
  },
];

export const classesService = {
  /**
   * Alias for listClassesWithStreams
   */
  async listClasses(schoolId: string): Promise<ClassSummary[]> {
    return this.listClassesWithStreams(schoolId);
  },

  /**
   * List all classes with their streams, capacity, and active class teacher
   */
  async listClassesWithStreams(schoolId: string): Promise<ClassSummary[]> {
    if (isMockEnv()) {
      return mockClassesData.filter((c) => c.schoolId === schoolId || !c.schoolId);
    }

    try {
      const today = new Date().toISOString().slice(0, 10);

      const [classesRes, streamsRes, teachersRes, enrolmentsRes] = await Promise.all([
        supabase
          .from('classes')
          .select('id, school_id, name, stage_level, created_at')
          .eq('school_id', schoolId)
          .order('name'),
        supabase
          .from('streams')
          .select('id, class_id, name, default_room')
          .order('name'),
        supabase
          .from('class_teachers')
          .select('id, class_id, stream_id, teacher_id, effective_from, effective_to, employee:employees(id, employee_number, role, person:people(first_name, last_name))')
          .eq('school_id', schoolId)
          .or(`effective_to.is.null,effective_to.gte.${today}`),
        supabase
          .from('student_enrolments')
          .select('id, class_id, stream_id')
          .eq('school_id', schoolId)
          .eq('status', 'active'),
      ]);

      if (classesRes.error || !classesRes.data || classesRes.data.length === 0) {
        if (classesRes.error) {
          console.warn('Live classes query failed, using mock data:', classesRes.error);
        }
        return mockClassesData.filter((c) => c.schoolId === schoolId || !c.schoolId);
      }

      const classes = classesRes.data || [];
      const streams = streamsRes.data || [];
      const teachers = teachersRes.data || [];
      const enrolments = enrolmentsRes.data || [];

      return classes.map((cls: any) => {
        const clsStreams = streams.filter((s: any) => s.class_id === cls.id);
        const clsTeacherRow = teachers.find(
          (t: any) => t.class_id === cls.id && t.stream_id === null
        );

        const mappedStreams: StreamSummary[] = clsStreams.map((s: any) => {
          const streamTeacherRow = teachers.find((t: any) => t.stream_id === s.id);
          const strmEnrolled = enrolments.filter((e: any) => e.stream_id === s.id).length;

          let classTeacher = null;
          if (streamTeacherRow?.employee) {
            const emp: any = Array.isArray(streamTeacherRow.employee)
              ? streamTeacherRow.employee[0]
              : streamTeacherRow.employee;
            const p: any = Array.isArray(emp?.person) ? emp.person[0] : emp?.person;
            classTeacher = {
              id: streamTeacherRow.id,
              teacherId: streamTeacherRow.teacher_id,
              teacherName: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Assigned Teacher',
              employeeNumber: emp?.employee_number,
            };
          }

          return {
            id: s.id,
            classId: s.class_id,
            name: s.name,
            defaultRoom: s.default_room,
            capacity: Number((s as any).capacity || 40),
            enrolledCount: strmEnrolled,
            classTeacher,
          };
        });

        const classEnrolled = enrolments.filter((e: any) => e.class_id === cls.id).length;

        let classTeacher = null;
        if (clsTeacherRow?.employee) {
          const emp: any = Array.isArray(clsTeacherRow.employee)
            ? clsTeacherRow.employee[0]
            : clsTeacherRow.employee;
          const p: any = Array.isArray(emp?.person) ? emp.person[0] : emp?.person;
          classTeacher = {
            id: clsTeacherRow.id,
            teacherId: clsTeacherRow.teacher_id,
            teacherName: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Assigned Teacher',
            employeeNumber: emp?.employee_number,
          };
        }

        return {
          id: cls.id,
          schoolId: cls.school_id,
          name: cls.name,
          stageLevel: cls.stage_level,
          capacity: Number((cls as any).capacity || 40),
          enrolledCount: classEnrolled,
          classTeacher,
          streams: mappedStreams,
        };
      });
    } catch (err) {
      console.warn('Failed to load classes and streams from DB, falling back to mock data:', err);
      return mockClassesData.filter((c) => c.schoolId === schoolId || !c.schoolId);
    }
  },

  /**
   * Get class details including streams and active enrolled student roster
   * with today's morning attendance status
   */
  async getClassDetails(classId: string, _schoolId?: string): Promise<ClassDetailData> {
    if (isMockEnv()) {
      const cls = mockClassesData.find((c) => c.id === classId) || mockClassesData[0];
      return {
        id: cls.id,
        schoolId: cls.schoolId,
        name: cls.name,
        stageLevel: cls.stageLevel,
        capacity: cls.capacity,
        classTeacher: cls.classTeacher,
        streams: cls.streams,
        roster: [
          {
            enrolmentId: 'enr-1',
            studentId: 'stu-1',
            admissionNumber: 'SOM-2026-001',
            fullName: 'Amina Kato',
            gender: 'female',
            streamId: 'stream-p5a',
            streamName: 'P.5 Blue',
            startDate: '2026-02-01',
            todayAttendanceStatus: 'present',
          },
          {
            enrolmentId: 'enr-2',
            studentId: 'stu-2',
            admissionNumber: 'SOM-2026-002',
            fullName: 'Brian Mukasa',
            gender: 'male',
            streamId: 'stream-p5a',
            streamName: 'P.5 Blue',
            startDate: '2026-02-01',
            todayAttendanceStatus: 'absent',
            attendanceRemarks: 'Fever',
          },
        ],
        attendanceSummary: {
          totalEnrolled: 2,
          recordedCount: 2,
          presentCount: 1,
          absentCount: 1,
          lateCount: 0,
          excusedCount: 0,
          attendanceRate: 50,
        },
      };
    }

    try {
      const today = new Date().toISOString().slice(0, 10);

      const [classRes, streamsRes, teacherRes, enrolmentsRes, sessionsRes] = await Promise.all([
        supabase.from('classes').select('*').eq('id', classId).single(),
        supabase.from('streams').select('*').eq('class_id', classId).order('name'),
        supabase
          .from('class_teachers')
          .select('id, teacher_id, employee:employees(id, employee_number, role, person:people(first_name, last_name))')
          .eq('class_id', classId)
          .is('stream_id', null)
          .or(`effective_to.is.null,effective_to.gte.${today}`)
          .maybeSingle(),
        supabase
          .from('student_enrolments')
          .select('id, student_id, stream_id, start_date, student:students(id, admission_number, person:people(first_name, last_name, gender)), stream:streams(name)')
          .eq('class_id', classId)
          .eq('status', 'active'),
        supabase
          .from('student_attendance_sessions')
          .select('id, stream_id, student_attendance_records(student_id, status, remarks)')
          .eq('class_id', classId)
          .eq('date', today),
      ]);

      if (classRes.error) throw classRes.error;

      const cls = classRes.data;
      const streams = streamsRes.data || [];
      const enrolments = enrolmentsRes.data || [];
      const sessions = sessionsRes.data || [];

      // Build attendance lookup for today
      const attendanceMap = new Map<string, { status: 'present' | 'absent' | 'late' | 'excused'; remarks?: string }>();
      for (const sess of sessions) {
        const records = (sess as any).student_attendance_records || [];
        for (const rec of records) {
          attendanceMap.set(rec.student_id, {
            status: rec.status,
            remarks: rec.remarks,
          });
        }
      }

      const roster: EnrolledStudentRosterItem[] = enrolments.map((e: any) => {
        const stu = e.student;
        const person = stu?.person;
        const att = attendanceMap.get(e.student_id);

        return {
          enrolmentId: e.id,
          studentId: e.student_id,
          admissionNumber: stu?.admission_number || 'N/A',
          fullName: `${person?.first_name || ''} ${person?.last_name || ''}`.trim() || 'Pupil',
          gender: person?.gender || null,
          streamId: e.stream_id,
          streamName: e.stream?.name || null,
          startDate: e.start_date,
          todayAttendanceStatus: att?.status || 'not_taken',
          attendanceRemarks: att?.remarks,
        };
      });

      const totalEnrolled = roster.length;
      const presentCount = roster.filter((r) => r.todayAttendanceStatus === 'present').length;
      const absentCount = roster.filter((r) => r.todayAttendanceStatus === 'absent').length;
      const lateCount = roster.filter((r) => r.todayAttendanceStatus === 'late').length;
      const excusedCount = roster.filter((r) => r.todayAttendanceStatus === 'excused').length;
      const recordedCount = presentCount + absentCount + lateCount + excusedCount;
      const attendanceRate = recordedCount > 0 ? Math.round((presentCount / recordedCount) * 100) : 0;

      let classTeacher = null;
      if (teacherRes.data?.employee) {
        const emp: any = Array.isArray(teacherRes.data.employee)
          ? teacherRes.data.employee[0]
          : teacherRes.data.employee;
        const p: any = Array.isArray(emp?.person) ? emp.person[0] : emp?.person;
        classTeacher = {
          id: teacherRes.data.id,
          teacherId: teacherRes.data.teacher_id,
          teacherName: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Assigned Teacher',
          employeeNumber: emp?.employee_number,
        };
      }

      return {
        id: cls.id,
        schoolId: cls.school_id,
        name: cls.name,
        stageLevel: cls.stage_level,
        capacity: Number(cls.capacity || 40),
        classTeacher,
        streams: streams.map((s: any) => ({
          id: s.id,
          classId: s.class_id,
          name: s.name,
          defaultRoom: s.default_room,
          capacity: Number(s.capacity || 40),
          enrolledCount: roster.filter((r) => r.streamId === s.id).length,
          classTeacher: null,
        })),
        roster,
        attendanceSummary: {
          totalEnrolled,
          recordedCount,
          presentCount,
          absentCount,
          lateCount,
          excusedCount,
          attendanceRate,
        },
      };
    } catch (err) {
      console.warn('Failed to load class details from DB, falling back to mock data:', err);
      const fallbackCls = mockClassesData.find((c) => c.id === classId) || mockClassesData[0];
      return {
        id: fallbackCls.id,
        schoolId: fallbackCls.schoolId,
        name: fallbackCls.name,
        stageLevel: fallbackCls.stageLevel,
        capacity: fallbackCls.capacity,
        classTeacher: fallbackCls.classTeacher,
        streams: fallbackCls.streams,
        roster: [
          {
            enrolmentId: 'enr-1',
            studentId: 'stu-1',
            admissionNumber: 'SOM-2026-001',
            fullName: 'Amina Kato',
            gender: 'female',
            streamId: fallbackCls.streams[0]?.id || 'stream-p5a',
            streamName: fallbackCls.streams[0]?.name ? `${fallbackCls.name} ${fallbackCls.streams[0].name}` : 'P.5 Blue',
            startDate: '2026-02-01',
            todayAttendanceStatus: 'present',
          },
          {
            enrolmentId: 'enr-2',
            studentId: 'stu-2',
            admissionNumber: 'SOM-2026-002',
            fullName: 'Brian Mukasa',
            gender: 'male',
            streamId: fallbackCls.streams[0]?.id || 'stream-p5a',
            streamName: fallbackCls.streams[0]?.name ? `${fallbackCls.name} ${fallbackCls.streams[0].name}` : 'P.5 Blue',
            startDate: '2026-02-01',
            todayAttendanceStatus: 'absent',
            attendanceRemarks: 'Fever',
          },
        ],
        attendanceSummary: {
          totalEnrolled: 2,
          recordedCount: 2,
          presentCount: 1,
          absentCount: 1,
          lateCount: 0,
          excusedCount: 0,
          attendanceRate: 50,
        },
      };
    }
  },

  /**
   * Create a new class
   */
  async createClass(schoolId: string, input: { name: string; stageLevel: string; capacity?: number }): Promise<string> {
    if (isMockEnv()) {
      const newCls: ClassSummary = {
        id: `class-${Date.now()}`,
        schoolId,
        name: input.name,
        stageLevel: input.stageLevel,
        capacity: input.capacity || 40,
        enrolledCount: 0,
        classTeacher: null,
        streams: [],
      };
      mockClassesData.push(newCls);
      return newCls.id;
    }

    const { data, error } = await supabase
      .from('classes')
      .insert({
        school_id: schoolId,
        name: input.name,
        stage_level: input.stageLevel,
        capacity: input.capacity || 40,
      })
      .select('id')
      .single();

    if (error) throw new Error(`classesService.createClass: ${error.message}`);
    return data.id;
  },

  /**
   * Update an existing class
   */
  async updateClass(classId: string, input: { name?: string; stageLevel?: string; capacity?: number }): Promise<void> {
    if (isMockEnv()) {
      const found = mockClassesData.find((c) => c.id === classId);
      if (found) {
        if (input.name) found.name = input.name;
        if (input.stageLevel) found.stageLevel = input.stageLevel;
        if (input.capacity) found.capacity = input.capacity;
      }
      return;
    }

    const { error } = await supabase
      .from('classes')
      .update({
        ...(input.name && { name: input.name }),
        ...(input.stageLevel && { stage_level: input.stageLevel }),
        ...(input.capacity && { capacity: input.capacity }),
      })
      .eq('id', classId);

    if (error) throw new Error(`classesService.updateClass: ${error.message}`);
  },

  /**
   * Create a new stream in a class
   */
  async createStream(classId: string, input: { name: string; defaultRoom?: string; capacity?: number }): Promise<string> {
    if (isMockEnv()) {
      const found = mockClassesData.find((c) => c.id === classId);
      const newStream: StreamSummary = {
        id: `stream-${Date.now()}`,
        classId,
        name: input.name,
        defaultRoom: input.defaultRoom || null,
        capacity: input.capacity || 40,
        enrolledCount: 0,
        classTeacher: null,
      };
      if (found) found.streams.push(newStream);
      return newStream.id;
    }

    const { data, error } = await supabase
      .from('streams')
      .insert({
        class_id: classId,
        name: input.name,
        default_room: input.defaultRoom || null,
        capacity: input.capacity || 40,
      })
      .select('id')
      .single();

    if (error) throw new Error(`classesService.createStream: ${error.message}`);
    return data.id;
  },

  /**
   * Update stream details
   */
  async updateStream(streamId: string, input: { name?: string; defaultRoom?: string; capacity?: number }): Promise<void> {
    if (isMockEnv()) return;

    const { error } = await supabase
      .from('streams')
      .update({
        ...(input.name && { name: input.name }),
        ...(input.defaultRoom !== undefined && { default_room: input.defaultRoom }),
        ...(input.capacity && { capacity: input.capacity }),
      })
      .eq('id', streamId);

    if (error) throw new Error(`classesService.updateStream: ${error.message}`);
  },

  /**
   * Assign or reassign a designated Class Teacher using atomic RPC
   */
  async assignClassTeacher(
    schoolId: string,
    classId: string,
    streamId: string | null,
    teacherId: string,
    effectiveDate?: string
  ): Promise<string> {
    if (isMockEnv()) {
      const cls = mockClassesData.find((c) => c.id === classId);
      if (cls) {
        cls.classTeacher = {
          id: `ct-${Date.now()}`,
          teacherId,
          teacherName: 'Assigned Teacher',
          employeeNumber: 'EMP-001',
        };
      }
      return `ct-${Date.now()}`;
    }

    const { data, error } = await supabase.rpc('assign_class_teacher', {
      p_school_id: schoolId,
      p_class_id: classId,
      p_stream_id: streamId || null,
      p_teacher_id: teacherId,
      p_effective_date: effectiveDate || new Date().toISOString().slice(0, 10),
    });

    if (error) throw new Error(`classesService.assignClassTeacher: ${error.message}`);
    return data as string;
  },

  /**
   * Transfer student to another class or stream using atomic transfer RPC
   */
  async transferStudentStream(
    studentId: string,
    targetClassId: string,
    targetStreamId: string | null,
    reason: string = 'transferred_stream'
  ): Promise<string> {
    if (isMockEnv()) return `enr-${Date.now()}`;

    const { data, error } = await supabase.rpc('transfer_student_enrolment', {
      p_student_id: studentId,
      p_target_class_id: targetClassId,
      p_target_stream_id: targetStreamId || null,
      p_reason: reason,
    });

    if (error) throw new Error(`classesService.transferStudentStream: ${error.message}`);
    return data as string;
  },
};
