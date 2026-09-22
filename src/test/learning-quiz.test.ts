import { describe, it, expect } from 'vitest';
import {
  scoreQuiz,
  isPassing,
  validateQuestionKey,
  type QuizQuestion,
} from '../modules/learning/quizDomain';

const mcq: QuizQuestion = {
  id: 'q1',
  questionType: 'mcq',
  prompt: 'What is 7 × 8?',
  options: [
    { id: 'a', text: '54' },
    { id: 'b', text: '56' },
    { id: 'c', text: '64' },
  ],
  answerKey: { correct_option_id: 'b' },
  defaultMarks: 1,
};

const tf: QuizQuestion = {
  id: 'q2',
  questionType: 'true_false',
  prompt: 'Plants need sunlight.',
  options: [],
  answerKey: { correct: true },
  defaultMarks: 1,
};

const short: QuizQuestion = {
  id: 'q3',
  questionType: 'short_answer',
  prompt: 'Write 56 in digits.',
  options: [],
  answerKey: { accepted: ['56', 'fifty-six'], case_sensitive: false },
  defaultMarks: 2,
};

const match: QuizQuestion = {
  id: 'q4',
  questionType: 'matching',
  prompt: 'Match shapes.',
  options: [],
  answerKey: {
    correct_pairs: [
      { left: 'triangle', right: '3 sides' },
      { left: 'square', right: '4 sides' },
    ],
  },
  defaultMarks: 2,
};

const items = [
  { questionId: 'q1', marks: 1 },
  { questionId: 'q2', marks: 1 },
  { questionId: 'q3', marks: 2 },
  { questionId: 'q4', marks: 2 },
];

describe('P2A-1 deterministic quiz scoring', () => {
  it('scores MCQ/TF/short/matching by key only (never AI)', () => {
    const result = scoreQuiz([mcq, tf, short, match], items, {
      q1: { optionId: 'b' },
      q2: { value: true },
      q3: { text: 'FIFTY-SIX' },
      q4: {
        pairs: [
          { left: 'square', right: '4 sides' },
          { left: 'triangle', right: '3 sides' },
        ],
      },
    });
    expect(result.score).toBe(6);
    expect(result.maxScore).toBe(6);
    expect(result.breakdown.q1.correct).toBe(true);
    expect(result.breakdown.q4.correct).toBe(true);
  });

  it('is all-or-nothing per item on v1 matching / short answer', () => {
    const result = scoreQuiz([mcq, short], items.slice(0, 2).concat([{ questionId: 'q3', marks: 2 }]), {
      q1: { optionId: 'a' },
      q3: { text: '56' },
    });
    expect(result.breakdown.q1.correct).toBe(false);
    expect(result.breakdown.q3.correct).toBe(true);
    expect(result.score).toBe(2);
  });

  it('rejects matching when pair sets differ', () => {
    const result = scoreQuiz([match], [{ questionId: 'q4', marks: 2 }], {
      q4: { pairs: [{ left: 'triangle', right: '3 sides' }] },
    });
    expect(result.score).toBe(0);
  });

  it('pass mark is explicit', () => {
    expect(isPassing(4, 4)).toBe(true);
    expect(isPassing(3, 4)).toBe(false);
    expect(isPassing(0, null)).toBe(true);
  });

  it('validateQuestionKey fails closed on incomplete keys', () => {
    expect(() => validateQuestionKey({ questionType: 'mcq', prompt: 'x', answerKey: {} })).toThrow(
      /correct_option_id/,
    );
    expect(() =>
      validateQuestionKey({ questionType: 'short_answer', prompt: 'x', answerKey: {} }),
    ).toThrow(/accepted/);
    expect(() =>
      validateQuestionKey({
        questionType: 'true_false',
        prompt: 'x',
        answerKey: { correct: true },
      }),
    ).not.toThrow();
  });
});
