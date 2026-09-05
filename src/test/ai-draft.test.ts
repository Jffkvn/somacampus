import { describe, it, expect } from 'vitest';

import {
  composeParentUpdate,
  composeAnnouncement,
  explainFeedback,
  BANNED_WORDS,
} from '../modules/communication/aiDraftService';

const DIAGNOSIS_WORDS = ['diagnosed', 'disorder', 'condition', 'syndrome'];
const hasDiagnosisWord = (s: string) =>
  DIAGNOSIS_WORDS.some((w) => s.toLowerCase().includes(w));

describe('AI draft composer (Phase 8F Task 1) — deterministic, evidence-grounded', () => {
  it('(a) parent update from 2 parent_visible observations contains both facts + name, no diagnosis words', () => {
    const draft = composeParentUpdate('Amina', [
      { observationText: 'Amina read aloud fluently during English group work.', visibility: 'parent_visible' },
      { observationText: 'Amina shared her crayons kindly with her desk partner.', visibility: 'parent_visible' },
    ]);

    expect(draft.body).toContain('Amina');
    expect(draft.body.toLowerCase()).toContain('read aloud fluently');
    expect(draft.body.toLowerCase()).toContain('shared her crayons');
    expect(hasDiagnosisWord(draft.body)).toBe(false);
    expect(draft.isAiDrafted).toBe(true);
    expect(draft.requiresHumanApproval).toBe(true);
  });

  it('(b) internal_only observation passed in is EXCLUDED from parent draft', () => {
    const draft = composeParentUpdate('Brian', [
      { observationText: 'Brian completed his maths exercise neatly.', visibility: 'parent_visible' },
      { observationText: 'SECRET-XYZ staff-only note about home visit.', visibility: 'internal_only' },
    ]);

    expect(draft.body.toLowerCase()).toContain('maths exercise');
    expect(draft.body).not.toContain('SECRET-XYZ');
    expect(draft.sourceCount).toBe(1);
  });

  it('(c) amounts in source evidence never surface in parent draft', () => {
    const draft = composeParentUpdate('Cathy', [
      {
        observationText: 'Cathy worked well in science. Fee balance of UGX 50,000 remains unpaid.',
        visibility: 'parent_visible',
      },
    ]);

    expect(draft.body).not.toMatch(/UGX/i);
    expect(draft.body).not.toContain('50,000');
    expect(draft.body).not.toContain('50000');
    expect(draft.body).not.toContain('20000');
    expect(draft.body).not.toMatch(/\d/);
  });

  it('(d) announcement draft contains all points and is flagged is_ai_drafted', () => {
    const draft = composeAnnouncement({
      title: 'Sports Day',
      points: ['Friday at the main field.', 'Bring packed lunch.', 'Parents welcome from noon.'],
      audience: 'parents',
    });

    for (const p of ['Friday at the main field.', 'Bring packed lunch.', 'Parents welcome from noon.']) {
      expect(draft.body).toContain(p);
    }
    expect(draft.title).toContain('Sports Day');
    expect(draft.isAiDrafted).toBe(true);
    expect(draft.requiresHumanApproval).toBe(true);
  });

  it('(e) Explain output adds no facts: shorter-or-equal and keeps key nouns', () => {
    const input =
      'Amina read aloud very fluently during English group work and she really helped her desk partner patiently.';
    const keyNouns = ['Amina', 'English', 'partner'];
    const out = explainFeedback(input, keyNouns);

    expect(out.text.length).toBeLessThanOrEqual(input.length);
    for (const noun of keyNouns) {
      expect(out.text.toLowerCase()).toContain(noun.toLowerCase());
    }
  });

  it('(f) empty evidence yields an honest empty draft, never fabricated', () => {
    const draft = composeParentUpdate('Denis', []);
    expect(draft.body).toBe('No approved observations to summarize yet.');
    expect(draft.sourceCount).toBe(0);
    expect(hasDiagnosisWord(draft.body)).toBe(false);
  });

  it('BANNED_WORDS covers diagnosis vocabulary', () => {
    for (const w of ['diagnosed', 'disorder', 'condition', 'syndrome']) {
      expect(BANNED_WORDS.map((b) => b.toLowerCase())).toContain(w);
    }
  });
});
