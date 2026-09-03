import { supabase } from '@/lib/supabase';
import type {
  CurriculumFramework,
  CurriculumVersion,
  CurriculumSubject,
  CurriculumStage,
  CurriculumStrand,
  CurriculumSubStrand,
  LearningObjective,
  LearningObjectiveRelationship,
} from '@/types/domain';

export interface ObjectiveFilter {
  versionId?: string;
  subjectId?: string;
  stageId?: string;
  strandId?: string;
  search?: string;
}

export class CurriculumService {
  /**
   * Retrieves all active curriculum frameworks.
   */
  async getFrameworks(): Promise<CurriculumFramework[]> {
    const { data, error } = await supabase
      .from('curriculum_frameworks')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw new Error(`Failed to load curriculum frameworks: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      jurisdiction: row.jurisdiction,
      description: row.description,
      isActive: row.is_active,
      createdAt: row.created_at,
    }));
  }

  /**
   * Retrieves versions for a specific framework.
   */
  async getVersions(frameworkId: string): Promise<CurriculumVersion[]> {
    const { data, error } = await supabase
      .from('curriculum_versions')
      .select('*')
      .eq('framework_id', frameworkId)
      .order('release_year', { ascending: false });

    if (error) throw new Error(`Failed to load curriculum versions: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      frameworkId: row.framework_id,
      versionCode: row.version_code,
      releaseYear: row.release_year,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      isCurrent: row.is_current,
      createdAt: row.created_at,
    }));
  }

  /**
   * Retrieves subjects for a specific curriculum version.
   */
  async getSubjects(versionId: string): Promise<CurriculumSubject[]> {
    const { data, error } = await supabase
      .from('curriculum_subjects')
      .select('*')
      .eq('version_id', versionId)
      .order('display_order');

    if (error) throw new Error(`Failed to load curriculum subjects: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      versionId: row.version_id,
      code: row.code,
      name: row.name,
      description: row.description,
      displayOrder: row.display_order,
    }));
  }

  /**
   * Retrieves stages for a specific curriculum version.
   */
  async getStages(versionId: string): Promise<CurriculumStage[]> {
    const { data, error } = await supabase
      .from('curriculum_stages')
      .select('*')
      .eq('version_id', versionId)
      .order('stage_number');

    if (error) throw new Error(`Failed to load curriculum stages: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      versionId: row.version_id,
      stageNumber: row.stage_number,
      name: row.name,
      typicalAgeRange: row.typical_age_range,
      displayOrder: row.display_order,
    }));
  }

  /**
   * Retrieves strands (and nested sub-strands) for a subject and version.
   */
  async getStrands(versionId: string, subjectId: string): Promise<Array<CurriculumStrand & { subStrands: CurriculumSubStrand[] }>> {
    const { data: strands, error: strandErr } = await supabase
      .from('curriculum_strands')
      .select('*')
      .eq('version_id', versionId)
      .eq('subject_id', subjectId)
      .order('display_order');

    if (strandErr) throw new Error(`Failed to load curriculum strands: ${strandErr.message}`);

    const strandIds = (strands ?? []).map((s) => s.id);
    let subStrands: any[] = [];
    if (strandIds.length > 0) {
      const { data: subData, error: subErr } = await supabase
        .from('curriculum_sub_strands')
        .select('*')
        .in('strand_id', strandIds)
        .order('display_order');

      if (!subErr && subData) {
        subStrands = subData;
      }
    }

    return (strands ?? []).map((s) => ({
      id: s.id,
      versionId: s.version_id,
      subjectId: s.subject_id,
      stageId: s.stage_id,
      code: s.code,
      name: s.name,
      description: s.description,
      displayOrder: s.display_order,
      subStrands: subStrands
        .filter((ss) => ss.strand_id === s.id)
        .map((ss) => ({
          id: ss.id,
          versionId: ss.version_id,
          strandId: ss.strand_id,
          code: ss.code,
          name: ss.name,
          description: ss.description,
          displayOrder: ss.display_order,
        })),
    }));
  }

  /**
   * Filters and retrieves learning objectives.
   */
  async getObjectives(filter: ObjectiveFilter = {}): Promise<LearningObjective[]> {
    let query = supabase.from('learning_objectives').select('*');

    if (filter.versionId) query = query.eq('version_id', filter.versionId);
    if (filter.subjectId) query = query.eq('subject_id', filter.subjectId);
    if (filter.stageId) query = query.eq('stage_id', filter.stageId);
    if (filter.strandId) query = query.eq('strand_id', filter.strandId);
    if (filter.search) {
      query = query.or(`code.ilike.%${filter.search}%,title.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
    }

    const { data, error } = await query.order('progression_order');
    if (error) throw new Error(`Failed to load learning objectives: ${error.message}`);

    return (data ?? []).map((row) => ({
      id: row.id,
      versionId: row.version_id,
      subjectId: row.subject_id,
      stageId: row.stage_id,
      strandId: row.strand_id,
      subStrandId: row.sub_strand_id,
      code: row.code,
      title: row.title,
      description: row.description,
      progressionOrder: row.progression_order,
      isAuthoritative: row.is_authoritative,
      provenanceSource: row.provenance_source,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  /**
   * Retrieves a single learning objective by ID.
   */
  async getObjectiveById(id: string): Promise<LearningObjective | null> {
    const { data, error } = await supabase
      .from('learning_objectives')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      versionId: data.version_id,
      subjectId: data.subject_id,
      stageId: data.stage_id,
      strandId: data.strand_id,
      subStrandId: data.sub_strand_id,
      code: data.code,
      title: data.title,
      description: data.description,
      progressionOrder: data.progression_order,
      isAuthoritative: data.is_authoritative,
      provenanceSource: data.provenance_source,
      metadata: data.metadata,
      createdAt: data.created_at,
    };
  }

  /**
   * Retrieves prerequisite objectives for a given objective.
   */
  async getPrerequisites(objectiveId: string): Promise<Array<{
    relationship: LearningObjectiveRelationship;
    prerequisiteObjective: LearningObjective;
  }>> {
    const { data, error } = await supabase
      .from('learning_objective_relationships')
      .select('*, source:learning_objectives!learning_objective_relationships_source_objective_id_fkey(*)')
      .eq('target_objective_id', objectiveId)
      .eq('relationship_type', 'prerequisite');

    if (error || !data) return [];
    return data.map((row: any) => ({
      relationship: {
        id: row.id,
        sourceObjectiveId: row.source_objective_id,
        targetObjectiveId: row.target_objective_id,
        relationshipType: row.relationship_type,
        notes: row.notes,
      },
      prerequisiteObjective: {
        id: row.source.id,
        versionId: row.source.version_id,
        subjectId: row.source.subject_id,
        stageId: row.source.stage_id,
        strandId: row.source.strand_id,
        subStrandId: row.source.sub_strand_id,
        code: row.source.code,
        title: row.source.title,
        description: row.source.description,
        progressionOrder: row.source.progression_order,
        isAuthoritative: row.source.is_authoritative,
        provenanceSource: row.source.provenance_source,
        metadata: row.source.metadata,
        createdAt: row.source.created_at,
      },
    }));
  }
}

export const curriculumService = new CurriculumService();
