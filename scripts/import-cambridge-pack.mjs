#!/usr/bin/env node
/**
 * import-cambridge-pack.mjs
 *
 * Ingests the Cambridge Primary Pilot Pack #1 into Supabase using the service role key.
 * Validates integrity, stages, strands, sub-strands, objectives, and relationships.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables
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

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const packDir = path.join(projectRoot, 'src/curriculum/packs/cambridge_primary');
const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'manifest.json'), 'utf8'));
const framework = JSON.parse(fs.readFileSync(path.join(packDir, 'framework.json'), 'utf8'));
const stages = JSON.parse(fs.readFileSync(path.join(packDir, 'stages.json'), 'utf8'));
const prerequisites = JSON.parse(fs.readFileSync(path.join(packDir, 'relationships/prerequisites.json'), 'utf8'));

const subjects = {};
const subjectDirs = ['mathematics', 'english', 'science', 'global_perspectives', 'computing'];
for (const sub of subjectDirs) {
  const subDir = path.join(packDir, 'subjects', sub);
  subjects[sub] = {
    subject: JSON.parse(fs.readFileSync(path.join(subDir, 'subject.json'), 'utf8')),
    strands: JSON.parse(fs.readFileSync(path.join(subDir, 'strands.json'), 'utf8')),
    objectives: JSON.parse(fs.readFileSync(path.join(subDir, 'objectives.json'), 'utf8')),
  };
}

async function runImport() {
  console.log('--- Ingesting Cambridge Primary Pilot Pack ---');

  // 1. Framework
  console.log(`1. Upserting Framework: ${framework.code}`);
  const { data: fwData, error: fwErr } = await supabase
    .from('curriculum_frameworks')
    .upsert(
      {
        code: framework.code,
        name: framework.name,
        jurisdiction: framework.jurisdiction,
        description: framework.description,
        is_active: framework.is_active,
      },
      { onConflict: 'code' }
    )
    .select('id')
    .single();

  if (fwErr || !fwData) {
    console.error('Framework upsert failed:', fwErr);
    process.exit(1);
  }
  const frameworkId = fwData.id;

  // 2. Version
  console.log(`2. Upserting Version: ${manifest.version_code}`);
  const { data: verData, error: verErr } = await supabase
    .from('curriculum_versions')
    .upsert(
      {
        framework_id: frameworkId,
        version_code: manifest.version_code,
        release_year: manifest.release_year,
        valid_from: manifest.valid_from,
        valid_to: manifest.valid_to,
        is_current: manifest.is_current,
      },
      { onConflict: 'framework_id,version_code' }
    )
    .select('id')
    .single();

  if (verErr || !verData) {
    console.error('Version upsert failed:', verErr);
    process.exit(1);
  }
  const versionId = verData.id;

  // 3. Stages
  console.log(`3. Upserting ${stages.length} Stages`);
  const stageMap = new Map();
  for (const st of stages) {
    const { data: stData, error: stErr } = await supabase
      .from('curriculum_stages')
      .upsert(
        {
          version_id: versionId,
          stage_number: st.stage_number,
          name: st.name,
          typical_age_range: st.typical_age_range,
          display_order: st.display_order,
        },
        { onConflict: 'version_id,stage_number' }
      )
      .select('id, stage_number')
      .single();

    if (stErr || !stData) {
      console.error(`Stage ${st.stage_number} upsert failed:`, stErr);
      process.exit(1);
    }
    stageMap.set(stData.stage_number, stData.id);
  }

  // 4. Subjects, Strands, Sub-strands, Objectives
  console.log(`4. Upserting 5 Subjects and Hierarchies`);
  const objectiveIdMap = new Map();

  for (const [subKey, subDef] of Object.entries(subjects)) {
    console.log(`   -> Subject: ${subDef.subject.name} (${subDef.subject.code})`);
    const { data: subjData, error: subjErr } = await supabase
      .from('curriculum_subjects')
      .upsert(
        {
          version_id: versionId,
          code: subDef.subject.code,
          name: subDef.subject.name,
          description: subDef.subject.description,
          display_order: subDef.subject.display_order,
        },
        { onConflict: 'version_id,code' }
      )
      .select('id')
      .single();

    if (subjErr || !subjData) {
      console.error(`Subject ${subDef.subject.code} failed:`, subjErr);
      process.exit(1);
    }
    const subjectId = subjData.id;

    const strandIdMap = new Map();
    const subStrandIdMap = new Map();

    for (const str of subDef.strands) {
      // Find or insert strand
      let strandId;
      const { data: existingStrand } = await supabase
        .from('curriculum_strands')
        .select('id')
        .eq('version_id', versionId)
        .eq('subject_id', subjectId)
        .eq('code', str.code)
        .maybeSingle();

      if (existingStrand) {
        strandId = existingStrand.id;
      } else {
        const { data: newStrand, error: strErr } = await supabase
          .from('curriculum_strands')
          .insert({
            version_id: versionId,
            subject_id: subjectId,
            stage_id: null,
            code: str.code,
            name: str.name,
            description: str.description,
            display_order: str.display_order,
          })
          .select('id')
          .single();

        if (strErr || !newStrand) {
          console.error(`Strand ${str.code} failed:`, strErr);
          process.exit(1);
        }
        strandId = newStrand.id;
      }
      strandIdMap.set(str.code, strandId);

      // Sub-strands (if any)
      for (const ss of str.sub_strands ?? []) {
        const { data: ssData, error: ssErr } = await supabase
          .from('curriculum_sub_strands')
          .upsert(
            {
              version_id: versionId,
              strand_id: strandId,
              code: ss.code,
              name: ss.name,
              description: ss.name,
              display_order: ss.display_order,
            },
            { onConflict: 'strand_id,code' }
          )
          .select('id, code')
          .single();

        if (ssErr || !ssData) {
          console.error(`Sub-strand ${ss.code} failed:`, ssErr);
          process.exit(1);
        }
        subStrandIdMap.set(ssData.code, ssData.id);
      }
    }

    // Objectives
    for (const obj of subDef.objectives) {
      const stageId = stageMap.get(obj.stage_number);
      const strandId = strandIdMap.get(obj.strand_code);
      const subStrandId = obj.sub_strand_code ? subStrandIdMap.get(obj.sub_strand_code) ?? null : null;

      const { data: objData, error: objErr } = await supabase
        .from('learning_objectives')
        .upsert(
          {
            version_id: versionId,
            subject_id: subjectId,
            stage_id: stageId,
            strand_id: strandId,
            sub_strand_id: subStrandId,
            code: obj.code,
            title: obj.title,
            description: obj.description,
            progression_order: obj.progression_order,
            is_authoritative: manifest.is_authoritative,
            provenance_source: manifest.provenance_source,
            metadata: {
              pilot_pack: true,
              subject_key: subKey,
            },
          },
          { onConflict: 'version_id,code' }
        )
        .select('id, code')
        .single();

      if (objErr || !objData) {
        console.error(`Objective ${obj.code} failed:`, objErr);
        process.exit(1);
      }
      objectiveIdMap.set(objData.code, objData.id);
    }
  }

  // 5. Prerequisites & Relationships
  console.log(`5. Upserting ${prerequisites.length} Prerequisite Relationships`);
  let relCount = 0;
  for (const rel of prerequisites) {
    const sourceId = objectiveIdMap.get(rel.source_objective_code);
    const targetId = objectiveIdMap.get(rel.target_objective_code);

    if (sourceId && targetId) {
      const { error: relErr } = await supabase
        .from('learning_objective_relationships')
        .upsert(
          {
            source_objective_id: sourceId,
            target_objective_id: targetId,
            relationship_type: rel.relationship_type,
            notes: rel.notes,
          },
          { onConflict: 'source_objective_id,target_objective_id,relationship_type' }
        );

      if (relErr) {
        console.warn(`Prerequisite ${rel.source_objective_code} -> ${rel.target_objective_code} failed:`, relErr);
      } else {
        relCount++;
      }
    }
  }

  console.log('--- Cambridge Primary Pack Successfully Ingested ---');
  console.log(`Framework ID: ${frameworkId}`);
  console.log(`Version ID: ${versionId}`);
  console.log(`Objectives Ingested: ${objectiveIdMap.size}`);
  console.log(`Relationships Ingested: ${relCount}`);
}

runImport().catch((e) => {
  console.error('Fatal import error:', e);
  process.exit(1);
});
