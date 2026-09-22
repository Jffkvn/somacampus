import { describe, it, expect } from 'vitest';
import {
  draftExamPaper,
  parsePastPaperStructure,
} from '../modules/learning/paperDraftDomain';

const pastPaper = `Grace Primary School
Primary 5 Mathematics — End of Term 2
Time: 1 hour 30 minutes
Total: 50 marks

Section A: Short questions
1. Calculate 7 × 8. [2 marks]
2. Work out 3/4 + 1/4. [2 marks]

Section B: Structured
3. Explain why 0.5 = 1/2. [6 marks]
`;

describe('P3-D paper production (backend AI draft)', () => {
  it('parses past-paper structure (sections, stems, time, total)', () => {
    const s = parsePastPaperStructure(pastPaper);
    expect(s.sections.map((x) => x.code)).toEqual(['A', 'B']);
    expect(s.sections[0].n).toBe(2);
    expect(s.stems).toContain('Calculate');
    expect(s.timeMinutes).toBe(90);
    expect(s.totalMarks).toBe(50);
  });

  it('backend AI drafts from structure + teacher topics (isDraft until approve)', () => {
    const s = parsePastPaperStructure(pastPaper);
    const draft = draftExamPaper(s, {
      title: 'P5 Mathematics — End of Term 2',
      termLabel: 'Term 2, 2026',
      topics: ['fractions', 'measurement', 'geometry'],
      instructions: 'Answer all questions.',
    });
    expect(draft.header.isDraft).toBe(true);
    expect(draft.header.origin).toBe('ai_draft');
    expect(draft.sections).toHaveLength(2);
    expect(draft.sections[0].questions[0].topic).toBe('fractions');
    expect(draft.sections[0].questions.length).toBe(2);
  });

  it('requires teacher topics (AI will not invent a syllabus)', () => {
    const s = parsePastPaperStructure(pastPaper);
    expect(() =>
      draftExamPaper(s, { title: 'T', termLabel: 'T2', topics: [] }),
    ).toThrow(/topics/i);
  });
});
