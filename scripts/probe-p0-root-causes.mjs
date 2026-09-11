/**
 * Read-only root-cause probe for P0 fixes (F2 parent overview, F3 student home).
 * Signs in as the demo parent / student and replays the exact queries the
 * services make, reporting which one fails. No writes anywhere.
 *
 * Run: node scripts/probe-p0-root-causes.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(\S+)/)[1];
const anon = env.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)[1];
const SCHOOL = '22222222-2222-2222-2222-222222222222';

const parent = createClient(url, anon);
const student = createClient(url, anon);

const p = async (label, fn) => {
  try {
    const r = await fn();
    if (r.error) console.log(`FAIL ${label}:`, JSON.stringify(r.error));
    else console.log(`ok   ${label}:`, JSON.stringify(r.data)?.slice(0, 160));
  } catch (e) {
    console.log(`THROW ${label}:`, e.message);
  }
};

console.log('=== PARENT ===');
const { data: pAuth } = await parent.auth.signInWithPassword({
  email: 'parent@somacampus.ug', password: 'SomaCampus2026!',
});
console.log('parent auth ok:', pAuth.user?.id);

const { data: person } = await parent.from('people').select('id, first_name, last_name, auth_user_id')
  .eq('auth_user_id', pAuth.user.id).maybeSingle();
console.log('person row:', person);

const { data: links } = await parent.from('student_guardians').select('student_id')
  .eq('guardian_person_id', person.id);
console.log('guardian links:', links);

const { data: enrols } = await parent.from('student_enrolments')
  .select('student_id, classes(id, name), streams(id, name)')
  .eq('school_id', SCHOOL).eq('status', 'active')
  .in('student_id', (links ?? []).map((l) => l.student_id));
console.log('enrolments:', JSON.stringify(enrols)?.slice(0, 200));

const studentId = enrols?.[0]?.student_id;
if (studentId) {
  await p('students by id', () => parent.from('students').select('id, admission_number, person:people!students_person_id_fkey(first_name, last_name)').eq('id', studentId).maybeSingle());
  await p('enrolment single', () => parent.from('student_enrolments').select('student_id, class_id, classes(id, name), streams(id, name)').eq('student_id', studentId).eq('school_id', SCHOOL).eq('status', 'active').maybeSingle());
  await p('attendance records', () => parent.from('student_attendance_records').select('id, date, status, remarks').eq('student_id', studentId).order('date', { ascending: false }).limit(60));
  await p('submissions', () => parent.from('student_submissions').select('id, assignment_id, submission_status, teacher_feedback, created_at, assignment:assignments!student_submissions_assignment_id_fkey(id, title, due_date, subjects(name))').eq('student_id', studentId).order('created_at', { ascending: false }));
  await p('observations', () => parent.from('teacher_observations').select('id, observation_text, observed_at, visibility, teacher:employees(people(first_name, last_name)), subjects(name)').eq('student_id', studentId).eq('visibility', 'parent_visible').order('observed_at', { ascending: false }));
  await p('lessons by class', () => parent.from('lessons').select('visible_lesson_note, submitted_at, curriculum_topic, subjects(name)').eq('school_id', SCHOOL).eq('class_id', enrols[0].classes.id).order('submitted_at', { ascending: false }).limit(8));
  await p('fee statement charges view', () => parent.from('student_fee_accounts').select('*').eq('student_id', studentId));
  await p('fee charges table', () => parent.from('fee_charges').select('*').eq('student_id', studentId).limit(5));
  await p('fee payments', () => parent.from('fee_payments').select('*').eq('student_id', studentId).limit(5));
  await p('activity enrolments', () => parent.from('activity_enrolments').select('student_id, student_name, class_name, stream_name, activity_id').eq('school_id', SCHOOL).eq('student_id', studentId));
  // financeService.getStudentFeeStatement likely queries a view; probe the likely ones
  await p('student_fee_statement view', () => parent.from('student_fee_statement').select('*').eq('student_id', studentId));
  await p('student_fee_statements view', () => parent.from('student_fee_statements').select('*').eq('student_id', studentId));
}

await parent.auth.signOut();

console.log('=== STUDENT ===');
const { data: sAuth } = await student.auth.signInWithPassword({
  email: 'student@somacampus.ug', password: 'SomaCampus2026!',
});
console.log('student auth ok:', sAuth.user?.id);

await p('online_students by email single', () => student.from('online_students').select('*').eq('email', 'student@somacampus.ug').single());
await p('online_students by email maybe', () => student.from('online_students').select('*').eq('email', 'student@somacampus.ug').maybeSingle());
await p('online_students rows count', () => student.from('online_students').select('id, email').limit(10));

const { data: sPerson } = await student.from('people').select('id, auth_user_id')
  .eq('auth_user_id', sAuth.user.id).maybeSingle();
console.log('student person row:', sPerson);
if (sPerson) {
  await p('students by person', () => student.from('students').select('id, admission_number, person_id').eq('person_id', sPerson.id));
}

await student.auth.signOut();
console.log('done');
