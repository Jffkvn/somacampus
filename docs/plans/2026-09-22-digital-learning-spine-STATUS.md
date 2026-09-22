# Digital Learning Spine — STATUS / HANDOFF

**Last updated:** 2026-09-22 (P0 M1–M6 + P1 complete)  
**Charter:** [`2026-09-22-digital-learning-spine.md`](./2026-09-22-digital-learning-spine.md)  
**Branch:** `feat/digital-learning-spine-p0`  
**Base:** `main` @ `18bfd1d`

> **New agent / new session:** read the charter first, then this file, then `git log`.  
> Do not reopen LOCKED decisions in the charter.

---

## 1. Decisions (LOCKED — do not reopen)

1. School OS + digital learning spine — **not** Moodle/Canvas/Zoom/WebRTC.  
2. **One academic core** (Phase 6 plan reused). No parallel curriculum tree.  
3. **Plan / Activity / Delivery** are distinct. `learning_activities` is the **only** new core academic entity.  
4. P0 activity types: **ASSIGNMENT | RESOURCE | LIVE_SESSION** only.  
5. Activity parent: `teaching_sequence_id` and/or `online_offering_id` (`num_nonnulls >= 1`).  
6. Offering `scheme_of_work_id` **nullable**; `delivery_pace` = term_paced | self_paced | sessional.  
7. Assignment/observation **origin** mutually exclusive: physical class | online offering [| session].  
8. **Session is not academic owner** of work; `online_session_id` is provenance.  
9. **Photo-first** submissions (not photo-only); mobile + weak network.  
10. **AI never writes score/grade/marks**; machine scoring is deterministic keys only.  
11. Rubric human marking first; quizzes later.  
12. **Progress ≠ completion.**  
13. No native video; provider integration P1 (recording → catch-up).  
14. Learning Coach **configurable** (not US hours baked in).

---

## 2. What already exists (reuse)

| Area | Where |
|---|---|
| Curriculum plan | `schemes_of_work`, `medium_term_plans`, `teaching_sequences`, `learning_objectives` |
| Delivered lesson | `lessons` (class_id NOT NULL) |
| Online ops | `online_programmes`, `online_offerings`, `online_sessions`, `online_enrolments`, … |
| Session work | `onlineAcademicService` (session-bound assignment/submit/observe) |
| Assignments | `assignments` + `assignments_origin_check` |
| Evidence | `teacher_observations` + origin check |
| Storage (staff docs) | existing private bucket patterns |
| UI shells | OnlineDay, SessionCockpit, StudentOnlineHome, CentreOps |

---

## 3. What was changed

| Slice | Files | Status |
|---|---|---|
| Charter + STATUS docs | `docs/plans/2026-09-22-digital-learning-spine*.md` | **Done** |
| M1 origin migration | `supabase/migrations/20260922000023_learning_spine_origins.sql` | **Done — pushed live** |
| M2 learning_activities | `supabase/migrations/20260922000024_learning_activities.sql` | **Done — pushed live** |
| M3 async assignment service | `src/modules/learning/learningActivityService.ts`, `assignmentDomain.ts`, `assignmentService.ts` | **Done** |
| M4 submissions + storage | `supabase/migrations/20260922000025_learning_submissions_storage.sql`, `src/modules/learning/submissionService.ts` | **Done — pushed live** |
| M5 rubric + gradebook | `supabase/migrations/20260922000026_learning_results_rubrics.sql`, `src/modules/learning/gradebookService.ts` | **Done — pushed live** |
| M6 Student/Teacher cockpits | `src/modules/learning/learningCockpitDomain.ts`, `learningCockpitService.ts`, `StudentLearningCockpit.tsx`, `TeacherMarkingCockpit.tsx`, wired into `StudentOnlineHomePage` + `TeacherTodayPage` | **Done** |
| M4 photo-submit UI | `src/modules/learning/photoUpload.ts`, `StudentWorkSubmitModal.tsx`, cockpit hand-in buttons | **Done** |
| P1 Learning Coach | `supabase/migrations/20260922000027_learning_coach.sql`, `learningCoachService.ts`, `LearningCoachPanel.tsx` on student home | **Done — pushed live** |
| P1 Office hours | `supabase/migrations/20260922000028_office_hours_booking.sql`, `officeHoursService.ts`, `OfficeHoursPanel.tsx` (reuses `online_slot_templates` + `online_bookings`) | **Done — pushed live** |
| P1 Recording → catch-up | `supabase/migrations/20260922000029_online_session_recordings.sql`, `sessionRecordingService.ts`, `CatchUpPanel.tsx` | **Done — pushed live** |
| P1 Pacing / at-risk enrichment | `learningCockpitDomain.ts` (`evaluatePace`, idle/completion signals), `learningCockpitService.ts`, `TeacherMarkingCockpit.tsx` | **Done** |

### M1 details
- `online_offerings.scheme_of_work_id` (nullable) + `delivery_pace`
- `assignments.online_offering_id` + exclusive `assignments_origin_check`
- `teacher_observations.online_offering_id` + same origin law
- session∈offering via composite FK `(online_session_id, online_offering_id) → online_sessions(id, offering_id)`
- `is_authorised_assignment_creator(..., p_online_offering_id)` — offering teaching assignments
- RLS insert/update pass offering id

