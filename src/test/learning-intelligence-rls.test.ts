import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasLiveAdminCreds, hasLiveAnonCreds } from './helpers/supabaseEnv';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vhivioulpbdyaynkqpja.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAnon = hasLiveAnonCreds(SUPABASE_URL, SUPABASE_ANON_KEY);
const hasAdmin = hasLiveAdminCreds(SUPABASE_URL, SUPABASE_SERVICE_KEY);

describe.skipIf(!hasAnon)('Phase 5 Learning Intelligence & Interventions RLS Security Suite', () => {
  const schoolId = '22222222-2222-2222-2222-222222222222';
  const classId = '55555555-5555-5555-5555-555555555551'; // Stage 5
  const streamId = '66666666-6666-6666-6666-666666666661'; // Blue
  const mathSubjectId = '77777777-7777-7777-7777-777777777771'; // Mathematics (David)

  const davidEmployeeId = '99999999-9999-9999-9999-999999999992'; // Subject Teacher Math
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
      await adminClient
        .from('interventions')
        .delete()
        .eq('school_id', schoolId)
        .like('learning_area', 'TEST_%');
    }
  });

  it('allows assigned Subject Teacher (David) to create an intervention for Mathematics', async () => {
    const { client } = await createTeacherClient('david.m@graceschool.ac.ug');

    const { data, error } = await client
      .from('interventions')
      .insert({
        school_id: schoolId,
        student_id: student1Id,
        teacher_id: davidEmployeeId,
        class_id: classId,
        stream_id: streamId,
        subject_id: mathSubjectId,
        learning_area: 'TEST_Fractions',
        reason: 'Difficulty with mixed numbers',
        strategy_action: '15-minute small group practice',
        target_outcome: 'Independent conversion with 80%+ accuracy',
        start_date: '2026-09-05',
        target_date: '2026-09-19',
        status: 'active',
      })
      .select('id, learning_area, status')
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.learning_area).toBe('TEST_Fractions');
    expect(data!.status).toBe('active');
  });

  it('allows school leadership (Principal) to create interventions across subjects', async () => {
    const { client } = await createTeacherClient('principal@somacampus.ug');

    const { data, error } = await client
      .from('interventions')
      .insert({
        school_id: schoolId,
        student_id: student1Id,
        teacher_id: davidEmployeeId,
        class_id: classId,
        stream_id: streamId,
        subject_id: mathSubjectId,
        learning_area: 'TEST_Leadership_Math_Intervention',
        reason: 'Identified by academic review',
        strategy_action: 'Peer tutoring twice weekly',
        target_outcome: '80% accuracy',
        start_date: '2026-09-05',
        target_date: '2026-09-25',
        status: 'active',
      })
      .select('id, learning_area')
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it('preserves immutable audit log when intervention status changes from active to completed', async () => {
    const { client } = await createTeacherClient('david.m@graceschool.ac.ug');

    // 1. Create active intervention
    const { data: created, error: createErr } = await client
      .from('interventions')
      .insert({
        school_id: schoolId,
        student_id: student1Id,
        teacher_id: davidEmployeeId,
        class_id: classId,
        stream_id: streamId,
        subject_id: mathSubjectId,
        learning_area: 'TEST_Audit_Intervention',
        reason: 'Initial friction',
        strategy_action: 'Targeted support',
        target_outcome: 'Pass test',
        target_date: '2026-09-20',
        status: 'active',
      })
      .select('id')
      .single();

    expect(createErr).toBeNull();
    const interventionId = created!.id;

    // 2. Complete the intervention
    const { error: updateErr } = await client
      .from('interventions')
      .update({
        status: 'completed',
        outcome: 'improved',
        outcome_notes: 'Target achieved with 90% score on follow-up test',
      })
      .eq('id', interventionId);

    expect(updateErr).toBeNull();

    // 3. Verify audit log record exists
    if (adminClient) {
      const { data: auditLogs, error: auditErr } = await adminClient
        .from('intervention_audit_logs')
        .select('*')
        .eq('intervention_id', interventionId)
        .order('changed_at', { ascending: true });

      expect(auditErr).toBeNull();
      expect(auditLogs).toBeDefined();
      expect(auditLogs!.length).toBeGreaterThanOrEqual(2);

      // Transition 1: Initial creation (NULL -> active)
      expect(auditLogs![0].previous_status).toBeNull();
      expect(auditLogs![0].new_status).toBe('active');

      // Transition 2: Completion (active -> completed)
      expect(auditLogs![1].previous_status).toBe('active');
      expect(auditLogs![1].new_status).toBe('completed');
    }
  });

  it('verifies that private teacher reflections are never queried or leaked into intelligence', async () => {
    const { client } = await createTeacherClient('david.m@graceschool.ac.ug');

    // Query interventions - works
    const { data: ivs, error: ivErr } = await client.from('interventions').select('id').limit(1);
    expect(ivErr).toBeNull();
    expect(ivs).toBeDefined();

    // Attempt to read private reflections of another teacher (Sarah)
    const { data: reflections } = await client
      .from('teacher_reflections')
      .select('*');

    // David should only see 0 rows or reflections where teacher_user_id = David's user ID
    if (reflections && reflections.length > 0) {
      for (const r of reflections) {
        expect(r.teacher_user_id).toBe(client.auth.getUser());
      }
    }
  });
});
