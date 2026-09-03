# Phase 3: Leadership Monitoring (Live Lessons Monitor) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the principal a live school-wide teaching monitor — every scheduled period today, its submission state, and attendance linkage.

**Architecture:** Extend `leadershipService` with one monitor query (today's scheduled entries merged with submitted lessons + session flags); new `LiveLessonsMonitorPage` with status/class filters; retarget three dashboard links to the new route. No migrations, no new tables, no RLS changes.

**Tech Stack:** React 19, Vite 6, Supabase JS 2.48, Postgres 17, Vitest 3, TS 5.7 strict.

---

### Task 1: Monitor service — scheduled vs submitted (TDD)

**Files:**
- Modify: `src/modules/leadership/leadershipService.ts` (add `getLiveLessonsMonitor`)
- Create: `src/test/monitor-live.test.ts`

**Step 1: Write failing tests** (`vi.mock('../lib/supabase')` pattern):
- scheduled 3 entries + 1 lesson → 2 pending;
- submitted lesson without session link → missing-attendance flag;
- no timetable → honest empty, no throw.

Run: `npx vitest run src/test/monitor-live.test.ts -v` → FAIL (RED).

**Step 2: Minimal implementation** — scheduled entries (active timetable, school, dow) + submitted lessons + session entry-ids, merged per `timetable_entry_id` (`submitted`|`pending`|`scheduled`); off-timetable lessons appended with startTime '—'. Mock branch under existing `isMockEnv` guard. Never throw; never select `teacher_reflections`.

**Step 3: Verify** — targeted PASS; typecheck clean.

**Step 4: Commit** — `feat(leadership): live lessons monitor service`

### Task 2: Monitor page + route

**Files:**
- Create: `src/modules/leadership/LiveLessonsMonitorPage.tsx`
- Modify: `src/App.tsx` (replace `teaching/lessons` placeholder ONLY)

Header + summary pills + status/class filters (client-side) + rows with status pills + "No attendance" badge + expandable visible notes + empty/loading/error states. Verify + commit — `feat(leadership): live lessons monitor page`.

### Task 3: Retarget dashboard stopgaps

"View all lessons" + Lessons StatCard + live `not_completed` alert actionRoute → `/teaching/lessons`. (Mock dead routes frozen.) Verify + commit — `fix(leadership): point dashboard at monitor`.

### Task 4: Gate + live validation

Mock gate (`typecheck && lint && test && build`), no migration. Live as principal: monitor shows submitted + pending; probe lesson as David → Submitted → cleanup; no reflection text in responses.

```
LEADERSHIP MONITOR: COMPLETE
VALIDATION: PASS
RLS VALIDATION: PASS (reads only; no new policies)
PHASE 3 READY: YES
```

### Out of Phase 3

School-wide attendance history (Phase 4); acting on alerts (Phase 4+); staff-presence panel (possible 3b); chart `[80,100]` clipping; `test:ci` tidy-up; `GCC-TEST-001` removal.
