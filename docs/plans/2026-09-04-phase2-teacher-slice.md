# Phase 2: Teacher Daily Workflow Vertical Slice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the teacher's daily loop end-to-end on real data: open lesson → confirm + note → submit → principal sees it → student profile retains it.

**Architecture:** New `src/modules/teaching/lessonService.ts` + `LessonCockpitPage.tsx` on the existing placeholder route; `leadershipService` mocks replaced with school-scoped Supabase queries; new minimal student list + detail. One small migration (lesson UPDATE policy + attendance link column). No changes to attendance write paths, clock-in, schedule, auth, or shell.

**Tech Stack:** React 19, Vite 6, Supabase JS 2.48 (PostgREST + RLS), Postgres 17, Vitest 3 + jsdom, TS 5.7 strict.

---

### Task 1: Migration — lesson correction policy + attendance link

**Files:**
- Create: `supabase/migrations/20260906000000_lesson_submit_hardening.sql`

**Step 1: Write the migration**

```sql
-- ==============================================================================
-- SOMACAMPUS MIGRATION: LESSON SUBMIT HARDENING
-- ==============================================================================
-- Links lessons to the daily attendance session; allows owner-or-leadership
-- corrections (INSERT was strict-owner since 00001; UPDATE was denied for all).
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS attendance_session_id UUID REFERENCES student_attendance_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_timetable_date ON lessons (timetable_entry_id, submitted_at DESC);

DROP POLICY IF EXISTS lessons_auth_update ON lessons;
CREATE POLICY lessons_auth_update ON lessons
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees e JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id)
    OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin','principal'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees e JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id)
    OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin','principal'))
  );
```

Deliberately NOT added: `submitted_by` (= `teacher_id`), `framework/level` columns (derived), curriculum engine tables (Phase 5).

**Step 2: Validate (no push yet)**

Run: `supabase db push --dry-run 2>&1 | grep "Would push"`
Expected: `• 20260906000000_lesson_submit_hardening.sql` only.

**Step 3: Commit**

```bash
git add supabase/migrations/20260906000000_lesson_submit_hardening.sql
git commit -m "fix(db): lesson update policy and attendance link"
```

### Task 2: `lessonService` — context + submit (TDD)

**Files:**
- Create: `src/modules/teaching/lessonService.ts`
- Create: `src/test/lesson-submit.test.ts`

**Step 1: Write failing tests** (use the `vi.mock('../lib/supabase')` stub-builder pattern in `src/test/teacher-schedule-live.test.ts`). Cover: getLessonContext resolves entry + previous note; null previous summary when none; submitLesson inserts lesson + reflection to correct tables; privateReflection NEVER in lessons payload.

Run: `npx vitest run src/test/lesson-submit.test.ts -v` — Expected: FAIL (import error = RED).

**Step 2: Minimal implementation**

- `getLessonContext(timetableEntryId, date): Promise<LessonContext>` — timetable_entries + joins (`timetables!inner(is_active)`, subjects, classes, streams, teacher w/ people); `curriculum.framework='Cambridge Primary'` const, level from `classes.stage_level`; `previousLessonSummary` = latest prior lessons row same class+subject → `visible_lesson_note`. `relevantResourcesCount` kept in contract, NOT displayed (Phase 5).
- `submitLesson(sub: LessonSubmission)` — insert lessons row (incl. `attendance_session_id?`, no reflection text); then if `sub.privateReflection`, insert `teacher_reflections` with `teacher_user_id` from `supabase.auth.getUser()`. Reflection failure → warn + succeed. Lessons-insert error → throw (caller shows message, keeps form state).

**Step 3: Verify** — targeted PASS; `npm run typecheck` 0 errors.

**Step 4: Commit** — `feat(teaching): lesson context and submit service`

### Task 3: Lesson cockpit page + route wiring (TDD)

**Files:**
- Create: `src/modules/teaching/LessonCockpitPage.tsx`
- Modify: `src/App.tsx` (`teaching/classes/:classId/lessons/:lessonId` placeholder → cockpit; nothing else)
- Modify: `src/modules/teacher/teacherService.ts` (wire `completedLessonIds` from today's lessons by teacher)

**Step 1: Failing test** — `getTeacherToday` returns `completedLessonIds` containing submitted `timetable_entry_id`. Run → FAIL.

**Step 2: Page** (reuse Card/Button/StatusPill/LoadingState; no new deps): context header; read-only daily-attendance strip + link back to Today (no second register UI); previous-lesson box or "No previous lesson recorded."; status radio (5 statuses); whatWasTaught + visibleLessonNote (required) + privateReflection ("Private — only you can ever read this"); submit → success card + back-link; form state preserved on failure.

**Step 3: Verify** — tests pass; mock suite 0 failed; typecheck clean. Manual: submit persists across reload (real-DB proof).

**Step 4: Commit** — `feat(teaching): lesson cockpit submit flow`

### Task 4: Leadership dashboard on real data

**Files:**
- Modify: `src/modules/leadership/leadershipService.ts` (only)
- Create: `src/test/leadership-live.test.ts` (supabase-mock pattern)

**Steps:** RED → GREEN. Stats from `student_enrolments` / `employees` / `teacher_attendance` / `lessons` counts; 5-day trend from `student_attendance_sessions` aggregates + staffRate; live lessons → `LeadershipLessonSummary` (visible notes only, NEVER join `teacher_reflections`); alerts from `not_completed` lessons + unmatched fee-import count (link to existing `/fees`, fix dead `/fees/reconciliation` + `/dashboard/school/teaching` links to real routes or remove). Empty states, not mock rows. Keep mock branch ONLY under mock env (existing `isMockEnv` guard pattern).

Verify + commit — `feat(leadership): real dashboard data`

### Task 5: Minimal student directory + detail (attendance history)

**Files:**
- Create: `src/modules/students/StudentDirectoryPage.tsx`, `src/modules/students/StudentDetailPage.tsx`
- Modify: `src/App.tsx` (`/students` → real list; ADD `/students/:studentId` detail; `/students/attendance` stays Phase 4 placeholder)
- Create: `src/test/student-profile.test.ts` (mock pattern)

**Steps:** RED → GREEN. Directory from enrolments+students+people with text filter → detail links. Detail: header, attendance % + counts from `student_attendance_records` (existing index), recent records, read-only fee-clearance line (graceful empty). Strengths/interventions marked "Phase 4".

Verify + commit — `feat(students): directory and attendance profile`

### Task 6: Gate + live push + live validation

Run: `npm run typecheck && npm run lint && npm run test && npm run build` (mock env). Then `supabase db push`; live probes: submit real lesson as Sarah → visible as principal → student detail shows day; correct a mark → audit row. Output gate lines (CLASS TEACHER / ATTENDANCE / LESSON SUBMIT / LEADERSHIP / STUDENT HISTORY COMPLETE, VALIDATION PASS, RLS PASS, PHASE 2 READY YES).

### Deferred (explicitly out of Phase 2)

1. Curriculum engine (frameworks/levels/objectives tables) — Phase 5 prerequisite.
2. Homework/assignments/quizzes/AI drafts/parent summaries — Phase 5a after Phases 3–4.
3. Fees reconciliation wizard — Phase 6.
4. Timetable/calendar/classes master views + teacher weekly timetable — placeholders stay.
5. Accepted debts: `relevantResourcesCount` UI-absent; open-read `teacher_attendance` SELECT; single-year enrolment scope; `test:ci`/`test:unit` tidy-up.
