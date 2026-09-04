# Phase 8A: Parent Identity & Portal Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A parent logs in, sees only their own children, switches between them, and views attendance, approved learning evidence, activities, and finance through authorised projections — with RLS enforcing every boundary.

**Architecture:** Guardian RLS + school calendars RLS + seed link first; `resolveMyChildIds(schoolId)` mirroring `resolveMyEmployeeId`; `Parent*Projection` allowlists mirroring `ActivityParticipantProjection`; `ParentHomePage` on `/parent/home` with child selector; parent nav group + permission codes. No messaging, no notifications, no AI (later sub-phases). Hard stop + verification report after 8A.

**Tech Stack:** React 19, Vite 6, Supabase JS 2.48, Postgres 17, Vitest 3, TS 5.7 strict.

**Decisions (locked):** in-app messaging only, no phone exposure; schema supports all channels, in-app delivery first; no Pay Now (read-only fees, pay externally); identity school-scoped now, multi-school UI later.

---

### Task 8A-1: Prerequisites (migration + seed + permissions + nav)

**Files:**
- Create: `supabase/migrations/20260913000000_parent_guardian_access.sql`
- Modify: `supabase/seed.sql` (Florence → Amari guardian link — check people/students IDs first)
- Modify: `src/config/permissions.ts` (parent + teacher communication-view codes)
- Modify: `src/config/navigation.ts` (parent Family Portal group)

**Steps:**
1. Migration: `student_guardians_staff_read` (staff of the student's school via enrolments+user_roles) + `student_guardians_self_read` (guardian_person_id = own people.id). `school_calendars_auth_read` — school-scoped (NOT USING(true)): `EXISTS enrolment/employment/guardianship in that school`. Idempotent guards. No push from worktree.
2. Seed: Florence Kyomugisha (parent@) → Amari Kyomugisha (student@) guardian row (find their people/student IDs in seed first).
3. Permissions: parent gets portal/children/fees/attendance/learning view + announcements/messages view codes; teacher gets announcements/messages view (class-level enforcement comes in 8D, codes only now).
4. Nav: parent Family Portal group (Home & Overview → /parent/home only for now; other hrefs added as pages land — do NOT link dead routes; single Home item initially).
5. Tests for nothing yet (RLS proven live in 8A-4). Typecheck clean.
6. Commit: `fix(db): guardian and calendar read access` + `feat(parent): permissions and nav foundation` (2 commits).

### Task 8A-2: Parent identity (DB fn + resolver + tests)

**Files:**
- Modify: migration from 8A-1 (append `current_guardian_student_ids_for_school`) — or new migration if 8A-1 committed; prefer same file if uncommitted, else new `20260913000001`.
- Create: `src/modules/auth/parentIdentity.ts` (`resolveMyChildIds(schoolId)`, fail-closed [] + throw on DB error, mirroring `resolveMyEmployeeId`).
- Create: `src/test/parent-identity.test.ts` (multi-child, no-link → [], cross-school isolation, DB-error throws).

**Steps:** RED (import error) → GREEN → verify → commit `feat(parent): guardian identity resolution`.

### Task 8A-3: Projections + ParentHomePage

**Files:**
- Modify: `src/types/domain.ts` (ParentAcademic/Attendance/Finance/Activity projection types + allowlists).
- Create: `src/modules/parent/parentService.ts` (child overview via projections; reuse financeService statement + studentService attendance internally, then ALLOWLIST-pick fields — never return full objects).
- Create: `src/modules/parent/ParentHomePage.tsx` (child selector, cards: attendance, approved observations `parent_visible` only, activities, finance summary; empty states; loading/error).
- Modify: `src/App.tsx` (`/parent/home` placeholder → page; RequireAccess parent-only).
- Create: `src/test/parent-projection.test.ts` (key enumeration, no amounts outside finance projection, no reflection text, other-child isolation).

**Steps:** RED → GREEN → verify → commit `feat(parent): home portal with projections`.

### Task 8A-4: Gate + live verify + merge

Mock gate (typecheck/lint/test/build). Push migrations from main dir after merge. Live as Florence (parent@somacampus.ug): children = [Amari] only; attendance/observations/finance render; teacher session sees no parent data. Report gate lines. Merge + push + CI.

### Out of 8A (hard stop)
Announcements UI, messaging/threads, notifications/bell, calendar page, AI drafting, Pay Now, multi-school switching UI. Next: 8B (announcements) or 8C per redefined sequence (Info → Announcements → Messaging → Notifications → AI).
