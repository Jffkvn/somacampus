#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const envPath = path.join(projectRoot, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = Object.fromEntries(
  envContent
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const [k, ...v] = line.split('=');
      return [k.trim(), v.join('=').trim()];
    })
);

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function runSeed() {
  console.log('--- Seeding Pilot School Curriculum Adoption & Scheme of Work ---');

  // 1. Get School
  const { data: schools } = await supabase.from('schools').select('id, name').limit(1);
  const school = schools?.[0];
  if (!school) throw new Error('No school found');
  console.log(`School: ${school.name} (${school.id})`);

  // 2. Get Cambridge Framework & Version
  const { data: fw } = await supabase.from('curriculum_frameworks').select('id').eq('code', 'CAMBRIDGE_PRIMARY').single();
  const { data: ver } = await supabase.from('curriculum_versions').select('id').eq('version_code', '2026.1').single();
  if (!fw || !ver) throw new Error('Cambridge Primary framework or version not found');

  // 3. Adopt Curriculum
  const { data: adoption } = await supabase
    .from('school_curriculum_adoptions')
    .upsert(
      {
        school_id: school.id,
        framework_id: fw.id,
        version_id: ver.id,
        status: 'active',
      },
      { onConflict: 'school_id,framework_id,version_id' }
    )
    .select('id')
    .single();

  console.log(`Adoption active: ${adoption.id}`);

  // 4. Map School Subject (Mathematics)
  const { data: schoolMath } = await supabase.from('subjects').select('id').eq('school_id', school.id).eq('code', 'MATH').single();
  const { data: currMath } = await supabase.from('curriculum_subjects').select('id').eq('version_id', ver.id).eq('code', 'MATH').single();

  if (schoolMath && currMath) {
    await supabase
      .from('school_curriculum_subject_maps')
      .upsert(
        {
          school_id: school.id,
          adoption_id: adoption.id,
          subject_id: schoolMath.id,
          curriculum_subject_id: currMath.id,
        },
        { onConflict: 'adoption_id,subject_id,curriculum_subject_id' }
      );
    console.log(`Subject mapped: School MATH -> Curriculum MATH`);
  }

  // 5. Get Year, Term, Class (P.5 / Stage 5), Teacher (David)
  const { data: year } = await supabase.from('academic_years').select('id').eq('school_id', school.id).limit(1).single();
  const { data: term } = await supabase.from('terms').select('id').eq('academic_year_id', year.id).limit(1).single();
  const { data: p5Class } = await supabase.from('classes').select('id, name').eq('school_id', school.id).ilike('name', '%5%').limit(1).single();
  const { data: stage5 } = await supabase.from('curriculum_stages').select('id').eq('version_id', ver.id).eq('stage_number', 5).single();
  const { data: teacher } = await supabase.from('employees').select('id').limit(1).single();

  if (year && term && p5Class && stage5 && teacher && schoolMath) {
    // 6. Create Scheme of Work
    let schemeId;
    const { data: existingScheme } = await supabase
      .from('schemes_of_work')
      .select('id')
      .eq('school_id', school.id)
      .eq('class_id', p5Class.id)
      .eq('subject_id', schoolMath.id)
      .maybeSingle();

    if (existingScheme) {
      schemeId = existingScheme.id;
    } else {
      const { data: newScheme } = await supabase
        .from('schemes_of_work')
        .insert({
          school_id: school.id,
          academic_year_id: year.id,
          term_id: term.id,
          class_id: p5Class.id,
          subject_id: schoolMath.id,
          stage_id: stage5.id,
          created_by_employee_id: teacher.id,
          title: 'Stage 5 Mathematics — Term 1 Cambridge Curriculum Scheme',
          overview_text: 'Term 1 scheme covering number sense, equivalent fractions, decimals, percentages, and geometric reasoning.',
          status: 'active',
        })
        .select('id')
        .single();
      if (!newScheme) {
        throw new Error('Failed to insert scheme');
      }
      schemeId = newScheme.id;
    }

    console.log(`Scheme of work: ${schemeId}`);

    // 7. Create Medium-Term Unit 1
    let unitId;
    const { data: existingUnit } = await supabase
      .from('medium_term_plans')
      .select('id')
      .eq('scheme_id', schemeId)
      .eq('unit_number', 1)
      .maybeSingle();

    if (existingUnit) {
      unitId = existingUnit.id;
    } else {
      const { data: newUnit } = await supabase
        .from('medium_term_plans')
        .insert({
          scheme_id: schemeId,
          unit_number: 1,
          title: 'Unit 1: Number Sense & Equivalent Fractions',
          week_start: 1,
          week_end: 3,
          learning_focus: 'Fractions equivalence, decimal conversion, and visual models.',
          estimated_periods: 12,
          display_order: 1,
        })
        .select('id')
        .single();
      unitId = newUnit.id;
    }

    // 8. Create Teaching Sequence 1 & Link Objective 5Nn.01
    const { data: obj5Nn } = await supabase.from('learning_objectives').select('id').eq('code', '5Nn.01').single();

    let seqId;
    const { data: existingSeq } = await supabase
      .from('teaching_sequences')
      .select('id')
      .eq('medium_term_plan_id', unitId)
      .eq('sequence_number', 1)
      .maybeSingle();

    if (existingSeq) {
      seqId = existingSeq.id;
    } else {
      const { data: newSeq } = await supabase
        .from('teaching_sequences')
        .insert({
          medium_term_plan_id: unitId,
          sequence_number: 1,
          title: 'Lesson 1: Exploring Equivalent Fractions with Visual Models',
          suggested_activities: 'Use fraction walls, strips, and number lines to represent equivalent fractions.',
          suggested_resources: 'Cambridge Primary Mathematics Learner Book 5, fraction manipulatives.',
          recommended_duration_mins: 45,
          display_order: 1,
        })
        .select('id')
        .single();
      seqId = newSeq.id;
    }

    if (obj5Nn && seqId) {
      await supabase
        .from('teaching_sequence_objectives')
        .upsert(
          {
            teaching_sequence_id: seqId,
            learning_objective_id: obj5Nn.id,
            is_primary: true,
          },
          { onConflict: 'teaching_sequence_id,learning_objective_id' }
        );
      console.log(`Teaching sequence linked to 5Nn.01`);
    }
  }

  console.log('--- Pilot Planning Data Seeded Successfully ---');
}

runSeed().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
