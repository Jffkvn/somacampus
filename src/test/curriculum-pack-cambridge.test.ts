import { describe, it, expect } from 'vitest';
import { CAMBRIDGE_PRIMARY_PACK } from '../curriculum/packs/cambridge_primary';

describe('Phase 6: Cambridge Primary Pilot Pack #1 Architecture Suite', () => {
  it('enforces manifest integrity and demonstration fixture safety (Guardrail C)', () => {
    const { manifest } = CAMBRIDGE_PRIMARY_PACK;
    expect(manifest.framework_code).toBe('CAMBRIDGE_PRIMARY');
    expect(manifest.version_code).toBe('2026.1');
    expect(manifest.release_year).toBe(2026);
    expect(manifest.is_authoritative).toBe(false);
    expect(manifest.provenance_source).toBe('Demonstration Fixture');
    expect(manifest.subjects).toEqual([
      'mathematics',
      'english',
      'science',
      'global_perspectives',
      'computing',
    ]);
  });

  it('declares 6 complete stages with age ranges', () => {
    const { stages } = CAMBRIDGE_PRIMARY_PACK;
    expect(stages).toHaveLength(6);
    expect(stages.map((s) => s.stage_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(stages.find((s) => s.stage_number === 5)?.name).toBe('Stage 5');
  });

  it('contains the 5 mandatory pilot subjects', () => {
    const { subjects } = CAMBRIDGE_PRIMARY_PACK;
    const codes = Object.values(subjects).map((s) => s.subject.code);
    expect(codes).toContain('MATH');
    expect(codes).toContain('ENG');
    expect(codes).toContain('SCI');
    expect(codes).toContain('GP');
    expect(codes).toContain('COMP');
  });

  it('validates Guardrail H: Optional Hierarchy Depth across subjects', () => {
    const { subjects } = CAMBRIDGE_PRIMARY_PACK;

    // 1. Mathematics uses 3-level hierarchy (Strand -> Sub-strand -> Objective)
    const mathStrands = subjects.mathematics.strands;
    expect(mathStrands.some((s) => (s.sub_strands?.length ?? 0) > 0)).toBe(true);
    const mathObjWithSub = subjects.mathematics.objectives.find((o) => o.code === '5Nn.01');
    expect(mathObjWithSub?.sub_strand_code).toBe('Nf');

    // 2. English uses 3-level hierarchy (Strand -> Sub-strand -> Objective)
    const engStrands = subjects.english.strands;
    expect(engStrands.some((s) => (s.sub_strands?.length ?? 0) > 0)).toBe(true);
    const engObjWithSub = subjects.english.objectives.find((o) => o.code === '5Ri.01');
    expect(engObjWithSub?.sub_strand_code).toBe('Ri');

    // 3. Global Perspectives uses 2-level hierarchy (Strand -> Objective) with NO synthetic sub-strands
    const gpStrands = subjects.global_perspectives.strands;
    expect(gpStrands.every((s) => !s.sub_strands || s.sub_strands.length === 0)).toBe(true);
    const gpObjectives = subjects.global_perspectives.objectives;
    expect(gpObjectives.every((o) => o.sub_strand_code === null || o.sub_strand_code === undefined)).toBe(true);

    // 4. Computing uses 2-level hierarchy (Strand -> Objective) with NO synthetic sub-strands
    const compStrands = subjects.computing.strands;
    expect(compStrands.every((s) => !s.sub_strands || s.sub_strands.length === 0)).toBe(true);
    const compObjectives = subjects.computing.objectives;
    expect(compObjectives.every((o) => o.sub_strand_code === null || o.sub_strand_code === undefined)).toBe(true);
  });

  it('verifies objective codes follow standard format and are globally unique across the pack', () => {
    const { subjects } = CAMBRIDGE_PRIMARY_PACK;
    const seenCodes = new Set<string>();

    for (const sub of Object.values(subjects)) {
      for (const obj of sub.objectives) {
        expect(seenCodes.has(obj.code)).toBe(false);
        seenCodes.add(obj.code);
        // Standard Cambridge primary code shape: StageNumber + Strand/SubStrand + Sequence (e.g. 5Nn.01, 5RES.01)
        expect(obj.code).toMatch(/^[1-6][A-Za-z]+\.[0-9]{2}$/);
      }
    }
    expect(seenCodes.size).toBeGreaterThanOrEqual(30);
  });

  it('validates prerequisite graph integrity without dangling references or self-loops', () => {
    const { subjects, prerequisites } = CAMBRIDGE_PRIMARY_PACK;
    const allCodes = new Set<string>();
    for (const sub of Object.values(subjects)) {
      for (const obj of sub.objectives) {
        allCodes.add(obj.code);
      }
    }

    expect(prerequisites.length).toBeGreaterThan(0);
    for (const rel of prerequisites) {
      expect(allCodes.has(rel.source_objective_code)).toBe(true);
      expect(allCodes.has(rel.target_objective_code)).toBe(true);
      expect(rel.source_objective_code).not.toBe(rel.target_objective_code);
      expect(['prerequisite', 'precursor', 'extension', 'cross_curricular']).toContain(
        rel.relationship_type
      );
    }
  });
});
