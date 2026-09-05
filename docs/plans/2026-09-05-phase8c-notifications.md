# Phase 8C: Notification Engine — Implementation Plan (as built)

> Status: implemented, merged, live-validated 2026-09-05.

**Goal:** Durable notification events with in-app delivery, preferences, and a header bell — starting from attendance events.

**Architecture:** `notification_events` / `deliveries` / `preferences` tables; attendance INSERT trigger creates EVENTS ONLY (`WARNING + RETURN NEW` so attendance never blocks on notification failure); `notificationService` (feed, recipient-scoped read receipts, mandatory-wins preferences); bell dropdown (unread badge, recent-8, mark-all-read); `/notifications/preferences` page. In-app delivery only; schema supports email/sms/whatsapp later.

**Decisions:** trigger never touches delivery/provider logic; read receipts scoped to recipient (single-update `markAllRead`); mandatory categories cannot be disabled.

**What was built:**
- Migration `20260913000004_notifications.sql` — 3 tables, trigger, 9 scoped policies (guardian TEXT-match on `payload.studentId`, no cast raises).
- `notificationService.ts`, bell wiring in `TopHeader.tsx`, `NotificationPreferencesPage.tsx`, `notification-service.test.ts` (8 tests).

**Live validation (temporary session, fully cleaned):** Sarah recorded Amari absent → trigger created `attendance_absent` event → Florence saw it → record, session, and event all deleted, verified zero remaining.
