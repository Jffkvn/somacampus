import { supabase } from '@/lib/supabase';
import {
  CAMBRIDGE_PRIMARY_PACK,
  type CurriculumPack,
} from '@/curriculum/packs/cambridge_primary';

export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportExecutionResult {
  success: boolean;
  frameworkId?: string;
  versionId?: string;
  subjectsCount: number;
  stagesCount: number;
  strandsCount: number;
  subStrandsCount: number;
  objectivesCount: number;
  relationshipsCount: number;
  errors?: string[];
}

export class CurriculumImportService {
  /**
   * Performs an in-memory referential and structural validation of the curriculum pack
   * before any database writes are attempted.
   */
  validatePack(pack: CurriculumPack = CAMBRIDGE_PRIMARY_PACK): ImportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Manifest checks
    if (!pack.manifest?.framework_code) {
      errors.push('Manifest missing required framework_code.');
    }
    if (!pack.manifest?.version_code) {
      errors.push('Manifest missing required version_code.');
    }

    // 2. Framework checks
    if (pack.framework?.code !== pack.manifest?.framework_code) {
      errors.push(
        `Framework code mismatch: manifest has '${pack.manifest?.framework_code}' but framework.json has '${pack.framework?.code}'`
      );
    }

    // 3. Stage checks
    const declaredStages = new Set(pack.stages.map((s) => s.stage_number));
    if (declaredStages.size === 0) {
      errors.push('Curriculum pack must declare at least one stage.');
    }

    // 4. Subjects & Objectives checks
    const allObjectiveCodes = new Set<string>();

    for (const [subjectKey, subjectDef] of Object.entries(pack.subjects)) {
      if (!subjectDef.subject?.code) {
        errors.push(`Subject '${subjectKey}' missing subject code.`);
      }

      const strandMap = new Map<string, { code: string; subStrandCodes: Set<string> }>();
      for (const strand of subjectDef.strands) {
        const subCodes = new Set((strand.sub_strands ?? []).map((ss) => ss.code));
        strandMap.set(strand.code, { code: strand.code, subStrandCodes: subCodes });
      }

      for (const obj of subjectDef.objectives) {
        if (allObjectiveCodes.has(obj.code)) {
          errors.push(`Duplicate objective code detected: '${obj.code}'`);
        }
        allObjectiveCodes.add(obj.code);

        if (!declaredStages.has(obj.stage_number)) {
          errors.push(
            `Objective '${obj.code}' references non-existent stage number '${obj.stage_number}'`
          );
        }

        const strand = strandMap.get(obj.strand_code);
        if (!strand) {
          errors.push(
            `Objective '${obj.code}' references non-existent strand code '${obj.strand_code}' in subject '${subjectDef.subject.code}'`
          );
        } else if (obj.sub_strand_code) {
          if (!strand.subStrandCodes.has(obj.sub_strand_code)) {
            errors.push(
              `Objective '${obj.code}' references non-existent sub-strand '${obj.sub_strand_code}' under strand '${obj.strand_code}'`
            );
          }
        }
      }
    }

