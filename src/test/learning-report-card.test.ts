import { describe, it, expect } from 'vitest';
import {
  buildSubjectReport,
  buildTermReportCard,
  deriveStrengthsAndNextSteps,
  evidenceLevelFor,
  pct,
} from '../modules/learning/reportCardDomain';

describe('P2C-1 report card domain (one gradebook, honest evidence)', () => {
  it('computes pct and evidence level honestly', () => {
    expect(pct(8, 10)).toBe(80);
    expect(pct(8, 0)).toBeNull();
    expect(evidenceLevelFor(0)).toBe('none');
    expect(evidenceLevelFor(2)).toBe('thin');
    expect(evidenceLevelFor(5)).toBe('strong');
  });

  it('derives strengths ≥75% and next steps <60% from objectives', () => {
    const { strengths, nextSteps } = deriveStrengthsAndNextSteps([
      { objectiveCode: 'M1', objectiveTitle: 'Fractions', score: 9, maxScore: 10, pct: 90, evidenceCount: 3 },
      { objectiveCode: 'M2', objectiveTitle: 'Geometry', score: 5, maxScore: 10, pct: 50, evidenceCount: 3 },
      { objectiveCode: 'M3', objectiveTitle: 'Measurement', score: 7, maxScore: 10, pct: 70, evidenceCount: 2 },
    ]);
    expect(strengths).toEqual(['Fractions']);
    expect(nextSteps).toEqual(['Geometry']);
  });

  it('subject average falls back to assessments and flags thin evidence', () => {
    const report = buildSubjectReport({
      subjectName: 'Mathematics',
      objectives: [],
      assessments: [
        { title: 'Quiz', resultSource: 'quiz', score: 4, maxScore: 5, feedback: null, markedAt: '2026-09-22' },
        { title: 'Homework', resultSource: 'rubric', score: 8, maxScore: 10, feedback: 'Strong method', markedAt: '2026-09-20' },
      ],
    });
    expect(report.averagePct).toBe(80);
    expect(report.evidenceLevel).toBe('thin');
  });

  it('builds a term report without inventing attendance or comments', () => {
    const card = buildTermReportCard({
      schoolName: "Grace's Cambridge Centre",
      learnerName: 'Amari Kyomugisha',
      termLabel: 'Term 1, 2026',
      subjects: [],
    });
    expect(card.teacherComment).toBeNull();
    expect(card.attendance.presentDays).toBeNull();
    expect(card.subjects).toEqual([]);
  });
});
