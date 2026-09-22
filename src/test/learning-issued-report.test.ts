import { describe, it, expect } from 'vitest';
import { buildReportSnapshot } from '../modules/learning/issuedReportService';
import { DEFAULT_BANDS, UG_DIVISION_PRESET, type GradingScale } from '../modules/learning/gradingDomain';

const scale: GradingScale = {
  id: 'g1',
  schoolId: 's1',
  name: 'Default',
  formula: 'mean',
  bands: DEFAULT_BANDS,
};

describe('P3-C issued report snapshots (immutable)', () => {
  it('freezes subjects + overall at issue time', () => {
    const marks = [
      { subjectCode: 'MATH', subjectName: 'Mathematics', score: 82, maxScore: 100 },
      { subjectCode: 'ENG', subjectName: 'English', score: 76, maxScore: 100 },
    ];
    const { snapshot, overall } = buildReportSnapshot(scale, {
      schoolName: "Grace's Cambridge Centre",
      learnerName: 'Amari Kyomugisha',
      termLabel: 'Term 2, 2026',
      marks,
      teacherComment: 'Strong term.',
    });
    expect(overall.value).toBe(79);
    expect(snapshot.overallLabel).toBe('79%');
    expect((snapshot.subjects as unknown[]).length).toBe(2);
    expect(snapshot.teacherComment).toBe('Strong term.');
  });

  it('snapshot is a frozen document (later mark changes do not affect it)', () => {
    const marks = [
      { subjectCode: 'MATH', subjectName: 'Mathematics', score: 82, maxScore: 100 },
    ];
    const { snapshot } = buildReportSnapshot(scale, {
      schoolName: 'S',
      learnerName: 'L',
      termLabel: 'T2',
      marks,
    });
    marks[0].score = 0;
    expect((snapshot.subjects as any[])[0].score).toBe(82);
  });

  it('aggregate formula freezes division in the snapshot', () => {
    const aggScale: GradingScale = {
      ...scale,
      formula: 'aggregate_division',
      divisions: UG_DIVISION_PRESET,
    };
    const { snapshot } = buildReportSnapshot(aggScale, {
      schoolName: 'S',
      learnerName: 'L',
      termLabel: 'T2',
      marks: [
        { subjectCode: 'MATH', subjectName: 'Mathematics', score: 82, maxScore: 100 },
        { subjectCode: 'ENG', subjectName: 'English', score: 76, maxScore: 100 },
        { subjectCode: 'SCI', subjectName: 'Science', score: 88, maxScore: 100 },
      ],
    });
    expect(snapshot.divisionLabel).toBe('Division 1');
    expect(snapshot.formula).toBe('aggregate_division');
  });
});
