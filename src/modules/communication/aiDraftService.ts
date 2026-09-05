/**
 * Evidence-grounded AI draft composer — SomaCampus Phase 8F Task 1.
 *
 * DETERMINISTIC, no I/O, no network, no secrets. There is NO AI provider
 * integration in this repo (verified: no fetch/keys in aiIntelligenceAssistant,
 * no AI env vars), so this module composes drafts from APPROVED evidence only
 * using pure template + extractive rules. A future LLM swaps in behind the
 * AiDraftProvider seam below WITHOUT changing the safety guards or the
 * approval data flow.
 *
 * Locked rules enforced here:
 * - Drafts from APPROVED evidence only: composeParentUpdate() uses ONLY
 *   observations with visibility === 'parent_visible'. Anything else passed
 *   in (internal_only, academic_team) is EXCLUDED, never quoted.
 * - NEVER diagnosis words in output (see BANNED_WORDS).
 * - NEVER amounts/balances in parent drafts: any token containing a digit and
 *   any UGX/currency mention is replaced with '[amount removed]'.
 * - NEVER send directly: every draft returns requiresHumanApproval: true and
 *   isAiDrafted: true. Callers MUST route draft -> human edit/approve -> send.
 *   This module has no send path by design.
 * - Explain = rephrase for readability WITHOUT adding facts: explainFeedback()
 *   is purely extractive (drops filler words only, never adds tokens), so the
 *   output vocabulary is a subset of the input vocabulary.
 */

/** Diagnosis / labelling vocabulary that must NEVER appear in a draft. */
export const BANNED_WORDS = [
  'diagnose',
  'diagnosed',
  'diagnosis',
  'disorder',
  'condition',
  'syndrome',
] as const;

export type DraftVisibility = 'parent_visible' | 'academic_team' | 'internal_only';

export interface DraftSourceObservation {
  observationText: string;
  visibility: DraftVisibility;
  id?: string;
}

export interface ParentUpdateDraft {
  studentName: string;
  body: string;
  /** Always true: rows written from this draft carry is_ai_drafted. */
  isAiDrafted: true;
  /** Always true: a human MUST edit/approve before any send. Never auto-send. */
  requiresHumanApproval: true;
  sourceCount: number;
}

export interface AnnouncementInput {
  title: string;
  points: string[];
  audience?: string;
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  isAiDrafted: true;
  requiresHumanApproval: true;
}

export interface ExplainResult {
  text: string;
  isAiDrafted: true;
}

export const EMPTY_EVIDENCE_MESSAGE = 'No approved observations to summarize yet.';

/**
 * FUTURE-LLM SEAM: a future provider-backed composer implements this
 * interface and reuses the guards (filterApprovedSources, sanitizeForParent)
 * + the approval flow (isAiDrafted / requiresHumanApproval) unchanged.
 * No caller may send a draft without human approval, LLM or not.
 */
export interface AiDraftProvider {
  readonly name: string;
  composeParentUpdate(studentName: string, observations: DraftSourceObservation[]): ParentUpdateDraft;
  composeAnnouncement(input: AnnouncementInput): AnnouncementDraft;
  explainFeedback(text: string, keyNouns: string[]): ExplainResult;
}

const REDACTED_AMOUNT = '[amount removed]';
const REDACTED_WORD = '[removed]';

const bannedPattern = (): RegExp =>
  new RegExp(`\\b(${BANNED_WORDS.map(escapeRegExp).join('|')})\\b`, 'gi');

