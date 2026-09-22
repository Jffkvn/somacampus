#!/usr/bin/env node
/**
 * Seeds a published deterministic quiz for write-path / UI E2E.
 * Prints quiz id to docs/verification/learning-quiz-seed.json
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').filter((l) => l && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const schoolId = '22222222-2222-2222-2222-222222222222';
  // Reuse learner + teacher from write-path seed if present
  const seedPath = path.join(root, 'docs/verification/learning-write-path-seed.json');
  const prev = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  // Offering for the student (first active enrolment)
  const { data: enrol } = await db
    .from('online_enrolments')
    .select('offering_id')
    .eq('school_id', schoolId)
    .eq('student_id', prev.studentId)
    .eq('status', 'active')
    .limit(1);

  let offeringId = enrol?.[0]?.offering_id ?? null;
  if (!offeringId) {
    // Create a minimal offering + enrolment so quiz parent law is satisfied.
    const { data: offering, error: offErr } = await db
      .from('online_offerings')
      .insert({
        school_id: schoolId,
        title: 'E2E Fractions Lab',
        delivery_pace: 'term_paced',
      })
      .select('id')
      .single();
    if (offErr) throw offErr;
    offeringId = offering.id;
    const { error: enrErr } = await db.from('online_enrolments').insert({
      school_id: schoolId,
      student_id: prev.studentId,
      offering_id: offeringId,
      status: 'active',
      start_date: new Date().toISOString().slice(0, 10),
    });
    if (enrErr) throw enrErr;
  }

  // Learning activity (ASSIGNMENT) as the gradebook target
  const { data: activity, error: actErr } = await db
    .from('learning_activities')
    .insert({
      school_id: schoolId,
      online_offering_id: offeringId,
      activity_type: 'ASSIGNMENT',
      title: 'P2A-1 quiz · What is 7 × 8?',
      instructions: 'Deterministic quiz — answer key only.',
      is_published: true,
      due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    })
    .select('id')
    .single();
  if (actErr) throw actErr;

  const questions = [
    {
      question_type: 'mcq',
      prompt: 'What is 7 × 8?',
      options: [
        { id: 'a', text: '54' },
        { id: 'b', text: '56' },
        { id: 'c', text: '64' },
      ],
      answer_key: { correct_option_id: 'b' },
      default_marks: 1,
    },
    {
      question_type: 'true_false',
      prompt: 'Plants need sunlight to grow well.',
      options: [],
      answer_key: { correct: true },
      default_marks: 1,
    },
    {
      question_type: 'short_answer',
      prompt: 'Write fifty-six as digits.',
      options: [],
      answer_key: { accepted: ['56'], case_sensitive: false },
      default_marks: 1,
    },
    {
      question_type: 'matching',
      prompt: 'Match: triangle → 3 sides; square → 4 sides',
      options: {
        pairs: [
          { left: 'triangle', right: '' },
          { left: 'square', right: '' },
        ],
      },
      answer_key: {
        correct_pairs: [
          { left: 'triangle', right: '3 sides' },
          { left: 'square', right: '4 sides' },
        ],
      },
      default_marks: 2,
    },
  ];

  const qIds = [];
  for (const q of questions) {
    const { data: row, error } = await db
      .from('learning_quiz_questions')
      .insert({ ...q, school_id: schoolId })
      .select('id, default_marks')
      .single();
    if (error) throw error;
    qIds.push(row);
  }

  const { data: quiz, error: quizErr } = await db
    .from('learning_quizzes')
    .insert({
      school_id: schoolId,
      title: 'P2A-1 Deterministic Quiz',
      instructions: 'Answer every question. Scores come from the key only.',
      online_offering_id: offeringId,
      learning_activity_id: activity.id,
      pass_mark: 3,
      max_attempts: 3,
      is_published: true,
    })
    .select('id')
    .single();
  if (quizErr) throw quizErr;

  for (let i = 0; i < qIds.length; i++) {
    const { error } = await db.from('learning_quiz_items').insert({
      quiz_id: quiz.id,
      question_id: qIds[i].id,
      sort_order: i,
      marks: Number(qIds[i].default_marks),
    });
    if (error) throw error;
  }

  const out = {
    schoolId,
    studentId: prev.studentId,
    teacherPerson: prev.teacherPerson,
    offeringId,
    learningActivityId: activity.id,
    quizId: quiz.id,
    questionIds: qIds.map((q) => q.id),
  };
  fs.writeFileSync(path.join(root, 'docs/verification/learning-quiz-seed.json'), JSON.stringify(out, null, 2));
  console.log('Quiz seed ready:', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
