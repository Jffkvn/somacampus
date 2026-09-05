import { describe, it, expect } from 'vitest';

import {
  composeParentUpdate,
  composeAnnouncement,
  explainFeedback,
  BANNED_WORDS,
} from '../modules/communication/aiDraftService';

const BANNED_STEMS = ['diagnos', 'disorder', 'condition', 'syndrome'];
const hasBannedWord = (s: string) => {
  const low = s.toLowerCase();
  return BANNED_STEMS.some((stem) => low.includes(stem));
};

describe('AI draft composer (Phase 8F Task 1) — deterministic, evidence-grounded', () => {
  it('(a) parent update from 2 parent_visible observations contains both facts + name, no diagnosis words', () => {
    const draft = composeParentUpdate('Amina', [
      { observationText: 'Amina read aloud fluently during English group work.', visibility: 'parent_visible' },
      { observationText: 'Amina shared her crayons kindly with her desk partner.', visibility: 'parent_visible' },
    ]);

    expect(draft.body).toContain('Amina');
    expect(draft.body.toLowerCase()).toContain('read aloud fluently');
    expect(draft.body.toLowerCase()).toContain('shared her crayons');
    expect(hasBannedWord(draft.body)).toBe(false);
    expect(draft.isAiDrafted).toBe(true);
    expect(draft.requiresHumanApproval).toBe(true);
  });

  it('(b) internal_only AND academic_team observations passed in are EXCLUDED from parent draft', () => {
    const draft = composeParentUpdate('Brian', [
      { observationText: 'Brian completed his maths exercise neatly.', visibility: 'parent_visible' },
      { observationText: 'SECRET-XYZ staff-only note about home visit.', visibility: 'internal_only' },
      { observationText: 'SECRET-ABC team-only note about intervention groups.', visibility: 'academic_team' },
    ]);

    expect(draft.body.toLowerCase()).toContain('maths exercise');
    expect(draft.body).not.toContain('SECRET-XYZ');
    expect(draft.body).not.toContain('SECRET-ABC');
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

  it('(e2) Explain keeps noun-bearing sentences: key noun outside the first sentence is still present', () => {
    const input =
      'The morning assembly was very long and quite noisy. Amina received a certificate for her reading progress.';
    const out = explainFeedback(input, ['Amina', 'certificate']);

    expect(out.text.toLowerCase()).toContain('amina');
    expect(out.text.toLowerCase()).toContain('certificate');
    // The first sentence carries none of the key nouns, so it is dropped.
    expect(out.text.toLowerCase()).not.toContain('assembly');
    expect(out.text.length).toBeLessThanOrEqual(input.length);
  });

  it('plural diagnosis words are sanitized (disorders/conditions/syndromes/diagnoses)', () => {
    for (const plural of ['disorders', 'conditions', 'syndromes', 'diagnoses']) {
      const draft = composeParentUpdate('Eve', [
        {
          observationText: `Eve participated well in group reading today, despite ${plural} noted elsewhere.`,
          visibility: 'parent_visible',
        },
      ]);
      expect(draft.body.toLowerCase()).not.toContain(plural);
      expect(hasBannedWord(draft.body)).toBe(false);
      expect(draft.body).toContain('[removed]');
    }
  });

  it('(f) empty evidence yields an honest empty draft, never fabricated', () => {
    const draft = composeParentUpdate('Denis', []);
    expect(draft.body).toBe('No approved observations to summarize yet.');
    expect(draft.sourceCount).toBe(0);
    expect(hasBannedWord(draft.body)).toBe(false);
  });

  it('BANNED_WORDS covers diagnosis vocabulary', () => {
    for (const w of ['diagnosed', 'disorder', 'condition', 'syndrome']) {
      expect(BANNED_WORDS.map((b) => b.toLowerCase())).toContain(w);
    }
  });
});