    // 5. Relationship / Prerequisite checks
    for (const rel of pack.prerequisites) {
      if (!allObjectiveCodes.has(rel.source_objective_code)) {
        errors.push(
          `Prerequisite relationship references non-existent source objective '${rel.source_objective_code}'`
        );
      }
      if (!allObjectiveCodes.has(rel.target_objective_code)) {
        errors.push(
          `Prerequisite relationship references non-existent target objective '${rel.target_objective_code}'`
        );
      }
      if (rel.source_objective_code === rel.target_objective_code) {
        errors.push(
          `Self-referencing prerequisite detected on objective '${rel.source_objective_code}'`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Idempotent import runner:
   * Inserts or updates the curriculum pack into Supabase.
   */
  async importPack(pack: CurriculumPack = CAMBRIDGE_PRIMARY_PACK): Promise<ImportExecutionResult> {
    const validation = this.validatePack(pack);
    if (!validation.isValid) {
      return {
        success: false,
        subjectsCount: 0,
        stagesCount: 0,
        strandsCount: 0,
        subStrandsCount: 0,
        objectivesCount: 0,
        relationshipsCount: 0,
        errors: validation.errors,
      };
    }

    try {
      // 1. Framework
      const { data: framework, error: fwErr } = await supabase
        .from('curriculum_frameworks')
        .upsert(
          {
            code: pack.framework.code,
            name: pack.framework.name,
            jurisdiction: pack.framework.jurisdiction,
            description: pack.framework.description,
            is_active: pack.framework.is_active,
          },
          { onConflict: 'code' }
        )
        .select('id')
        .single();

      if (fwErr || !framework) throw new Error(`Failed to upsert framework: ${fwErr?.message}`);
      const frameworkId = framework.id;

      // 2. Version
      const { data: version, error: verErr } = await supabase
        .from('curriculum_versions')
        .upsert(
          {
            framework_id: frameworkId,
            version_code: pack.manifest.version_code,
            release_year: pack.manifest.release_year,
            valid_from: pack.manifest.valid_from,
            valid_to: pack.manifest.valid_to,
            is_current: pack.manifest.is_current,
          },
          { onConflict: 'framework_id,version_code' }
        )
        .select('id')
        .single();

      if (verErr || !version) throw new Error(`Failed to upsert version: ${verErr?.message}`);
      const versionId = version.id;

      // 3. Stages
      const stageMap = new Map<number, string>(); // stage_number -> stage_id
      for (const st of pack.stages) {
        const { data: stageRow, error: stErr } = await supabase
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

        if (stErr || !stageRow) throw new Error(`Failed to upsert stage: ${stErr?.message}`);
        stageMap.set(stageRow.stage_number, stageRow.id);
      }

      // 4. Subjects, Strands, Sub-strands, Objectives
      let totalSubjects = 0;
      let totalStrands = 0;
      let totalSubStrands = 0;
      let totalObjectives = 0;
      const objectiveIdMap = new Map<string, string>(); // code -> id

      for (const subjectDef of Object.values(pack.subjects)) {
        // Upsert subject
        const { data: subjRow, error: subjErr } = await supabase
          .from('curriculum_subjects')
          .upsert(
            {
              version_id: versionId,
              code: subjectDef.subject.code,
              name: subjectDef.subject.name,
              description: subjectDef.subject.description,
              display_order: subjectDef.subject.display_order,
            },
            { onConflict: 'version_id,code' }
          )
          .select('id')
          .single();

        if (subjErr || !subjRow) throw new Error(`Failed to upsert subject: ${subjErr?.message}`);
        const subjectId = subjRow.id;
        totalSubjects++;

        // Strands & Sub-strands
        const strandIdMap = new Map<string, string>(); // code -> id
        const subStrandIdMap = new Map<string, string>(); // code -> id

        for (const str of subjectDef.strands) {
          // Check if strand already exists
          const { data: strRow, error: strErr } = await supabase
            .from('curriculum_strands')
            .upsert(
              {
                version_id: versionId,
                subject_id: subjectId,
                stage_id: null,
                code: str.code,
                name: str.name,
                description: str.description,
                display_order: str.display_order,
              },
              { onConflict: 'id,version_id' }
            )
            .select('id')
            .single();

          let strandId = strRow?.id;
          if (strErr || !strandId) {
            // Fetch existing if already present
            const { data: existingStrand } = await supabase
              .from('curriculum_strands')
              .select('id')
              .eq('version_id', versionId)
              .eq('subject_id', subjectId)
              .eq('code', str.code)
              .maybeSingle();

            if (!existingStrand) throw new Error(`Failed to upsert strand: ${strErr?.message}`);
            strandId = existingStrand.id;
          }

          strandIdMap.set(str.code, strandId);
          totalStrands++;

          // Sub-strands (if any - Guardrail H)
          for (const sub of str.sub_strands ?? []) {
            const { data: subRow, error: subErr } = await supabase
              .from('curriculum_sub_strands')
              .upsert(
                {
                  version_id: versionId,
                  strand_id: strandId,
                  code: sub.code,
                  name: sub.name,
                  description: sub.name,
                  display_order: sub.display_order,
                },
                { onConflict: 'strand_id,code' }
              )
              .select('id')
              .single();

            if (subErr || !subRow) throw new Error(`Failed to upsert sub-strand: ${subErr?.message}`);
            subStrandIdMap.set(sub.code, subRow.id);
            totalSubStrands++;
          }
        }

        // Objectives for this subject
        for (const obj of subjectDef.objectives) {
          const stageId = stageMap.get(obj.stage_number)!;
          const strandId = strandIdMap.get(obj.strand_code)!;
          const subStrandId = obj.sub_strand_code ? subStrandIdMap.get(obj.sub_strand_code) ?? null : null;

          const { data: objRow, error: objErr } = await supabase
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
                is_authoritative: pack.manifest.is_authoritative,
                provenance_source: pack.manifest.provenance_source,
                metadata: {
                  pilot_pack: true,
                  source_manifest: pack.manifest.pack_format_version,
                },
              },
              { onConflict: 'version_id,code' }
            )
            .select('id, code')
            .single();

          if (objErr || !objRow) throw new Error(`Failed to upsert objective '${obj.code}': ${objErr?.message}`);
          objectiveIdMap.set(objRow.code, objRow.id);
          totalObjectives++;
        }
      }

      // 5. Prerequisite & Progression Relationships
      let totalRelationships = 0;
      for (const rel of pack.prerequisites) {
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

          if (!relErr) {
            totalRelationships++;
          }
        }
      }

      return {
        success: true,
        frameworkId,
        versionId,
        subjectsCount: totalSubjects,
        stagesCount: stageMap.size,
        strandsCount: totalStrands,
        subStrandsCount: totalSubStrands,
        objectivesCount: totalObjectives,
        relationshipsCount: totalRelationships,
      };
    } catch (err: any) {
      return {
        success: false,
        subjectsCount: 0,
        stagesCount: 0,
        strandsCount: 0,
        subStrandsCount: 0,
        objectivesCount: 0,
        relationshipsCount: 0,
        errors: [err?.message || 'Unknown import error'],
      };
    }
  }
}

export const curriculumImportService = new CurriculumImportService();
