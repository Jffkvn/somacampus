import { supabase } from '@/lib/supabase';
import type {
  SchoolCurriculumAdoption,
  SchoolCurriculumSubjectMap,
  SchemeOfWork,
  SchemeOfWorkStatus,
  MediumTermPlan,
  TeachingSequence,
  LearningObjective,
} from '@/types/domain';

export interface CreateSchemeInput {
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  streamId?: string | null;
  subjectId: string;
  stageId: string;
  createdByEmployeeId: string;
  title: string;
  overviewText?: string;
}

export interface CreateUnitInput {
  schemeId: string;
  unitNumber: number;
  title: string;
  weekStart: number;
  weekEnd: number;
  learningFocus?: string;
  estimatedPeriods?: number;
  displayOrder?: number;
}

export interface CreateSequenceInput {
  mediumTermPlanId: string;
  sequenceNumber: number;
  title: string;
  suggestedActivities?: string;
  suggestedResources?: string;
  recommendedDurationMins?: number;
  displayOrder?: number;
  objectiveIds?: string[];
}

export interface PlannedLessonObjectiveContext {
  hasPlan: boolean;
  schemeId?: string;
  schemeTitle?: string;
  unitId?: string;
  unitTitle?: string;
  sequenceId?: string;
  sequenceTitle?: string;
  primaryObjective?: LearningObjective | null;
  allObjectives: LearningObjective[];
}

export class AcademicPlanningService {
  /**
   * Retrieves active curriculum adoptions for a school.
   */
  async getSchoolAdoptions(schoolId: string): Promise<SchoolCurriculumAdoption[]> {
    const { data, error } = await supabase
      .from('school_curriculum_adoptions')
      .select('*')
      .eq('school_id', schoolId)
      .eq('status', 'active');

    if (error) throw new Error(`Failed to load school curriculum adoptions: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      frameworkId: row.framework_id,
      versionId: row.version_id,
      status: row.status as 'active' | 'archived',
      adoptedAt: row.adopted_at,
    }));
  }

  /**
   * Adopts a curriculum framework and version for a school.
   */
  async createSchoolAdoption(schoolId: string, frameworkId: string, versionId: string): Promise<SchoolCurriculumAdoption> {
    const { data, error } = await supabase
      .from('school_curriculum_adoptions')
      .upsert(
        {
          school_id: schoolId,
          framework_id: frameworkId,
          version_id: versionId,
          status: 'active',
        },
        { onConflict: 'school_id,framework_id,version_id' }
      )
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to adopt curriculum: ${error?.message}`);
    return {
      id: data.id,
      schoolId: data.school_id,
      frameworkId: data.framework_id,
      versionId: data.version_id,
      status: data.status,
      adoptedAt: data.adopted_at,
    };
  }

  /**
   * Retrieves subject mappings for an adoption.
   */
  async getSubjectMaps(schoolId: string, adoptionId: string): Promise<SchoolCurriculumSubjectMap[]> {
    const { data, error } = await supabase
      .from('school_curriculum_subject_maps')
      .select('*')
      .eq('school_id', schoolId)
      .eq('adoption_id', adoptionId);

    if (error) throw new Error(`Failed to load subject mappings: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      adoptionId: row.adoption_id,
      subjectId: row.subject_id,
      curriculumSubjectId: row.curriculum_subject_id,
    }));
  }

  /**
   * Maps a local school subject to a curriculum subject under a specific adoption.
   */
  async mapSchoolSubject(
    schoolId: string,
    adoptionId: string,
    subjectId: string,
    curriculumSubjectId: string
  ): Promise<SchoolCurriculumSubjectMap> {
    const { data, error } = await supabase
      .from('school_curriculum_subject_maps')
      .upsert(
        {
          school_id: schoolId,
          adoption_id: adoptionId,
          subject_id: subjectId,
          curriculum_subject_id: curriculumSubjectId,
        },
        { onConflict: 'adoption_id,subject_id,curriculum_subject_id' }
      )
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to map school subject: ${error?.message}`);
    return {
      id: data.id,
      schoolId: data.school_id,
      adoptionId: data.adoption_id,
      subjectId: data.subject_id,
      curriculumSubjectId: data.curriculum_subject_id,
    };
  }

