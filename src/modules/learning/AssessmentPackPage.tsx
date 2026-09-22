/**
 * P2A-4 assessment pack progress UI — objective rollup from the one gradebook.
 * Student / teacher read path. No AI mastery labels.
 */
import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { AlertCircle, Target } from 'lucide-react';
import { assessmentPackService } from './assessmentPackService';
import type { PackProgress } from './assessmentPackDomain';

export interface AssessmentPackPageProps {
  packId: string;
  studentId: string;
}

const KIND_LABEL: Record<string, string> = {
  baseline: 'Baseline',
  diagnostic: 'Diagnostic',
  unit: 'Unit',
  midterm: 'Mid-term',
  end_of_term: 'End of term',
  project: 'Project',
  practical: 'Practical',
  oral: 'Oral',
};

export const AssessmentPackPage: React.FC<AssessmentPackPageProps> = ({ packId, studentId }) => {
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        setProgress(await assessmentPackService.getLearnerProgress(packId, studentId));
      } catch (err: any) {
        console.error('Assessment pack load failed:', err);
        setError('We could not load this assessment pack. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [packId, studentId]);

  if (isLoading) return <LoadingState label="Loading assessment pack..." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Assessments"
        title={progress ? `${KIND_LABEL[progress.packKind] ?? progress.packKind} · ${progress.title}` : 'Assessment pack'}
        description="Student → Subject → Objectives → Evidence → Result. Rollup is from scored work only."
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {progress && (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Target className="w-4 h-4 text-brand-teal" /> Objective rollup
                  </span>
                </CardTitle>
                <CardDescription>
                  Evidence-linked mastery percentages (Progress ≠ completion).
                </CardDescription>
              </div>
              <StatusPill status="info" label={`${progress.completionPct}% scored`} />
            </CardHeader>
            <CardContent>
              {progress.objectives.length === 0 ? (
                <p className="text-sm text-slate-400">No scored evidence mapped to objectives yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {progress.objectives.map((o) => (
                    <li key={o.objectiveCode} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {o.objectiveTitle ?? o.objectiveCode}
                        </p>
                        <p className="text-xs text-slate-400">
                          {o.evidenceCount} evidence item{o.evidenceCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900">
                          {o.pct != null ? `${o.pct}%` : '—'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {o.scoreSum}/{o.maxSum}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pack items</CardTitle>
              <CardDescription>Quizzes and activities in this pack.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-slate-100">
                {progress.items.map((item) => {
                  const r = progress.resultsByItem[item.id];
                  return (
                    <li key={item.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{item.itemTitle}</p>
                        <p className="text-xs text-slate-400">
                          {item.objectiveMap.map((m) => m.objectiveTitle ?? m.objectiveCode).join(', ') ||
                            'No objectives mapped'}
                          {item.weight !== 1 ? ` · weight ×${item.weight}` : ''}
                        </p>
                      </div>
                      <StatusPill
                        status={r?.score != null ? 'success' : 'neutral'}
                        label={
                          r?.score != null
                            ? `${r.score}${r.maxScore != null ? `/${r.maxScore}` : ''}`
                            : 'not scored'
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
