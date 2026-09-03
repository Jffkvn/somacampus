import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasLiveAdminCreds, hasLiveAnonCreds } from './helpers/supabaseEnv';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vhivioulpbdyaynkqpja.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAnon = hasLiveAnonCreds(SUPABASE_URL, SUPABASE_ANON_KEY);
const hasAdmin = hasLiveAdminCreds(SUPABASE_URL, SUPABASE_SERVICE_KEY);

describe.skipIf(!hasAnon)('Phase 4 Academic Evidence & RLS Security Suite', () => {
  const schoolId = '22222222-2222-2222-2222-222222222222';
  const classId = '55555555-5555-5555-5555-555555555551'; // Stage 5
  const streamId = '66666666-6666-6666-6666-666666666661'; // Blue
  const mathSubjectId = '77777777-7777-7777-7777-777777777771'; // Mathematics (David)

  const davidEmployeeId = '99999999-9999-9999-9999-999999999992'; // Subject Teacher Math
  const sarahEmployeeId = '99999999-9999-9999-9999-999999999991'; // Class Teacher
  const student1Id = '22222222-0000-0000-0000-000000000001'; // John Okello

  async function createTeacherClient(email: string, pass = 'SomaCampus2026!') {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
    if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
    return { client, user: data.user };
  }

  const adminClient = hasAdmin
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    : null;

  beforeAll(async () => {
    if (adminClient) {
      // Clean up any test assignments created in this suite
      await adminClient
        .from('assignments')
        .delete()
        .eq('school_id', schoolId)
        .like('title', 'TEST_%');
    }
  });

  it('allows assigned Subject Teacher (David) to create an assignment for Mathematics', async () => {
    const { client } = await createTeacherClient('david.m@graceschool.ac.ug');

    const { data, error } = await client
      .from('assignments')
      .insert({
        school_id: schoolId,
        teacher_id: davidEmployeeId,
        class_id: classId,
        stream_id: streamId,
        subject_id: mathSubjectId,
        title: 'TEST_Math_Fractions_HW',
        instructions: 'Solve questions 1 through 10.',
        assigned_date: '2026-09-05',
        due_date: '2026-09-08',
        submission_type: 'homework',
        evidence_track: 'diagnostic_evidence',
        status: 'published',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.title).toBe('TEST_Math_Fractions_HW');
  });

  it('blocks Class Teacher (Sarah) from creating an assignment for Mathematics without subject authority (RULE 3)', async () => {
    const { client } = await createTeacherClient('teacher@somacampus.ug'); // Sarah (Class Teacher)

    const { data, error } = await client
      .from('assignments')
      .insert({
        school_id: schoolId,
        teacher_id: sarahEmployeeId,
        class_id: classId,
        stream_id: streamId,
        subject_id: mathSubjectId, // Math belongs to David, NOT Sarah!
        title: 'TEST_Unauthorized_Sarah_Math',
        instructions: 'Unauthorized homework attempt.',
        assigned_date: '2026-09-05',
        due_date: '2026-09-08',
        submission_type: 'homework',
        evidence_track: 'diagnostic_evidence',
        status: 'published',
      })
      .select()
      .maybeSingle();

    // Must be rejected by RLS policy is_authorised_assignment_creator
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('allows school leadership (Principal) to create assignments across subjects', async () => {
    const { client } = await createTeacherClient('principal@somacampus.ug');

    const { data, error } = await client
      .from('assignments')
      .insert({
        school_id: schoolId,
        teacher_id: davidEmployeeId,
        class_id: classId,
        stream_id: streamId,
        subject_id: mathSubjectId,
        title: 'TEST_Principal_Override_Assignment',
        instructions: 'End of term assessment.',
        assigned_date: '2026-09-05',
        due_date: '2026-09-10',
        submission_type: 'project',
        evidence_track: 'formal_graded',
        max_score: 100,
        status: 'published',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.evidence_track).toBe('formal_graded');
  });

  it('preserves immutable audit log when teacher updates an authoritative score', async () => {
    if (!adminClient) return;

    // Create a temporary assignment and submission
    const { data: assign } = await adminClient
      .from('assignments')
      .insert({
        school_id: schoolId,
        teacher_id: davidEmployeeId,
        class_id: classId,
        stream_id: streamId,
        subject_id: mathSubjectId,
        title: 'TEST_Audit_Score_Assignment',
        instructions: 'Scored task.',
        assigned_date: '2026-09-05',
        due_date: '2026-09-08',
        submission_type: 'classwork',
        evidence_track: 'formal_graded',
        max_score: 50,
      })
      .select()
      .single();

    const { data: sub } = await adminClient
      .from('student_submissions')
      .insert({
        school_id: schoolId,
        assignment_id: assign.id,
        student_id: student1Id,
        participation_status: 'expected',
        submission_status: 'submitted',
        work_type: 'written',
        score: 40,
        reviewed_by_teacher_id: davidEmployeeId,
      })
      .select()
      .single();

    // Now David updates the score to 45
    const { client: davidClient } = await createTeacherClient('david.m@graceschool.ac.ug');
    const { error: updateErr } = await davidClient
      .from('student_submissions')
      .update({
        score: 45,
        teacher_feedback: 'Recalculated question 3 mark.',
        reviewed_by_teacher_id: davidEmployeeId,
      })
      .eq('id', sub.id);

    expect(updateErr).toBeNull();

    // Verify trigger logged to academic_assessment_audit_logs
    const { data: logs } = await adminClient
      .from('academic_assessment_audit_logs')
      .select('*')
      .eq('submission_id', sub.id);

    expect(logs).toBeDefined();
    expect(logs!.length).toBeGreaterThanOrEqual(1);
    const log = logs![0];
    expect(Number(log.previous_score)).toBe(40);
    expect(Number(log.new_score)).toBe(45);
  });
});
