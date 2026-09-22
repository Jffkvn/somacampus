/**
 * P2D-3 structured peer review UI — teacher prompts only.
 * Formative: never writes the gradebook (peerReviewWritesGradebook === false).
 */
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, Users2 } from 'lucide-react';
import { peerReviewService } from './peerReviewService';
import { DEFAULT_PEER_PROMPTS, type PeerReviewTask } from './peerReviewDomain';

export interface PeerReviewPanelProps {
  schoolId: string;
  studentId?: string | null;
  workStudentId?: string | null;
  /** Teacher can author tasks. */
  canAuthor?: boolean;
  createdByPersonId?: string | null;
}

export const PeerReviewPanel: React.FC<PeerReviewPanelProps> = ({
  schoolId,
  studentId,
  workStudentId,
  canAuthor = false,
  createdByPersonId,
}) => {
  const [tasks, setTasks] = useState<PeerReviewTask[]>([]);
  const [active, setActive] = useState<PeerReviewTask | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);

  const load = async () => {
    try {
      setError(null);
      setTasks(await peerReviewService.listTasks(schoolId));
    } catch (err: any) {
      setError(err?.message ?? 'Could not load peer review tasks');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const submit = async () => {
    if (!active || !studentId || !workStudentId) return;
    setIsSaving(true);
    setError(null);
    try {
      await peerReviewService.submitResponse({
        schoolId,
        taskId: active.id,
        authorStudentId: studentId,
        workStudentId,
        prompts: active.prompts,
        answers,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Could not submit peer review');
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
              <Users2 className="w-4 h-4 text-brand-teal" /> Structured peer review
            </span>
          </CardTitle>
          <CardDescription>
            Teacher-owned prompts. Formative only — peer feedback never writes grades.
          </CardDescription>
        </div>
        <StatusPill status="neutral" label="not graded" />
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {done ? (
          <p className="text-sm font-semibold text-emerald-700">
            Peer review sent. Your teacher keeps the academic grade — this is formative help only.
          </p>
        ) : active && studentId && workStudentId ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">{active.title}</p>
            {active.instructions && (
              <p className="text-xs text-slate-500">{active.instructions}</p>
            )}
            {active.prompts.map((p) => (
              <div key={p.id}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{p.prompt}</label>
                <textarea
                  value={answers[p.id] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                />
              </div>
            ))}
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => void submit()}
              className="bg-brand-teal text-white"
            >
              {isSaving ? 'Sending…' : 'Send peer review'}
            </Button>
          </div>
        ) : (
          <>
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-400">No peer review tasks yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-400">
                        {t.prompts.length} prompt{t.prompts.length === 1 ? '' : 's'} · formative
                      </p>
                    </div>
                    {studentId && workStudentId ? (
                      <Button size="sm" variant="outline" onClick={() => setActive(t)}>
                        Start
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">Needs a review pair</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canAuthor && createdByPersonId && (
              <p className="text-[11px] text-slate-400">
                Default teacher prompts: {DEFAULT_PEER_PROMPTS.map((p) => p.id).join(' · ')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
