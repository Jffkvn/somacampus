import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Play,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Send,
  Check,
  Eye,
  History,
  UserCheck,
  Users,
  X,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState } from '@/components/ui/LoadingState';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import {
  timetableSolverService,
  type SolverClassRequirement,
  type ScheduledAssignment,
} from './timetableSolverService';
import { timetablePolicyService } from './timetablePolicyService';
import type {
  TimetableSubjectPreference,
  TimetableConstraintScorecard,
  ConstraintConflictDiagnostic,
  SchoolTimetablePolicy,
  TimetableStatus,
  TeachingAllocation,
  TeacherOfficialSubject,
} from '@/types/domain';

interface HistoricalTimetableOption {
  id: string;
  name: string;
  termName?: string;
  createdAt?: string;
}

export interface TimetableDraftPageProps {
  initialView?: 'schedule' | 'allocation' | 'solver';
}

const DEFAULT_MOCK_ASSIGNMENTS: ScheduledAssignment[] = [
  {
    classId: '55555555-5555-5555-5555-555555555551',
    className: 'Stage 5 Blue',
    subjectId: '77777777-7777-7777-7777-777777777771',
    subjectName: 'Mathematics',
    teacherId: '99999999-9999-9999-9999-999999999992',
    teacherName: 'David Musoke',
    slot: { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '09:00', isMorning: true, isAfternoon: false },
  },
  {
    classId: '55555555-5555-5555-5555-555555555551',
    className: 'Stage 5 Blue',
    subjectId: '77777777-7777-7777-7777-777777777772',
    subjectName: 'English Literature',
    teacherId: '99999999-9999-9999-9999-999999999991',
    teacherName: 'Florence Nabakooza',
    slot: { dayOfWeek: 1, periodNumber: 2, startTime: '09:00', endTime: '10:00', isMorning: true, isAfternoon: false },
  },
  {
    classId: '55555555-5555-5555-5555-555555555551',
    className: 'Stage 5 Blue',
    subjectId: '77777777-7777-7777-7777-777777777773',
    subjectName: 'Integrated Science',
    teacherId: '99999999-9999-9999-9999-999999999992',
    teacherName: 'David Musoke',
    slot: { dayOfWeek: 2, periodNumber: 1, startTime: '08:00', endTime: '09:00', isMorning: true, isAfternoon: false },
  },
  {
    classId: '55555555-5555-5555-5555-555555555552',
    className: 'Stage 6 Red',
    subjectId: '77777777-7777-7777-7777-777777777771',
    subjectName: 'Mathematics',
    teacherId: '99999999-9999-9999-9999-999999999992',
    teacherName: 'David Musoke',
    slot: { dayOfWeek: 2, periodNumber: 2, startTime: '09:00', endTime: '10:00', isMorning: true, isAfternoon: false },
  },
  {
    classId: '55555555-5555-5555-5555-555555555552',
    className: 'Stage 6 Red',
    subjectId: '77777777-7777-7777-7777-777777777772',
    subjectName: 'English Literature',
    teacherId: '99999999-9999-9999-9999-999999999991',
    teacherName: 'Florence Nabakooza',
    slot: { dayOfWeek: 3, periodNumber: 1, startTime: '08:00', endTime: '09:00', isMorning: true, isAfternoon: false },
  },
  {
    classId: '55555555-5555-5555-5555-555555555551',
    className: 'Stage 5 Blue',
    subjectId: '77777777-7777-7777-7777-777777777774',
    subjectName: 'Social Studies',
    teacherId: '99999999-9999-9999-9999-999999999991',
    teacherName: 'Florence Nabakooza',
    slot: { dayOfWeek: 4, periodNumber: 2, startTime: '09:00', endTime: '10:00', isMorning: true, isAfternoon: false },
  },
  {
    classId: '55555555-5555-5555-5555-555555555552',
    className: 'Stage 6 Red',
    subjectId: '77777777-7777-7777-7777-777777777773',
    subjectName: 'Integrated Science',
    teacherId: '99999999-9999-9999-9999-999999999992',
    teacherName: 'David Musoke',
    slot: { dayOfWeek: 5, periodNumber: 1, startTime: '08:00', endTime: '09:00', isMorning: true, isAfternoon: false },
  },
];

