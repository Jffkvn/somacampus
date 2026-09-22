/**
 * P3-F Results Slip — official one-page “statement of results”.
 *
 * Design: school certificate / statement print genre.
 * Palette: ink #0f172a · paper #fff · rule #cbd5e1 · seal #002b36 (institution).
 * Typography: formal serif display for school name; tabular marks table.
 * Layout: crest band → identity → results table → overall seal band → signatures.
 * Signature moment: the aggregate/division band (the number heads actually read).
 */
import React from 'react';
import { Button } from '../../components/ui/Button';
import { Printer } from 'lucide-react';
import type { ResultsSlipSnapshot } from './resultsSlipDomain';

export interface ResultsSlipDocumentProps {
  snapshot: ResultsSlipSnapshot;
  showPrint?: boolean;
}

export const ResultsSlipDocument: React.FC<ResultsSlipDocumentProps> = ({
  snapshot,
  showPrint = true,
}) => {
  const subjects = snapshot.subjects ?? [];

  return (
    <div className="space-y-4">
      {showPrint && (
        <div className="print:hidden flex justify-end">
          <Button size="sm" variant="outline" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
            Print slip
          </Button>
        </div>
      )}

      <article
        id="results-slip"
        className="mx-auto w-full max-w-[720px] bg-white text-slate-900 border border-slate-200 rounded-none shadow-sm print:shadow-none print:border-0"
        style={{ fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" }}
      >
        {/* Crest band */}
        <header className="border-b-[3px] border-[#002b36] px-8 pt-7 pb-5 text-center">
          <div
            className="mx-auto mb-2 h-12 w-12 rounded-full border-2 border-[#002b36] flex items-center justify-center text-[#002b36] font-bold text-sm tracking-widest"
            aria-hidden
          >
            {snapshot.schoolCode ?? 'SCH'}
          </div>
          <h1 className="text-xl font-semibold tracking-wide text-[#002b36]">{snapshot.schoolName}</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Statement of Results
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {snapshot.examTitle ? `${snapshot.examTitle} · ` : ''}
            {snapshot.termLabel}
          </p>
        </header>

        {/* Identity */}
        <section className="px-8 py-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm border-b border-slate-200">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Learner</p>
            <p className="font-semibold">{snapshot.learnerName}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Admission no.</p>
            <p className="font-semibold">{snapshot.admissionNumber ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Class</p>
            <p>{snapshot.className ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Term</p>
            <p>{snapshot.termLabel}</p>
          </div>
        </section>

        {/* Results table — tabular figures */}
        <section className="px-8 py-4">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-300">
                <th className="py-2 font-medium">Subject</th>
                <th className="py-2 text-right font-medium">Mark</th>
                <th className="py-2 text-right font-medium">%</th>
                <th className="py-2 text-right font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.subjectCode} className="border-b border-slate-100">
                  <td className="py-2">{s.subjectName}</td>
                  <td className="py-2 text-right">
                    {s.score}
                    {s.maxScore != null ? `/${s.maxScore}` : ''}
                  </td>
                  <td className="py-2 text-right">{s.pct}</td>
                  <td className="py-2 text-right font-semibold">{s.grade ?? '—'}</td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-400 text-sm">
                    No recorded subjects for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Signature moment — overall seal band */}
        <section className="mx-8 mb-5 rounded-sm bg-[#002b36] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] opacity-70">Overall</p>
            <p className="text-2xl font-semibold tracking-wide" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {snapshot.overallLabel ?? '—'}
            </p>
          </div>
          {snapshot.divisionLabel && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] opacity-70">Classification</p>
              <p className="text-xl font-semibold">{snapshot.divisionLabel}</p>
            </div>
          )}
        </section>

        {/* Signatures */}
        <footer className="px-8 pb-8 grid grid-cols-2 gap-10 text-xs text-slate-600">
          <div>
            <div className="h-10 border-b border-slate-400" />
            <p className="mt-1 uppercase tracking-wider text-[10px] text-slate-400">
              {snapshot.issuedByTitle ?? 'Head Teacher'}
            </p>
          </div>
          <div>
            <div className="h-10 border-b border-slate-400" />
            <p className="mt-1 uppercase tracking-wider text-[10px] text-slate-400">Date</p>
          </div>
          <p className="col-span-2 pt-2 text-[10px] text-slate-400 leading-relaxed">
            {snapshot.footer}
          </p>
        </footer>
      </article>
    </div>
  );
};
