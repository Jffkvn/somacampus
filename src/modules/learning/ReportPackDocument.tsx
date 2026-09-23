/**
 * Branded report pack (print/PDF-first official school document).
 * Crest band · letterhead · identity · marks table · overall · signatures.
 * Same genre as ResultsSlipDocument, for full term report packs.
 */
import React from 'react';
import type { TermReportCard } from './reportCardDomain';

export interface ReportPackDocumentProps {
  report: TermReportCard;
  schoolCode?: string | null;
  principalTitle?: string | null;
}

export const ReportPackDocument: React.FC<ReportPackDocumentProps> = ({
  report,
  schoolCode = 'SCH',
  principalTitle = 'Head Teacher',
}) => {
  return (
    <article
      id="report-pack"
      className="mx-auto w-full max-w-[720px] bg-white text-slate-900 border border-slate-200 rounded-none shadow-sm print:shadow-none print:border-0"
      style={{ fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" }}
    >
      <header className="border-b-[3px] border-[#002b36] px-8 pt-7 pb-5 text-center">
        <div
          className="mx-auto mb-2 h-12 w-12 rounded-full border-2 border-[#002b36] flex items-center justify-center text-[#002b36] font-bold text-sm tracking-widest"
          aria-hidden
        >
          {schoolCode}
        </div>
        <h1 className="text-xl font-semibold tracking-wide text-[#002b36]">{report.schoolName}</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-slate-500">
          Academic Report
        </p>
        <p className="mt-1 text-xs text-slate-500">{report.termLabel}</p>
      </header>

      <section className="px-8 py-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm border-b border-slate-200">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Learner</p>
          <p className="font-semibold">{report.learnerName}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Admission no.</p>
          <p className="font-semibold">{report.admissionNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Term</p>
          <p>{report.termLabel}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Attendance</p>
          <p>
            {report.attendance?.presentDays != null ? `${report.attendance.presentDays} present` : '—'}
            {report.attendance?.absentDays != null ? ` · ${report.attendance.absentDays} absent` : ''}
          </p>
        </div>
      </section>

      {report.subjects.map((s) => (
        <section key={s.subjectName} className="px-8 py-4 border-b border-slate-100">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#002b36] uppercase tracking-wider">{s.subjectName}</h2>
            <p className="text-sm font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {s.averagePct != null ? `${s.averagePct}%` : '—'}
            </p>
          </div>
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                <th className="py-1 font-medium">Assessment</th>
                <th className="py-1 text-right font-medium">Mark</th>
                <th className="py-1 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {s.assessments.map((a, i) => {
                const pct = a.maxScore && a.maxScore > 0 && a.score != null
                  ? Math.round((a.score / a.maxScore) * 1000) / 10
                  : null;
                return (
                  <tr key={`${a.title}-${i}`} className="border-b border-slate-50">
                    <td className="py-1.5">{a.title}</td>
                    <td className="py-1.5 text-right">
                      {a.score ?? '—'}
                      {a.maxScore != null ? `/${a.maxScore}` : ''}
                    </td>
                    <td className="py-1.5 text-right">{pct != null ? `${pct}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {s.strengths.length > 0 && (
            <p className="mt-2 text-xs text-emerald-900">
              <span className="font-semibold uppercase tracking-wide">Strengths:</span>{' '}
              {s.strengths.join(', ')}
            </p>
          )}
          {s.nextSteps.length > 0 && (
            <p className="mt-1 text-xs text-amber-900">
              <span className="font-semibold uppercase tracking-wide">Needs development:</span>{' '}
              {s.nextSteps.join(', ')}
            </p>
          )}
          {s.evidenceLevel !== 'strong' && (
            <p className="mt-1 text-[10px] text-slate-400">{s.evidenceLevel} evidence</p>
          )}
        </section>
      ))}

      {report.teacherComment && (
        <section className="px-8 py-4 border-b border-slate-100">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Teacher comment</p>
          <p className="text-sm text-slate-800 leading-relaxed">{report.teacherComment}</p>
        </section>
      )}

      <footer className="px-8 pb-8 pt-4 grid grid-cols-2 gap-10 text-xs text-slate-600">
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 uppercase tracking-wider text-[10px] text-slate-400">Class Teacher</p>
        </div>
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 uppercase tracking-wider text-[10px] text-slate-400">{principalTitle}</p>
        </div>
        <p className="col-span-2 pt-2 text-[10px] text-slate-400 leading-relaxed">
          Official academic report · issued from the school academic record · live data changes do not alter this copy once issued.
        </p>
      </footer>
    </article>
  );
};
