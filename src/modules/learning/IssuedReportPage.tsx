/**
 * P3-C issued report view — renders the frozen snapshot only.
 * Later gradebook edits cannot change what is shown here.
 */
import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, Printer, FileCheck2 } from 'lucide-react';
import { issuedReportService, type IssuedReport } from './issuedReportService';

export interface IssuedReportPageProps {
  reportId: string;
  canPrint?: boolean;
}

export const IssuedReportPage: React.FC<IssuedReportPageProps> = ({
  reportId,
  canPrint = true,
}) => {
  const [report, setReport] = useState<IssuedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        setReport(await issuedReportService.get(reportId));
      } catch (err: any) {
        setError(err?.message ?? 'Could not load issued report');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [reportId]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">Loading issued report…</div>;
  }

  const snap = (report?.snapshot ?? {}) as any;
  const subjects: any[] = Array.isArray(snap.subjects) ? snap.subjects : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300" id="issued-report">
      <PageHeader
        eyebrow="Academic records"
        title={snap.learnerName ? `${snap.termLabel} report` : 'Issued report'}
        description="Issued historical document — live gradebook changes do not alter this copy."
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card className="print:shadow-none">
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-600" /> {snap.schoolName ?? 'School'}
                </span>
              </CardTitle>
              <CardDescription>
                {snap.learnerName}
                {snap.admissionNumber ? ` · ${snap.admissionNumber}` : ''}
                {snap.className ? ` · ${snap.className}` : ''} · v{report.version}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <StatusPill status="success" label="issued" />
              {canPrint && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Printer className="w-4 h-4" />}
                  onClick={() => window.print()}
                >
                  Print / PDF
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="py-2">Subject</th>
                  <th className="py-2 text-right">Mark</th>
                  <th className="py-2 text-right">%</th>
                  <th className="py-2 text-right">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjects.map((s) => (
                  <tr key={s.subjectCode}>
                    <td className="py-2 font-semibold text-slate-800">{s.subjectName}</td>
                    <td className="py-2 text-right">
                      {s.score}
                      {s.maxScore != null ? `/${s.maxScore}` : ''}
                    </td>
                    <td className="py-2 text-right">{s.pct}%</td>
                    <td className="py-2 text-right">{s.grade ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Overall</p>
              <p className="text-lg font-bold text-slate-900">
                {report.overallLabel ?? snap.overallLabel ?? '—'}
                {report.divisionLabel ? ` · ${report.divisionLabel}` : ''}
              </p>
            </div>

            {snap.teacherComment && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Teacher comment</p>
                <p className="text-sm text-slate-800">{snap.teacherComment}</p>
              </div>
            )}
            {snap.headComment && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Head teacher</p>
                <p className="text-sm text-slate-800">{snap.headComment}</p>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Issued {String(report.issuedAt).slice(0, 19).replace('T', ' ')} · immutable academic record
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
