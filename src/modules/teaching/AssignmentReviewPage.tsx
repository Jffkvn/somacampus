import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import { resolveMyEmployeeId } from '../auth/identity';
import { assignmentService } from './assignmentService';
import { observationService } from './observationService';
import {
  teachingAiService,
  type GroundedObservationDraft,
  type GroundedInterventionDraft,
} from './teachingAiService';
import { learningIntelligenceService } from '../intelligence/learningIntelligenceService';
import type {
  Assignment,
  StudentSubmission,
  ParticipationStatus,
  SubmissionStatus,
  ObservationType,
  WorkType,
} from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  X,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';

export const AssignmentReviewPage: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { schoolId } = useAuth();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick observation state
  const [activeObsStudent, setActiveObsStudent] = useState<StudentSubmission | null>(null);
  const [obsType, setObsType] = useState<ObservationType>('learning_progress');
  const [obsText, setObsText] = useState('');
  const [isSavingObs, setIsSavingObs] = useState(false);
  const [obsSuccessMsg, setObsSuccessMsg] = useState<string | null>(null);

  // AI Evidence Extraction & Next-Step Intervention state
  const [aiExtractSubmission, setAiExtractSubmission] = useState<StudentSubmission | null>(null);
  const [isExtractingAi, setIsExtractingAi] = useState(false);
  const [extractedObsDraft, setExtractedObsDraft] = useState<GroundedObservationDraft | null>(null);
  const [aiDraftObsType, setAiDraftObsType] = useState<ObservationType>('misconception');
  const [aiDraftObsText, setAiDraftObsText] = useState('');
  const [aiDraftFollowup, setAiDraftFollowup] = useState('');
  const [isApprovingObs, setIsApprovingObs] = useState(false);
  const [obsApprovedSuccess, setObsApprovedSuccess] = useState(false);

  // Intervention suggestion state
  const [isSuggestingIntervention, setIsSuggestingIntervention] = useState(false);
  const [interventionDraft, setInterventionDraft] = useState<GroundedInterventionDraft | null>(null);
  const [isAcceptingIntervention, setIsAcceptingIntervention] = useState(false);
  const [interventionSuccessMsg, setInterventionSuccessMsg] = useState<string | null>(null);

  // Authenticated teacher identity — resolved per school, never a demo constant.
  // Review, observation and intervention writes stay disabled until it resolves.
  const [myTeacherId, setMyTeacherId] = useState<string | null>(null);
  const [isResolvingIdentity, setIsResolvingIdentity] = useState(false);

  const loadData = async () => {
    if (!assignmentId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await assignmentService.getAssignmentDetail(assignmentId);
      if (!res) {
        setError('Assignment not found');
      } else {
        setAssignment(res.assignment);
        setSubmissions(res.submissions);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load assignment detail');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [assignmentId]);

  useEffect(() => {
    const scopeSchoolId = assignment?.schoolId ?? schoolId;
    if (!scopeSchoolId) {
      setMyTeacherId(null);
      return;
    }
    let cancelled = false;
    setIsResolvingIdentity(true);
    resolveMyEmployeeId(scopeSchoolId)
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
  }, [assignment?.schoolId, schoolId]);

  const writesBlocked = isResolvingIdentity || !myTeacherId;

  const handleUpdateParticipation = async (subId: string, partStatus: ParticipationStatus) => {
    if (!myTeacherId) return;
    try {
      const updated = await assignmentService.updateSubmission(subId, { participationStatus: partStatus });
      setSubmissions((prev) => prev.map((s) => (s.id === subId ? updated : s)));
    } catch (err: any) {
      alert(err.message ?? 'Failed to update participation');
    }
  };

  const handleUpdateSubmissionStatus = async (subId: string, subStatus: SubmissionStatus) => {
    if (!myTeacherId) return;
    try {
      const updated = await assignmentService.updateSubmission(subId, { submissionStatus: subStatus });
      setSubmissions((prev) => prev.map((s) => (s.id === subId ? updated : s)));
    } catch (err: any) {
      alert(err.message ?? 'Failed to update submission status');
    }
  };

  const handleSaveReview = async (sub: StudentSubmission) => {
    if (!myTeacherId) return;
    try {
      const updated = await assignmentService.reviewSubmission(sub.id, {
        reviewStatus: 'reviewed',
        feedback: sub.teacherFeedback ?? undefined,
        score: sub.score,
        teacherId: myTeacherId,
      });
      setSubmissions((prev) => prev.map((s) => (s.id === sub.id ? updated : s)));
    } catch (err: any) {
      alert(err.message ?? 'Failed to save review');
    }
  };

  const handleCreateObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeObsStudent || !assignment || !obsText.trim()) return;
    if (!myTeacherId) return;

    try {
      setIsSavingObs(true);
      await observationService.createObservation({
        schoolId: assignment.schoolId,
        studentId: activeObsStudent.studentId,
        teacherId: myTeacherId,
        classId: assignment.classId,
        streamId: assignment.streamId,
        subjectId: assignment.subjectId,
        assignmentId: assignment.id,
        observationType: obsType,
        observationText: obsText.trim(),
      });
      setIsSavingObs(false);
      setObsSuccessMsg(`Observation saved for ${activeObsStudent.studentName}!`);
      setTimeout(() => {
        setObsSuccessMsg(null);
        setActiveObsStudent(null);
        setObsText('');
      }, 1500);
    } catch (err: any) {
      setIsSavingObs(false);
      alert(err.message ?? 'Failed to record observation');
    }
  };

  const handleOpenAiExtract = async (sub: StudentSubmission) => {
    if (!assignment || !myTeacherId) return;
    setAiExtractSubmission(sub);
    setIsExtractingAi(true);
    setObsApprovedSuccess(false);
    setInterventionDraft(null);
    setInterventionSuccessMsg(null);

    try {
      const draft = await teachingAiService.extractObservationDraftFromWork({
        assignmentTitle: assignment.title,
        objectiveCode: assignment.curriculumObjectiveCode || '5Nn.01',
        objectiveDescription: assignment.curriculumObjectiveTitle || 'Cambridge Primary standard',
        workType: sub.workType || 'notebook',
        workSummary:
          sub.workSummary ||
          (sub.teacherFeedback ? `Work notes: ${sub.teacherFeedback}` : 'Student completed workbook exercises with step-by-step working.'),
        // Phase A2 tenant grounding: edge requires + validates each ID against caller's school.
        schoolId: assignment.schoolId,
        teacherId: myTeacherId,
        classId: assignment.classId ?? null,
        streamId: assignment.streamId ?? null,
        subjectId: assignment.subjectId,
        studentId: sub.studentId,
        resourceIds: assignment.resourceIdUsed ? [assignment.resourceIdUsed] : [],
      });

      setExtractedObsDraft(draft);
      setAiDraftObsType(draft.observationType);
      setAiDraftObsText(draft.observationText);
      setAiDraftFollowup(draft.suggestedFollowupFocus || '');
    } catch (err: any) {
      alert(err?.message ?? 'Failed to extract observation draft');
    } finally {
      setIsExtractingAi(false);
    }
  };

  const handleApproveObservation = async () => {
    if (!aiExtractSubmission || !assignment || !aiDraftObsText.trim()) return;
    if (!myTeacherId) return;

    try {
      setIsApprovingObs(true);
      await observationService.createObservation({
        schoolId: assignment.schoolId,
        studentId: aiExtractSubmission.studentId,
        teacherId: myTeacherId,
        classId: assignment.classId,
        streamId: assignment.streamId,
        subjectId: assignment.subjectId,
        assignmentId: assignment.id,
        observationType: aiDraftObsType,
        observationText: aiDraftObsText.trim(),
      });

      setObsApprovedSuccess(true);
    } catch (err: any) {
      alert(err?.message ?? 'Failed to record approved observation');
    } finally {
      setIsApprovingObs(false);
    }
  };

  const handleRequestInterventionSuggestion = async () => {
    if (!aiExtractSubmission || !assignment || !myTeacherId) return;
    try {
      setIsSuggestingIntervention(true);
      const draft = await teachingAiService.suggestInterventionFromEvidence({
        studentId: aiExtractSubmission.studentId,
        curriculumObjective: assignment.curriculumObjectiveCode || '5Nn.01',
        approvedObservationSnippets: [aiDraftObsText],
        // Phase A2 tenant grounding: edge requires + validates each ID against caller's school.
        schoolId: assignment.schoolId,
        teacherId: myTeacherId,
        classId: assignment.classId ?? null,
        streamId: assignment.streamId ?? null,
        subjectId: assignment.subjectId,
        resourceIds: assignment.resourceIdUsed ? [assignment.resourceIdUsed] : [],
      });
      setInterventionDraft(draft);
    } catch (err: any) {
      alert(err?.message ?? 'Failed to suggest intervention');
    } finally {
      setIsSuggestingIntervention(false);
    }
  };

  const handleAcceptIntervention = async () => {
    if (!aiExtractSubmission || !assignment || !interventionDraft || !myTeacherId) return;
    try {
      setIsAcceptingIntervention(true);
      const targetDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await learningIntelligenceService.createIntervention(
        {
          schoolId: assignment.schoolId,
          studentId: aiExtractSubmission.studentId,
          teacherId: myTeacherId,
          classId: assignment.classId!,
          streamId: assignment.streamId,
          subjectId: assignment.subjectId!,
          learningArea: interventionDraft.learningArea,
          topicName: interventionDraft.topicName,
          reason: interventionDraft.reason,
          strategyAction: interventionDraft.strategyAction,
          targetOutcome: interventionDraft.targetOutcome,
          targetDate,
          status: 'active', // Explicit teacher approval gate
        },
        [{ type: 'submission', id: aiExtractSubmission.id }]
      );
      setInterventionSuccessMsg('Intervention accepted & active! Grounded evidence will appear in your next Lesson Cockpit briefing.');
    } catch (err: any) {
      alert(err?.message ?? 'Failed to accept intervention');
    } finally {
      setIsAcceptingIntervention(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading assignment review..." />;
  }

  if (error || !assignment) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-4">
          {error ?? 'Assignment not found'}
        </div>
        <Link to="/teaching/assignments" className="text-teal-700 text-sm font-medium hover:underline">
          &larr; Back to Assignments
        </Link>
      </div>
    );
  }

  const isFormal = assignment.evidenceTrack === 'formal_graded';

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/teaching/assignments" className="hover:text-slate-800">
          Assignments
        </Link>
        <span>&bull;</span>
        <span className="text-slate-800 font-medium">{assignment.title}</span>
      </div>

      {/* Fail-closed identity gate: writes disabled until the teacher id resolves. */}
      {isResolvingIdentity && (
        <div className="p-3 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg">
          Resolving your teacher identity for this school...
        </div>
      )}
      {!isResolvingIdentity && !myTeacherId && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          <span className="font-bold">Sign in / resolve identity to review work.</span>{' '}
          Your teacher identity could not be resolved for this school, so reviews, observations
          and interventions are disabled. No demo teacher is assumed.
        </div>
      )}

      {/* Header Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  isFormal ? 'bg-indigo-100 text-indigo-800' : 'bg-teal-100 text-teal-800'
                }`}
              >
                {isFormal ? 'Formal Graded Assessment' : 'Diagnostic Learning Evidence'}
              </span>
              <span className="text-xs text-slate-400 font-medium uppercase">
                {assignment.submissionType}
              </span>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {assignment.title}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Class: <span className="font-semibold text-slate-700">{assignment.className} {assignment.streamName ? `• ${assignment.streamName}` : ''}</span> &bull;{' '}
              Subject: <span className="font-semibold text-slate-700">{assignment.subjectName ?? 'General'}</span> &bull;{' '}
              Due Date: <span className="font-semibold text-slate-700">{assignment.dueDate}</span>
              {isFormal && assignment.maxScore && (
                <span className="ml-2 font-semibold text-indigo-700">
                  (Max: {assignment.maxScore} pts)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/teaching/assignments">
              <Button variant="outline" size="sm">
                &larr; All Assignments
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700 border border-slate-200">
            <span className="font-bold text-slate-900">Instructions: </span>
            {assignment.instructions}
          </div>

          {/* Metrics summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-center">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs text-slate-500 font-medium">Expected</p>
              <p className="text-lg font-bold text-slate-800">{assignment.expectedCount ?? 0}</p>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
              <p className="text-xs text-emerald-700 font-medium">Submitted</p>
              <p className="text-lg font-bold text-emerald-800">{assignment.submittedCount ?? 0}</p>
            </div>
            <div className="p-2.5 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 font-medium">Missing</p>
              <p className="text-lg font-bold text-red-800">{assignment.missingCount ?? 0}</p>
            </div>
            <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-700 font-medium">Excused / Exempt</p>
              <p className="text-lg font-bold text-amber-800">{assignment.excusedCount ?? 0}</p>
            </div>
            <div className="p-2.5 bg-teal-50 rounded-lg border border-teal-100">
              <p className="text-xs text-teal-700 font-medium">Reviewed</p>
              <p className="text-lg font-bold text-teal-800">{assignment.reviewedCount ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roster Review Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">
            Class Submissions Roster ({submissions.length} Students)
          </CardTitle>
          <p className="text-xs text-slate-500">
            Review student work, mark submission state, record teacher feedback and authoritative scores.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-y border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-3">Participation</th>
                  <th className="py-3 px-3">Submission Status</th>
                  <th className="py-3 px-3">Work Reference</th>
                  {isFormal && <th className="py-3 px-3">Score</th>}
                  <th className="py-3 px-3">Teacher Feedback</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((sub) => {
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Student Info */}
                      <td className="py-3 px-4">
                        <Link
                          to={`/students/${sub.studentId}`}
                          className="font-semibold text-slate-900 hover:text-teal-700 underline-offset-2 hover:underline"
                        >
                          {sub.studentName ?? 'Student'}
                        </Link>
                        <p className="text-[10px] text-slate-400 mt-0.5">{sub.admissionNumber}</p>
                      </td>

                      {/* Participation Status */}
                      <td className="py-3 px-3">
                        <select
                          value={sub.participationStatus}
                          disabled={writesBlocked}
                          onChange={(e) =>
                            handleUpdateParticipation(sub.id, e.target.value as ParticipationStatus)
                          }
                          className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                        >
                          <option value="expected">Expected</option>
                          <option value="excused">Excused</option>
                          <option value="not_required">Not Required</option>
                        </select>
                      </td>

                      {/* Submission Status */}
                      <td className="py-3 px-3">
                        <select
                          value={sub.submissionStatus}
                          disabled={writesBlocked}
                          onChange={(e) =>
                            handleUpdateSubmissionStatus(sub.id, e.target.value as SubmissionStatus)
                          }
                          className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
                        >
                          <option value="pending">Pending</option>
                          <option value="submitted">Submitted</option>
                          <option value="late">Late</option>
                          <option value="missing">Missing</option>
                        </select>
                      </td>

                      {/* Work Reference */}
                      <td className="py-3 px-3 max-w-xs space-y-1">
                        <select
                          value={sub.workType || 'notebook'}
                          onChange={(e) => {
                            const val = e.target.value as WorkType;
                            setSubmissions((prev) =>
                              prev.map((s) => (s.id === sub.id ? { ...s, workType: val } : s))
                            );
                          }}
                          className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-600"
                        >
                          <option value="notebook">Physical Notebook</option>
                          <option value="written">Written Sheet</option>
                          <option value="photo_reference">Photo Reference</option>
                          <option value="file_reference">File / Document</option>
                        </select>
                        <input
                          type="text"
                          value={sub.workSummary ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSubmissions((prev) =>
                              prev.map((s) => (s.id === sub.id ? { ...s, workSummary: val } : s))
                            );
                          }}
                          placeholder="e.g. Workbook Page 42, fraction diagrams"
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                        />
                      </td>

                      {/* Score (Formal Graded Only) */}
                      {isFormal && (
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max={assignment.maxScore ?? 100}
                              value={sub.score ?? ''}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : null;
                                setSubmissions((prev) =>
                                  prev.map((s) => (s.id === sub.id ? { ...s, score: val } : s))
                                );
                              }}
                              className="w-14 px-2 py-1 border border-slate-200 rounded text-xs text-center font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            />
                            <span className="text-slate-400 text-[10px]">
                              /{assignment.maxScore ?? 100}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Teacher Feedback */}
                      <td className="py-3 px-3 max-w-xs">
                        <input
                          type="text"
                          value={sub.teacherFeedback ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSubmissions((prev) =>
                              prev.map((s) => (s.id === sub.id ? { ...s, teacherFeedback: val } : s))
                            );
                          }}
                          placeholder="Feedback comment..."
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSaveReview(sub)}
                            disabled={writesBlocked}
                            className="text-[11px] h-7 px-2"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveObsStudent(sub);
                              setObsText('');
                            }}
                            disabled={writesBlocked}
                            className="text-[11px] h-7 px-2 text-slate-700 hover:bg-slate-100"
                          >
                            + Obs
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenAiExtract(sub)}
                            disabled={writesBlocked}
                            className="text-[11px] h-7 px-2 border-teal-600 text-teal-800 bg-teal-50 hover:bg-teal-100 flex items-center gap-1 font-semibold"
                          >
                            <Sparkles className="w-3 h-3 text-teal-600 shrink-0" />
                            AI Evidence
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Manual Quick Observation Modal Drawer */}
      {activeObsStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 animate-in fade-in zoom-in-95">
            <div>
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                Capture Classroom Evidence
              </p>
              <h3 className="text-lg font-bold text-slate-900">
                Teacher Observation: {activeObsStudent.studentName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record qualitative diagnostic evidence directly into the student&apos;s academic record.
              </p>
            </div>

            {obsSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">
                {obsSuccessMsg}
              </div>
            )}

            <form onSubmit={handleCreateObservation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observation Category
                </label>
                <select
                  value={obsType}
                  onChange={(e) => setObsType(e.target.value as ObservationType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="learning_progress">Learning Progress / General</option>
                  <option value="misconception">Misconception / Obstacle</option>
                  <option value="strength">Notable Strength / Insight</option>
                  <option value="support_need">Support Need / Intervention</option>
                  <option value="participation">Classroom Participation</option>
                  <option value="behaviour">Learning Behaviour</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observation Text
                </label>
                <textarea
                  rows={3}
                  value={obsText}
                  onChange={(e) => setObsText(e.target.value)}
                  placeholder="e.g. Demonstrated strong spatial reasoning when resolving fraction pieces..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveObsStudent(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSavingObs || writesBlocked}
                  className="bg-teal-700 hover:bg-teal-800 text-white"
                >
                  {isSavingObs ? 'Saving...' : 'Save Observation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Evidence Extraction & Next-Step Intervention Modal */}
      {aiExtractSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-teal-800 to-teal-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-300 shrink-0" />
                <div>
                  <h3 className="text-base font-bold">AI Evidence Extraction & Next Steps</h3>
                  <p className="text-[11px] text-teal-200">
                    Student: {aiExtractSubmission.studentName} ({aiExtractSubmission.admissionNumber})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAiExtractSubmission(null)}
                className="text-teal-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              {/* Mandatory Inviolable Governance Banner */}
              <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
                <span className="text-[11px] font-semibold text-purple-900">
                  Strictly Qualitative Evidence &bull; No AI Grading, Marks, or Diagnostic Labels
                </span>
              </div>

              {/* Context Summary */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-slate-700">
                <p>
                  <strong>Curriculum Objective:</strong>{' '}
                  <span className="font-mono text-teal-800 font-bold">
                    {assignment.curriculumObjectiveCode || '5Nn.01'}
                  </span>{' '}
                  — {assignment.curriculumObjectiveTitle || 'Cambridge Primary Standard'}
                </p>
                <p>
                  <strong>Student Work Reference:</strong>{' '}
                  <span className="text-slate-900 font-medium">
                    {aiExtractSubmission.workType} &bull; {aiExtractSubmission.workSummary || 'Workbook exercises completed'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Based on teacher-entered work summary (text only — no photo or vision analysis).
                </p>
              </div>

              {/* Extraction State */}
              {isExtractingAi ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-slate-600 font-medium">
                    Extracting qualitative observations from the teacher-entered work summary...
                  </p>
                </div>
              ) : extractedObsDraft ? (
                <div className="space-y-3">
                  {/* Observation Draft Form */}
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Qualitative Observation Draft (Teacher Controlled)</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                        Requires Approval
                      </span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Observation Classification
                      </label>
                      <select
                        value={aiDraftObsType}
                        onChange={(e) => setAiDraftObsType(e.target.value as ObservationType)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        <option value="misconception">Misconception / Conceptual Friction</option>
                        <option value="learning_progress">Learning Progress / Mastery</option>
                        <option value="strength">Notable Mathematical Insight</option>
                        <option value="support_need">Scaffolding / Support Need</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Observation Text (Edit freely before approving)
                      </label>
                      <textarea
                        rows={3}
                        value={aiDraftObsText}
                        onChange={(e) => setAiDraftObsText(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-600 font-normal leading-relaxed"
                      />
                    </div>

                    {aiDraftFollowup && (
                      <div className="p-2 bg-white/80 border border-amber-200/80 rounded-lg flex items-start gap-2 text-slate-700">
                        <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-900">Suggested Retrieval Focus:</strong>
                          <p className="text-[11px] text-slate-600">{aiDraftFollowup}</p>
                        </div>
                      </div>
                    )}

                    {obsApprovedSuccess ? (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Observation approved & recorded in student&apos;s longitudinal profile!</span>
                      </div>
                    ) : (
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={isApprovingObs || !aiDraftObsText.trim() || writesBlocked}
                          onClick={handleApproveObservation}
                          className="bg-teal-700 hover:bg-teal-800 text-white font-medium"
                        >
                          {isApprovingObs ? 'Recording...' : 'Approve & Record Evidence'}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* AI Next-Step Intervention Loop (Appears when misconception or friction identified) */}
                  {(aiDraftObsType === 'misconception' || aiDraftObsType === 'support_need' || obsApprovedSuccess) && (
                    <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-indigo-950 font-bold">
                          <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>AI-Suggested Targeted Next Step</span>
                        </div>
                        {!interventionDraft && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isSuggestingIntervention || writesBlocked}
                            onClick={handleRequestInterventionSuggestion}
                            className="text-[11px] h-7 px-2.5 border-indigo-300 text-indigo-800 bg-white hover:bg-indigo-50"
                          >
                            <Sparkles className="w-3 h-3 text-indigo-600 mr-1" />
                            {isSuggestingIntervention ? 'Analyzing...' : 'Suggest Next Step'}
                          </Button>
                        )}
                      </div>

                      {interventionSuccessMsg && (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 font-medium">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{interventionSuccessMsg}</span>
                        </div>
                      )}

                      {interventionDraft && !interventionSuccessMsg && (
                        <div className="p-3 bg-white rounded-lg border border-indigo-200 space-y-2.5">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Strategy Action</span>
                            <textarea
                              rows={2}
                              value={interventionDraft.strategyAction}
                              onChange={(e) =>
                                setInterventionDraft({ ...interventionDraft, strategyAction: e.target.value })
                              }
                              className="w-full mt-0.5 px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Target Outcome</span>
                            <input
                              type="text"
                              value={interventionDraft.targetOutcome}
                              onChange={(e) =>
                                setInterventionDraft({ ...interventionDraft, targetOutcome: e.target.value })
                              }
                              className="w-full mt-0.5 px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            />
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] text-slate-500 italic">
                              Status: Draft &bull; 14-day duration
                            </span>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={isAcceptingIntervention || writesBlocked}
                              onClick={handleAcceptIntervention}
                              className="bg-indigo-700 hover:bg-indigo-800 text-white font-medium"
                            >
                              {isAcceptingIntervention ? 'Accepting...' : 'Accept Intervention'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAiExtractSubmission(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
