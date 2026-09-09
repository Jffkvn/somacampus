import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { resolveMyEmployeeId } from '../auth/identity';
import { assignmentService } from './assignmentService';
import {
  teachingAiService,
  type GroundedAssignmentDraft,
} from './teachingAiService';
import {
  resourceLibraryService,
  type AcademicResource,
} from './resourceLibraryService';
import type { EvidenceTrack, SubmissionType } from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import {
  Sparkles,
  BookOpen,
  Layers,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
} from 'lucide-react';

export const AssignmentCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { schoolId, fullName } = useAuth();

  // Teaching context is derived from the linking timetable/lesson context
  // (LessonCockpit links here with ?lessonId=&classId=&streamId=&subjectId=&topic=).
  // No silent demo prefill: a missing class/subject blocks writes with an
  // explicit notice instead of falling back to demo UUIDs.
  const prefillLessonId = searchParams.get('lessonId') || undefined;
  const prefillClassId = searchParams.get('classId') || '';
  const prefillStreamId = searchParams.get('streamId') || '';
  const prefillSubjectId = searchParams.get('subjectId') || '';
  const prefillTopic = searchParams.get('topic') || '';
  const hasTeachingContext = Boolean(prefillClassId && prefillSubjectId);

  // Authenticated teacher identity — resolved per school, never a demo constant.
  // Writes stay disabled until the employee id resolves (fail closed).
  const [myTeacherId, setMyTeacherId] = useState<string | null>(null);
  const [isResolvingIdentity, setIsResolvingIdentity] = useState(false);
  useEffect(() => {
    if (!schoolId) {
      setMyTeacherId(null);
      return;
    }
    let cancelled = false;
    setIsResolvingIdentity(true);
    resolveMyEmployeeId(schoolId)
      .then((id) => {
        if (!cancelled) setMyTeacherId(id);
      })
      .catch(() => {
        if (!cancelled) setMyTeacherId(null);
      })
      .finally(() => {
        if (!cancelled) setIsResolvingIdentity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  // Display names: explicit context params first, then a best-effort
  // RLS-scoped lookup by id, then honest generic labels (never demo names).
  const [classDisplayName, setClassDisplayName] = useState(searchParams.get('className') || '');
  const [subjectDisplayName, setSubjectDisplayName] = useState(searchParams.get('subjectName') || '');
  const streamDisplayName = searchParams.get('streamName') || '';
  useEffect(() => {
    let cancelled = false;
    if (prefillClassId && !classDisplayName) {
      Promise.resolve(
        supabase.from('classes').select('name').eq('id', prefillClassId).maybeSingle()
      )
        .then(({ data }) => {
          if (!cancelled && (data as any)?.name) setClassDisplayName((data as any).name);
        })
        .catch(() => {});
    }
    if (prefillSubjectId && !subjectDisplayName) {
      Promise.resolve(
        supabase.from('subjects').select('name').eq('id', prefillSubjectId).maybeSingle()
      )
        .then(({ data }) => {
          if (!cancelled && (data as any)?.name) setSubjectDisplayName((data as any).name);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [prefillClassId, prefillSubjectId]);

  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [title, setTitle] = useState(prefillTopic ? `${prefillTopic} Practice` : '');
  const [instructions, setInstructions] = useState('');
  const [evidenceTrack, setEvidenceTrack] = useState<EvidenceTrack>('diagnostic_evidence');
  const [submissionType, setSubmissionType] = useState<SubmissionType>('homework');
  const [maxScore, setMaxScore] = useState<number | ''>(50);
  const [assignedDate, setAssignedDate] = useState(today);
  const [dueDate, setDueDate] = useState(nextWeek);

  // AI Grounding Assist State (Track A Core Loop)
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [selectedObjectiveCode, setSelectedObjectiveCode] = useState('5Nn.01');
  const [customEvidenceNotes, setCustomEvidenceNotes] = useState(
    'Covered mixed numbers conversion. 4 students struggled with simplifying improper fractions.'
  );
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [groundedDraft, setGroundedDraft] = useState<GroundedAssignmentDraft | null>(null);
  const [isAiApproved, setIsAiApproved] = useState(false);

  // Layer 4 Resource Library Search-Before-Generate State
  const [matchingResources, setMatchingResources] = useState<AcademicResource[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Query live school resources when objective changes in modal
  useEffect(() => {
    if (!isAiModalOpen || !schoolId) return;
    let isCancelled = false;
    setIsLoadingResources(true);
    setResourceError(null);
    resourceLibraryService
      .findMatchingResources(schoolId, selectedObjectiveCode)
      .then((res) => {
        if (!isCancelled) setMatchingResources(res);
      })
      .catch((err) => {
        // Fail closed: surface the error, never inject unscoped fallback rows.
        if (!isCancelled) {
          setMatchingResources([]);
          setResourceError(err.message ?? 'Failed to search school resource library.');
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingResources(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [isAiModalOpen, selectedObjectiveCode, schoolId]);

  // Available Cambridge objectives for Stage 5 Mathematics
  const availableObjectives = useMemo(() => {
    return teachingAiService.getAvailableCambridgeObjectives('mathematics', 5);
  }, []);

  const handleUseExistingResource = (res: AcademicResource) => {
    setTitle(res.title);
    setInstructions(`### Vetted Resource: ${res.title}\n\n${res.previewText}\n\n### Required Work:\nComplete all questions with step-by-step mathematical reasoning.`);
    setSubmissionType(res.type === 'worksheet' ? 'worksheet' : 'homework');
    setGroundedDraft(null); // Pure school resource, not an unapproved AI draft
    setIsAiModalOpen(false);
  };

  const handleGenerateAiDraft = async (adaptedResource?: AcademicResource) => {
    try {
      setIsGeneratingAi(true);
      setErrorMessage(null);
      if (!schoolId || !myTeacherId) {
        throw new Error('Sign in / resolve identity to generate drafts for your school.');
      }
      if (!hasTeachingContext) {
        throw new Error('Select a class and subject to continue — open Create Assignment from your timetable or lesson context.');
      }

      const draft = await teachingAiService.generateAssignmentDraft({
        objectiveCode: selectedObjectiveCode,
        subjectName: subjectDisplayName || 'Selected subject',
        stageNumber: 5,
        adaptedResource,
        lessonContext: {
          schoolId,
          teacherId: myTeacherId,
          classId: prefillClassId,
          className: classDisplayName || 'Selected class',
          streamId: prefillStreamId || undefined,
          streamName: streamDisplayName || undefined,
          subjectId: prefillSubjectId,
          subjectName: subjectDisplayName || 'Selected subject',
          teacherName: fullName || 'Teacher',
          lessonId: prefillLessonId,
          topic: prefillTopic || undefined,
        },
        evidenceContext: {
          strugglingConcept: customEvidenceNotes,
          strugglingStudentCount: 4,
          observations: [customEvidenceNotes],
        },
        preferredSubmissionType: submissionType,
        preferredEvidenceTrack: evidenceTrack,
      });

      setGroundedDraft(draft);
      setTitle(draft.title);
      setInstructions(draft.instructions);
      setSubmissionType(draft.submissionType);
      setEvidenceTrack(draft.evidenceTrack);
      setMaxScore(draft.maxScore);
      setIsAiApproved(false);
      setIsAiModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Failed to generate AI assignment draft.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Please enter an assignment title');
      return;
    }
    if (!instructions.trim()) {
      setErrorMessage('Please enter instructions for the students');
      return;
    }
    if (evidenceTrack === 'formal_graded' && (!maxScore || Number(maxScore) <= 0)) {
      setErrorMessage('Formal graded assignments must have a maximum score greater than 0');
      return;
    }
    if (groundedDraft && !isAiApproved) {
      setErrorMessage('You must review and check the approval confirmation before publishing an AI-drafted assignment.');
      return;
    }
    if (!schoolId) {
      setErrorMessage('Sign in to publish assignments for your school.');
      return;
    }
    if (!myTeacherId) {
      setErrorMessage('Sign in / resolve identity to publish assignments. Your teacher identity could not be resolved for this school.');
      return;
    }
    if (!hasTeachingContext) {
      setErrorMessage('Select a class and subject to continue — class and subject context is required, no demo class is assumed.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const created = await assignmentService.createAssignment({
        schoolId,
        teacherId: myTeacherId,
        classId: prefillClassId,
        streamId: prefillStreamId || undefined,
        subjectId: prefillSubjectId,
        lessonId: prefillLessonId,
        title: title.trim(),
        instructions: instructions.trim(),
        assignedDate,
        dueDate,
        submissionType,
        evidenceTrack,
        maxScore: evidenceTrack === 'formal_graded' ? Number(maxScore) : null,
        isAiDrafted: groundedDraft ? true : false,
        requiresHumanApproval: groundedDraft ? true : false,
        approvalState: isAiApproved ? 'approved' : 'unreviewed',
        aiDraftApprovedBy: isAiApproved ? myTeacherId : undefined,
        aiDraftApprovedAt: isAiApproved ? new Date().toISOString() : undefined,
        curriculumObjectiveCode: groundedDraft?.grounding?.curriculumObjective?.code || selectedObjectiveCode,
        curriculumObjectiveTitle: groundedDraft?.grounding?.curriculumObjective?.title,
        resourceIdUsed: groundedDraft?.resourceIdUsed,
      });

      navigate(`/teaching/assignments/${created.id}`);
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Failed to create assignment');
      setIsSubmitting(false);
    }
  };

  // Fail-closed tenant gate: never fall back to a demo school when unauthenticated.
  if (!schoolId) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto px-4 py-6">
        <Card>
          <CardContent>
            <p className="text-sm font-bold text-slate-800">Sign in to create assignments for your school</p>
            <p className="text-xs text-slate-500 mt-1">
              Assignments are scoped to your school. Please sign in to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/teaching/assignments" className="hover:text-slate-800">
          Assignments
        </Link>
        <span>&bull;</span>
        <span className="text-slate-800 font-medium">New Assignment</span>
      </div>

      {/* Fail-closed identity gate: writes disabled until the teacher id resolves. */}
      {isResolvingIdentity && (
        <div className="p-3 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg">
          Resolving your teacher identity for this school...
        </div>
      )}
      {!isResolvingIdentity && !myTeacherId && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          <span className="font-bold">Sign in / resolve identity to publish assignments.</span>{' '}
          Your teacher identity could not be resolved for this school, so publishing and AI
          drafts are disabled. No demo teacher is assumed.
        </div>
      )}
      {!hasTeachingContext && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
          <span className="font-bold">Select a class and subject to continue.</span>{' '}
          Open Create Assignment from your timetable or lesson context (class and subject are
          required — no demo class is assumed).
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-slate-900">
                Create Assignment / Homework
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Establish expected student work linked directly to your class curriculum context.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsAiModalOpen(true)}
              className="flex items-center gap-1.5 border-teal-600 text-teal-800 bg-teal-50 hover:bg-teal-100 font-medium"
            >
              <Sparkles className="w-4 h-4 text-teal-600" />
              AI Cambridge Assist
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Grounding Audit Banner (Shown when AI draft is populated) */}
          {groundedDraft && (
            <div className="mb-6 p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>AI Generated Draft — Human Review Required</span>
              </div>
              <p className="text-xs text-amber-800">
                This draft was assembled by the 5-layer teaching engine. Grounding layers active:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="p-2 bg-white/90 rounded border border-amber-200/60 flex items-start gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">Cambridge Goal:</span>
                    <p className="text-slate-600">{groundedDraft.grounding.curriculumObjective.code}</p>
                  </div>
                </div>

                <div className="p-2 bg-white/90 rounded border border-amber-200/60 flex items-start gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">Library Material:</span>
                    <p className="text-slate-600 truncate">{groundedDraft.grounding.matchedResources[0]?.title || 'Standard pack'}</p>
                  </div>
                </div>

                <div className="p-2 bg-white/90 rounded border border-amber-200/60 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">Class Evidence:</span>
                    <p className="text-slate-600">4 struggling learners scaffolded</p>
                  </div>
                </div>
              </div>

              {/* Explicit Human-in-the-loop Acceptance Checkbox */}
              <label className="flex items-center gap-2 pt-2 border-t border-amber-200 cursor-pointer select-none text-xs font-medium text-amber-950">
                <input
                  type="checkbox"
                  checked={isAiApproved}
                  onChange={(e) => setIsAiApproved(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-700 focus:ring-teal-600 border-amber-300"
                />
                <span>I have reviewed, adapted, and approved this AI-generated assignment content for my students.</span>
              </label>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {errorMessage}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assignment Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fractions Intro Practice Worksheet"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            {/* Evidence Track Selection (Critical Product Rule) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Academic Evidence Track
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEvidenceTrack('diagnostic_evidence')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    evidenceTrack === 'diagnostic_evidence'
                      ? 'border-teal-600 bg-teal-50/50 ring-1 ring-teal-600'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold text-teal-900">Diagnostic Learning Evidence</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Homework, worksheets, practice, and formative tasks. Informs profile without distorting formal grades.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setEvidenceTrack('formal_graded')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    evidenceTrack === 'formal_graded'
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold text-indigo-900">Formal Graded Assessment</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Formally scored unit tests or coursework. Contributes authoritative marks to academic standing.
                  </p>
                </button>
              </div>
            </div>

            {/* Max Score (Conditional on Formal Graded) */}
            {evidenceTrack === 'formal_graded' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Maximum Score Points
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value ? Number(e.target.value) : '')}
                  required
                  className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            )}

            {/* Submission Type & Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Activity Type
                </label>
                <select
                  value={submissionType}
                  onChange={(e) => setSubmissionType(e.target.value as SubmissionType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="homework">Homework</option>
                  <option value="classwork">Classwork</option>
                  <option value="worksheet">Worksheet</option>
                  <option value="quiz">Diagnostic Quiz</option>
                  <option value="project">Project</option>
                  <option value="practical">Practical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Date
                </label>
                <input
                  type="date"
                  value={assignedDate}
                  onChange={(e) => setAssignedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            {/* Instructions */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Instructions / Questions & Scaffolding
                </label>
                {groundedDraft && (
                  <span className="text-[11px] text-teal-700 font-medium">
                    Grounded with 4 Rubric Criteria
                  </span>
                )}
              </div>
              <textarea
                rows={8}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Detail the pages, exercises, or tasks expected from each student..."
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-600 resize-y"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Link to="/teaching/assignments">
                <Button type="button" variant="ghost" size="md">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting || isResolvingIdentity || !myTeacherId || !hasTeachingContext || (Boolean(groundedDraft) && !isAiApproved)}
                className={`text-white ${
                  groundedDraft && !isAiApproved
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {isSubmitting ? 'Publishing...' : 'Publish Assignment'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* AI Grounding Modal Drawer */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-gradient-to-r from-teal-800 to-teal-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-300" />
                <h3 className="text-base font-bold">Cambridge AI Teaching Loop Assist</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                className="text-teal-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="font-semibold text-slate-800">Active Classroom Context (Layer 2)</p>
                <p className="text-slate-600 mt-0.5">
                  Class: <span className="font-medium text-slate-900">{classDisplayName || 'Selected class'}{streamDisplayName ? ` ${streamDisplayName}` : ''}</span> &bull; Subject: <span className="font-medium text-slate-900">{subjectDisplayName || 'Selected subject'}</span> &bull; Teacher: <span className="font-medium text-slate-900">{fullName || 'Teacher'}</span>
                </p>
              </div>

              {/* Layer 1 Objective Picker */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  1. Cambridge Primary Standard (Layer 1)
                </label>
                <select
                  value={selectedObjectiveCode}
                  onChange={(e) => setSelectedObjectiveCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {availableObjectives.map((obj) => (
                    <option key={obj.code} value={obj.code}>
                      {obj.code} — {obj.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Resolved directly from the verified Cambridge Primary Pilot Pack.
                </p>
              </div>

              {/* Layer 3 Evidence Notes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  2. Class Evidence & Misconceptions to Scaffold (Layer 3)
                </label>
                <textarea
                  rows={2}
                  value={customEvidenceNotes}
                  onChange={(e) => setCustomEvidenceNotes(e.target.value)}
                  placeholder="e.g. 4 students struggled with converting mixed numbers into improper fractions..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  The engine will embed hints and tape diagram scaffolding for these specific learners.
                </p>
              </div>

              {/* Layer 4 Search-Before-Generate: Live School Resources */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700">
                    3. School Resource Library (Layer 4 — Search-Before-Generate)
                  </label>
                  {matchingResources.length > 0 && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {matchingResources.length} Matched Materials
                    </span>
                  )}
                </div>

                {isLoadingResources ? (
                  <p className="text-[11px] text-slate-400 italic p-2.5 bg-slate-50 rounded border border-slate-200">
                    Searching library for approved {selectedObjectiveCode} materials...
                  </p>
                ) : resourceError ? (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[11px] font-semibold">
                    {resourceError}
                  </div>
                ) : matchingResources.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {matchingResources.map((res) => (
                      <div
                        key={res.id}
                        className="p-2.5 bg-white rounded-lg border border-teal-200/80 shadow-sm space-y-1.5 hover:border-teal-400 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate">{res.title}</p>
                            <p className="text-[10px] text-slate-500 truncate">{res.curriculumObjective}</p>
                          </div>
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                            {res.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/70 p-1.5 rounded">
                          {res.previewText}
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleUseExistingResource(res)}
                            className="text-[10px] h-6 px-2 text-slate-700 border-slate-300 hover:bg-slate-50"
                          >
                            Use As-Is
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isGeneratingAi || isResolvingIdentity || !myTeacherId || !hasTeachingContext}
                            onClick={() => handleGenerateAiDraft(res)}
                            className="text-[10px] h-6 px-2 border-teal-600 text-teal-800 bg-teal-50 hover:bg-teal-100 flex items-center gap-1 font-semibold"
                          >
                            <Sparkles className="w-3 h-3 text-teal-600" />
                            Adapt with AI
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 bg-teal-50/60 border border-teal-200/80 rounded-lg flex items-center gap-2 text-teal-900">
                    <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                    <span className="text-[11px]">
                      No custom worksheets found for <strong>{selectedObjectiveCode}</strong>. The engine will synthesize a fresh assignment grounded directly in the Cambridge standard.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">
                {matchingResources.length > 0 ? 'Or generate a new draft:' : 'All 5 layers ready'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAiModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isGeneratingAi || isResolvingIdentity || !myTeacherId || !hasTeachingContext}
                  onClick={() => handleGenerateAiDraft()}
                  className="bg-teal-700 hover:bg-teal-800 text-white flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGeneratingAi ? 'Synthesizing 5 Layers...' : 'Generate Grounded Draft'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
