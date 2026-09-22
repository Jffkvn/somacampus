/**
 * P3-D paper production UI (teacher).
 * Past paper → structure · teacher brief → BACKEND AI DRAFT · edit/approve · print.
 */
import React, { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, FileText, Sparkles, Printer, CheckCircle2 } from 'lucide-react';
import { paperService, aiDraftPaper } from './paperService';
import { parsePastPaperStructure, type PaperDraft, type PaperStructure } from './paperDraftDomain';

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export interface ExamPaperBuilderPageProps {
  schoolId: string;
  subjectId?: string | null;
  classId?: string | null;
  createdBy?: string | null;
}

export const ExamPaperBuilderPage: React.FC<ExamPaperBuilderPageProps> = ({
  schoolId,
  subjectId,
  classId,
  createdBy,
}) => {
  const [pastPaperText, setPastPaperText] = useState('');
  const [title, setTitle] = useState('End of Term Examination');
  const [termLabel, setTermLabel] = useState('Term 2, 2026');
  const [topics, setTopics] = useState('fractions, measurement, geometry');
  const [instructions, setInstructions] = useState('Answer ALL questions. Show your working.');
  const [structure, setStructure] = useState<PaperStructure | null>(null);
  const [draft, setDraft] = useState<PaperDraft | null>(null);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const ingestPastPaper = () => {
    try {
      setError(null);
      setStructure(parsePastPaperStructure(pastPaperText));
    } catch (err: any) {
      setError(err?.message ?? 'Could not read past paper');
    }
  };

  const generate = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const brief = {
        title,
        termLabel,
        topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
        instructions,
      };
      const st = structure ?? parsePastPaperStructure(pastPaperText || '1. Calculate. [2 marks]');
      const { paper, draft: d } = await paperService.createWithAiDraft({
        schoolId,
        templateId: null,
        structure: st,
        brief,
        subjectId: subjectId ?? null,
        classId: classId ?? null,
        createdBy: createdBy ?? null,
      });
      setPaperId(paper.id);
      setDraft(d);
    } catch (err: any) {
      // Fallback: local backend-AI draft so the teacher can still review.
      try {
        const brief = {
          title,
          termLabel,
          topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
          instructions,
        };
        const st = structure ?? parsePastPaperStructure(pastPaperText || '1. Calculate. [2 marks]');
        setDraft(await aiDraftPaper(st, brief));
      } catch (e2: any) {
        setError(err?.message ?? e2?.message ?? 'Could not draft paper');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const approve = async () => {
    if (!paperId || !draft) return;
    setIsBusy(true);
    try {
      await paperService.approve(paperId, draft);
      setDraft({ ...draft, header: { ...draft.header, isDraft: false, origin: 'approved' } });
      setApproved(true);
    } catch (err: any) {
      setError(err?.message ?? 'Could not approve paper');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300" id="exam-paper">
      <PageHeader
        eyebrow="Formal assessment"
        title="Exam paper builder"
        description="Past-paper structure + your topics → backend AI draft → you approve → print. Sitting stays at the school."
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-teal" /> 1 · Past paper & brief
            </span>
          </CardTitle>
          <CardDescription>Paste last year’s paper (or section list). You set topics — AI drafts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className={labelClass}>Past paper text</label>
          <textarea
            className={inputClass}
            rows={5}
            value={pastPaperText}
            onChange={(e) => setPastPaperText(e.target.value)}
            placeholder={'Section A: Short questions\n1. Calculate 7 × 8. [2 marks]\n…'}
          />
          <Button type="button" size="sm" variant="outline" onClick={ingestPastPaper}>
            Read structure
          </Button>
          {structure && (
            <p className="text-xs text-slate-500">
              Sections: {structure.sections.map((s) => `${s.code}×${s.n}`).join(' · ')}
              {structure.timeMinutes ? ` · ${structure.timeMinutes} min` : ''}
              {structure.totalMarks ? ` · ${structure.totalMarks} marks` : ''}
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Term</label>
              <input className={inputClass} value={termLabel} onChange={(e) => setTermLabel(e.target.value)} />
            </div>
          </div>
          <label className={labelClass}>Topics (comma separated — teacher owned)</label>
          <input className={inputClass} value={topics} onChange={(e) => setTopics(e.target.value)} />
          <label className={labelClass}>Instructions</label>
          <input className={inputClass} value={instructions} onChange={(e) => setInstructions(e.target.value)} />

          <Button
            type="button"
            disabled={isBusy}
            onClick={() => void generate()}
            leftIcon={<Sparkles className="w-4 h-4" />}
            className="bg-brand-teal text-white"
          >
            {isBusy ? 'Drafting…' : 'Generate draft (backend AI)'}
          </Button>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-teal" /> 2 · Review & approve
              </span>
            </CardTitle>
            <CardDescription>
              {draft.header.isDraft
                ? 'DRAFT — edit questions before print. AI never marks grades.'
                : 'APPROVED — printable school paper.'}
            </CardDescription>
            <div className="flex items-center gap-2">
              <StatusPill
                status={draft.header.isDraft ? 'pending' : 'success'}
                label={draft.header.isDraft ? 'ai draft' : 'approved'}
              />
              {approved && (
                <Button size="sm" variant="outline" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                  Print
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 print:text-black">
            <div className="border-b border-slate-200 pb-3">
              <p className="text-lg font-bold text-slate-900">{draft.header.title}</p>
              <p className="text-sm text-slate-500">
                {draft.header.termLabel}
                {draft.header.timeMinutes ? ` · Time: ${draft.header.timeMinutes / 60}h` : ''}
                {` · Total: ${draft.header.totalMarks} marks`}
              </p>
              <p className="text-sm text-slate-600 mt-1">{draft.header.instructions}</p>
            </div>
            {draft.sections.map((sec) => (
              <div key={sec.code}>
                <p className="font-bold text-slate-900 mb-1">
                  Section {sec.code}: {sec.title}
                </p>
                <ol className="list-decimal ml-5 space-y-1 text-sm text-slate-800">
                  {sec.questions.map((q) => (
                    <li key={q.n}>
                      {q.text}{' '}
                      <span className="text-xs text-slate-400">[{q.marks} marks]</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {draft.header.isDraft && paperId && (
              <Button
                type="button"
                disabled={isBusy}
                onClick={() => void approve()}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
                className="bg-brand-teal text-white"
              >
                Approve exam paper
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
