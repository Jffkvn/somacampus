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
};
