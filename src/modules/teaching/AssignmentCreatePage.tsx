import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { assignmentService } from './assignmentService';
import type { EvidenceTrack, SubmissionType } from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

const DEFAULT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
const DEFAULT_TEACHER_ID = '99999999-9999-9999-9999-999999999992'; // David Musoke

export const AssignmentCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const prefillLessonId = searchParams.get('lessonId') || undefined;
  const prefillClassId = searchParams.get('classId') || '55555555-5555-5555-5555-555555555551'; // Stage 5
  const prefillStreamId = searchParams.get('streamId') || '66666666-6666-6666-6666-666666666661'; // Blue
  const prefillSubjectId = searchParams.get('subjectId') || '77777777-7777-7777-7777-777777777771'; // Math
  const prefillTopic = searchParams.get('topic') || '';

  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [title, setTitle] = useState(prefillTopic ? `${prefillTopic} Practice` : '');
  const [instructions, setInstructions] = useState('');
  const [evidenceTrack, setEvidenceTrack] = useState<EvidenceTrack>('diagnostic_evidence');
  const [submissionType, setSubmissionType] = useState<SubmissionType>('homework');
  const [maxScore, setMaxScore] = useState<number | ''>(50);
  const [assignedDate, setAssignedDate] = useState(today);
  const [dueDate, setDueDate] = useState(nextWeek);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const created = await assignmentService.createAssignment({
        schoolId: DEFAULT_SCHOOL_ID,
        teacherId: DEFAULT_TEACHER_ID,
        classId: prefillClassId,
        streamId: prefillStreamId,
        subjectId: prefillSubjectId,
        lessonId: prefillLessonId,
        title: title.trim(),
        instructions: instructions.trim(),
        assignedDate,
        dueDate,
        submissionType,
        evidenceTrack,
        maxScore: evidenceTrack === 'formal_graded' ? Number(maxScore) : null,
      });

      navigate(`/teaching/assignments/${created.id}`);
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Failed to create assignment');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/teaching/assignments" className="hover:text-slate-800">
          Assignments
        </Link>
        <span>&bull;</span>
        <span className="text-slate-800 font-medium">New Assignment</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">
            Create Assignment / Homework
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Establish expected student work linked directly to the Stage 5 Blue curriculum.
          </p>
        </CardHeader>
        <CardContent>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instructions / Questions
              </label>
              <textarea
                rows={4}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Detail the pages, exercises, or tasks expected from each student..."
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 resize-y"
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
                disabled={isSubmitting}
                className="bg-teal-700 hover:bg-teal-800 text-white"
              >
                {isSubmitting ? 'Publishing...' : 'Publish Assignment'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
