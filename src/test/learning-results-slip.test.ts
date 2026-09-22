import { describe, it, expect } from 'vitest';
import { buildResultsSlip } from '../modules/learning/resultsSlipDomain';
import { DEFAULT_BANDS, UG_DIVISION_PRESET, type GradingScale } from '../modules/learning/gradingDomain';

const scale: GradingScale = {
  id: 'g1',
  schoolId: 's1',
  name: 'Default',
  formula: 'aggregate_division',
  bands: DEFAULT_BANDS,
  divisions: UG_DIVISION_PRESET,
};

describe('P3-F results slip (official one-pager)', () => {
  it('builds a complete slip payload from the one gradebook', () => {
    const { snapshot, overall } = buildResultsSlip(scale, {
      schoolName: "Grace's Cambridge Centre",
      schoolCode: 'GCC',
      learnerName: 'Amari Kyomugisha',
      admissionNumber: 'GCC-2026-014',
      className: 'Primary 5',
      termLabel: 'Term 2, 2026',
      examTitle: 'End of Term 2',
      marks: [
        { subjectCode: 'MATH', subjectName: 'Mathematics', score: 82, maxScore: 100 },
        { subjectCode: 'ENG', subjectName: 'English', score: 76, maxScore: 100 },
        { subjectCode: 'SCI', subjectName: 'Science', score: 88, maxScore: 100 },
      ],
    });
    expect(snapshot.kind).toBe('results_slip');
    expect(snapshot.subjects).toHaveLength(3);
    expect(overall.division).toBe('Division 1');
    expect(snapshot.divisionLabel).toBe('Division 1');
    expect(snapshot.footer).toMatch(/not a national examination certificate/i);
    expect(snapshot.issuedByTitle).toBe('Head Teacher');
  });

  it('slip freezes marks (immutable document law)', () => {
    const marks = [{ subjectCode: 'MATH', subjectName: 'Mathematics', score: 50, maxScore: 100 }];
    const { snapshot } = buildResultsSlip({ ...scale, formula: 'mean' }, {
      schoolName: 'S',
      learnerName: 'L',
      termLabel: 'T2',
      marks,
    });
    marks[0].score = 0;
    expect(snapshot.subjects[0].score).toBe(50);
  });
});
