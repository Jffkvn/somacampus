/**
 * P2C-1 report card page — generated from the live academic record only.
 * Teacher comment is explicit human input (never AI-written grades).
 */
import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { AlertCircle, Printer } from 'lucide-react';
import { reportCardService, currentAcademicWindow } from './reportCardService';
import type { TermReportCard } from './reportCardDomain';
import { draftReportComment } from '../../lib/aiGateway';
import { ReportPackDocument } from './ReportPackDocument';

export interface ReportCardPageProps {
  schoolId: string;
  schoolName: string;
  studentIdOrEmail: string;
  /** Who is commenting: teacher writes; parent views read-only. */
  canComment?: boolean;
}

const EVIDENCE_PILL: Record<string, 'success' | 'pending' | 'neutral'> = {
  strong: 'success',
  thin: 'pending',
  none: 'neutral',
};

export const ReportCardPage: React.FC<ReportCardPageProps> = ({
  schoolId,
  schoolName,
  studentIdOrEmail,
  canComment = false,
}) => {
  const [card, setCard] = useState<TermReportCard | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const w = await currentAcademicWindow(schoolId);
      const built = await reportCardService.buildForStudent({
        studentIdOrEmail,
        schoolId,
        schoolName,
        termLabel: w.termLabel,
        fromIso: w.fromIso,
        toIso: w.toIso,
        teacherComment: comment || null,
      });
      setCard(built);
    } catch (err: any) {
      console.error('Report card failed:', err);
      const raw = String(err?.message ?? '');
      setError(
        /PGRST|permission/i.test(raw)
          ? 'We could not build this report right now. Please try again later.'
          : raw || 'Could not build the report card.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, studentIdOrEmail]);

  if (isLoading) return <LoadingState label="Building report card from the academic record..." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 print:space-y-4" id="report-card">
      <PageHeader
        eyebrow="Reporting"
        title="Report card"
        description="Generated from live gradebook data only. Progress ≠ completion."
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {card && (
        <ReportPackDocument
          report={card}
          schoolCode={card.schoolName.slice(0, 3).toUpperCase() || 'SCH'}
        />
      )}
      {card && (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  {card.learnerName}
                  {card.admissionNumber ? ` · ${card.admissionNumber}` : ''}
                </CardTitle>
                <CardDescription>
                  {card.schoolName} · {card.termLabel}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-4 h-4" />}
                onClick={() => window.print()}
                className="print:hidden"
              >
                Print / PDF
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {card.subjects.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Not enough scored work yet for this window — the report stays empty rather than inventing marks.
                </p>
              ) : (
                card.subjects.map((s) => (
                  <div key={s.subjectName} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{s.subjectName}</p>
                        <p className="text-xs text-slate-500">
                          {s.averagePct != null ? `Average ${s.averagePct}%` : 'Average —'}
                        </p>
                      </div>
                      <StatusPill
                        status={EVIDENCE_PILL[s.evidenceLevel] ?? 'neutral'}
                        label={`${s.evidenceLevel} evidence`}
                      />
                    </div>

                    {s.objectives.length > 0 && (
                      <ul className="text-xs text-slate-600 mb-2 space-y-0.5">
                        {s.objectives.map((o) => (
                          <li key={o.objectiveCode ?? o.objectiveTitle}>
                            {o.objectiveTitle ?? o.objectiveCode}
                            {o.pct != null ? ` — ${o.pct}%` : ' —'}
                          </li>
                        ))}
                      </ul>
                    )}

                    {s.assessments.length > 0 && (
                      <ul className="text-xs text-slate-500 mb-2 space-y-0.5">
                        {s.assessments.slice(0, 6).map((a, i) => (
                          <li key={`${a.title}-${i}`}>
                            {a.title}
                            {a.score != null ? ` · ${a.score}${a.maxScore != null ? `/${a.maxScore}` : ''}` : ''}
                            {a.feedback ? ` — ${a.feedback}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}

                    {s.strengths.length > 0 && (
                      <p className="text-xs text-emerald-800">
                        <span className="font-semibold">Strengths:</span> {s.strengths.join(', ')}
                      </p>
                    )}
                    {s.nextSteps.length > 0 && (
                      <p className="text-xs text-amber-800">
                        <span className="font-semibold">Needs development:</span> {s.nextSteps.join(', ')}
                      </p>
                    )}
                  </div>
                ))
              )}

              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Teacher comment</p>
                {canComment ? (
                  <>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Human comment only — never auto-written grades."
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                    />
                    <div className="flex gap-2 mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const subj = (card?.subjects ?? []) as any[];
                            const evidence = subj.flatMap((s: any) =>
                              (s.assessments ?? []).map((a: any) => ({
                                kind: 'learning_result',
                                id: String(a.title ?? ''),
                                label: `${s.subjectName ?? 'Subject'}: ${a.title ?? ''}`,
                              })),
                            );
                            const res = await draftReportComment({
                              learnerName: String(card?.learnerName ?? 'Learner'),
                              evidence,
                              tone: 'formal_cambridge',
                            });
                            setComment(res.comment);
                          } catch {
                            /* fail closed — teacher writes manually */
                          }
                        }}
                      >
                        AI draft (edit before Issue)
                      </Button>
                      <Button type="button" size="sm" onClick={() => void load()}>
                        Refresh report with comment
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-700">{card.teacherComment ?? '—'}</p>
                )}
                {card.teacherComment && canComment && (
                  <p className="text-sm text-slate-700 mt-2">{card.teacherComment}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
