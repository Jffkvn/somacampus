/**
 * Timetable & Teaching Policy Service — SomaCampus Phase 9I.
 *
 * Implements:
 * 1. Hierarchical policy resolution: School-wide default -> Teacher override -> Day exception
 * 2. Class subject quota derivation from Phase 6 Schemes of Work & Medium-Term Plans
 * 3. Combined physical + online workload calculation and monitoring
 * 4. Transactional timetable publishing via publish_timetable_atomic
 */

import { supabase } from '../../lib/supabase';
import type {
  SchoolTimetablePolicy,
  TimetablePolicyRules,
  TimetableSubjectPreference,
  TeacherWorkloadSummary,
  TeacherOfficialSubject,
  TeachingAllocation,
  TeachingAllocationStatus,
  TeachingAllocationSource,
} from '../../types/domain';

const DEFAULT_POLICY_RULES: TimetablePolicyRules = {
  maxPeriodsPerDay: 6,
  maxPeriodsPerWeek: 28,
  maxConsecutivePeriods: 3,
  minBreakMinutes: 30,
  maxOnlineSessionsPerDay: 2,
  maxOnlineSessionsPerWeek: 8,
  maxCombinedTeachingHoursPerDay: 7.0,
};

function isWithinEffectiveDates(p: SchoolTimetablePolicy, date?: string): boolean {
  if (!date) return true;
  if (p.effectiveFrom && date < p.effectiveFrom) return false;
  if (p.effectiveTo && date > p.effectiveTo) return false;
  return true;
}

