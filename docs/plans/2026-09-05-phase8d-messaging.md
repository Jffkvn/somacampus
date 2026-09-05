# Phase 8D: Parent–Teacher Messaging — Implementation Plan (as built)

> Status: implemented, merged, live-validated 2026-09-05.

**Goal:** Controlled parent↔teacher conversations — no free-for-all broadcast, no school-wide parent search.

**Architecture:** `communication_threads` / `participants` / `messages` / `reads` with `is_authorised_parent_teacher_contact()` (class/subject/activity legs, effective-date-aware, school-scoped); service enforces per-pair contact check before any insert (RLS as backstop); client-generated thread UUIDs with bare inserts (a just-created row fails its own participant-scoped RETURNING check — pre-membership deny); Messages page + thread view; `/communication/messages` route scoped to teacher+parent nav.

**Decisions:** in-app only, no phones; no AI drafting UI (8F); per-participant contact checks app-level (not RLS-expressible without triggers).

**What was built:**
- Migration `20260913000005_messaging.sql` + follow-up `20260913000006_thread_creator_check.sql` (fixed a live-found nested-RLS deadlock: first participant un-addable — DEFINER creator helper).
- `communicationService.ts`, `MessagesPage.tsx` (+ThreadView), `communication-service.test.ts` (13 tests).

**Live validation (all cleaned):** Sarah↔Florence authorized both directions, Paul→Florence denied; thread + participants + message written; Florence read with receipt; Paul's reads hidden and send denied `42501`.
