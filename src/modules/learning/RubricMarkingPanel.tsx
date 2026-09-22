/**
 * P0 human rubric marking UI (charter §10).
 * Teacher taps one level per criterion; total is the deterministic sum of
 * selected level points. AI never writes score/grade/marks.
 */
import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { AlertCircle, BadgeCheck } from 'lucide-react';
import {
  buildRubricMarks,
  computeRubricTotal,
  gradebookService,
  type LearningRubric,
  type RubricCriterion,
} from './gradebookService';

export interface RubricMarkingPanelProps {
  schoolId: string;
  studentId: string;
  markedBy: string;
  rubric: LearningRubric;
  assignmentId?: string | null;
  learningActivityId?: string | null;
  submissionId?: string | null;
  onRecorded?: (score: number) => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';

function CriterionRow({
  criterion,
  selected,
  onSelect,
  comment,
  onComment,
}: {
  criterion: RubricCriterion;
  selected?: number;
  onSelect: (levelValue: number) => void;
  comment?: string;
  onComment?: (text: string) => void;
}) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-b-0">
      <p className="text-sm font-semibold text-slate-800 mb-2">
        {criterion.title}
        {criterion.weight != null && criterion.weight !== 1 ? (
          <span className="ml-2 text-xs font-normal text-slate-400">×{criterion.weight}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {criterion.levels.map((level) => {
          const active = selected === level.value;
          return (
            <button
              key={level.value}
              type="button"
              onClick={() => onSelect(level.value)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-brand-teal text-white border-brand-teal'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-brand-teal/50'
              }`}
            >
              {level.label}
              <span className="ml-1 opacity-80">{level.points}pt</span>
            </button>
          );
        })}
      </div>
      {onComment && (
        <input
          value={comment ?? ''}
          onChange={(e) => onComment(e.target.value)}
          placeholder="Comment for this criterion (optional)"
          maxLength={500}
          className="mt-2 w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
        />
      )}
    </div>
  );
}

export const RubricMarkingPanel: React.FC<RubricMarkingPanelProps> = ({
  schoolId,
  studentId,
  markedBy,
  rubric,
  assignmentId = null,
  learningActivityId = null,
  submissionId = null,
  onRecorded,
}) => {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [criterionComments, setCriterionComments] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedScore, setSavedScore] = useState<number | null>(null);

  const marks = useMemo(() => {
    const base = buildRubricMarks(rubric.criteria, selected);
    return base.map((m) => ({
      ...m,
      comment: criterionComments[m.criterionId] || null,
    }));
  }, [rubric.criteria, selected, criterionComments]);
  const total = useMemo(() => computeRubricTotal(marks), [marks]);
  const maxTotal = useMemo(
    () =>
      rubric.criteria.reduce(
        (sum, c) => sum + Math.max(...c.levels.map((l) => l.points), 0),
        0,
      ),
    [rubric.criteria],
  );
  const canSave = marks.length > 0 && !isSaving;

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await gradebookService.recordResult({
        schoolId,
        studentId,
        markedBy,
        assignmentId,
        learningActivityId,
        submissionId,
        learningRubricId: rubric.id,
        resultSource: 'rubric',
        feedback: feedback.trim() || null,
        rubricMarks: marks,
      });
      setSavedScore(result.score ?? total);
      onRecorded?.(result.score ?? total);
    } catch (err: any) {
      console.error('Rubric mark failed:', err);
      const raw = String(err?.message ?? '');
      setError(
        /PGRST|permission|violates/i.test(raw)
          ? 'Could not save these marks. Please try again.'
          : raw || 'Could not save marks.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-brand-teal" /> {rubric.title}
            </span>
          </CardTitle>
          <CardDescription>
            Human marking only — score is the sum of the levels you tap. AI never writes grades.
          </CardDescription>
        </div>
        <p className="text-lg font-extrabold text-slate-900">
          {total}
          <span className="text-sm font-semibold text-slate-400">/{maxTotal}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {savedScore != null && (
          <p className="text-sm font-semibold text-emerald-700">
            Marked {savedScore}/{maxTotal}. Progress ≠ completion until feedback is reviewed.
          </p>
        )}

        {rubric.criteria.map((c) => (
          <CriterionRow
            key={c.id}
            criterion={c}
            selected={selected[c.id]}
            onSelect={(v) => setSelected((prev) => ({ ...prev, [c.id]: v }))}
            comment={criterionComments[c.id]}
            onComment={(text) => setCriterionComments((prev) => ({ ...prev, [c.id]: text }))}
          />
        ))}

        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1" htmlFor="rubric-feedback">
            Teacher feedback
          </label>
          <textarea
            id="rubric-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What to keep / what to fix…"
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" disabled={!canSave} onClick={() => void save()}>
            {isSaving ? 'Saving…' : `Save marks (${total}/${maxTotal})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
