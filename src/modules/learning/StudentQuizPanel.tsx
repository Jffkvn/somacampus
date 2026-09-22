/**
 * P2A-1 student quiz taker — deterministic keys only (never AI scores).
 * Draft autosave → submit → score from submit_learning_quiz_attempt.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, CheckCircle2, ListChecks } from 'lucide-react';
import { quizService, type LearningQuiz, type QuizAttempt } from './quizService';
import {
  scoreQuiz,
  isPassing,
  remainingSeconds,
  formatClock,
  shuffleOrder,
  type QuizAnswers,
  type QuizQuestion,
} from './quizDomain';

interface QuizPack {
  quiz: LearningQuiz;
  items: Array<{ question: QuizQuestion; marks: number; sortOrder: number }>;
}

export interface StudentQuizPanelProps {
  schoolId: string;
  studentId: string;
  /** One published quiz id (from activity / assignment link). */
  quizId: string;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50';

export const StudentQuizPanel: React.FC<StudentQuizPanelProps> = ({
  schoolId,
  studentId,
  quizId,
}) => {
  const [pack, setPack] = useState<QuizPack | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ score: number; maxScore: number; passed: boolean } | null>(null);
  const [clockLeft, setClockLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!attempt?.expiresAt || result) return;
    const tick = () => setClockLeft(remainingSeconds(attempt.expiresAt));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [attempt?.expiresAt, result]);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const p = await quizService.getQuizWithQuestions(quizId);
        if (!p) {
          setError('This quiz is not available.');
          return;
        }
        setPack(p);
        const a = await quizService.startOrResumeAttempt({ schoolId, quizId, studentId });
        setAttempt(a);
        setAnswers(a.answers ?? {});
        if (a.state === 'scored' && a.score != null) {
          setResult({
            score: a.score,
            maxScore: a.maxScore ?? 0,
            passed: isPassing(a.score, p.quiz.passMark),
          });
        }
      } catch (err: any) {
        console.error('Quiz load failed:', err);
        setError('We could not load this quiz. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [schoolId, studentId, quizId]);

  const preview = useMemo(() => {
    if (!pack || result) return null;
    return scoreQuiz(
      pack.items.map((i) => i.question),
      pack.items.map((i) => ({ questionId: i.question.id, marks: i.marks })),
      answers,
    );
  }, [pack, answers, result]);

  const displayItems = useMemo(() => {
    if (!pack) return [];
    const seed = (attempt?.id ?? pack.quiz.id)
      .split('')
      .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    let items = pack.items;
    if (pack.quiz.shuffleQuestions) items = shuffleOrder(items, seed);
    return items.map((item) => {
      if (!pack.quiz.shuffleOptions || !Array.isArray(item.question.options)) return item;
      const opts = shuffleOrder(item.question.options as any[], seed + item.question.id.length);
      return { ...item, question: { ...item.question, options: opts } };
    });
  }, [pack, attempt?.id]);

  const setAnswer = (questionId: string, patch: QuizAnswers[string]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }));
  };

  const saveDraft = async () => {
    if (!attempt) return;
    setIsSaving(true);
    try {
      await quizService.saveDraft(attempt.id, answers);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const submit = async () => {
    if (!attempt || !pack) return;
    setIsSaving(true);
    setError(null);
    try {
      const scored = await quizService.submitAttempt(attempt.id, answers);
      setAttempt(scored);
      setResult({
        score: scored.score ?? 0,
        maxScore: scored.maxScore ?? 0,
        passed: isPassing(scored.score ?? 0, pack.quiz.passMark),
      });
    } catch (err: any) {
      console.error('Quiz submit failed:', err);
      const raw = String(err?.message ?? '');
      setError(
        /already submitted|max_attempts|permission/i.test(raw)
          ? raw
          : 'We could not submit your quiz. Your answers are saved — try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-slate-400">Loading quiz…</CardContent>
      </Card>
    );
  }

  if (!pack) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-rose-700">{error ?? 'Quiz unavailable'}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-brand-teal" /> {pack.quiz.title}
            </span>
          </CardTitle>
          <CardDescription>
            {pack.quiz.instructions || 'Answer every question. Scores come from the answer key only.'}
            {pack.quiz.passMark != null ? ` · Pass ${pack.quiz.passMark}` : ''}
            {` · Attempt ${attempt?.attemptNo ?? 1}/${pack.quiz.maxAttempts}`}
          </CardDescription>
        </div>
        {result ? (
          <StatusPill status={result.passed ? 'success' : 'critical'} label={result.passed ? 'passed' : 'not yet'} />
        ) : clockLeft != null ? (
          <StatusPill
            status={clockLeft < 60 ? 'warning' : 'info'}
            label={`⏱ ${formatClock(clockLeft)}`}
          />
        ) : (
          <StatusPill status="pending" label="in progress" />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result ? (
          <div className="text-center py-4 space-y-2">
            <CheckCircle2 className={`w-10 h-10 mx-auto ${result.passed ? 'text-emerald-600' : 'text-amber-600'}`} />
            <p className="text-lg font-bold text-slate-900">
              {result.score}/{result.maxScore}
            </p>
            <p className="text-sm text-slate-500">
              Marked by answer key (deterministic). Progress ≠ completion until you review feedback.
            </p>
          </div>
        ) : (
          <>
            {displayItems.map((item, idx) => {
              const q = item.question;
              const a = answers[q.id] ?? {};
              return (
                <div key={q.id} className="py-3 border-b border-slate-100 last:border-b-0">
                  <p className="text-sm font-semibold text-slate-800 mb-2">
                    {idx + 1}. {q.prompt}
                    <span className="ml-2 text-xs font-normal text-slate-400">{item.marks} mark(s)</span>
                  </p>

                  {q.questionType === 'mcq' &&
                    (Array.isArray(q.options) ? q.options : []).map((o: any) => (
                      <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700 py-1">
                        <input
                          type="radio"
                          name={q.id}
                          checked={a.optionId === o.id}
                          onChange={() => setAnswer(q.id, { optionId: o.id })}
                        />
                        {o.text}
                      </label>
                    ))}

                  {q.questionType === 'true_false' && (
                    <div className="flex gap-3">
                      {[true, false].map((v) => (
                        <label key={String(v)} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={q.id}
                            checked={a.value === v}
                            onChange={() => setAnswer(q.id, { value: v })}
                          />
                          {v ? 'True' : 'False'}
                        </label>
                      ))}
                    </div>
                  )}

                  {q.questionType === 'short_answer' && (
                    <input
                      className={inputClass}
                      value={a.text ?? ''}
                      onChange={(e) => setAnswer(q.id, { text: e.target.value })}
                      placeholder="Your answer"
                    />
                  )}

                  {q.questionType === 'matching' && (
                    <div className="space-y-2">
                      {(Array.isArray((q as any).options?.pairs)
                        ? (q as any).options.pairs
                        : []
                      ).map((p: any) => (
                        <div key={p.left} className="flex items-center gap-2 text-sm">
                          <span className="w-32 shrink-0 text-slate-700">{p.left}</span>
                          <input
                            className={inputClass}
                            placeholder="Match to…"
                            value={
                              (a.pairs ?? []).find((x) => x.left === p.left)?.right ?? ''
                            }
                            onChange={(e) => {
                              const right = e.target.value;
                              const pairs = [...(a.pairs ?? []).filter((x) => x.left !== p.left)];
                              if (right) pairs.push({ left: p.left, right });
                              setAnswer(q.id, { pairs });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                {preview
                  ? `Preview score is informational — final score is recorded on submit.`
                  : ''}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={isSaving} onClick={() => void saveDraft()}>
                  {isSaving ? 'Saving…' : 'Save draft'}
                </Button>
                <Button
                  type="button"
                  disabled={isSaving || attempt?.state !== 'draft'}
                  onClick={() => void submit()}
                  className="bg-brand-teal text-white"
                >
                  Submit quiz
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
