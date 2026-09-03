import { supabase } from '../../lib/supabase';
import type {
  InterventionStatus,
  InterventionOutcome,
  InterventionEvidenceType,
  EvidenceReference,
  StudentIntervention,
  LearningAreaPattern,
  StudentLongitudinalProfile,
  PreLessonBriefing,
  ObservationType,
} from '../../types/domain';

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co' ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY === 'placeholder-anon-key';


function one<T>(val: T | T[] | null | undefined): T | null {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

export interface CreateInterventionInput {
  schoolId: string;
  studentId: string;
  teacherId: string;
  classId: string;
  streamId?: string | null;
  subjectId: string;
  learningArea: string;
  topicName?: string;
  curriculumObjectiveRef?: string | null;
  reason: string;
  strategyAction: string;
  targetOutcome: string;
  startDate?: string;
  targetDate: string;
  status?: InterventionStatus;
}

export const learningIntelligenceService = {
  /**
   * Deterministic compilation of the longitudinal student learning profile.
   * Aggregates authoritative evidence (formal assessments, diagnostic work,
   * teacher observations) without AI assumptions.
   * Excludes private teacher reflections unconditionally.
   */
  async getLongitudinalProfile(studentId: string): Promise<StudentLongitudinalProfile | null> {
    if (isMockEnv()) return null;

    try {
      // 1. Student Identity & Active Enrolment
      const { data: student, error: stErr } = await supabase
        .from('students')
        .select(`
          id,
          admission_number,
          people:people!students_person_id_fkey(first_name, last_name)
        `)
        .eq('id', studentId)
        .maybeSingle();

      if (stErr || !student) return null;

      const person = one(student.people);
      const fullName = person?.first_name
        ? `${person.first_name}${person.last_name ? ` ${person.last_name}` : ''}`
        : 'Unknown Student';

      let className = '—';
      let streamName: string | undefined;
      try {
        const { data: enrol } = await supabase
          .from('student_enrolments')
          .select('classes(name), streams(name)')
          .eq('student_id', studentId)
          .eq('status', 'active')
          .maybeSingle();

        const cls = one((enrol as any)?.classes);
        const stm = one((enrol as any)?.streams);
        if (cls?.name) {
          className = stm?.name ? `${cls.name} ${stm.name}` : cls.name;
          streamName = stm?.name ?? undefined;
        }
      } catch {
        // className stays '—'
      }

      // 2. Attendance Summary
      let attendancePercentage = 0;
      try {
        const { data: attData } = await supabase
          .from('student_attendance_records')
          .select('status')
          .eq('student_id', studentId);

        if (Array.isArray(attData) && attData.length > 0) {
          const present = attData.filter((r) => r.status === 'present').length;
          attendancePercentage = Math.round((present / attData.length) * 100);
        }
      } catch {
        attendancePercentage = 0;
      }

      // 3. Submissions / Academic Evidence (Two-Track)
      const { data: rawSubmissions } = await supabase
        .from('student_submissions')
        .select(`
          id,
          assignment_id,
          participation_status,
          submission_status,
          score,
          teacher_feedback,
          work_type,
          created_at,
          assignment:assignments!student_submissions_assignment_id_fkey(
            id,
            title,
            due_date,
            evidence_track,
            max_score,
            submission_type,
            subject_id,
            subjects(id, name)
          )
        `)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      const submissions = Array.isArray(rawSubmissions) ? rawSubmissions : [];

      // 4. Teacher Observations (Strictly excluding private teacher reflections)
      const { data: rawObservations } = await supabase
        .from('teacher_observations')
        .select(`
          id,
          observation_type,
          observation_text,
          observed_at,
          subject_id,
          subjects(id, name),
          teacher:employees(people(first_name, last_name))
        `)
        .eq('student_id', studentId)
        .order('observed_at', { ascending: false });

      const observations = Array.isArray(rawObservations) ? rawObservations : [];

      // 5. Interventions & Relational Evidence Links
      const { data: rawInterventions } = await supabase
        .from('interventions')
        .select(`
          id,
          school_id,
          student_id,
          teacher_id,
          class_id,
          stream_id,
          subject_id,
          learning_area,
          topic_name,
          curriculum_objective_ref,
          reason,
          strategy_action,
          target_outcome,
          start_date,
          target_date,
          status,
          outcome,
          outcome_notes,
          follow_up_notes,
          created_at,
          updated_at,
          teacher:employees(people(first_name, last_name)),
          subjects(name),
          classes(name),
          evidence:intervention_evidence(evidence_type, evidence_id)
        `)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      const interventionsList = Array.isArray(rawInterventions) ? rawInterventions : [];

      // Map interventions to domain model
      const mappedInterventions: StudentIntervention[] = interventionsList.map((iv: any) => {
        const teacherPerson = one(iv.teacher?.people);
        const teacherName = teacherPerson?.first_name
          ? `${teacherPerson.first_name}${teacherPerson.last_name ? ` ${teacherPerson.last_name}` : ''}`
          : 'Teacher';
        const subj = one(iv.subjects);
        const cls = one(iv.classes);

        const evidenceReferences: EvidenceReference[] = (iv.evidence || []).map((ev: any) => ({
          type: ev.evidence_type,
          id: ev.evidence_id,
          titleOrSnippet: `Linked ${ev.evidence_type}`,
          date: String(iv.start_date),
        }));

        return {
          id: iv.id,
          schoolId: iv.school_id,
          studentId: iv.student_id,
          studentName: fullName,
          teacherId: iv.teacher_id,
          teacherName,
          classId: iv.class_id,
          className: cls?.name ?? 'Class',
          streamId: iv.stream_id,
          subjectId: iv.subject_id,
          subjectName: subj?.name ?? 'General',
          learningArea: iv.learning_area,
          topicName: iv.topic_name ?? undefined,
          curriculumObjectiveRef: iv.curriculum_objective_ref ?? null,
          reason: iv.reason,
          strategyAction: iv.strategy_action,
          targetOutcome: iv.target_outcome,
          startDate: String(iv.start_date),
          targetDate: String(iv.target_date),
          status: iv.status,
          outcome: iv.outcome ?? null,
          outcomeNotes: iv.outcome_notes ?? null,
          followUpNotes: iv.follow_up_notes ?? null,
          evidenceReferences,
          createdAt: iv.created_at,
          updatedAt: iv.updated_at,
        };
      });

      const activeInterventions = mappedInterventions.filter(
        (i) => i.status === 'active' || i.status === 'draft',
      );
      const pastInterventions = mappedInterventions.filter(
        (i) => i.status === 'completed' || i.status === 'abandoned',
      );

      // 6. Calculate Academic Overview (Strict separation: formal vs diagnostic)
      const formalSubmissions = submissions.filter(
        (s) => (s.assignment as any)?.evidence_track === 'formal_graded' && s.score !== null && s.score !== undefined,
      );
      const diagnosticSubmissions = submissions.filter(
        (s) => (s.assignment as any)?.evidence_track !== 'formal_graded',
      );

      let formalAveragePct: number | null = null;
      if (formalSubmissions.length > 0) {
        let earnedSum = 0;
        let maxPossibleSum = 0;
        for (const fs of formalSubmissions) {
          const max = Number((fs.assignment as any)?.max_score ?? 100);
          earnedSum += Number(fs.score);
          maxPossibleSum += max;
        }
        formalAveragePct = maxPossibleSum > 0 ? Math.round((earnedSum / maxPossibleSum) * 100) : null;
      }

      let diagnosticParticipationPct = 0;
      if (diagnosticSubmissions.length > 0) {
        const expected = diagnosticSubmissions.filter((s) => s.participation_status === 'expected');
        const submittedOrLate = expected.filter(
          (s) => s.submission_status === 'submitted' || s.submission_status === 'late',
        ).length;
        diagnosticParticipationPct = expected.length > 0
          ? Math.round((submittedOrLate / expected.length) * 100)
          : 100;
      }

      // 7. Calculate Subject Trajectories
      const subjectsMap = new Map<string, { name: string; formal: any[]; diagnostic: any[]; obs: any[] }>();

      for (const s of submissions) {
        const a = one(s.assignment);
        const subjId = a?.subject_id || 'unknown';
        const subjName = (one(a?.subjects) as any)?.name || 'General';
        if (!subjectsMap.has(subjId)) {
          subjectsMap.set(subjId, { name: subjName, formal: [], diagnostic: [], obs: [] });
        }
        if (a?.evidence_track === 'formal_graded') {
          subjectsMap.get(subjId)!.formal.push(s);
        } else {
          subjectsMap.get(subjId)!.diagnostic.push(s);
        }
      }

      for (const o of observations) {
        const subjId = o.subject_id || 'general';
        const subjName = (one(o.subjects) as any)?.name || 'General Observations';
        if (!subjectsMap.has(subjId)) {
          subjectsMap.set(subjId, { name: subjName, formal: [], diagnostic: [], obs: [] });
        }
        subjectsMap.get(subjId)!.obs.push(o);
      }

      const subjectTrajectories: StudentLongitudinalProfile['subjectTrajectories'] = [];

      for (const [subjId, group] of subjectsMap.entries()) {
        const totalEvidence = group.formal.length + group.diagnostic.length + group.obs.length;
        let sFormalAvg: number | null = null;
        if (group.formal.length > 0) {
          const graded = group.formal.filter((f) => f.score !== null && f.score !== undefined);
          if (graded.length > 0) {
            const sum = graded.reduce((acc, curr) => acc + Number(curr.score), 0);
            const maxSum = graded.reduce(
              (acc, curr) => acc + Number((curr.assignment as any)?.max_score ?? 100),
              0,
            );
            sFormalAvg = maxSum > 0 ? Math.round((sum / maxSum) * 100) : null;
          }
        }

        let sDiagPct = 100;
        if (group.diagnostic.length > 0) {
          const expected = group.diagnostic.filter((d) => d.participation_status === 'expected');
          const completed = expected.filter(
            (d) => d.submission_status === 'submitted' || d.submission_status === 'late',
          ).length;
          sDiagPct = expected.length > 0 ? Math.round((completed / expected.length) * 100) : 100;
        }

        const struggles = group.obs.filter(
          (o) => o.observation_type === 'misconception' || o.observation_type === 'support_need',
        ).length;

        let status: 'steady' | 'support_needed' | 'insufficient_evidence' = 'steady';
        if (totalEvidence < 2) {
          status = 'insufficient_evidence';
        } else if ((sFormalAvg !== null && sFormalAvg < 50) || struggles >= 2) {
          status = 'support_needed';
        }

        subjectTrajectories.push({
          subjectId: subjId,
          subjectName: group.name,
          formalAveragePct: sFormalAvg,
          diagnosticParticipationPct: sDiagPct,
          evidenceCount: totalEvidence,
          status,
        });
      }

      // 8. Deterministic Emerging Pattern Engine
      // Groups by (subject, learning_area / title)
      const emergingPatterns: LearningAreaPattern[] = [];
      for (const [subjId, group] of subjectsMap.entries()) {
        const misconceptions = group.obs.filter((o) => o.observation_type === 'misconception');
        const supportNeeds = group.obs.filter((o) => o.observation_type === 'support_need');
        const strengths = group.obs.filter((o) => o.observation_type === 'strength');

        const evidenceReferences: EvidenceReference[] = [
          ...misconceptions.map((m) => ({
            type: 'observation' as InterventionEvidenceType,
            id: m.id,
            titleOrSnippet: m.observation_text.slice(0, 60),
            date: String(m.observed_at).slice(0, 10),
          })),
          ...group.formal.map((f) => ({
            type: 'formal_assessment' as InterventionEvidenceType,
            id: f.id,
            titleOrSnippet: `${(f.assignment as any)?.title}: ${f.score}/${(f.assignment as any)?.max_score}`,
            date: String((f.assignment as any)?.due_date || f.created_at).slice(0, 10),
          })),
          ...group.diagnostic.map((d) => ({
            type: 'submission' as InterventionEvidenceType,
            id: d.id,
            titleOrSnippet: `${(d.assignment as any)?.title} (${d.submission_status})`,
            date: String((d.assignment as any)?.due_date || d.created_at).slice(0, 10),
          })),
        ];

        const totalItems = group.formal.length + group.diagnostic.length + group.obs.length;

        if (totalItems < 2) {
          emergingPatterns.push({
            subjectId: subjId,
            subjectName: group.name,
            learningArea: group.name,
            classification: 'insufficient_evidence',
            summary: `Insufficient evidence recorded to evaluate patterns in ${group.name} yet.`,
            evidenceCount: totalItems,
            observationsCount: group.obs.length,
            evidenceReferences: evidenceReferences.slice(0, 5),
            requiresAttention: false,
          });
          continue;
        }

        // Observed Struggle Pattern
        if (misconceptions.length + supportNeeds.length >= 2) {
          emergingPatterns.push({
            subjectId: subjId,
            subjectName: group.name,
            learningArea: group.name,
            classification: 'observed_pattern',
            summary: `Observed recurring difficulty across ${misconceptions.length + supportNeeds.length} observations in ${group.name}.`,
            evidenceCount: totalItems,
            observationsCount: group.obs.length,
            evidenceReferences: evidenceReferences.slice(0, 6),
            requiresAttention: true,
          });
        }
        // Observed Strength Pattern
        else if (strengths.length >= 2) {
          emergingPatterns.push({
            subjectId: subjId,
            subjectName: group.name,
            learningArea: group.name,
            classification: 'observed_pattern',
            summary: `Consistent mastery demonstrated across ${strengths.length} observations in ${group.name}.`,
            evidenceCount: totalItems,
            observationsCount: group.obs.length,
            evidenceReferences: evidenceReferences.slice(0, 6),
            requiresAttention: false,
          });
        }
        // Possible Struggle Pattern (1 observation + lower score)
        else if (misconceptions.length === 1 && group.formal.some((f) => f.score !== null && Number(f.score) < 50)) {
          emergingPatterns.push({
            subjectId: subjId,
            subjectName: group.name,
            learningArea: group.name,
            classification: 'possible_pattern',
            summary: `Possible friction in ${group.name}. 1 recorded misconception accompanied by a lower assessment score.`,
            evidenceCount: totalItems,
            observationsCount: group.obs.length,
            evidenceReferences: evidenceReferences.slice(0, 6),
            requiresAttention: true,
          });
        }
      }

      // 9. Unified Chronological Evidence Timeline
      const timelineItems: StudentLongitudinalProfile['evidenceTimeline'] = [];

      for (const s of submissions) {
        const a = one(s.assignment);
        const subjName = (one(a?.subjects) as any)?.name || 'General';
        const isFormal = a?.evidence_track === 'formal_graded';
        const dateStr = String(a?.due_date || s.created_at).slice(0, 10);

        if (isFormal) {
          timelineItems.push({
            id: s.id,
            date: dateStr,
            type: 'formal_assessment',
            subjectName: subjName,
            title: a?.title || 'Assessment',
            details: `Authoritative Score: ${s.score ?? '—'} / ${a?.max_score ?? 100}${s.teacher_feedback ? ` • Feedback: "${s.teacher_feedback}"` : ''}`,
            provenanceId: s.id,
            provenanceType: 'formal_assessment',
            badge: { label: 'Formal Graded', variant: 'success' },
          });
        } else {
          timelineItems.push({
            id: s.id,
            date: dateStr,
            type: 'diagnostic_work',
            subjectName: subjName,
            title: a?.title || 'Classwork/Homework',
            details: `Work format: ${s.work_type} • Status: ${s.submission_status}${s.score !== null && s.score !== undefined ? ` • Score: ${s.score}` : ''}`,
            provenanceId: s.id,
            provenanceType: 'submission',
            badge: { label: 'Diagnostic Work', variant: 'info' },
          });
        }
      }

      for (const o of observations) {
        const subjName = (one(o.subjects) as any)?.name || 'General';
        const teacherPerson = one((o.teacher as any)?.people);
        const tName = teacherPerson?.first_name
          ? `${teacherPerson.first_name} ${teacherPerson.last_name || ''}`
          : 'Teacher';
        const dateStr = String(o.observed_at).slice(0, 10);

        let variant: 'warning' | 'info' | 'critical' | 'success' = 'info';
        if (o.observation_type === 'misconception') variant = 'warning';
        else if (o.observation_type === 'support_need') variant = 'critical';
        else if (o.observation_type === 'strength') variant = 'success';

        timelineItems.push({
          id: o.id,
          date: dateStr,
          type: 'teacher_observation',
          subjectName: subjName,
          title: `Teacher Observation (${o.observation_type.replace('_', ' ')})`,
          details: `"${o.observation_text}" — Observed by ${tName}`,
          provenanceId: o.id,
          provenanceType: 'observation',
          badge: { label: o.observation_type.replace('_', ' '), variant },
        });
      }

      for (const iv of mappedInterventions) {
        timelineItems.push({
          id: iv.id,
          date: iv.startDate,
          type: 'intervention_action',
          subjectName: iv.subjectName || 'General',
          title: `Intervention: ${iv.learningArea} (${iv.status})`,
          details: `Strategy: ${iv.strategyAction} • Target: ${iv.targetOutcome}${iv.outcome ? ` • Outcome: ${iv.outcome}` : ''}`,
          provenanceId: iv.id,
          provenanceType: 'lesson',
          badge: {
            label: iv.status === 'completed' ? 'Resolved' : 'Active Intervention',
            variant: iv.status === 'completed' ? 'success' : 'critical',
          },
        });
      }

      timelineItems.sort((a, b) => b.date.localeCompare(a.date));

      return {
        studentId,
        fullName,
        admissionNumber: student.admission_number || '—',
        className,
        streamName,
        academicOverview: {
          formalAveragePct,
          formalAssessmentsCount: formalSubmissions.length,
          diagnosticParticipationPct,
          diagnosticCount: diagnosticSubmissions.length,
          observationsCount: observations.length,
          attendancePercentage,
          activeInterventionsCount: activeInterventions.length,
        },
        subjectTrajectories,
        emergingPatterns,
        activeInterventions,
        pastInterventions,
        evidenceTimeline: timelineItems,
      };
    } catch (err) {
      console.warn('getLongitudinalProfile failed:', err);
      return null;
    }
  },

  /**
   * Pre-Lesson Teacher Learning Context ("Before You Teach").
   * Strictly scoped to the specified class and subject.
   * Returns previous lesson summary, students needing attention,
   * recent observations, and evidence-grounded retrieval prompts.
   */
  async getPreLessonBriefing(classId: string, subjectId: string, topic?: string): Promise<PreLessonBriefing> {
    if (isMockEnv()) {
      return {
        classId,
        subjectId,
        className: 'Class',
        subjectName: 'Subject',
        curriculumTopic: topic || 'Current Topic',
        recentClassEvidence: {
          totalSubmissions: 0,
          averageFormalScorePct: null,
          summaryText: 'Mock environment: no live briefing data.',
          hasInsufficientEvidence: true,
        },
        studentsNeedingAttention: [],
        recentClassObservations: [],
        suggestedRetrievalFocus: [],
      };
    }

    try {
      // 1. Resolve Class & Subject Names
      const [clsRes, subjRes] = await Promise.all([
        supabase.from('classes').select('name').eq('id', classId).maybeSingle(),
        supabase.from('subjects').select('name').eq('id', subjectId).maybeSingle(),
      ]);
      const className = clsRes.data?.name ?? 'Class';
      const subjectName = subjRes.data?.name ?? 'Subject';

      // 2. Previous Completed Lesson for this class & subject
      const { data: prevLesson } = await supabase
        .from('lessons')
        .select('completed_at, curriculum_topic, visible_lesson_note, lesson_status')
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('lesson_status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const previousLesson = prevLesson
        ? {
            date: String(prevLesson.completed_at).slice(0, 10),
            topic: prevLesson.curriculum_topic || 'Previous Topic',
            visibleLessonNote: prevLesson.visible_lesson_note,
            status: prevLesson.lesson_status,
          }
        : undefined;

      // 3. Active Interventions in this class + subject
      const { data: rawInterventions } = await supabase
        .from('interventions')
        .select(`
          id,
          student_id,
          reason,
          learning_area,
          students(id, admission_number, people(first_name, last_name))
        `)
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .in('status', ['active', 'draft']);

      const interventionsList = Array.isArray(rawInterventions) ? rawInterventions : [];

      // 4. Recent Class Observations in this subject (last 30 days)
      const { data: rawObs } = await supabase
        .from('teacher_observations')
        .select(`
          id,
          student_id,
          observation_type,
          observation_text,
          observed_at,
          students(people(first_name, last_name))
        `)
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .order('observed_at', { ascending: false })
        .limit(10);

      const obsList = Array.isArray(rawObs) ? rawObs : [];

      const recentClassObservations = obsList.map((o: any) => {
        const p = one(o.students?.people);
        const sName = p?.first_name ? `${p.first_name} ${p.last_name || ''}` : 'Student';
        return {
          id: o.id,
          studentName: sName,
          type: o.observation_type as ObservationType,
          text: o.observation_text,
          date: String(o.observed_at).slice(0, 10),
        };
      });

      // 5. Students Needing Attention (Active intervention OR recent misconception)
      const studentsNeedingAttentionMap = new Map<string, any>();

      for (const iv of interventionsList) {
        const p = one((iv as any).students?.people);
        const sName = p?.first_name ? `${p.first_name} ${p.last_name || ''}` : 'Student';
        studentsNeedingAttentionMap.set(iv.student_id, {
          studentId: iv.student_id,
          studentName: sName,
          reason: `Active intervention: ${iv.learning_area || 'Targeted Support'} (${iv.reason})`,
          activeInterventionId: iv.id,
          evidenceReferences: [
            {
              type: 'lesson' as InterventionEvidenceType,
              id: iv.id,
              titleOrSnippet: iv.reason,
              date: new Date().toISOString().slice(0, 10),
            },
          ],
        });
      }

      for (const o of obsList) {
        if (o.observation_type === 'misconception' || o.observation_type === 'support_need') {
          const p = one((o.students as any)?.people);
          const sName = p?.first_name ? `${p.first_name} ${p.last_name || ''}` : 'Student';
          if (!studentsNeedingAttentionMap.has(o.student_id)) {
            studentsNeedingAttentionMap.set(o.student_id, {
              studentId: o.student_id,
              studentName: sName,
              reason: `Recent misconception: "${o.observation_text.slice(0, 60)}"`,
              recentMisconceptionSnippet: o.observation_text,
              evidenceReferences: [
                {
                  type: 'observation' as InterventionEvidenceType,
                  id: o.id,
                  titleOrSnippet: o.observation_text,
                  date: String(o.observed_at).slice(0, 10),
                },
              ],
            });
          }
        }
      }

      const studentsNeedingAttention = Array.from(studentsNeedingAttentionMap.values());

      // 6. Recent Class Evidence Metrics
      const { data: rawAssignments } = await supabase
        .from('assignments')
        .select(`
          id,
          evidence_track,
          max_score,
          student_submissions(score, submission_status)
        `)
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .limit(5);

      let totalSubmissions = 0;
      let scoreSum = 0;
      let scoreCount = 0;

      if (Array.isArray(rawAssignments)) {
        for (const a of rawAssignments) {
          const subs = Array.isArray(a.student_submissions) ? a.student_submissions : [];
          totalSubmissions += subs.length;
          for (const sub of subs) {
            if (sub.score !== null && sub.score !== undefined) {
              scoreSum += Number(sub.score);
              scoreCount++;
            }
          }
        }
      }

      const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;
      const hasInsufficientEvidence = totalSubmissions < 3 && obsList.length < 2;

      const summaryText = hasInsufficientEvidence
        ? 'Insufficient recent academic submissions to establish class-wide trend.'
        : `${totalSubmissions} recent submissions reviewed across this subject with average mark of ${avgScore ?? '—'}%. ${studentsNeedingAttention.length} students currently flagged for targeted attention.`;

      // 7. Grounded Retrieval Focus Suggestions
      const suggestedRetrievalFocus: PreLessonBriefing['suggestedRetrievalFocus'] = [];

      // Extract real topics from recent misconceptions
      const recentMisconceptions = obsList.filter((o) => o.observation_type === 'misconception');
      if (recentMisconceptions.length > 0) {
        for (const m of recentMisconceptions.slice(0, 2)) {
          suggestedRetrievalFocus.push({
            topic: topic || previousLesson?.topic || subjectName,
            prompt: `Review quick diagnostic check: "${m.observation_text.slice(0, 80)}"`,
            evidenceBasis: `Grounded in observation from ${String(m.observed_at).slice(0, 10)}`,
          });
        }
      } else if (previousLesson?.topic) {
        suggestedRetrievalFocus.push({
          topic: previousLesson.topic,
          prompt: `Spend 5 minutes recalling key principles from "${previousLesson.topic}".`,
          evidenceBasis: `Grounded in previous lesson note: "${previousLesson.visibleLessonNote.slice(0, 60)}"`,
        });
      }

      return {
        classId,
        subjectId,
        className,
        subjectName,
        curriculumTopic: topic || previousLesson?.topic || subjectName,
        previousLesson,
        recentClassEvidence: {
          totalSubmissions,
          averageFormalScorePct: avgScore,
          summaryText,
          hasInsufficientEvidence,
        },
        studentsNeedingAttention,
        recentClassObservations,
        suggestedRetrievalFocus,
      };
    } catch (err) {
      console.warn('getPreLessonBriefing failed:', err);
      return {
        classId,
        subjectId,
        className: 'Class',
        subjectName: 'Subject',
        curriculumTopic: topic || 'Topic',
        recentClassEvidence: {
          totalSubmissions: 0,
          averageFormalScorePct: null,
          summaryText: 'Unable to load class briefing at this time.',
          hasInsufficientEvidence: true,
        },
        studentsNeedingAttention: [],
        recentClassObservations: [],
        suggestedRetrievalFocus: [],
      };
    }
  },

  /**
   * Creates a targeted teacher intervention.
   * Inserts canonical relational links into intervention_evidence.
   */
  async createIntervention(
    input: CreateInterventionInput,
    evidenceItems: Array<{ type: InterventionEvidenceType; id: string }> = [],
  ): Promise<{ interventionId: string }> {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;

    // AI or automated systems can ONLY create 'draft'. Teacher approval required for 'active'.
    const status = input.status ?? 'active';

    const { data, error } = await supabase
      .from('interventions')
      .insert({
        school_id: input.schoolId,
        student_id: input.studentId,
        teacher_id: input.teacherId,
        class_id: input.classId,
        stream_id: input.streamId ?? null,
        subject_id: input.subjectId,
        learning_area: input.learningArea,
        topic_name: input.topicName ?? null,
        curriculum_objective_ref: input.curriculumObjectiveRef ?? null,
        reason: input.reason,
        strategy_action: input.strategyAction,
        target_outcome: input.targetOutcome,
        start_date: input.startDate ?? new Date().toISOString().slice(0, 10),
        target_date: input.targetDate,
        status,
        created_by_user_id: userId ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create intervention: ${error?.message || 'Database error'}`);
    }

    const interventionId = data.id;

    // Insert canonical relational evidence records
    if (evidenceItems.length > 0) {
      const evidenceRows = evidenceItems.map((ev) => ({
        school_id: input.schoolId,
        intervention_id: interventionId,
        evidence_type: ev.type,
        evidence_id: ev.id,
      }));

      const { error: evErr } = await supabase.from('intervention_evidence').insert(evidenceRows);
      if (evErr) {
        console.warn('Failed to insert relational intervention_evidence:', evErr);
      }
    }

    return { interventionId };
  },

  /**
   * Updates intervention status. Enforces valid lifecycle:
   * draft -> active -> completed/abandoned.
   * DB trigger automatically records state change in intervention_audit_logs.
   */
  async updateInterventionStatus(
    interventionId: string,
    newStatus: InterventionStatus,
    reason?: string,
  ): Promise<void> {
    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (reason) {
      updatePayload.outcome_notes = reason;
    }

    const { error } = await supabase
      .from('interventions')
      .update(updatePayload)
      .eq('id', interventionId);

    if (error) {
      throw new Error(`Failed to update intervention status: ${error.message}`);
    }
  },

  /**
   * Resolves an intervention with outcome assessment.
   */
  async recordInterventionOutcome(
    interventionId: string,
    outcome: InterventionOutcome,
    outcomeNotes: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('interventions')
      .update({
        status: 'completed',
        outcome,
        outcome_notes: outcomeNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', interventionId);

    if (error) {
      throw new Error(`Failed to record intervention outcome: ${error.message}`);
    }
  },
};