export const timetablePolicyService = {
  /**
   * Resolves effective policy rules for a specific teacher on a given date.
   * Hierarchy: Exception -> Teacher Override -> Department Override -> School Default.
   */
  resolveEffectiveRules(
    policies: SchoolTimetablePolicy[],
    teacherId?: string,
    departmentName?: string,
    date?: string,
  ): TimetablePolicyRules {
    const active = policies.filter((p) => p.isActive);

    // 1. Exception (e.g. temporary adjustment for an employee or school-wide on this date)
    const exceptionPolicy = active.find(
      (p) =>
        p.scopeType === 'exception' &&
        (!p.targetEmployeeId || p.targetEmployeeId === teacherId) &&
        isWithinEffectiveDates(p, date),
    );
    if (exceptionPolicy) {
      return { ...DEFAULT_POLICY_RULES, ...exceptionPolicy.rules };
    }

    // 2. Teacher-specific override
    if (teacherId) {
      const teacherPolicy = active.find(
        (p) =>
          p.scopeType === 'teacher' &&
          p.targetEmployeeId === teacherId &&
          isWithinEffectiveDates(p, date),
      );
      if (teacherPolicy) {
        return { ...DEFAULT_POLICY_RULES, ...teacherPolicy.rules };
      }
    }

    // 3. Department override
    if (departmentName) {
      const deptPolicy = active.find(
        (p) =>
          p.scopeType === 'department' &&
          p.departmentName?.toLowerCase() === departmentName.toLowerCase() &&
          isWithinEffectiveDates(p, date),
      );
      if (deptPolicy) {
        return { ...DEFAULT_POLICY_RULES, ...deptPolicy.rules };
      }
    }

    // 4. School-wide default
    const schoolDefault = active.find(
      (p) => p.scopeType === 'school_default' && isWithinEffectiveDates(p, date),
    );
    if (schoolDefault) {
      return { ...DEFAULT_POLICY_RULES, ...schoolDefault.rules };
    }

    return DEFAULT_POLICY_RULES;
  },

  /**
   * Derives class subject weekly quotas from Phase 6 Schemes of Work & Medium-Term Plans.
   * If a scheme exists with estimated_periods and duration in weeks, calculates periods/week.
   * Fallback to standard 4 periods/week if no plan exists.
   */
  deriveSubjectQuota(
    classId: string,
    subjectId: string,
    schemes: Array<{
      classId: string;
      subjectId: string;
      estimatedPeriodsTotal?: number;
      durationWeeks?: number;
    }>,
    overrideQuota?: number,
  ): number {
    if (overrideQuota !== undefined && overrideQuota > 0) {
      return overrideQuota;
    }

    const matchedScheme = schemes.find(
      (s) => s.classId === classId && s.subjectId === subjectId,
    );

    if (
      matchedScheme &&
      matchedScheme.estimatedPeriodsTotal &&
      matchedScheme.durationWeeks &&
      matchedScheme.durationWeeks > 0
    ) {
      return Math.ceil(
        matchedScheme.estimatedPeriodsTotal / matchedScheme.durationWeeks,
      );
    }

    return 4; // Default standard allocation
  },

  /**
   * Calculates the combined physical + online workload for teachers.
   * Verifies that total load does not breach daily or weekly maximums.
   */
  computeTeacherWorkloads(params: {
    teachers: Array<{ id: string; name: string; departmentName?: string }>;
    physicalTimetableEntries: Array<{ teacherId: string; dayOfWeek: number; periodNumber?: number }>;
    onlineSessions: Array<{ teacherId: string; scheduledStart: string; status: string }>;
    policies: SchoolTimetablePolicy[];
    date?: string;
  }): TeacherWorkloadSummary[] {
    return params.teachers.map((t) => {
      const rules = this.resolveEffectiveRules(
        params.policies,
        t.id,
        t.departmentName,
        params.date,
      );

      // Physical entries count & daily distribution
      const physicalEntries = params.physicalTimetableEntries.filter(
        (e) => e.teacherId === t.id,
      );
      const physicalPeriods = physicalEntries.length;

      const physicalDayCounts: Record<number, number> = {};
      for (const e of physicalEntries) {
        physicalDayCounts[e.dayOfWeek] = (physicalDayCounts[e.dayOfWeek] || 0) + 1;
      }
      const peakDaily = Math.max(0, ...Object.values(physicalDayCounts));

      // Online sessions count & daily distribution
      const activeOnline = params.onlineSessions.filter(
        (s) =>
          s.teacherId === t.id &&
          ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(s.status),
      );
      const onlineSessions = activeOnline.length;

      const onlineDayCounts: Record<number, number> = {};
      for (const s of activeOnline) {
        const d = new Date(s.scheduledStart);
        // UTC Mon=1..Sun=7
        const dow = ((d.getUTCDay() + 6) % 7) + 1;
        onlineDayCounts[dow] = (onlineDayCounts[dow] || 0) + 1;
      }
      const peakOnlineDaily = Math.max(0, ...Object.values(onlineDayCounts));

      // Combined daily teaching hours
      let peakCombinedHours = 0;
      for (let day = 1; day <= 7; day++) {
        const phys = physicalDayCounts[day] || 0;
        const onl = onlineDayCounts[day] || 0;
        const dailyH = Number((phys * 0.75 + onl * 1.0).toFixed(1));
        if (dailyH > peakCombinedHours) peakCombinedHours = dailyH;
      }

      // Total teaching hours
      const totalHours = Number(
        (physicalPeriods * 0.75 + onlineSessions * 1.0).toFixed(1),
      );

      const alerts: string[] = [];
      let status: 'OK' | 'APPROACHING_CAP' | 'OVER_CAP' = 'OK';

      if (physicalPeriods > rules.maxPeriodsPerWeek) {
        status = 'OVER_CAP';
        alerts.push(
          `Weekly physical periods (${physicalPeriods}) exceeds limit (${rules.maxPeriodsPerWeek}).`,
        );
      } else if (physicalPeriods >= rules.maxPeriodsPerWeek - 2) {
        status = 'APPROACHING_CAP';
        alerts.push(`Approaching weekly limit (${physicalPeriods}/${rules.maxPeriodsPerWeek}).`);
      }

      if (peakDaily > rules.maxPeriodsPerDay) {
        status = 'OVER_CAP';
        alerts.push(`Daily physical load (${peakDaily}) exceeds limit (${rules.maxPeriodsPerDay}).`);
      }

      if (onlineSessions > rules.maxOnlineSessionsPerWeek) {
        status = 'OVER_CAP';
        alerts.push(
          `Online sessions (${onlineSessions}) exceeds weekly limit (${rules.maxOnlineSessionsPerWeek}).`,
        );
      }

      if (peakOnlineDaily > rules.maxOnlineSessionsPerDay) {
        status = 'OVER_CAP';
        alerts.push(
          `Daily online sessions (${peakOnlineDaily}) exceeds daily limit (${rules.maxOnlineSessionsPerDay}).`,
        );
      }

      if (peakCombinedHours > rules.maxCombinedTeachingHoursPerDay) {
        status = 'OVER_CAP';
        alerts.push(
          `Combined daily teaching hours (${peakCombinedHours}h) exceeds limit (${rules.maxCombinedTeachingHoursPerDay}h).`,
        );
      }

      return {
        employeeId: t.id,
        teacherName: t.name,
        physicalPeriods,
        onlineSessions,
        totalTeachingHours: totalHours,
        peakDailyPeriods: peakDaily,
        dailyLimit: rules.maxPeriodsPerDay,
        weeklyLimit: rules.maxPeriodsPerWeek,
        status,
        alerts,
      };
    });
  },

  /**
   * Publishes a timetable version atomically via Supabase RPC.
   * Archives previously active published timetable for the school & term.
   */
  async publishTimetableAtomic(
    timetableId: string,
    publishedByEmployeeId: string,
  ): Promise<{ success: boolean; timetableId: string; archivedCount: number }> {
    const { data, error } = await supabase.rpc('publish_timetable_atomic', {
      p_timetable_id: timetableId,
      p_published_by: publishedByEmployeeId,
    });

    if (error) {
      throw new Error(`Failed to publish timetable atomically: ${error.message}`);
    }

    return {
      success: data?.success ?? true,
      timetableId: data?.timetable_id ?? timetableId,
      archivedCount: data?.archived_count ?? 0,
    };
  },

  /**
   * Approves a timetable version atomically via Supabase RPC.
   * Requires leadership and hardViolationsCount = 0.
   */
  async approveTimetableAtomic(
    timetableId: string,
    approvedByEmployeeId: string,
    note?: string,
  ): Promise<{ success: boolean; timetableId: string; status: string }> {
    const { data, error } = await supabase.rpc('approve_timetable_atomic', {
      p_timetable_id: timetableId,
      p_approved_by: approvedByEmployeeId,
      p_note: note ?? null,
    });

    if (error) {
      throw new Error(`Failed to approve timetable atomically: ${error.message}`);
    }

    return {
      success: data?.success ?? true,
      timetableId: data?.timetable_id ?? timetableId,
      status: data?.status ?? 'approved',
    };
  },

  /**
   * Loads timetable policies for a school.
   */
  async getPolicies(schoolId: string): Promise<SchoolTimetablePolicy[]> {
    const { data, error } = await supabase
      .from('school_timetable_policies')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true);

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      scopeType: row.scope_type,
      targetEmployeeId: row.target_employee_id,
      departmentName: row.department_name,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      rules: row.rules,
      isActive: row.is_active,
    }));
  },

  /**
   * Loads subject preferences for a school.
   */
  async getSubjectPreferences(
    schoolId: string,
  ): Promise<TimetableSubjectPreference[]> {
    const { data, error } = await supabase
      .from('timetable_subject_preferences')
      .select('*')
      .eq('school_id', schoolId);

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      subjectId: row.subject_id,
      preferredTimeWindow: row.preferred_time_window,
      preferredStartTime: row.preferred_start_time,
      preferredEndTime: row.preferred_end_time,
      priorityWeight: row.priority_weight,
      allowDoublePeriods: row.allow_double_periods,
      sourceType: row.source_type,
    }));
  },

  /**
   * Loads official teaching subjects for a school or teacher.
   */
  async getOfficialTeachingSubjects(
    schoolId: string,
    teacherId?: string,
  ): Promise<TeacherOfficialSubject[]> {
    let query = supabase
      .from('teacher_official_subjects')
      .select('*, employees(id, person_id, people(first_name, last_name)), subjects(id, name, code)')
      .eq('school_id', schoolId);

    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      teacherId: row.teacher_id,
      subjectId: row.subject_id,
      teacherName: row.employees?.people
        ? `${row.employees.people.first_name} ${row.employees.people.last_name}`
        : undefined,
      subjectName: row.subjects?.name,
      appointedAt: row.appointed_at,
      notes: row.notes,
    }));
  },

  /**
   * Appoints an official teaching subject to a teacher.
   */
  async assignOfficialTeachingSubject(
    schoolIdOrInput:
      | string
      | {
          schoolId: string;
          teacherId: string;
          subjectId: string;
          appointedAt?: string;
          notes?: string;
        },
    teacherId?: string,
    subjectId?: string,
    appointedAt?: string,
    notes?: string,
  ): Promise<TeacherOfficialSubject> {
    const input =
      typeof schoolIdOrInput === 'string'
        ? {
            schoolId: schoolIdOrInput,
            teacherId: teacherId!,
            subjectId: subjectId!,
            appointedAt,
            notes,
          }
        : schoolIdOrInput;

    // Authoritative path: appoint_teacher_subject RPC verifies leadership,
    // teacher/subject tenancy, and upserts atomically. No direct inserts.
    const { data: rpcId, error: rpcError } = await supabase.rpc('appoint_teacher_subject', {
      p_school_id: input.schoolId,
      p_teacher_id: input.teacherId,
      p_subject_id: input.subjectId,
      p_notes: input.notes ?? null,
    });
    if (rpcError) throw rpcError;

    const { data, error } = await supabase
      .from('teacher_official_subjects')
      .select('*, subjects(name)')
      .eq('id', rpcId as string)
      .single();

    if (error) throw error;
    return {
      id: data.id,
      schoolId: data.school_id,
      teacherId: data.teacher_id,
      subjectId: data.subject_id,
      subjectName: data.subjects?.name,
      appointedAt: data.appointed_at,
      notes: data.notes,
    };
  },

  /**
   * Removes an official teaching subject appointment.
   */
  async removeOfficialTeachingSubject(
    idOrSchoolId: string,
    teacherId?: string,
    subjectId?: string,
  ): Promise<void> {
    let query = supabase.from('teacher_official_subjects').delete();
    if (teacherId && subjectId) {
      query = query
        .eq('school_id', idOrSchoolId)
        .eq('teacher_id', teacherId)
        .eq('subject_id', subjectId);
    } else {
      query = query.eq('id', idOrSchoolId);
    }
    const { error } = await query;
    if (error) throw error;
  },

  /**
   * Loads teaching allocations for an academic period.
   */
  async getTeachingAllocations(
    schoolId: string,
    academicYearId?: string,
    filter?: { classId?: string; subjectId?: string; teacherId?: string; status?: TeachingAllocationStatus },
  ): Promise<TeachingAllocation[]> {
    let query = supabase
      .from('teaching_allocations')
      .select('*, classes(name), subjects(name), employees!teaching_allocations_teacher_id_fkey(id, person_id, people(first_name, last_name)), streams(name)')
      .eq('school_id', schoolId);

    if (academicYearId) {
      query = query.eq('academic_year_id', academicYearId);
    }

    if (filter?.classId) query = query.eq('class_id', filter.classId);
    if (filter?.subjectId) query = query.eq('subject_id', filter.subjectId);
    if (filter?.teacherId) query = query.eq('teacher_id', filter.teacherId);
    if (filter?.status) query = query.eq('status', filter.status);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      academicYearId: row.academic_year_id,
      classId: row.class_id,
      className: row.classes?.name,
      streamId: row.stream_id,
      streamName: row.streams?.name,
      subjectId: row.subject_id,
      subjectName: row.subjects?.name,
      teacherId: row.teacher_id,
      teacherName: row.employees?.people
        ? `${row.employees.people.first_name} ${row.employees.people.last_name}`
        : undefined,
      periodsPerWeek: row.periods_per_week,
      status: row.status as TeachingAllocationStatus,
      allocationSource: row.allocation_source as TeachingAllocationSource,
      proposalReason: row.proposal_reason,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
    }));
  },

  /**
   * Saves a teaching allocation with strict subject eligibility verification.
   * Throws if the teacher is not officially appointed to teach that subject.
   */
  async saveTeachingAllocation(input: {
    id?: string;
    schoolId: string;
    academicYearId: string;
    classId: string;
    streamId?: string | null;
    subjectId: string;
    teacherId: string;
    periodsPerWeek?: number;
    status?: TeachingAllocationStatus;
    allocationSource?: TeachingAllocationSource;
    proposalReason?: string | null;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  }): Promise<TeachingAllocation> {
    // 1. Verify teacher is officially appointed to this subject
    const { data: officialSub, error: subErr } = await supabase
      .from('teacher_official_subjects')
      .select('id')
      .eq('school_id', input.schoolId)
      .eq('teacher_id', input.teacherId)
      .eq('subject_id', input.subjectId)
      .maybeSingle();

    if (subErr) throw subErr;
    if (!officialSub) {
      throw new Error(
        `Teacher is not officially appointed to teach this subject in this school. You must first record this as an Official Teaching Subject.`
      );
    }

    const payload = {
      school_id: input.schoolId,
      academic_year_id: input.academicYearId,
      class_id: input.classId,
      stream_id: input.streamId ?? null,
      subject_id: input.subjectId,
      teacher_id: input.teacherId,
      periods_per_week: input.periodsPerWeek ?? 1,
      status: input.status ?? 'draft',
      allocation_source: input.allocationSource ?? 'human',
      proposal_reason: input.proposalReason ?? null,
      effective_from: input.effectiveFrom ?? new Date().toISOString().split('T')[0],
      effective_to: input.effectiveTo ?? null,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (input.id) {
      const { data, error } = await supabase
        .from('teaching_allocations')
        .update(payload)
        .eq('id', input.id)
        .select('*, classes(name), subjects(name), employees!teaching_allocations_teacher_id_fkey(id, person_id, people(first_name, last_name))')
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('teaching_allocations')
        .insert(payload)
        .select('*, classes(name), subjects(name), employees!teaching_allocations_teacher_id_fkey(id, person_id, people(first_name, last_name))')
        .single();
      if (error) throw error;
      result = data;
    }

    return {
      id: result.id,
      schoolId: result.school_id,
      academicYearId: result.academic_year_id,
      classId: result.class_id,
      className: result.classes?.name,
      streamId: result.stream_id,
      subjectId: result.subject_id,
      subjectName: result.subjects?.name,
      teacherId: result.teacher_id,
      teacherName: result.employees?.people
        ? `${result.employees.people.first_name} ${result.employees.people.last_name}`
        : undefined,
      periodsPerWeek: result.periods_per_week,
      status: result.status,
      allocationSource: result.allocation_source,
      proposalReason: result.proposal_reason,
      effectiveFrom: result.effective_from,
      effectiveTo: result.effective_to,
    };
  },

  /**
   * Atomically approves teaching allocations via Supabase RPC.
   * Transactionally syncs approved rows to subject_teachers as a derived compatibility projection.
   */
  async approveTeachingAllocationsAtomic(
    allocationIds: string[],
    approvedByEmployeeId: string,
  ): Promise<{ success: boolean; approvedCount: number; schoolId: string }> {
    const { data, error } = await supabase.rpc('approve_teaching_allocations_atomic', {
      p_allocation_ids: allocationIds,
      p_approved_by: approvedByEmployeeId,
    });

    if (error) {
      throw new Error(`Failed to approve teaching allocations atomically: ${error.message}`);
    }

    return {
      success: data?.success ?? true,
      approvedCount: data?.approved_count ?? 0,
      schoolId: data?.school_id ?? '',
    };
  },

  /**
   * Workflow B: Generates AI-assisted draft teaching allocations from scratch.
   * Analyzes official teaching subjects, Phase 6 Schemes of Work weekly quotas,
   * and teacher workload limits.
   * Produces draft proposals with clear provenance. Never selects arbitrary teachers.
   */
  generateTeachingPlanDraftWithAi(params: {
    schoolId: string;
    academicYearId: string;
    classes: Array<{ id: string; name: string }>;
    subjects: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; name: string }>;
    officialSubjects: TeacherOfficialSubject[];
    schemesOfWork?: any[];
    policies?: SchoolTimetablePolicy[];
  }): {
    draftAllocations: Array<Omit<TeachingAllocation, 'id'>>;
    unassigned: Array<{ classId: string; className: string; subjectId: string; subjectName: string; reason: string }>;
  } {
    const draftAllocations: Array<Omit<TeachingAllocation, 'id'>> = [];
    const unassigned: Array<{ classId: string; className: string; subjectId: string; subjectName: string; reason: string }> = [];

    const teacherLoad: Record<string, number> = {};
    params.teachers.forEach((t) => {
      teacherLoad[t.id] = 0;
    });

    const effectiveDate = new Date().toISOString().split('T')[0];

    params.classes.forEach((cls) => {
      params.subjects.forEach((sub) => {
        // Derive required weekly periods from Phase 6 Scheme of Work
        const scheme = (params.schemesOfWork ?? []).find(
          (s: any) => s.class_id === cls.id && s.subject_id === sub.id,
        );

        let periodsPerWeek = 0;
        if (scheme) {
          const mtps = scheme.medium_term_plans ?? [];
          if (mtps.length > 0) {
            const totalPeriods = mtps.reduce((acc: number, m: any) => acc + (m.estimated_periods || 0), 0);
            const maxWeek = Math.max(...mtps.map((m: any) => m.week_end || 10));
            if (totalPeriods > 0 && maxWeek > 0) {
              periodsPerWeek = Math.max(1, Math.min(10, Math.ceil(totalPeriods / maxWeek)));
            }
          }
        }

        // If no scheme, report missing curriculum requirement (NO fake fallback)
        if (periodsPerWeek === 0) {
          unassigned.push({
            classId: cls.id,
            className: cls.name,
            subjectId: sub.id,
            subjectName: sub.name,
            reason: `No weekly teaching requirement found in Schemes of Work for ${cls.name} ${sub.name}.`,
          });
          return;
        }

        // Find candidate teachers whose OFFICIAL teaching subjects include this subject
        const candidateTeachers = params.officialSubjects
          .filter((os) => os.subjectId === sub.id)
          .map((os) => os.teacherId);

        if (candidateTeachers.length === 0) {
          unassigned.push({
            classId: cls.id,
            className: cls.name,
            subjectId: sub.id,
            subjectName: sub.name,
            reason: `No teachers have ${sub.name} recorded in their Official Teaching Subjects.`,
          });
          return;
        }

        // Find an eligible teacher with sufficient weekly capacity
        let selectedTeacherId: string | null = null;
        let lowestLoad = Infinity;

        for (const tId of candidateTeachers) {
          const rules = timetablePolicyService.resolveEffectiveRules(params.policies ?? [], tId, undefined, effectiveDate);
          const currentLoad = teacherLoad[tId] || 0;
          if (currentLoad + periodsPerWeek <= rules.maxPeriodsPerWeek) {
            if (currentLoad < lowestLoad) {
              lowestLoad = currentLoad;
              selectedTeacherId = tId;
            }
          }
        }

        if (!selectedTeacherId) {
          unassigned.push({
            classId: cls.id,
            className: cls.name,
            subjectId: sub.id,
            subjectName: sub.name,
            reason: `All qualified teachers for ${sub.name} would exceed their maximum weekly teaching limits (${periodsPerWeek} additional periods needed).`,
          });
          return;
        }

        const teacherObj = params.teachers.find((t) => t.id === selectedTeacherId);
        const currentTeacherLoad = (teacherLoad[selectedTeacherId] || 0) + periodsPerWeek;
        teacherLoad[selectedTeacherId] = currentTeacherLoad;

        draftAllocations.push({
          schoolId: params.schoolId,
          academicYearId: params.academicYearId,
          classId: cls.id,
          className: cls.name,
          subjectId: sub.id,
          subjectName: sub.name,
          teacherId: selectedTeacherId,
          teacherName: teacherObj?.name ?? 'Teacher',
          periodsPerWeek,
          status: 'draft',
          allocationSource: 'ai_draft',
          proposalReason: `Official ${sub.name} subject + available workload (${currentTeacherLoad} periods allocated).`,
          effectiveFrom: effectiveDate,
        });
      });
    });

    return { draftAllocations, unassigned };
  },
};