  /**
   * Retrieves schemes of work with optional filters.
   */
  async getSchemesOfWork(
    schoolId: string,
    filter: { academicYearId?: string; termId?: string; classId?: string; subjectId?: string } = {}
  ): Promise<SchemeOfWork[]> {
    let query = supabase
      .from('schemes_of_work')
      .select('*')
      .eq('school_id', schoolId);

    if (filter.academicYearId) query = query.eq('academic_year_id', filter.academicYearId);
    if (filter.termId) query = query.eq('term_id', filter.termId);
    if (filter.classId) query = query.eq('class_id', filter.classId);
    if (filter.subjectId) query = query.eq('subject_id', filter.subjectId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to load schemes of work: ${error.message}`);

    return (data ?? []).map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      academicYearId: row.academic_year_id,
      termId: row.term_id,
      classId: row.class_id,
      streamId: row.stream_id,
      subjectId: row.subject_id,
      stageId: row.stage_id,
      createdByEmployeeId: row.created_by_employee_id,
      title: row.title,
      overviewText: row.overview_text,
      status: row.status as SchemeOfWorkStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Retrieves a scheme of work with its units and sequences.
   */
  async getSchemeById(schemeId: string): Promise<{
    scheme: SchemeOfWork;
    units: Array<MediumTermPlan & { sequences: Array<TeachingSequence & { objectives: LearningObjective[] }> }>;
  } | null> {
    const { data: schemeData, error: sErr } = await supabase
      .from('schemes_of_work')
      .select('*')
      .eq('id', schemeId)
      .maybeSingle();

    if (sErr || !schemeData) return null;

    const scheme: SchemeOfWork = {
      id: schemeData.id,
      schoolId: schemeData.school_id,
      academicYearId: schemeData.academic_year_id,
      termId: schemeData.term_id,
      classId: schemeData.class_id,
      streamId: schemeData.stream_id,
      subjectId: schemeData.subject_id,
      stageId: schemeData.stage_id,
      createdByEmployeeId: schemeData.created_by_employee_id,
      title: schemeData.title,
      overviewText: schemeData.overview_text,
      status: schemeData.status as SchemeOfWorkStatus,
      createdAt: schemeData.created_at,
      updatedAt: schemeData.updated_at,
    };

    // Load units
    const { data: unitsData } = await supabase
      .from('medium_term_plans')
      .select('*')
      .eq('scheme_id', schemeId)
      .order('unit_number');

    const units: any[] = [];
    for (const u of unitsData ?? []) {
      const { data: seqData } = await supabase
        .from('teaching_sequences')
        .select('*')
        .eq('medium_term_plan_id', u.id)
        .order('sequence_number');

      const sequences: any[] = [];
      for (const seq of seqData ?? []) {
        const { data: objLinks } = await supabase
          .from('teaching_sequence_objectives')
          .select('*, obj:learning_objectives(*)')
          .eq('teaching_sequence_id', seq.id);

        const objectives = (objLinks ?? []).map((l: any) => ({
          id: l.obj.id,
          versionId: l.obj.version_id,
          subjectId: l.obj.subject_id,
          stageId: l.obj.stage_id,
          strandId: l.obj.strand_id,
          subStrandId: l.obj.sub_strand_id,
          code: l.obj.code,
          title: l.obj.title,
          description: l.obj.description,
          progressionOrder: l.obj.progression_order,
          isAuthoritative: l.obj.is_authoritative,
          provenanceSource: l.obj.provenance_source,
          metadata: l.obj.metadata,
          createdAt: l.obj.created_at,
        }));

        sequences.push({
          id: seq.id,
          mediumTermPlanId: seq.medium_term_plan_id,
          sequenceNumber: seq.sequence_number,
          title: seq.title,
          suggestedActivities: seq.suggested_activities,
          suggestedResources: seq.suggested_resources,
          recommendedDurationMins: seq.recommended_duration_mins,
          displayOrder: seq.display_order,
          objectives,
        });
      }

      units.push({
        id: u.id,
        schemeId: u.scheme_id,
        unitNumber: u.unit_number,
        title: u.title,
        weekStart: u.week_start,
        weekEnd: u.week_end,
        learningFocus: u.learning_focus,
        estimatedPeriods: u.estimated_periods,
        displayOrder: u.display_order,
        createdAt: u.created_at,
        sequences,
      });
    }

    return { scheme, units };
  }

  /**
   * Creates a scheme of work.
   */
  async createSchemeOfWork(input: CreateSchemeInput): Promise<SchemeOfWork> {
    const { data, error } = await supabase
      .from('schemes_of_work')
      .insert({
        school_id: input.schoolId,
        academic_year_id: input.academicYearId,
        term_id: input.termId,
        class_id: input.classId,
        stream_id: input.streamId ?? null,
        subject_id: input.subjectId,
        stage_id: input.stageId,
        created_by_employee_id: input.createdByEmployeeId,
        title: input.title,
        overview_text: input.overviewText ?? null,
        status: 'active',
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to create scheme of work: ${error?.message}`);
    return {
      id: data.id,
      schoolId: data.school_id,
      academicYearId: data.academic_year_id,
      termId: data.term_id,
      classId: data.class_id,
      streamId: data.stream_id,
      subjectId: data.subject_id,
      stageId: data.stage_id,
      createdByEmployeeId: data.created_by_employee_id,
      title: data.title,
      overviewText: data.overview_text,
      status: data.status as SchemeOfWorkStatus,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Creates a medium-term plan (unit).
   */
  async createMediumTermPlan(input: CreateUnitInput): Promise<MediumTermPlan> {
    const { data, error } = await supabase
      .from('medium_term_plans')
      .insert({
        scheme_id: input.schemeId,
        unit_number: input.unitNumber,
        title: input.title,
        week_start: input.weekStart,
        week_end: input.weekEnd,
        learning_focus: input.learningFocus ?? null,
        estimated_periods: input.estimatedPeriods ?? null,
        display_order: input.displayOrder ?? input.unitNumber,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to create unit: ${error?.message}`);
    return {
      id: data.id,
      schemeId: data.scheme_id,
      unitNumber: data.unit_number,
      title: data.title,
      weekStart: data.week_start,
      weekEnd: data.week_end,
      learningFocus: data.learning_focus,
      estimatedPeriods: data.estimated_periods,
      displayOrder: data.display_order,
      createdAt: data.created_at,
    };
  }

  /**
   * Creates a teaching sequence and links objectives.
   */
  async createTeachingSequence(input: CreateSequenceInput): Promise<TeachingSequence> {
    const { data: seq, error: sErr } = await supabase
      .from('teaching_sequences')
      .insert({
        medium_term_plan_id: input.mediumTermPlanId,
        sequence_number: input.sequenceNumber,
        title: input.title,
        suggested_activities: input.suggestedActivities ?? null,
        suggested_resources: input.suggestedResources ?? null,
        recommended_duration_mins: input.recommendedDurationMins ?? 45,
        display_order: input.displayOrder ?? input.sequenceNumber,
      })
      .select()
      .single();

    if (sErr || !seq) throw new Error(`Failed to create teaching sequence: ${sErr?.message}`);

    if (input.objectiveIds && input.objectiveIds.length > 0) {
      const links = input.objectiveIds.map((objId, idx) => ({
        teaching_sequence_id: seq.id,
        learning_objective_id: objId,
        is_primary: idx === 0,
      }));

      await supabase.from('teaching_sequence_objectives').insert(links);
    }

    return {
      id: seq.id,
      mediumTermPlanId: seq.medium_term_plan_id,
      sequenceNumber: seq.sequence_number,
      title: seq.title,
      suggestedActivities: seq.suggested_activities,
      suggestedResources: seq.suggested_resources,
      recommendedDurationMins: seq.recommended_duration_mins,
      displayOrder: seq.display_order,
    };
  }

  /**
   * Dynamic Lesson Objective Progression Pointer:
   * Finds the active scheme for this class and subject, checks completed lessons,
   * and returns the current planned teaching sequence and objective!
   */
  async getPlannedObjectiveForLesson(
    classId: string,
    subjectId: string,
    termId?: string
  ): Promise<PlannedLessonObjectiveContext> {
    try {
      let schemeQuery = supabase
        .from('schemes_of_work')
        .select('*')
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('status', 'active');

      if (termId) {
        schemeQuery = schemeQuery.eq('term_id', termId);
      }

      const { data: scheme } = await schemeQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!scheme) {
        return { hasPlan: false, allObjectives: [] };
      }

      // Load units in order
      const { data: units } = await supabase
        .from('medium_term_plans')
        .select('id, title, unit_number')
        .eq('scheme_id', scheme.id)
        .order('unit_number');

      if (!units || units.length === 0) {
        return { hasPlan: false, schemeId: scheme.id, schemeTitle: scheme.title, allObjectives: [] };
      }

      // Load sequences across units
      const unitIds = units.map((u) => u.id);
      const { data: sequences } = await supabase
        .from('teaching_sequences')
        .select('id, medium_term_plan_id, sequence_number, title')
        .in('medium_term_plan_id', unitIds)
        .order('display_order');

      if (!sequences || sequences.length === 0) {
        return { hasPlan: false, schemeId: scheme.id, schemeTitle: scheme.title, allObjectives: [] };
      }

      // Find completed lessons that link to sequences in this scheme
      const seqIds = sequences.map((s) => s.id);
      const { data: completedLinks } = await supabase
        .from('lesson_learning_objectives')
        .select('teaching_sequence_id')
        .in('teaching_sequence_id', seqIds);

      const completedSeqIds = new Set((completedLinks ?? []).map((l) => l.teaching_sequence_id));

      // Find first uncompleted sequence (or last if all completed)
      const nextSequence = sequences.find((s) => !completedSeqIds.has(s.id)) ?? sequences[0];
      const activeUnit = units.find((u) => u.id === nextSequence.medium_term_plan_id);

      // Load objectives for this sequence
      const { data: objLinks } = await supabase
        .from('teaching_sequence_objectives')
        .select('*, obj:learning_objectives(*)')
        .eq('teaching_sequence_id', nextSequence.id)
        .order('is_primary', { ascending: false });

      const objectives: LearningObjective[] = (objLinks ?? []).map((l: any) => ({
        id: l.obj.id,
        versionId: l.obj.version_id,
        subjectId: l.obj.subject_id,
        stageId: l.obj.stage_id,
        strandId: l.obj.strand_id,
        subStrandId: l.obj.sub_strand_id,
        code: l.obj.code,
        title: l.obj.title,
        description: l.obj.description,
        progressionOrder: l.obj.progression_order,
        isAuthoritative: l.obj.is_authoritative,
        provenanceSource: l.obj.provenance_source,
        metadata: l.obj.metadata,
        createdAt: l.obj.created_at,
      }));

      const primary = objectives[0] ?? null;

      return {
        hasPlan: true,
        schemeId: scheme.id,
        schemeTitle: scheme.title,
        unitId: activeUnit?.id,
        unitTitle: activeUnit?.title,
        sequenceId: nextSequence.id,
        sequenceTitle: nextSequence.title,
        primaryObjective: primary,
        allObjectives: objectives,
      };
    } catch {
      return { hasPlan: false, allObjectives: [] };
    }
  }
}

export const academicPlanningService = new AcademicPlanningService();
