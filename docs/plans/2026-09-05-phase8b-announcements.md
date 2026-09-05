# Phase 8B: School Announcements — Implementation Plan (as built)

> Status: implemented, merged, live-validated 2026-09-05.

**Goal:** Staff-published, audience-targeted announcements with parent acknowledgements.

**Architecture:** `school_announcements` + `announcement_acknowledgements` tables with audience-scoped RLS (no `USING(true)`); `announcementService` (feed, staff-only create client gate + RLS reliance, graceful duplicate acks); `AnnouncementsPage` (staff create form, read-only feed, Ack/Yes/No, priority pills, expired dimmed-readable); `/communication/announcements` route; parent nav visibility.

**Decisions:** no AI drafting UI in 8B (deferred to 8F); in-app only; acknowledgements immutable (insert+select only, `23505` → graceful).

**What was built:**
- Migration `20260913000003_school_announcements.sql` — both tables, DEFINER audience helper `can_view_school_announcement()` covering all 6 audiences school-scoped, manage (admin/principal) + read + self-ack + own/staff-ack-read policies.
- `announcementService.ts`, `AnnouncementsPage.tsx`, `announcement-service.test.ts` (6 tests).
- Follow-up fix in-batch: class-target suffix read row field, not form state.

**Live validation (probes, all cleaned):** principal published parents-targeted probe → teacher publish denied `42501` → Florence saw + acknowledged → duplicate rejected `23505` → teacher could not see parents-targeted row → cascade cleanup verified zero rows.