### M2 details
- `learning_activities` (types ASSIGNMENT | RESOURCE | LIVE_SESSION)
- parent: `teaching_sequence_id` and/or `online_offering_id` (`num_nonnulls >= 1`)
- optional `online_session_id` provenance (composite FK)
- `learning_activity_objectives`
- RLS: staff manage; enrolled student + guardian read published offering activities

### M3 details
- `learningActivityService.createActivity / listByOffering / listBySequence`
- `assignmentService.createAssignment` accepts `onlineOfferingId` (async, no session required); XOR with `classId`
- Offering publishes → roster from `online_enrolments`
- `onlineAcademicService.createSessionAssignment` inherits `online_offering_id` from the session (provenance only)

### M4 details
- `learning_submissions` + `learning_submission_attachments` (photo-first kinds)
- `submit_learning_work` RPC: attempt++, late from due_date, history preserved
- Storage bucket `student-submissions` + school-scoped student/teacher/guardian policies
- `submissionService` upload + submit + markReview state machine

### M5 details
- `learning_rubrics` (criteria × levels JSONB) + `learning_results`
- `compute_rubric_total` deterministic sum; `record_learning_result` RPC re-checks
- `gradebookService.createRubric / recordResult / listForStudent|Assignment|Activity`
- AI never writes score (charter #10)

### M6 details
- Student Today panels: **Today · Learning · Due · Overdue · Feedback · Progress · Next**
- Teacher panels: **marking queue** (photo submissions awaiting human mark) + **at-risk foundation** (deterministic overdue/missing/late counts — no AI scoring)
- Mounted on `StudentOnlineHomePage` and `TeacherTodayPage`; OnlineDay / SessionCockpit unchanged
- Pure domain: `learningCockpitDomain.ts` (bucket rules + at-risk thresholds)

---

## 4. Tests / verification

| Check | Result |
|---|---|
| `npx supabase db push` (M1–M5 + P1 027–029) | **Applied live** (`vhivioulpbdyaynkqpja`) — migrations 023–029 confirmed |
| `npm run verify:trust` | **PASS** (44 services, 0 violations) |
| `npm run verify:contracts` | **PASS** |
| `npm run verify:migrations` | **PASS** (89 files, 0 errors, 15 pre-existing warnings) |
| `npm run typecheck` | **PASS** |
| `npx vitest run src/test/learning-cockpit.test.ts src/test/learning-gradebook.test.ts` | **PASS** (11 tests) |
| Full `npm test` | **PASS** (880 passed, 30 skipped live-gated, 7 skipped files) |
| UI confirmation (browser) | **PASS (signed-in)** — `scripts/verify-learning-ui-authed.mjs` logs in `student@somacampus.ug` + `teacher@somacampus.ug` against live Supabase. Student home: cockpit + Learning Coach + Office hours + catch-up + photo hand-in modal all present. Teacher today: marking queue + at-risk present. Screenshots `learn_*_authed.png` / `learn_login_*.png`. Report `docs/verification/learning-ui-authed-report.json`. Unauthenticated shell pass remains in `learning-ui-report.json` (SMOKE_ONLY). |

---

## 5. Known gaps / risks

- Teacher rubric **marking UI** links into `/teaching/assignments/:id`; full criterion picker is P0-complete in service + tests, UI can deepen.
- At-risk is deterministic (overdue/missing/late + term-pace + idle + completion %). P2 analytics / report cards remain later.
- P1 Learning Coach / office hours / recordings / pacing are **done**. Optional: live Meet/Zoom webhook → `ingestRecording`.
- Quizzes / gradebook advanced rules / discussion / proctoring are **P2**.
- 15 pre-existing migration audit warnings (legacy `USING (true)` + hard-delete cleanups) — not introduced by this spine.
- Signed-in UI confirmation covered student home + photo modal + teacher marking/at-risk. Data-mutating flows (actually submitting a photo, recording coach hours against a live roster row) still need seeded live data — unit tests cover the fail-closed logic.

---

## 6. Next exact steps (in order)

1. ~~M1 migration~~ **Done (live)**  
2. ~~M2 learning_activities~~ **Done (live)**  
3. ~~M3 learningActivities + async assignment~~ **Done**  
4. ~~M4 submissions + storage~~ **Done (live)**  
5. ~~M5 rubric + gradebook~~ **Done (live)**  
6. ~~M6 Student Today + Teacher marking/at-risk cockpits~~ **Done**  
7. Full `npm test` + PR + Trust Gate CI ← **this PR**  
8. ~~P1 Learning Coach~~ **Done (live, migration 027)**  
9. ~~P1 Office hours~~ **Done (live, migration 028 — reuses booking)**  
10. ~~P1 Recording → catch-up~~ **Done (live, migration 029 — external provider URL, learning artifact)**  
11. ~~P1 Online pacing / at-risk enrichment~~ **Done (term_pace, idle days, completion %)**  
12. Optional: live provider webhook endpoint (Meet/Zoom) — `sessionRecordingService.ingestRecording` is ready  
13. P2 (later): quizzes, discussion, report cards, proctoring, richer analytics

---

## 7. Handoff rule

If you take over: **update §3/§4/§6 in this file in the same PR as code.**  
Chat history is not the source of truth.
