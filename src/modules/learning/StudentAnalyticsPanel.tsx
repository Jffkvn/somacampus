/**
 * P2B-1 student analytics panel — every claim lists its evidence rows.
 * "Not enough evidence" is a first-class honest answer.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { AlertCircle, FileSearch } from 'lucide-react';
import { analyticsService } from './analyticsService';
import type { StudentAnalytics } from './analyticsDomain';
import { explainResults } from '../../lib/aiGateway';
import { SuggestionsPanel } from './SuggestionsPanel';
import { suggestionService } from './suggestionService';

export interface StudentAnalyticsPanelProps {
  studentId: string;
  schoolId: string;
  learnerLabel?: string;
}

export const StudentAnalyticsPanel: React.FC<StudentAnalyticsPanelProps> = ({
  studentId,
  schoolId,
  learnerLabel,
}) => {
  const [data, setData] = useState<StudentAnalytics | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        setAiSummary(null);
        const a = await analyticsService.getStudentAnalytics(studentId, schoolId);
        setData(a);
        // AI-5: evidence-cited explain (optional; fail closed to rule claims).
        const evidence = a.claims.flatMap((c) => c.evidence);
        if (evidence.length) {
          explainResults({ evidence, context: a.claims.map((c) => `${c.title}: ${c.value}`).join('; ') })
            .then((res) => setAiSummary(res.summary || null))
            .catch(() => setAiSummary(null));
        }
        // P2B-2: persist gap suggestions (recommend-only) when evidence supports them.
        try {
          const gaps = suggestionService.suggestGaps(
            a.objectives.map((o) => ({
              objectiveCode: o.objectiveCode,
              objectiveTitle: o.objectiveTitle,
              pct: o.pct ?? 100,
              evidenceCount: o.evidenceCount,
              evidence: o.evidence,
            })),
          );
          for (const g of gaps) {
            await suggestionService.record({
              schoolId,
              studentId,
              kind: g.kind,
              title: g.title,
              rationale: g.rationale,
              evidenceLinks: g.evidenceLinks,
            });
          }
        } catch (e) {
          console.warn('Gap suggestion persist skipped:', e);
        }
      } catch (err: any) {
        console.error('Analytics failed:', err);
        setError('We could not load analytics right now. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [studentId, schoolId]);

  if (isLoading) return <LoadingState label="Loading evidence-cited analytics..." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Intelligence"
        title={learnerLabel ? `Why is ${learnerLabel} behind?` : 'Learner analytics'}
        description="Every number cites the academic rows behind it. No vanity metrics."
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-brand-teal" /> Claims with evidence
                </span>
              </CardTitle>
              <CardDescription>Uncitable claims show “Not enough evidence”.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiSummary && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400 block mb-1">AI summary (cited evidence required)</span>
                {aiSummary}
              </p>
            )}
            {data.claims.map((c) => (
              <div key={c.key} className="rounded-xl border border-slate-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{c.title}</p>
                  <p className="text-lg font-bold text-slate-900">
                    {c.value != null ? `${c.value}${c.unit ?? ''}` : '—'}
                  </p>
                </div>
                {c.note && <p className="text-xs text-amber-700 mt-1">{c.note}</p>}
                <ul className="mt-2 space-y-0.5">
                  {c.evidence.map((e) => (
                    <li key={e.id} className="text-xs text-slate-500">
                      <span className="font-medium">{e.kind}</span> · {e.label}
                      {e.at ? ` · ${String(e.at).slice(0, 10)}` : ''} · <code>{e.id.slice(0, 8)}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {data.objectives.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Objectives</p>
                <ul className="space-y-2">
                  {data.objectives.map((o) => (
                    <li key={o.objectiveCode} className="text-sm text-slate-700">
                      {o.objectiveTitle ?? o.objectiveCode} — {o.pct != null ? `${o.pct}%` : '—'} (
                      {o.evidenceCount} evidence)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link to="/teacher/today" className="text-sm font-semibold text-brand-teal hover:underline">
              Back to today
            </Link>
          </CardContent>
        </Card>
      )}

      {data && (
        <SuggestionsPanel studentId={studentId} canDecide />
      )}
    </div>
  );
};
