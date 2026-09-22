#!/usr/bin/env node
/** Seeds an assessment pack wired to the P2A-1 quiz + write-path activity. */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const quizSeed = JSON.parse(fs.readFileSync('docs/verification/learning-quiz-seed.json', 'utf8'));
const writeSeed = JSON.parse(fs.readFileSync('docs/verification/learning-write-path-seed.json', 'utf8'));

async function main() {
  const { data: pack, error } = await db
    .from('learning_assessment_packs')
    .insert({
      school_id: quizSeed.schoolId,
      pack_kind: 'unit',
      title: 'Unit 1 · Number & Shape',
      description: 'P2A-4 E2E pack (fractions quiz + photo task).',
      online_offering_id: quizSeed.offeringId,
      is_published: true,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: itemErr } = await db.from('learning_assessment_items').insert([
    {
      pack_id: pack.id,
      sort_order: 0,
      item_title: 'Deterministic quiz',
      quiz_id: quizSeed.quizId,
      objective_map: [{ objective_code: 'N1', objective_title: 'Number · multiplication' }],
      weight: 1,
    },
    {
      pack_id: pack.id,
      sort_order: 1,
      item_title: 'Fractions photo task',
      learning_activity_id: quizSeed.learningActivityId,
      objective_map: [{ objective_code: 'N2', objective_title: 'Number · fractions' }],
      weight: 2,
    },
  ]);
  if (itemErr) throw itemErr;

  const out = { packId: pack.id, quizId: quizSeed.quizId, studentId: quizSeed.studentId };
  fs.writeFileSync('docs/verification/learning-assessment-pack-seed.json', JSON.stringify(out, null, 2));
  console.log('Pack seed ready:', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
