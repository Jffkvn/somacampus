#!/usr/bin/env node
/**
 * scripts/seed-learning-write-path.mjs
 *
 * Seeds live demo data for Digital Learning Spine write-path E2E:
 * - published ASSIGNMENT + roster row for student@somacampus.ug
 * - learning_coach_settings (school default, hours sign-off on)
 * - learning_coach_assignments (parent@somacampus.ug as guardian coach)
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (admin) — fail closed on errors.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function personIdByEmail(email) {
  const { data, error } = await db.from('people').select('id').eq('email', email).limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error(`No person for ${email}`);
  return data[0].id;
}

async function studentIdByPerson(personId) {
  const { data, error } = await db.from('students').select('id').eq('person_id', personId).limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error(`No student for person ${personId}`);
  return data[0].id;
}

async function employeeIdByPerson(personId) {
  const { data, error } = await db.from('employees').select('id').eq('person_id', personId).limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error(`No employee for person ${personId}`);
  return data[0].id;
}

async function main() {
  const schoolId = '22222222-2222-2222-2222-222222222222';
  const subjectId = '77777777-7777-7777-7777-777777777771'; // Mathematics (live)
  const classId = '55555555-5555-5555-5555-555555555551'; // Stage 5 (live)

  const studentPerson = await personIdByEmail('student@somacampus.ug');
  const studentId = await studentIdByPerson(studentPerson);
  const teacherPerson = await personIdByEmail('teacher@somacampus.ug');
  const teacherId = await employeeIdByPerson(teacherPerson);
  const parentPerson = await personIdByEmail('parent@somacampus.ug');

  console.log({ schoolId, studentId, teacherId, studentPerson, parentPerson });

  // 1. Coach settings (configurable hours — weekly target 3h).
  const { error: settingsErr } = await db.from('learning_coach_settings').upsert(
    {
      school_id: schoolId,
      stage_key: null,
      is_enabled: true,
      timezone: 'Africa/Kampala',
      weekly_hours_target: 3,
    },
    { onConflict: 'school_id,stage_key' },
  );
  if (settingsErr) throw settingsErr;

  // 2. Parent as active Learning Coach for this student.
  const { data: existingCoach } = await db
    .from('learning_coach_assignments')
    .select('id')
    .eq('student_id', studentId)
    .eq('coach_person_id', parentPerson)
    .eq('is_active', true)
    .maybeSingle();
  let coachAssignmentId = existingCoach?.id;
  if (!coachAssignmentId) {
    const { data: coachRow, error: coachErr } = await db
      .from('learning_coach_assignments')
      .insert({
        school_id: schoolId,
        student_id: studentId,
        coach_person_id: parentPerson,
        coach_role: 'parent',
        is_active: true,
      })
      .select('id')
      .single();
    if (coachErr) throw coachErr;
    coachAssignmentId = coachRow.id;
  }

  // 3. Open assignment (due tomorrow) owned by the demo teacher.
  const due = new Date();
  due.setDate(due.getDate() + 1);
  const dueDate = due.toISOString().slice(0, 10);
  const title = `Write-path E2E fractions ${new Date().toISOString().slice(0, 10)}`;
  const { data: assignment, error: assignErr } = await db
    .from('assignments')
    .insert({
      school_id: schoolId,
      teacher_id: teacherId,
      class_id: classId,
      subject_id: subjectId,
      title,
      instructions: 'Photograph Q1–Q4 in your exercise book and hand in.',
      assigned_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate,
      submission_type: 'homework',
      evidence_track: 'diagnostic_evidence',
      status: 'published',
    })
    .select('id')
    .single();
  if (assignErr) throw assignErr;

  const { error: rosterErr } = await db.from('student_submissions').insert({
    school_id: schoolId,
    assignment_id: assignment.id,
    student_id: studentId,
    participation_status: 'expected',
    submission_status: 'pending',
    work_type: 'notebook',
    teacher_review_status: 'unreviewed',
  });
  if (rosterErr) throw rosterErr;

  // 4. Simple rubric for the follow-on marking UI.
  const { data: rubric, error: rubricErr } = await db
    .from('learning_rubrics')
    .insert({
      school_id: schoolId,
      title: 'P0 method rubric',
      description: 'Understanding · Method · Accuracy',
      criteria: [
        {
          id: 'understanding',
          title: 'Understanding',
          levels: [
            { value: 0, label: 'Not yet', points: 0 },
            { value: 1, label: 'Developing', points: 1 },
            { value: 2, label: 'Secure', points: 2 },
            { value: 3, label: 'Excellent', points: 3 },
          ],
        },
        {
          id: 'method',
          title: 'Method',
          levels: [
            { value: 0, label: 'Not yet', points: 0 },
            { value: 1, label: 'Developing', points: 1 },
            { value: 2, label: 'Secure', points: 2 },
            { value: 3, label: 'Excellent', points: 3 },
          ],
        },
        {
          id: 'accuracy',
          title: 'Accuracy',
          levels: [
            { value: 0, label: 'Not yet', points: 0 },
            { value: 1, label: 'Developing', points: 1 },
            { value: 2, label: 'Secure', points: 2 },
            { value: 3, label: 'Excellent', points: 3 },
          ],
        },
      ],
    })
    .select('id')
    .single();
  if (rubricErr) throw rubricErr;

  const out = {
    schoolId,
    studentId,
    studentPerson,
    teacherId,
    teacherPerson,
    parentPerson,
    coachAssignmentId,
    assignmentId: assignment.id,
    assignmentTitle: title,
    dueDate,
    rubricId: rubric.id,
  };
  fs.writeFileSync(path.join(root, 'docs/verification/learning-write-path-seed.json'), JSON.stringify(out, null, 2));
  console.log('Seeded write-path fixtures:', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
