# Phase 8F: AI Drafting (Advisory-Only) — Implementation Plan (as built)

> Status: implemented, merged, unit-verified 2026-09-05.

**Goal:** Evidence-grounded drafting assistance with mandatory human approval — no autonomous sending, no diagnosis, no invented facts.

**Architecture decision (grounded):** the repo has no AI provider integration (no keys, no endpoints, no Edge Functions), so 8F is a DETERMINISTIC composer + approval data flow with a documented LLM seam (`AiDraftProvider` interface), not an LLM integration.

**What was built:**
- `aiDraftService.ts`: `composeParentUpdate` (parent_visible observations only, diagnosis plurals sanitized, amounts stripped, honest empty), `composeAnnouncement` (verbatim points, flagged), `explainFeedback` (extractive, noun-enforced, subset vocabulary). `requiresHumanApproval: true` always.
- UI: Draft buttons in thread composer (teacher-only) + announcements (staff), parent Explain toggle (read-only, creates nothing). Drafts always land editable; approve→send records `is_ai_drafted` + approver; manual sends stay unflagged; discard clears body+flag.
- `ai-draft.test.ts` (9) + `ai-draft-flow.test.ts` (9): genuine RED pre-fix runs recorded.

**Live verification note:** draft paths are client-side over existing RLS-protected reads; the underlying observation-visibility boundary was live-proven across three personas (Florence sees parent_visible only; Sarah/David see all) after fixing `teacher_observations_auth_read` (`USING(true)` → visibility-scoped, migration `20260913000008_observation_visibility_rls.sql`).
