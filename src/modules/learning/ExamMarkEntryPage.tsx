/**
 * P3-B exam mark entry (teacher). Human marks only.
 * Sitting runs outside SomaCampus (in person / school policy).
 * Saves to exam_marks + learning_results (result_source='exam').
 */
import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, FileSpreadsheet } from 'lucide-react';
import { examService } from './examService';
import { pctFor, type ExamCandidate, type ExamSitting } from './examDomain';
import { parseMarkSheetText, confirmMarks, matchesStudent, canBulkConfirm } from './markSheetDomain';
import { extractMarks } from '../../lib/aiGateway';

export interface ExamMarkEntryPageProps {
  sittingId: string;
}

export const ExamMarkEntryPage: React.FC<ExamMarkEntryPageProps> = ({ sittingId }) => {
  const [sitting, setSitting] = useState<ExamSitting | null>(null);
  const [candidates, setCandidates] = useState<ExamCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetText, setSheetText] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ studentLabel: string; score: number | null; confidence: 'high' | 'low'; sourceLine?: string | null }>
  >([]);
  const [confirmedLabels, setConfirmedLabels] = useState<string[]>([]);
  const [editedScores, setEditedScores] = useState<Record<string, number>>({});

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const s = await examService.getSitting(sittingId);
      if (!s) {
        setError('Exam sitting not found.');
        return;
      }
      setSitting(s);
      setCandidates(await examService.listCandidates(s));
    } catch (err: any) {
      setError(err?.message ?? 'Could not load exam sitting');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sittingId]);

  const saveMark = async (studentId: string, score: number | null) => {
    if (!sitting) return;
    setBusyId(studentId);
    try {
      await examService.recordMark({
        sittingId: sitting.id,
        studentId,
        score,
        maxMarks: sitting.maxMarks,
      });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not save mark');
    } finally {
      setBusyId(null);
    }
  };

  const parseSheet = async () => {
    try {
      const res = await extractMarks({
        sheetText,
        photoDataUrl,
        rosterNames: candidates.map((c) => c.studentName ?? c.studentId),
      });
      setSuggestions(
        res.suggestions.map((s) => ({
          studentLabel: s.studentLabel,
          score: s.score,
          confidence: s.confidence,
          sourceLine: s.sourceLine ?? null,
        })),
      );
    } catch {
      const r = parseMarkSheetText(sheetText);
      setSuggestions(r.suggestions);
    }
    setConfirmedLabels([]);
  };

  const applyConfirmed = async () => {
    if (!sitting) return;
    const confirmed = confirmMarks(
      suggestions as Array<{ studentLabel: string; score: number | null; confidence: 'high' | 'low' }>,
      confirmedLabels,
      editedScores,
    );
    for (const row of confirmed) {
      const cand = candidates.find((c) =>
        matchesStudent(row.studentLabel, c.studentName ?? c.studentId),
      );
      if (!cand) continue;
      await saveMark(cand.studentId, row.score);
    }
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">Loading exam sitting…</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Formal assessment"
        title={sitting?.title ?? 'Exam sitting'}
        description={
          sitting
            ? `${sitting.termLabel} · max ${sitting.maxMarks} marks · sitting is run by the school (${sitting.delivery.replace(/_/g, ' ')})`
            : 'Mark entry'
        }
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {sitting && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand-teal" /> Mark sheet
                </span>
              </CardTitle>
              <CardDescription>
                Teacher enters marks (human only). Saved to the academic record as exam results.
              </CardDescription>
            </div>
            <StatusPill status="info" label={sitting.status.replace(/_/g, ' ')} />
          </CardHeader>
          <CardContent className="pt-0">
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-400">No candidates found for this class.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                    <th className="py-2">Student</th>
                    <th className="py-2 text-right">Mark</th>
                    <th className="py-2 text-right">%</th>
                    <th className="py-2 text-right">Save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((c) => (
                    <CandidateRow
                      key={c.studentId}
                      candidate={c}
                      maxMarks={sitting.maxMarks}
                      busy={busyId === c.studentId}
                      onSave={(score) => void saveMark(c.studentId, score)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* P3-E mark-sheet assist — suggest only; teacher confirms */}
      <Card>
        <CardHeader>
          <CardTitle>Mark-sheet assist (read first-page marks → confirm)</CardTitle>
          <CardDescription>
            Paste/photo text of the marks the teacher wrote on the first page. We only read those figures —
            never invent a score. Confirm every number before it enters the academic record.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Option B — photo of first-page marks (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="block w-full text-xs mb-2"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setPhotoDataUrl(String(reader.result || ''));
              reader.readAsDataURL(f);
            }}
          />
          {photoDataUrl && (
            <img src={photoDataUrl} alt="Mark sheet first page" className="max-h-40 rounded-lg border border-slate-200 mb-2" />
          )}
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Or paste mark-sheet text (manual read)
          </label>
          <textarea
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
            rows={4}
            value={sheetText}
            onChange={(e) => setSheetText(e.target.value)}
            placeholder={'Amari Kyomugisha 74\nJohn Okello 82'}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={parseSheet}>
              Suggest marks
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!confirmedLabels.length}
              onClick={() => void applyConfirmed()}
              className="bg-brand-teal text-white"
            >
              Confirm selected
            </Button>
          </div>
          {suggestions.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {suggestions.map((s) => (
                <li key={s.studentLabel} className="py-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={!canBulkConfirm(s)}
                      checked={confirmedLabels.includes(s.studentLabel)}
                      onChange={(e) =>
                        setConfirmedLabels((prev) =>
                          e.target.checked
                            ? [...prev, s.studentLabel]
                            : prev.filter((x) => x !== s.studentLabel),
                        )
                      }
                    />
                    {s.studentLabel}
                    {s.confidence === 'low' && (
                      <span className="text-[10px] text-amber-700">edit required</span>
                    )}
                  </label>
                  <span className="flex items-center gap-2">
                    {canBulkConfirm(s) ? (
                      <span>
                        {s.score ?? '—'}{' '}
                        <span className="text-xs text-slate-400">({s.confidence})</span>
                      </span>
                    ) : (
                      <input
                        className="w-16 px-2 py-1 text-xs border border-slate-200 rounded-lg text-right"
                        inputMode="decimal"
                        placeholder="mark"
                        aria-label={`Edit mark for ${s.studentLabel}`}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setEditedScores((prev) => ({
                            ...prev,
                            [s.studentLabel.trim().toLowerCase()]: v,
                          }));
                        }}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function CandidateRow({
  candidate,
  maxMarks,
  busy,
  onSave,
}: {
  candidate: ExamCandidate;
  maxMarks: number;
  busy: boolean;
  onSave: (score: number | null) => void;
}) {
  const [value, setValue] = useState(candidate.score == null ? '' : String(candidate.score));
  useEffect(() => {
    setValue(candidate.score == null ? '' : String(candidate.score));
  }, [candidate.score]);
  const pct = pctFor(value === '' ? null : Number(value), maxMarks);

  return (
    <tr>
      <td className="py-2 font-semibold text-slate-800">{candidate.studentName ?? candidate.studentId}</td>
      <td className="py-2 text-right">
        <input
          className="w-20 px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-right"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Mark for ${candidate.studentName ?? candidate.studentId}`}
        />
      </td>
      <td className="py-2 text-right text-slate-500">{pct == null ? '—' : `${pct}%`}</td>
      <td className="py-2 text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || value === ''}
          onClick={() => onSave(value === '' ? null : Number(value))}
        >
          {busy ? '…' : 'Save'}
        </Button>
      </td>
    </tr>
  );
}
