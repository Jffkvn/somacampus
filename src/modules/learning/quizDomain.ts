/**
 * P2A-1 deterministic quiz scoring (pure). AI never writes scores.
 * Score = sum of marks for items where the learner's answer matches the key.
 */

export type QuizQuestionType = 'mcq' | 'true_false' | 'matching' | 'short_answer';

export interface QuizQuestion {
  id: string;
  questionType: QuizQuestionType;
  prompt: string;
  options: unknown;
  answerKey: Record<string, unknown>;
  defaultMarks: number;
}

export interface QuizItem {
  questionId: string;
  marks: number;
}

export interface QuizAnswer {
  /** mcq */
  optionId?: string;
  /** true_false */
  value?: boolean;
  /** short_answer */
  text?: string;
  /** matching: [{left, right}] */
  pairs?: Array<{ left: string; right: string }>;
}

export type QuizAnswers = Record<string, QuizAnswer>;

export interface ItemScore {
  questionId: string;
  points: number;
  maxPoints: number;
  correct: boolean;
}

export interface QuizScore {
  score: number;
  maxScore: number;
  breakdown: Record<string, ItemScore>;
}

function normalizeShort(text: string | undefined, caseSensitive: boolean): string {
  const t = (text ?? '').trim();
  return caseSensitive ? t : t.toLowerCase();
}

export function scoreQuiz(
  questions: QuizQuestion[],
  items: QuizItem[],
  answers: QuizAnswers,
): QuizScore {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const breakdown: Record<string, ItemScore> = {};
  let score = 0;
  let maxScore = 0;

  for (const item of items) {
    const q = byId.get(item.questionId);
    const marks = Number(item.marks) || q?.defaultMarks || 0;
    maxScore += marks;
    const answer = answers[item.questionId];
    let correct = false;

    if (q && answer) {
      const key = q.answerKey ?? {};
      if (q.questionType === 'mcq') {
        correct = Boolean(answer.optionId) && answer.optionId === key.correct_option_id;
      } else if (q.questionType === 'true_false') {
        correct =
          typeof answer.value === 'boolean' && answer.value === Boolean(key.correct);
      } else if (q.questionType === 'short_answer') {
        const accepted = Array.isArray(key.accepted) ? (key.accepted as string[]) : [];
        const caseSensitive = Boolean(key.case_sensitive);
        const given = normalizeShort(answer.text, caseSensitive);
        correct = accepted.some((a) => normalizeShort(a, caseSensitive) === given && given.length > 0);
      } else if (q.questionType === 'matching') {
        const correctPairs = Array.isArray(key.correct_pairs)
          ? (key.correct_pairs as Array<{ left: string; right: string }>)
          : [];
        const givenPairs = answer.pairs ?? [];
        const match = (l: string, r: string) =>
          correctPairs.some((cp) => cp.left === l && cp.right === r);
        correct =
          givenPairs.length === correctPairs.length &&
          givenPairs.every((p) => match(p.left, p.right));
      }
    }

    const points = correct ? marks : 0;
    score += points;
    breakdown[item.questionId] = {
      questionId: item.questionId,
      points,
      maxPoints: marks,
      correct,
    };
  }

  return { score, maxScore, breakdown };
}

export function isPassing(score: number, passMark: number | null | undefined): boolean {
  if (passMark == null) return true;
  return score >= Number(passMark);
}

export function validateQuestionKey(q: {
  questionType: QuizQuestionType;
  prompt: string;
  answerKey: Record<string, unknown>;
}): void {
  if (!q.prompt?.trim()) throw new Error('quiz: prompt is required');
  const key = q.answerKey ?? {};
  if (q.questionType === 'mcq' && !key.correct_option_id) {
    throw new Error('quiz: mcq requires answerKey.correct_option_id');
  }
  if (q.questionType === 'true_false' && typeof key.correct !== 'boolean') {
    throw new Error('quiz: true_false requires answerKey.correct boolean');
  }
  if (q.questionType === 'short_answer' && !(key.accepted as unknown[] | undefined)?.length) {
    throw new Error('quiz: short_answer requires answerKey.accepted[]');
  }
  if (q.questionType === 'matching' && !(key.correct_pairs as unknown[] | undefined)?.length) {
    throw new Error('quiz: matching requires answerKey.correct_pairs[]');
  }
}
