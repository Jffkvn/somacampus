import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vhivioulpbdyaynkqpja.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAnon = Boolean(SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'placeholder-key') && !/mock|placeholder/i.test(SUPABASE_URL);
const hasAdmin = Boolean(SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY !== 'placeholder-key') && !/mock|placeholder/i.test(SUPABASE_URL);

describe.skipIf(!hasAnon)('Class Teacher & Daily Attendance RLS Security Suite', () => {
  const schoolId = '22222222-2222-2222-2222-222222222222';
  const classId = '55555555-5555-5555-5555-555555555551'; // Stage 5
  const streamId = '66666666-6666-6666-6666-666666666661'; // Blue
  const sarahEmployeeId = '99999999-9999-9999-9999-999999999991'; // Class Teacher
  const davidEmployeeId = '99999999-9999-9999-9999-999999999992'; // Subject Teacher Math
  const paulEmployeeId = '99999999-9999-9999-9999-999999999995'; // Former Class Teacher (Expired)

  // Helper to create client authenticated as a specific user
  async function createTeacherClient(email: string, pass = 'SomaCampus2026!') {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
    return { client, session: data.session, user: data.user };
  }

  // Admin client for setup and cleanup
  const adminClient = hasAdmin
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    : null;

  beforeAll(async () => {
    if (adminClient) {
      // Clean up test attendance records for today and test dates
      await adminClient
        .from('student_attendance_sessions')
        .delete()
        .eq('class_id', classId)
        .in('date', ['2026-09-03', '2026-09-04', '2026-09-05']);
    }
  });

  // 1. Class Teacher can create daily attendance for her class
  it('allows designated Class Teacher (Sarah) to create daily attendance session', async () => {
    const { client } = await createTeacherClient('teacher@somacampus.ug');
    const testDate = '2026-09-03';

    const { data: session, error } = await client
      .from('student_attendance_sessions')
      .insert({
        school_id: schoolId,
        class_id: classId,
        stream_id: streamId,
        date: testDate,
        class_teacher_id: sarahEmployeeId,
        recorded_by_teacher_id: sarahEmployeeId,
        total_students: 24,
        present_count: 23,
        absent_count: 1,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(session).toBeDefined();
    expect(session.class_teacher_id).toBe(sarahEmployeeId);
    expect(session.recorded_by_teacher_id).toBe(sarahEmployeeId);
  });

  // 2. Attendance stores Class Teacher responsible and actual recorder separately
  it('stores Class Teacher responsible and actual recorder when Subject Teacher (David) records attendance', async () => {
    const { client } = await createTeacherClient('david.m@graceschool.ac.ug');
    const testDate = '2026-09-04'; // Different date for David's session

    // David records attendance for Stage 5 Blue because Sarah is unavailable
    const { data: session, error } = await client
      .from('student_attendance_sessions')
      .insert({
        school_id: schoolId,
        class_id: classId,
        stream_id: streamId,
        date: testDate,
        class_teacher_id: sarahEmployeeId, // Sarah is still the designated Class Teacher!
        recorded_by_teacher_id: davidEmployeeId, // David is the actual recorder!
        total_students: 24,
        present_count: 24,
        absent_count: 0,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(session).toBeDefined();
    // CRITICAL PRODUCT RULE: class_teacher_id != recorded_by_teacher_id
    expect(session.class_teacher_id).toBe(sarahEmployeeId);
    expect(session.recorded_by_teacher_id).toBe(davidEmployeeId);
    expect(session.class_teacher_id).not.toBe(session.recorded_by_teacher_id);
  });

  // 3. Database unique constraint prevents multiple daily attendance sessions for the same class/stream/date
  it('enforces that multiple subject lessons cannot create multiple daily attendance sessions on the same day', async () => {
    const { client } = await createTeacherClient('teacher@somacampus.ug');
    const testDate = '2026-09-03'; // Already created in test 1

    // Attempting to create a second attendance session for Stage 5 Blue on the same date must be rejected
    const { data: duplicate, error } = await client
      .from('student_attendance_sessions')
      .insert({
        school_id: schoolId,
        class_id: classId,
        stream_id: streamId,
        date: testDate,
        class_teacher_id: sarahEmployeeId,
        recorded_by_teacher_id: sarahEmployeeId,
        total_students: 24,
        present_count: 24,
        absent_count: 0,
      });

    expect(duplicate).toBeNull();
    expect(error).toBeDefined();
    // Unique violation code: 23505
    expect(error?.code).toBe('23505');
  });

  // 4. Former Class Teacher whose effective_to has expired is rejected by RLS
  it('blocks former Class Teacher (Paul Mukasa) whose assignment has expired from recording attendance', async () => {
    const { client } = await createTeacherClient('paul.m@graceschool.ac.ug');
    const testDate = '2026-09-05';

    // Paul's assignment ended on 2025-12-31; RLS policy must deny him access
    const { data, error } = await client
      .from('student_attendance_sessions')
      .insert({
        school_id: schoolId,
        class_id: classId,
        stream_id: streamId,
        date: testDate,
        class_teacher_id: paulEmployeeId,
        recorded_by_teacher_id: paulEmployeeId,
        total_students: 24,
        present_count: 24,
        absent_count: 0,
      });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    // RLS policy violation code: 42501
    expect(error?.code).toBe('42501');
  });

  // 5. Strict Lesson Ownership: teacher cannot insert a lesson under someone else's teacher ID
  it('enforces strict lesson ownership: a teacher cannot forge a lesson for another teacher', async () => {
    const { client } = await createTeacherClient('teacher@somacampus.ug'); // Sarah

    // Sarah tries to insert a lesson claiming David is the teacher
    const { data, error } = await client
      .from('lessons')
      .insert({
        school_id: schoolId,
        class_id: classId,
        subject_id: '77777777-7777-7777-7777-777777777771',
        teacher_id: davidEmployeeId, // Forged teacher_id!
        lesson_status: 'completed',
        visible_lesson_note: 'Attempting to forge David lesson record',
      });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error?.code).toBe('42501');
  });

  // 6. Attendance Correction Audit Trail
  it('preserves immutable audit log when attendance status is corrected', async () => {
    const { client } = await createTeacherClient('teacher@somacampus.ug');
    const testDate = '2026-09-03';

    // Fetch the session created in test 1
    const { data: session } = await client
      .from('student_attendance_sessions')
      .select('id')
      .eq('class_id', classId)
      .eq('date', testDate)
      .single();

    expect(session).toBeDefined();

    // Ensure test person and student exist
    let testStudentId: string;
    const { data: existingStudents } = await adminClient!
      .from('students')
      .select('id')
      .limit(1);

    if (existingStudents && existingStudents.length > 0) {
      testStudentId = existingStudents[0].id;
    } else {
      const { data: testPerson } = await adminClient!
        .from('people')
        .insert({
          first_name: 'John',
          last_name: 'Okello',
          email: 'john.o@graceschool.ac.ug',
        })
        .select()
        .single();

      const { data: testStudent } = await adminClient!
        .from('students')
        .insert({
          person_id: testPerson.id,
          admission_number: 'GCC-TEST-001',
          status: 'active',
        })
        .select()
        .single();
      testStudentId = testStudent.id;
    }

    // Insert student attendance record as absent
    const { data: record, error: recErr } = await client
      .from('student_attendance_records')
      .upsert({
        session_id: session!.id,
        student_id: testStudentId,
        school_id: schoolId,
        class_id: classId,
        stream_id: streamId,
        date: testDate,
        status: 'absent',
        recorded_by: sarahEmployeeId,
      })
      .select()
      .single();

    expect(recErr).toBeNull();
    expect(record).toBeDefined();

    // Update status to 'present' with correction reason
    const { error: updateErr } = await client
      .from('student_attendance_records')
      .update({
        status: 'present',
        corrected_by: sarahEmployeeId,
        corrected_at: new Date().toISOString(),
        correction_reason: 'Arrived late with clinic note',
      })
      .eq('id', record.id);

    expect(updateErr).toBeNull();

    // Verify audit log has captured the change
    const { data: auditLogs, error: auditErr } = await client
      .from('student_attendance_audit_logs')
      .select('*')
      .eq('attendance_record_id', record.id);

    expect(auditErr).toBeNull();
    expect(auditLogs).toBeDefined();
    expect(auditLogs!.length).toBeGreaterThanOrEqual(1);

    const log = auditLogs![0];
    expect(log.previous_status).toBe('absent');
    expect(log.new_status).toBe('present');
    expect(log.reason).toBe('Arrived late with clinic note');
    expect(log.changed_by_teacher_id).toBe(sarahEmployeeId);
  });
});
