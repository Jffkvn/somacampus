import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { assignmentService } from './assignmentService';
import { observationService } from './observationService';
import type {
  Assignment,
  StudentSubmission,
  ParticipationStatus,
  SubmissionStatus,
  ObservationType,
} from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';

const DEFAULT_TEACHER_ID = '99999999-9999-9999-9999-999999999992'; // David Musoke

export const AssignmentReviewPage: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();

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

  const handleUpdateParticipation = async (subId: string, partStatus: ParticipationStatus) => {
    try {
      const updated = await assignmentService.updateSubmission(subId, { participationStatus: partStatus });
      setSubmissions((prev) => prev.map((s) => (s.id === subId ? updated : s)));
    } catch (err: any) {
      alert(err.message ?? 'Failed to update participation');
    }
  };

  const handleUpdateSubmissionStatus = async (subId: string, subStatus: SubmissionStatus) => {
    try {
      const updated = await assignmentService.updateSubmission(subId, { submissionStatus: subStatus });
      setSubmissions((prev) => prev.map((s) => (s.id === subId ? updated : s)));
    } catch (err: any) {
      alert(err.message ?? 'Failed to update submission status');
    }
  };

  const handleSaveReview = async (sub: StudentSubmission) => {
    try {
      const updated = await assignmentService.reviewSubmission(sub.id, {
        reviewStatus: 'reviewed',
        feedback: sub.teacherFeedback ?? undefined,
        score: sub.score,
        teacherId: DEFAULT_TEACHER_ID,
      });
      setSubmissions((prev) => prev.map((s) => (s.id === sub.id ? updated : s)));
    } catch (err: any) {
      alert(err.message ?? 'Failed to save review');
    }
  };

  const handleCreateObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeObsStudent || !assignment || !obsText.trim()) return;

    try {
      setIsSavingObs(true);
      await observationService.createObservation({
        schoolId: assignment.schoolId,
        studentId: activeObsStudent.studentId,
        teacherId: DEFAULT_TEACHER_ID,
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
                      <td className="py-3 px-3 max-w-xs">
                        <input
                          type="text"
                          value={sub.workSummary ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSubmissions((prev) =>
                              prev.map((s) => (s.id === sub.id ? { ...s, workSummary: val } : s))
                            );
                          }}
                          placeholder="e.g. Workbook Page 42"
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
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSaveReview(sub)}
                            className="text-[11px] h-7 px-2"
                          >
                            Save Review
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveObsStudent(sub);
                              setObsText('');
                            }}
                            className="text-[11px] h-7 px-2 text-teal-700 hover:bg-teal-50"
                          >
                            + Observe
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

      {/* Observation Modal Drawer */}
      {activeObsStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
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
                  disabled={isSavingObs}
                  className="bg-teal-700 hover:bg-teal-800 text-white"
                >
                  {isSavingObs ? 'Saving...' : 'Save Observation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
