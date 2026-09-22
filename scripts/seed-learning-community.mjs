#!/usr/bin/env node
/** Seeds a teacher-led community + moderator membership for UI/write-path E2E. */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const writeSeed = JSON.parse(fs.readFileSync('docs/verification/learning-write-path-seed.json', 'utf8'));

async function main() {
  const schoolId = writeSeed.schoolId;
  const teacherPerson = writeSeed.teacherPerson;

  const { data: existing } = await db
    .from('learning_communities')
    .select('id')
    .eq('school_id', schoolId)
    .eq('title', 'Stage 5 · Class community')
    .maybeSingle();

  let communityId = existing?.id;
  if (!communityId) {
    const { data: c, error } = await db
      .from('learning_communities')
      .insert({
        school_id: schoolId,
        community_type: 'teacher_led',
        title: 'Stage 5 · Class community',
        description: 'Teacher-led challenges and show-and-tell.',
        stage_key: 'Stage 5',
        moderator_person_id: teacherPerson,
      })
      .select('id')
      .single();
    if (error) throw error;
    communityId = c.id;
    const { error: mErr } = await db.from('community_members').insert({
      community_id: communityId,
      person_id: teacherPerson,
      member_role: 'moderator',
      can_post: true,
      can_reply: true,
    });
    if (mErr) throw mErr;
  }

  const out = { communityId, schoolId, teacherPerson, teacherEmail: 'teacher@somacampus.ug' };
  fs.writeFileSync('docs/verification/learning-community-seed.json', JSON.stringify(out, null, 2));
  console.log('Community seed ready:', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