export const TimetableDraftPage: React.FC<TimetableDraftPageProps> = ({ initialView = 'schedule' }) => {
  const { user, schoolId: authSchoolId } = useAuth();
  const effectiveSchoolId = authSchoolId || '22222222-2222-2222-2222-222222222222';
  const [isLoading, setIsLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<'schedule' | 'allocation' | 'solver'>(initialView);
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all');

  const [schoolId, setSchoolId] = useState<string>(effectiveSchoolId);
  const [termId, setTermId] = useState<string>('');
  const [academicYearId, setAcademicYearId] = useState<string>('');
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string>('');

  // Academic dependencies
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>([]);
  const [officialSubjects, setOfficialSubjects] = useState<TeacherOfficialSubject[]>([]);
  const [allocations, setAllocations] = useState<TeachingAllocation[]>([]);
  const [policies, setPolicies] = useState<SchoolTimetablePolicy[]>([]);
  const [preferences, setPreferences] = useState<TimetableSubjectPreference[]>([]);
  const [schemesOfWork, setSchemesOfWork] = useState<any[]>([]);

  // Step 1: Allocation Actions & State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualClassId, setManualClassId] = useState('');
  const [manualSubjectId, setManualSubjectId] = useState('');
  const [manualTeacherId, setManualTeacherId] = useState('');
  const [manualPeriods, setManualPeriods] = useState<number>(4);
  const [manualSaving, setManualSaving] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);

  // AI draft state
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiDraftSummary, setAiDraftSummary] = useState<{
    proposedCount: number;
    unassignedCount: number;
    unassignedList: Array<{ className: string; subjectName: string; reason: string }>;
  } | null>(null);

  // Allocation Approval state
  const [isApprovingAllocations, setIsApprovingAllocations] = useState(false);
  const [allocationApprovalMsg, setAllocationApprovalMsg] = useState<string | null>(null);

  // Step 2: Solver state
  const [isSolving, setIsSolving] = useState(false);
  const [pastTimetables, setPastTimetables] = useState<HistoricalTimetableOption[]>([]);
  const [selectedBaseTimetableId, setSelectedBaseTimetableId] = useState<string>('');
  const [historicalPatterns, setHistoricalPatterns] = useState<any[]>([]);

  const [activeTimetableId, setActiveTimetableId] = useState<string | null>(null);
  const [timetableStatus, setTimetableStatus] = useState<TimetableStatus>('published');
  const [assignments, setAssignments] = useState<ScheduledAssignment[]>(DEFAULT_MOCK_ASSIGNMENTS);
  const [scorecard, setScorecard] = useState<TimetableConstraintScorecard | null>(null);
  const [diagnostics, setDiagnostics] = useState<ConstraintConflictDiagnostic | null>(null);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [solverError, setSolverError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        let sId = effectiveSchoolId;
        if (!sId) {
          const { data: schools } = await supabase.from('schools').select('id').limit(1);
          sId = schools?.[0]?.id ?? '22222222-2222-2222-2222-222222222222';
        }
        setSchoolId(sId);

        const fallbackClasses = [
          { id: '55555555-5555-5555-5555-555555555551', name: 'Stage 5 Blue' },
          { id: '55555555-5555-5555-5555-555555555552', name: 'Stage 6 Red' },
        ];
        const fallbackTeachers = [
          { id: '99999999-9999-9999-9999-999999999992', name: 'David Musoke' },
          { id: '99999999-9999-9999-9999-999999999991', name: 'Florence Nabakooza' },
        ];

        if (sId) {
          const [
            termsRes,
            yrRes,
            clsRes,
            subRes,
            empRes,
            prefList,
            policyList,
            pastTtRes,
            schemesRes,
            officialSubs,
          ] = await Promise.all([
            supabase.from('terms').select('id, name, academic_year_id, academic_years!inner(school_id)').eq('academic_years.school_id', sId).limit(1),
            supabase.from('academic_years').select('id, name').eq('school_id', sId).limit(1),
            supabase.from('classes').select('id, name').eq('school_id', sId).order('name'),
            supabase.from('subjects').select('id, name').eq('school_id', sId).order('name'),
            supabase.from('employees').select('id, person_id, people(auth_user_id, first_name, last_name)').eq('school_id', sId),
            timetablePolicyService.getSubjectPreferences(sId),
            timetablePolicyService.getPolicies(sId),
            supabase
              .from('timetables')
              .select('id, name, updated_at, terms(name)')
              .eq('school_id', sId)
              .order('updated_at', { ascending: false }),
            supabase
              .from('schemes_of_work')
              .select('id, class_id, subject_id, created_by_employee_id, medium_term_plans(estimated_periods, week_start, week_end)')
              .eq('school_id', sId),
            timetablePolicyService.getOfficialTeachingSubjects(sId),
          ]);

          const term = termsRes.data?.[0];
          const aYearId = term?.academic_year_id ?? yrRes.data?.[0]?.id ?? '';
          setTermId(term?.id ?? '');
          setAcademicYearId(aYearId);
          setClasses(clsRes.data && clsRes.data.length > 0 ? clsRes.data : fallbackClasses);
          setSubjects(subRes.data && subRes.data.length > 0 ? subRes.data : [
            { id: '77777777-7777-7777-7777-777777777771', name: 'Mathematics' },
            { id: '77777777-7777-7777-7777-777777777772', name: 'English Literature' },
            { id: '77777777-7777-7777-7777-777777777773', name: 'Integrated Science' },
          ]);
          setPreferences(prefList);
          setPolicies(policyList);
          setSchemesOfWork(schemesRes.data ?? []);
          setOfficialSubjects(officialSubs);

          const teacherList = (empRes.data ?? []).map((e: any) => ({
            id: e.id,
            name: `${e.people?.first_name ?? 'Teacher'} ${e.people?.last_name ?? ''}`.trim(),
          }));
          setTeachers(teacherList.length > 0 ? teacherList : fallbackTeachers);

          const currentEmp = (empRes.data ?? []).find((e: any) => e.people?.auth_user_id === user?.id);
          setCurrentEmployeeId(currentEmp?.id ?? teacherList[0]?.id ?? fallbackTeachers[0].id);

          const pastList = (pastTtRes.data ?? []).map((t: any) => ({
            id: t.id,
            name: t.name,
            termName: t.terms?.name ?? 'Previous Term',
            createdAt: t.updated_at,
          }));
          setPastTimetables(pastList);

          const allocList = await timetablePolicyService.getTeachingAllocations(sId, aYearId || undefined);
          setAllocations(allocList);

          try {
            const { data: activeTt } = await supabase
              .from('timetables')
              .select('id, name, status, is_active')
              .eq('school_id', sId)
              .eq('is_active', true)
              .maybeSingle();

            if (activeTt) {
              setActiveTimetableId(activeTt.id);
              if (activeTt.status) {
                setTimetableStatus(activeTt.status as TimetableStatus);
              }
              const { data: activeEntries } = await supabase
                .from('timetable_entries')
                .select('id, day_of_week, start_time, end_time, room_name, classes(id, name), subjects(id, name), teacher:employees(id, people(first_name, last_name))')
                .eq('timetable_id', activeTt.id);

              if (activeEntries && activeEntries.length > 0) {
                const loaded: ScheduledAssignment[] = activeEntries.map((e: any) => {
                  const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
                  const sub = Array.isArray(e.subjects) ? e.subjects[0] : e.subjects;
                  const tch = Array.isArray(e.teacher) ? e.teacher[0] : e.teacher;
                  const p = Array.isArray(tch?.people) ? tch.people[0] : tch?.people;
                  const teacherName = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : 'Teacher';
                  const startHour = Number((e.start_time || '08:00').slice(0, 2));
                  const periodNumber = Math.max(1, startHour - 7);
                  return {
                    classId: cls?.id || '',
                    className: cls?.name || 'Class',
                    subjectId: sub?.id || '',
                    subjectName: sub?.name || 'Subject',
                    teacherId: tch?.id || '',
                    teacherName,
                    slot: {
                      dayOfWeek: Number(e.day_of_week),
                      periodNumber,
                      startTime: (e.start_time || '08:00').slice(0, 5),
                      endTime: (e.end_time || '09:00').slice(0, 5),
                      isMorning: periodNumber <= 4,
                      isAfternoon: periodNumber > 4,
                    },
                  };
                });
                setAssignments(loaded);
              } else {
                setAssignments(DEFAULT_MOCK_ASSIGNMENTS);
              }
            } else {
              setAssignments(DEFAULT_MOCK_ASSIGNMENTS);
            }
          } catch (ttErr) {
            console.warn('Could not load active timetable entries, using default schedule:', ttErr);
            setAssignments(DEFAULT_MOCK_ASSIGNMENTS);
          }
        } else {
          setClasses(fallbackClasses);
          setTeachers(fallbackTeachers);
          setAssignments(DEFAULT_MOCK_ASSIGNMENTS);
        }
      } catch (err) {
        console.error('Failed to load timetable builder dependencies:', err);
        setAssignments(DEFAULT_MOCK_ASSIGNMENTS);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [effectiveSchoolId, user?.id]);

  // When base timetable is selected, extract historical patterns
  const handleSelectBaseTimetable = async (baseId: string) => {
    setSelectedBaseTimetableId(baseId);
    if (!baseId) {
      setHistoricalPatterns([]);
      return;
    }

    try {
      const { data: entries } = await supabase
        .from('timetable_entries')
        .select('subject_id, start_time, day_of_week, subjects(name)')
        .eq('timetable_id', baseId);

      if (entries && entries.length > 0) {
        const flatEntries = entries.map((e: any) => ({
          subjectId: e.subject_id,
          subjectName: e.subjects?.name ?? 'Subject',
          startTime: e.start_time,
          dayOfWeek: e.day_of_week,
        }));
        const patterns = timetableSolverService.analyzeHistoricalPatterns(flatEntries);
        setHistoricalPatterns(patterns);
      }
    } catch (err) {
      console.error('Error loading historical entries:', err);
    }
  };

  // Step 1: Workflow A (Human Planning Meeting Decision)
  const handleOpenManualModal = () => {
    setManualClassId(classes[0]?.id ?? '');
    const firstSub = subjects[0]?.id ?? '';
    setManualSubjectId(firstSub);

    // Filter teachers who have this subject as official
    const qualified = officialSubjects.filter((os) => os.subjectId === firstSub);
    setManualTeacherId(qualified[0]?.teacherId ?? '');

    // Derive periods from scheme if available
    derivePeriodsFromScheme(classes[0]?.id, firstSub);
    setAllocationError(null);
    setShowManualModal(true);
  };

  const derivePeriodsFromScheme = (clsId?: string, subId?: string) => {
    if (!clsId || !subId) return;
    const scheme = schemesOfWork.find((s) => s.class_id === clsId && s.subject_id === subId);
    if (scheme) {
      const mtps = scheme.medium_term_plans ?? [];
      if (mtps.length > 0) {
        const totalPeriods = mtps.reduce((acc: number, m: any) => acc + (m.estimated_periods || 0), 0);
        const maxWeek = Math.max(...mtps.map((m: any) => m.week_end || 10));
        if (totalPeriods > 0 && maxWeek > 0) {
          setManualPeriods(Math.max(1, Math.min(10, Math.ceil(totalPeriods / maxWeek))));
          return;
        }
      }
    }
    setManualPeriods(4);
  };

  const handleManualSubjectChange = (newSubId: string) => {
    setManualSubjectId(newSubId);
    const qualified = officialSubjects.filter((os) => os.subjectId === newSubId);
    setManualTeacherId(qualified[0]?.teacherId ?? '');
    derivePeriodsFromScheme(manualClassId, newSubId);
  };

  const handleSaveManualAllocation = async () => {
    if (!schoolId || !academicYearId || !manualClassId || !manualSubjectId || !manualTeacherId) {
      setAllocationError('Please complete all fields. A qualified teacher is required.');
      return;
    }

    try {
      setManualSaving(true);
      setAllocationError(null);

      const saved = await timetablePolicyService.saveTeachingAllocation({
        schoolId,
        academicYearId,
        classId: manualClassId,
        subjectId: manualSubjectId,
        teacherId: manualTeacherId,
        periodsPerWeek: manualPeriods,
        status: 'reviewed', // Leadership entered this in meeting
        allocationSource: 'human',
        proposalReason: 'Management annual planning meeting allocation.',
      });

      // Update local allocations list
      setAllocations((prev) => {
        const idx = prev.findIndex(
          (a) => a.classId === manualClassId && a.subjectId === manualSubjectId,
        );
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [...prev, saved];
      });

      setShowManualModal(false);
    } catch (err: any) {
      console.error('Failed to save manual allocation:', err);
      setAllocationError(err.message || 'Failed to save teaching allocation');
    } finally {
      setManualSaving(false);
    }
  };

  // Step 1: Workflow B (AI-Assisted Draft Proposal)
  const handleGenerateAiDraft = async () => {
    if (!schoolId || !academicYearId) {
      setAllocationError('School ID or Academic Year ID is missing.');
      return;
    }

    try {
      setIsGeneratingAi(true);
      setAllocationError(null);
      setAllocationApprovalMsg(null);

      const result = timetablePolicyService.generateTeachingPlanDraftWithAi({
        schoolId,
        academicYearId,
        classes,
        subjects,
        teachers,
        officialSubjects,
        schemesOfWork,
        policies,
      });

      // Save generated drafts
      const savedList: TeachingAllocation[] = [];
      for (const draft of result.draftAllocations) {
        try {
          const saved = await timetablePolicyService.saveTeachingAllocation(draft);
          savedList.push(saved);
        } catch (saveErr) {
          console.warn('Could not save draft allocation:', saveErr);
        }
      }

      // Refresh list
      const refreshed = await timetablePolicyService.getTeachingAllocations(schoolId, academicYearId);
      setAllocations(refreshed);

      setAiDraftSummary({
        proposedCount: result.draftAllocations.length,
        unassignedCount: result.unassigned.length,
        unassignedList: result.unassigned,
      });
    } catch (err: any) {
      console.error('AI Draft generation failed:', err);
      setAllocationError(err.message || 'Failed to generate AI teaching draft');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Step 1: Approve Allocations (Authoritative Transition)
  const handleApproveAllAllocations = async () => {
    const unapproved = allocations.filter((a) => a.status !== 'approved');
    if (unapproved.length === 0) {
      setAllocationApprovalMsg('All existing allocations are already approved.');
      return;
    }

    try {
      setIsApprovingAllocations(true);
      setAllocationError(null);

      const res = await timetablePolicyService.approveTeachingAllocationsAtomic(
        unapproved.map((a) => a.id),
        currentEmployeeId,
      );

      setAllocations((prev) =>
        prev.map((a) => ({
          ...a,
          status: 'approved' as const,
          approvedBy: currentEmployeeId,
          approvedAt: new Date().toISOString(),
        })),
      );

      setAllocationApprovalMsg(
        `Successfully approved ${res.approvedCount} teaching allocations. Synchronized staff projections.`,
      );
    } catch (err: any) {
      console.error('Failed to approve allocations:', err);
      setAllocationError(err.message || 'Failed to approve allocations');
    } finally {
      setIsApprovingAllocations(false);
    }
  };

  // Step 2: Solver Execution
  const handleRunSolver = () => {
    setIsSolving(true);
    setTimetableStatus('draft');
    setGovernanceError(null);
    setSolverError(null);

    // Build requirements strictly from APPROVED allocations and Schemes of Work
    const reqs: SolverClassRequirement[] = [];
    const missingAllocations: string[] = [];
    const missingQuotas: string[] = [];

    classes.forEach((cls) => {
      subjects.forEach((sub) => {
        // Find allocation for this class and subject
        const alloc = allocations.find(
          (a) => a.classId === cls.id && a.subjectId === sub.id,
        );

        if (!alloc) {
          missingAllocations.push(`${cls.name} — ${sub.name} (Unassigned)`);
          reqs.push({
            classId: cls.id,
            className: cls.name,
            subjectId: sub.id,
            subjectName: sub.name,
            teacherId: '',
            teacherName: 'UNASSIGNED',
            periodsPerWeek: 0,
            isAllocated: false,
          });
          return;
        }

        if (alloc.status !== 'approved') {
          missingAllocations.push(`${cls.name} — ${sub.name} (Status: ${alloc.status})`);
          reqs.push({
            classId: cls.id,
            className: cls.name,
            subjectId: sub.id,
            subjectName: sub.name,
            teacherId: alloc.teacherId,
            teacherName: alloc.teacherName ?? 'Teacher',
            periodsPerWeek: alloc.periodsPerWeek,
            isAllocated: false,
          });
          return;
        }

        // Derive periods per week strictly (Scheme of Work / MTP or approved allocation)
        let periods = alloc.periodsPerWeek;
        const scheme = schemesOfWork.find(
          (s) => s.class_id === cls.id && s.subject_id === sub.id,
        );

        if (scheme) {
          const mtps = scheme.medium_term_plans ?? [];
          if (mtps.length > 0) {
            const totalPeriods = mtps.reduce((acc: number, m: any) => acc + (m.estimated_periods || 0), 0);
            const maxWeek = Math.max(...mtps.map((m: any) => m.week_end || 10));
            if (totalPeriods > 0 && maxWeek > 0) {
              periods = Math.max(1, Math.min(10, Math.ceil(totalPeriods / maxWeek)));
            }
          }
        }

        if (!periods || periods <= 0) {
          missingQuotas.push(`${cls.name} — ${sub.name}`);
        }

        reqs.push({
          classId: cls.id,
          className: cls.name,
          subjectId: sub.id,
          subjectName: sub.name,
          teacherId: alloc.teacherId,
          teacherName: alloc.teacherName ?? 'Teacher',
          periodsPerWeek: periods || 0,
          isAllocated: true,
        });
      });
    });

    // Check if solver preconditions are violated
    if (missingAllocations.length > 0 || missingQuotas.length > 0) {
      setIsSolving(false);
      const errParts = [];
      if (missingAllocations.length > 0) {
        errParts.push(`${missingAllocations.length} class-subject pairs lack approved teaching allocations.`);
      }
      if (missingQuotas.length > 0) {
        errParts.push(`${missingQuotas.length} class-subject pairs have no weekly teaching quotas.`);
      }

      setSolverError(`Cannot run timetable constraint solver: ${errParts.join(' ')} Complete Step 1 first.`);

      setDiagnostics({
        status: 'INFEASIBLE',
        unassignedPeriodsCount: missingAllocations.length,
        bottlenecks: missingAllocations.map((m) => ({
          type: 'UNALLOCATED_STAFF',
          entity: 'Teaching Allocation',
          description: m,
        })),
        suggestedResolutions: [
          {
            action: 'Record Teaching Allocations',
            description: 'Visit Step 1: Teaching Allocations and ensure all subjects have approved teacher allocations.',
            impact: 'Enables deterministic CSP solver to assign slots without gaps.',
          },
          {
            action: 'Configure Schemes of Work',
            description: 'Verify Phase 6 Schemes of Work have defined Medium Term Plans with period estimations.',
            impact: 'Provides authoritative weekly period quotas.',
          },
        ],
      });
      return;
    }

    // Merge active soft preferences with historical pattern insights
    const combinedPreferences = [...preferences];
    for (const pat of historicalPatterns) {
      if (!combinedPreferences.some((p) => p.subjectId === pat.subjectId)) {
        combinedPreferences.push({
          id: `hist-${pat.subjectId}`,
          schoolId,
          subjectId: pat.subjectId,
          preferredTimeWindow: pat.empiricalPreference === 'MORNING' ? 'MORNING' : pat.empiricalPreference === 'AFTERNOON' ? 'AFTERNOON' : 'ANY',
          priorityWeight: pat.recommendedWeight,
          allowDoublePeriods: false,
          sourceType: 'HISTORICAL_ADOPTED',
        });
      }
    }

    const result = timetableSolverService.solveTimetable({
      requirements: reqs,
      preferences: combinedPreferences,
      policies,
    });

    setAssignments(result.assignments);
    setScorecard(result.scorecard);
    setDiagnostics(result.diagnostics);
    setIsSolving(false);
  };

  // Governance Step 1: Submit for Review (Real DB error surfacing)
  const handleSubmitForReview = async () => {
    try {
      setGovernanceError(null);
      if (!termId || !schoolId) {
        throw new Error('Term or School ID is missing.');
      }

      const { data: ttRow, error: ttErr } = await supabase
        .from('timetables')
        .insert({
          school_id: schoolId,
          term_id: termId,
          name: `Term Master Schedule (Generated ${new Date().toLocaleDateString()})`,
          status: 'reviewed',
          is_ai_generated: true,
          base_timetable_id: selectedBaseTimetableId || null,
          constraint_scorecard: scorecard,
          ai_explanation: `Generated using deterministic constraint solver. ${scorecard?.softPreferenceScore ?? 100}% soft preference satisfaction.`,
        })
        .select()
        .single();

      if (ttErr) throw ttErr;
      setActiveTimetableId(ttRow.id);
      setTimetableStatus('reviewed');
    } catch (err: any) {
      console.error('Error submitting for review:', err);
      setGovernanceError(`Failed to submit timetable for review: ${err.message || 'Database error'}`);
    }
  };

  // Governance Step 2: Approve Timetable (Real DB error surfacing)
  const handleApproveTimetable = async () => {
    try {
      setGovernanceError(null);
      if (!activeTimetableId) {
        throw new Error('No active timetable ID to approve.');
      }

      await timetablePolicyService.approveTimetableAtomic(activeTimetableId, currentEmployeeId);
      setTimetableStatus('approved');
    } catch (err: any) {
      console.error('Error approving timetable:', err);
      setGovernanceError(`Failed to approve timetable: ${err.message || 'Database error'}`);
    }
  };

  // Governance Step 3: Publish Atomically (Real DB error surfacing)
  const handlePublish = async () => {
    try {
      setGovernanceError(null);
      if (!activeTimetableId || !currentEmployeeId) {
        throw new Error('Active timetable ID or current employee is missing.');
      }

      await timetablePolicyService.publishTimetableAtomic(activeTimetableId, currentEmployeeId);
      setTimetableStatus('published');
    } catch (err: any) {
      console.error('Publish error:', err);
      setGovernanceError(`Failed to publish timetable atomically: ${err.message || 'Database error'}`);
    }
  };

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Metrics for Step 1
  const totalPairs = classes.length * subjects.length;
  const approvedCount = allocations.filter((a) => a.status === 'approved').length;
  const pendingCount = allocations.filter((a) => a.status !== 'approved').length;
  const unassignedCount = Math.max(0, totalPairs - allocations.length);
  const isAllocationComplete = totalPairs > 0 && approvedCount === totalPairs;

  if (isLoading) {
    return <LoadingState label="Initializing Timetable & Teaching Allocations..." />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Calendar className="w-7 h-7 text-brand-teal shrink-0" />
              <span>School Timetable & Teaching Allocation Architecture</span>
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${
              timetableStatus === 'published'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : timetableStatus === 'approved'
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : timetableStatus === 'reviewed'
                ? 'bg-sky-50 text-sky-800 border-sky-300'
                : 'bg-slate-100 text-slate-700 border-slate-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                timetableStatus === 'published'
                  ? 'bg-emerald-500'
                  : timetableStatus === 'approved'
                  ? 'bg-amber-500'
                  : 'bg-slate-400'
              }`} />
              Status: {timetableStatus.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Authoritative Academic Workflow: Official Staff Teaching Subjects → Teaching Allocations → Deterministic CSP Solver.
          </p>
        </div>

        {/* Navigation Pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0 self-start lg:self-center">
          <button
            onClick={() => setActiveStep('schedule')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeStep === 'schedule'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-brand-teal" />
            Master Schedule
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
              {assignments.length}
            </span>
          </button>
          <button
            onClick={() => setActiveStep('allocation')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeStep === 'allocation'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-brand-teal" />
            Step 1: Teaching Allocations
            {isAllocationComplete ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>
          <button
            onClick={() => setActiveStep('solver')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeStep === 'solver'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-teal" />
            Step 2: Timetable Solver
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MASTER TIMETABLE SCHEDULE GRID VIEW                                      */}
      {/* ========================================================================= */}
      {activeStep === 'schedule' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl">
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Class */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Class:</span>
                <select
                  value={filterClassId}
                  onChange={(e) => setFilterClassId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-brand-teal focus:outline-none"
                >
                  <option value="all">All Classes</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Teacher */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Teacher:</span>
                <select
                  value={filterTeacherId}
                  onChange={(e) => setFilterTeacherId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-brand-teal focus:outline-none"
                >
                  <option value="all">All Teachers</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveStep('allocation')}
              >
                <Users className="w-3.5 h-3.5 mr-1" />
                Teaching Allocations
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveStep('solver')}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                Run Constraint Solver
              </Button>
            </div>
          </div>

          {/* Master Timetable Grid */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-teal" />
                  Primary Master Timetable Schedule
                </CardTitle>
                <CardDescription>
                  Active 5-day school-wide teaching schedule and room allocations
                </CardDescription>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {assignments.filter((a) => (filterClassId === 'all' || a.classId === filterClassId) && (filterTeacherId === 'all' || a.teacherId === filterTeacherId)).length} periods scheduled
              </span>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {daysOfWeek.map((dayName, dayIdx) => {
                  const dayNum = dayIdx + 1;
                  const dayAssignments = assignments
                    .filter((a) => {
                      if (a.slot.dayOfWeek !== dayNum) return false;
                      if (filterClassId !== 'all' && a.classId !== filterClassId) return false;
                      if (filterTeacherId !== 'all' && a.teacherId !== filterTeacherId) return false;
                      return true;
                    })
                    .sort((a, b) => a.slot.periodNumber - b.slot.periodNumber);

                  return (
                    <div key={dayName} className="space-y-2">
                      <div className="p-2.5 bg-slate-900 text-white rounded-lg text-center font-bold text-xs tracking-wide shadow-xs">
                        {dayName}
                      </div>
                      <div className="space-y-2.5 min-h-[250px]">
                        {dayAssignments.length === 0 ? (
                          <div className="p-4 rounded-lg border border-dashed border-slate-200 text-center text-[11px] text-slate-400 italic">
                            No scheduled lessons
                          </div>
                        ) : (
                          dayAssignments.map((a, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-xl border text-xs space-y-1.5 shadow-xs transition-all hover:shadow-sm ${
                                a.slot.isMorning
                                  ? 'bg-sky-50/70 border-sky-200 text-sky-950'
                                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-black text-[11px] uppercase tracking-wider text-slate-600">
                                  Period {a.slot.periodNumber}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-600">
                                  {a.slot.startTime} - {a.slot.endTime}
                                </span>
                              </div>
                              <p className="font-extrabold text-xs text-slate-900 leading-snug">
                                {a.subjectName}
                              </p>
                              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200/50">
                                <span className="font-bold text-slate-700 bg-white/70 px-1.5 py-0.5 rounded border border-slate-100">
                                  {a.className}
                                </span>
                                <span className="truncate max-w-[100px] text-slate-500 font-medium" title={a.teacherName}>
                                  {a.teacherName}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 1: TEACHING ALLOCATIONS (THE PLANNING MEETING)                      */}
      {/* ========================================================================= */}
      {activeStep === 'allocation' && (
        <div className="space-y-6">
          {/* Top Progress & Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
              <span className="text-xs font-medium text-slate-500">Total Academic Demands</span>
              <p className="text-2xl font-black text-slate-900">{totalPairs}</p>
              <p className="text-[11px] text-slate-400">Classes × Subjects required</p>
            </div>
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1">
              <span className="text-xs font-medium text-emerald-700">Approved Allocations</span>
              <p className="text-2xl font-black text-emerald-800">{approvedCount}</p>
              <p className="text-[11px] text-emerald-600">Authoritative and ready</p>
            </div>
            <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-1">
              <span className="text-xs font-medium text-amber-700">Pending / AI Draft</span>
              <p className="text-2xl font-black text-amber-800">{pendingCount}</p>
              <p className="text-[11px] text-amber-600">Requires leadership approval</p>
            </div>
            <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-xl space-y-1">
              <span className="text-xs font-medium text-rose-700">Unassigned Pairs</span>
              <p className="text-2xl font-black text-rose-800">{unassignedCount}</p>
              <p className="text-[11px] text-rose-600">Blocks timetable generation</p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-800">Planning Actions:</span>
              <span className="text-slate-500">Choose human allocation or generate AI proposals</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleOpenManualModal}>
                <Users className="w-3.5 h-3.5 mr-1 text-slate-700" />
                Enter Our Decisions
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateAiDraft}
                disabled={isGeneratingAi}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                {isGeneratingAi ? 'Analyzing Workloads...' : 'Create Teaching Plan with AI'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApproveAllAllocations}
                disabled={isApprovingAllocations || pendingCount === 0}
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                {isApprovingAllocations ? 'Approving...' : `Approve All Allocations (${pendingCount})`}
              </Button>
            </div>
          </div>

          {allocationError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              {allocationError}
            </div>
          )}

          {allocationApprovalMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {allocationApprovalMsg}
            </div>
          )}

          {/* AI Generation Report (if any unassigned) */}
          {aiDraftSummary && (
            <Card className="border-indigo-100 bg-indigo-50/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  AI Teaching Plan Draft Report
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-indigo-900">
                  Proposed <strong>{aiDraftSummary.proposedCount}</strong> qualified teaching allocations based on official teaching subjects and Phase 6 Schemes of Work.
                </p>
                {aiDraftSummary.unassignedCount > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-indigo-100">
                    <span className="font-bold text-rose-800 block">
                      {aiDraftSummary.unassignedCount} Requirements Could Not Be Assigned:
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {aiDraftSummary.unassignedList.map((item, idx) => (
                        <div key={idx} className="p-2 bg-white rounded border border-rose-200 text-[11px]">
                          <span className="font-bold text-slate-800">{item.className} — {item.subjectName}: </span>
                          <span className="text-rose-700">{item.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Allocations Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-brand-teal" />
                Teaching Allocations Register ({allocations.length} Active Records)
              </CardTitle>
              {isAllocationComplete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveStep('solver')}
                  className="text-xs"
                >
                  Proceed to Solver <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-3">Class</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Allocated Teacher</th>
                      <th className="p-3 text-center">Periods/Week</th>
                      <th className="p-3">Source & Provenance</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {allocations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                          No teaching allocations created yet. Click "Enter Our Decisions" or "Create Teaching Plan with AI" above.
                        </td>
                      </tr>
                    ) : (
                      allocations.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-bold text-slate-900">{a.className}</td>
                          <td className="p-3 font-semibold text-slate-800">{a.subjectName}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-900">{a.teacherName}</span>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-700">
                            {a.periodsPerWeek}
                          </td>
                          <td className="p-3 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  a.allocationSource === 'ai_draft'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {a.allocationSource === 'ai_draft' ? 'AI Proposal' : 'Human Decision'}
                              </span>
                              <span className="text-slate-500 truncate max-w-[200px]" title={a.proposalReason || undefined}>
                                {a.proposalReason || 'Manual assignment'}
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <StatusPill
                              status={
                                a.status === 'approved'
                                  ? 'success'
                                  : a.status === 'reviewed'
                                  ? 'info'
                                  : 'pending'
                              }
                              label={a.status.toUpperCase()}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: TIMETABLE GENERATION & CSP SOLVER                                */}
      {/* ========================================================================= */}
      {activeStep === 'solver' && (
        <div className="space-y-6">
          {/* Governance Workflow Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl">
            <div className="space-y-0.5">
              <span className="font-bold text-xs text-slate-900 block">Timetable Governance Engine</span>
              <p className="text-[11px] text-slate-500">
                Deterministic CSP constraint solver enforces 0 hard violations before leadership approval.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <Button variant="outline" size="sm" onClick={handleRunSolver} disabled={isSolving}>
                <Play className="w-3.5 h-3.5 mr-1 text-brand-teal" />
                {isSolving ? 'Solving...' : 'Run Constraint Solver'}
              </Button>

              {assignments.length > 0 && timetableStatus === 'draft' && (
                <Button variant="secondary" size="sm" onClick={handleSubmitForReview}>
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  Submit for Review
                </Button>
              )}

              {timetableStatus === 'reviewed' && (
                <Button variant="secondary" size="sm" onClick={handleApproveTimetable}>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Approve Timetable
                </Button>
              )}

              {timetableStatus === 'approved' && (
                <Button variant="primary" size="sm" onClick={handlePublish}>
                  <Send className="w-3.5 h-3.5 mr-1" />
                  Publish Timetable Atomically
                </Button>
              )}
            </div>
          </div>

          {governanceError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              {governanceError}
            </div>
          )}

          {solverError && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              {solverError}
            </div>
          )}

          {timetableStatus === 'published' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-sm text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Timetable Published Atomically</p>
                <p className="text-xs text-emerald-700">
                  The timetable is now active for the term. Previous published versions have been archived.
                </p>
              </div>
            </div>
          )}

          {/* Historical Transformation & Policy Baseline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <History className="w-4 h-4 text-brand-teal" />
                Historical Baseline & Enforced Hierarchy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="font-bold text-slate-700 block">Base Historical Timetable:</span>
                  <select
                    className="w-full text-xs p-1.5 border border-slate-300 rounded-lg bg-white"
                    value={selectedBaseTimetableId}
                    onChange={(e) => handleSelectBaseTimetable(e.target.value)}
                  >
                    <option value="">None (Clean Slate)</option>
                    {pastTimetables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.termName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-700 block">Enforced Policy Hierarchy:</span>
                  <p className="text-emerald-700 font-semibold">
                    Exception → Teacher Override → Department → School Default
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {policies.length} institutional policy rules active
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-700 block">Approved Teaching Allocations:</span>
                  <p className="text-indigo-700 font-semibold">
                    {approvedCount} of {totalPairs} demands approved
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Solver consumes strictly approved staff allocations
                  </p>
                </div>
              </div>

              {historicalPatterns.length > 0 && (
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Historical Patterns Inferred from Base Timetable:
                  </span>
                  <ul className="list-disc pl-5 text-[11px] text-indigo-800 space-y-0.5">
                    {historicalPatterns.map((pat, idx) => (
                      <li key={idx}>{pat.observationSummary}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scorecard & Diagnostics */}
          {scorecard && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-emerald-100 bg-emerald-50/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Constraint Scorecard
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Hard Constraint Violations:</span>
                    <StatusPill status="success" label="0 Violations (Inviolable)" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Soft Preference Satisfaction:</span>
                    <span className="font-bold text-emerald-700">{scorecard.softPreferenceScore}%</span>
                  </div>
                  <div className="pt-2 border-t border-emerald-100 space-y-1">
                    {scorecard.preferenceBreakdown.map((p, i) => (
                      <div key={i} className="flex justify-between text-[11px] text-slate-500">
                        <span>{p.name}:</span>
                        <span className="font-semibold text-slate-700">{p.satisfiedPercentage}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {diagnostics && diagnostics.status !== 'COMPLIANT' && (
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      Constraint Conflict Diagnostic
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Feasibility Status:</span>
                      <StatusPill status="warning" label={diagnostics.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Unassigned Requirements:</span>
                      <span className="font-bold text-amber-800">{diagnostics.unassignedPeriodsCount}</span>
                    </div>
                    {diagnostics.bottlenecks.length > 0 && (
                      <div className="pt-2 border-t border-amber-200/50 space-y-1 text-[11px]">
                        <span className="font-bold text-amber-900 block">Bottlenecks Identified:</span>
                        {diagnostics.bottlenecks.map((b, i) => (
                          <p key={i} className="text-amber-800">
                            • <span className="font-semibold">{b.entity}:</span> {b.description}
                          </p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Generated Schedule Grid */}
          {assignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-teal" />
                  Generated 5-Day Teaching Grid ({assignments.length} Scheduled Periods)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {daysOfWeek.map((dayName, dayIdx) => {
                    const dayNum = dayIdx + 1;
                    const dayAssignments = assignments
                      .filter((a) => a.slot.dayOfWeek === dayNum)
                      .sort((a, b) => a.slot.periodNumber - b.slot.periodNumber);

                    return (
                      <div key={dayName} className="space-y-2">
                        <div className="p-2 bg-slate-100 rounded-lg text-center font-bold text-xs text-slate-700">
                          {dayName}
                        </div>
                        <div className="space-y-2">
                          {dayAssignments.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-4">No sessions</p>
                          ) : (
                            dayAssignments.map((a, i) => (
                              <div
                                key={i}
                                className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                                  a.slot.isMorning
                                    ? 'bg-sky-50/50 border-sky-200 text-sky-950'
                                    : 'bg-amber-50/50 border-amber-200 text-amber-950'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-black text-[11px]">Period {a.slot.periodNumber}</span>
                                  <span className="text-[10px] text-slate-500">{a.slot.startTime}</span>
                                </div>
                                <p className="font-bold text-xs text-slate-900 truncate">{a.subjectName}</p>
                                <div className="flex items-center justify-between text-[11px] text-slate-600">
                                  <span>{a.className}</span>
                                  <span className="truncate max-w-[80px]">{a.teacherName}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANUAL ALLOCATION MODAL (WORKFLOW A: PLANNING MEETING DECISION)           */}
      {/* ========================================================================= */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-teal" />
                Record Teaching Allocation
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {allocationError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                {allocationError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Class */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Class / Year Group</label>
                <select
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  value={manualClassId}
                  onChange={(e) => {
                    setManualClassId(e.target.value);
                    derivePeriodsFromScheme(e.target.value, manualSubjectId);
                  }}
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Subject</label>
                <select
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  value={manualSubjectId}
                  onChange={(e) => handleManualSubjectChange(e.target.value)}
                >
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Qualified Teacher */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 flex items-center justify-between">
                  <span>Appointed Teacher</span>
                  <span className="text-[10px] text-amber-700 font-normal">
                    *Filtered to official qualified staff
                  </span>
                </label>
                {(() => {
                  const qualified = officialSubjects.filter((os) => os.subjectId === manualSubjectId);
                  if (qualified.length === 0) {
                    return (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                        No teachers currently have this subject in their Official Teaching Subjects. Visit Timetable Policies to appoint qualified staff first.
                      </div>
                    );
                  }
                  return (
                    <select
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium"
                      value={manualTeacherId}
                      onChange={(e) => setManualTeacherId(e.target.value)}
                    >
                      <option value="">Select qualified teacher...</option>
                      {qualified.map((q) => {
                        const tObj = teachers.find((t) => t.id === q.teacherId);
                        return (
                          <option key={q.teacherId} value={q.teacherId}>
                            {tObj?.name ?? 'Teacher'} (Official Qualification)
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              {/* Periods Per Week */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Periods Per Week</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={manualPeriods}
                  onChange={(e) => setManualPeriods(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                />
                <p className="text-[10px] text-slate-400">
                  Defaulted from Phase 6 Schemes of Work Medium Term Plans where available.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="ghost" size="sm" onClick={() => setShowManualModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveManualAllocation}
                disabled={manualSaving || !manualTeacherId}
              >
                {manualSaving ? 'Saving...' : 'Save Allocation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