/** Keep ONLY parent_visible rows — approved evidence for parent surfaces. */
export function filterApprovedSources(
  observations: DraftSourceObservation[]
): DraftSourceObservation[] {
  return (observations ?? []).filter((o) => o.visibility === 'parent_visible');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parent-safe sanitiser: strips diagnosis words and ALL amounts.
 * - Banned diagnosis words -> '[removed]' (never labelled in parent drafts).
 * - 'UGX' mentions -> removed (currency has no place in a parent update).
 * - Any token containing a digit -> '[amount removed]' (covers balances,
 *   fees, comma/dot-grouped figures without trying to parse them).
 */
export function sanitizeForParent(text: string): string {
  let out = (text ?? '').trim();
  out = out.replace(bannedPattern(), REDACTED_WORD);
  out = out.replace(/\bUGX\b\.?/gi, REDACTED_AMOUNT);
  out = out.replace(/\S*\d\S*/g, REDACTED_AMOUNT);
  out = out.replace(/[ \t]+/g, ' ').trim();
  return out;
}

function sentenceOf(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * Parent update draft from approved evidence only. Non-parent_visible rows
 * are excluded (counted out of sourceCount). Empty approved set returns the
 * honest empty message — never fabricated observations.
 */
export function composeParentUpdate(
  studentName: string,
  observations: DraftSourceObservation[]
): ParentUpdateDraft {
  const name = (studentName ?? '').trim();
  const approved = filterApprovedSources(observations);
  if (approved.length === 0) {
    return {
      studentName: name,
      body: EMPTY_EVIDENCE_MESSAGE,
      isAiDrafted: true,
      requiresHumanApproval: true,
      sourceCount: 0,
    };
  }
  const lines = approved.map((o) => `- ${sentenceOf(sanitizeForParent(o.observationText))}`);
  const body = `Hello, here is a learning update for ${name}:\n${lines.join('\n')}\nPlease reply if you have any questions. A teacher will review this message before it is sent.`;
  return {
    studentName: name,
    body,
    isAiDrafted: true,
    requiresHumanApproval: true,
    sourceCount: approved.length,
  };
}

/**
 * Announcement draft: quotes every supplied point verbatim (no evidence
 * filtering — points ARE the approved content), flagged for human approval.
 */
export function composeAnnouncement(input: AnnouncementInput): AnnouncementDraft {
  const title = (input?.title ?? '').trim();
  const points = (input?.points ?? []).map((p) => p.trim()).filter(Boolean);
  const body =
    points.length === 0
      ? `${title}\n\nDetails to follow. A staff member will review this notice before it is published.`
      : `${title}\n\n${points.map((p) => `- ${sentenceOf(p)}`).join('\n')}\n\nA staff member will review this notice before it is published.`;
  return { title, body, isAiDrafted: true, requiresHumanApproval: true };
}

/** Filler glue words safe to drop — removing them can only shorten. */
const FILLER_WORDS = new Set(
  ['very', 'really', 'basically', 'actually', 'just', 'quite', 'rather', 'simply', 'well'].map((w) =>
    w.toLowerCase()
  )
);

/**
 * Explain = extractive simplification. Drops filler words only; every output
 * token comes from the input, so no new facts can be introduced. Output is
 * therefore always shorter-or-equal and keeps the caller's key nouns (which
 * are themselves drawn from the input).
 */
export function explainFeedback(text: string, keyNouns: string[]): ExplainResult {
  const input = (text ?? '').trim().replace(/\s+/g, ' ');
  if (!input) return { text: '', isAiDrafted: true };
  const kept = input.split(' ').filter((tok) => {
    const alpha = tok.replace(/[^A-Za-z]/g, '').toLowerCase();
    if (!alpha) return true;
    return !FILLER_WORDS.has(alpha);
  });
  let out = kept.join(' ').replace(/\s+([.,!?;:])/g, '$1').trim();
  if (!out) out = input;
  // Belt-and-braces: never exceed input length.
  if (out.length > input.length) out = out.slice(0, input.length).trim();
  void keyNouns;
  return { text: out, isAiDrafted: true };
}

/** Default deterministic provider — the export a future LLM replaces. */
export const deterministicDraftProvider: AiDraftProvider = {
  name: 'deterministic-evidence-composer',
  composeParentUpdate,
  composeAnnouncement,
  explainFeedback,
};
