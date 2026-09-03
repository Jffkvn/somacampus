import { describe, it, expect } from 'vitest';
import { curriculumImportService } from '../modules/curriculum/curriculumImportService';
import { CAMBRIDGE_PRIMARY_PACK } from '../curriculum/packs/cambridge_primary';

describe('Curriculum Import Service Pre-Flight Validation Suite', () => {
  it('validates the official Cambridge Primary pack as structurally valid', () => {
    const result = curriculumImportService.validatePack(CAMBRIDGE_PRIMARY_PACK);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a pack with duplicate objective codes', () => {
    const corruptedPack = JSON.parse(JSON.stringify(CAMBRIDGE_PRIMARY_PACK));
    // Duplicate 5Nn.01 into English
    corruptedPack.subjects.english.objectives.push({
      code: '5Nn.01',
      stage_number: 5,
      strand_code: 'R',
      sub_strand_code: 'Ri',
      title: 'Conflicting duplicate',
      description: 'Duplicate code test',
      progression_order: 99,
    });

    const result = curriculumImportService.validatePack(corruptedPack);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate objective code detected: '5Nn.01'"))).toBe(true);
  });

  it('rejects a pack referencing an undeclared stage number', () => {
    const corruptedPack = JSON.parse(JSON.stringify(CAMBRIDGE_PRIMARY_PACK));
    corruptedPack.subjects.mathematics.objectives[0].stage_number = 99;

    const result = curriculumImportService.validatePack(corruptedPack);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("references non-existent stage number '99'"))).toBe(true);
  });

  it('rejects self-referencing prerequisite relationships', () => {
    const corruptedPack = JSON.parse(JSON.stringify(CAMBRIDGE_PRIMARY_PACK));
    corruptedPack.prerequisites.push({
      source_objective_code: '5Nn.01',
      target_objective_code: '5Nn.01',
      relationship_type: 'prerequisite',
      notes: 'Invalid self-loop',
    });

    const result = curriculumImportService.validatePack(corruptedPack);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Self-referencing prerequisite detected"))).toBe(true);
  });

  it('rejects prerequisite referencing non-existent objective code', () => {
    const corruptedPack = JSON.parse(JSON.stringify(CAMBRIDGE_PRIMARY_PACK));
    corruptedPack.prerequisites.push({
      source_objective_code: '99XYZ.99',
      target_objective_code: '5Nn.01',
      relationship_type: 'prerequisite',
      notes: 'Dangling reference',
    });

    const result = curriculumImportService.validatePack(corruptedPack);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("references non-existent source objective '99XYZ.99'"))).toBe(true);
  });
});
