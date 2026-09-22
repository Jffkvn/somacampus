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
| Write-path E2E (seeded) | `scripts/seed-learning-write-path.mjs`, `scripts/verify-learning-write-path.mjs` — photo hand-in → `learning_submissions`; parent coach hours → `learning_coach_confirmations` | **PASS (live DB)** |
| Coach settings uniqueness fix | `supabase/migrations/20260922000030_learning_coach_settings_unique.sql` (NULL stage_key was not unique) | **Done — pushed live** |
| Rubric marking UI | `RubricMarkingPanel.tsx` + Rubric action on `AssignmentReviewPage` | **Done** |
| P2 plan | `docs/plans/2026-09-22-digital-learning-spine-P2.md` | **Done** |
| P2A-1 deterministic quizzes | migrations 031–033, `quizDomain.ts`, `quizService.ts`, `StudentQuizPage`/`StudentQuizPanel`, seed + UI verify scripts | **Done — pushed live** |
| P2C-1 report cards | `reportCardDomain.ts`, `reportCardService.ts`, `ReportCardPage` (`/reports/learner`, `/parent/reports`) | **Done** |
| P2A-2 quiz behaviour | migration 034 — timer, shuffle questions/options, retakes, delayed release, objective_ids | **Done — pushed live** |
| P2A-3 advanced rubrics | migration 035 — weights, per-criterion comments, revise-with-reason, moderation RPC | **Done — pushed live** |
| P2A-4 assessment packs | migration 036 — packs + items + objective rollup domain/service/UI `/assessments/pack/:id` | **Done — pushed live** |
| P2B-1 evidence-cited analytics | `analyticsDomain.ts`, `analyticsService.ts`, `StudentAnalyticsPanel` `/intelligence/learner` | **Done** |

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
| `npx supabase db push` (M1–M5 + P1 027–030) | **Applied live** (`vhivioulpbdyaynkqpja`) — migrations 023–030 confirmed |
| `npm run verify:trust` | **PASS** (44 services, 0 violations) |
| `npm run verify:contracts` | **PASS** |
| `npm run verify:migrations` | **PASS** (89 files, 0 errors, 15 pre-existing warnings) |
| `npm run typecheck` | **PASS** |
| Full `npm test` | **PASS** (906 passed, 26 skipped) |
| UI confirmation (browser) | **PASS (signed-in)** — `scripts/verify-learning-ui-authed.mjs` logs in `student@somacampus.ug` + `teacher@somacampus.ug` against live Supabase. Student home: cockpit + Learning Coach + Office hours + catch-up + photo hand-in modal all present. Teacher today: marking queue + at-risk present. Screenshots `learn_*_authed.png` / `learn_login_*.png`. Report `docs/verification/learning-ui-authed-report.json`. Unauthenticated shell pass remains in `learning-ui-report.json` (SMOKE_ONLY). |
| Write-path E2E (live mutations) | **PASS** — student photo hand-in wrote `learning_submissions` (state submitted); parent coach sign-off wrote `learning_coach_confirmations` (1.5h). Screenshots `e2e_*.png`, report `learning-write-path-report.json`. |
| Rubric marking UI | **PASS (signed-in teacher)** — `e2e_rubric_marking_panel.png` shows criterion level taps + deterministic total. |
| P2A-1 quiz UI + write-path | **PASS (signed-in student + teacher shell)** — `p2_quiz_*.png`, report `p2-quiz-ui-report.json`. `learning_results` row `result_source=quiz` (4/5 on E2E answers). Answer keys column-locked from `authenticated` (staff RPC only). |
| P2C-1 report UI | **PASS (signed-in teacher + parent)** — `p2_report_teacher.png` (comment box), `p2_report_parent.png` (read-only). Report `p2-report-ui-report.json`. |
| P2A-2 + P2A-3 UI | **PASS (signed-in student + teacher)** — `p2a2_quiz_student.png`, `p2a3_rubric_comments.png`. Report `p2a2-p2a3-ui-report.json`. |
| P2A-4 UI | **PASS (signed-in student + teacher shell)** — `p2a4_assessment_pack_student.png`. Report `p2a4-ui-report.json`. |
| P2B-1 UI | **PASS (signed-in teacher)** — `p2b1_analytics_teacher.png` (claims + evidence rows). Report `p2b1-ui-report.json`. |

---

## 5. Known gaps / risks

- Rubric marking UI covers tap-level + deterministic total + teacher feedback on `/teaching/assignments/:id`. Multi-rubric picker is P2 polish.
- Write-path E2E proves photo submit + coach hours on live DB. Repeat with `node scripts/seed-learning-write-path.mjs && node scripts/verify-learning-write-path.mjs`.
- 15 pre-existing migration audit warnings (legacy `USING (true)` + hard-delete cleanups) — not introduced by this spine.
- Optional: live Meet/Zoom webhook → `sessionRecordingService.ingestRecording`.
- Quizzes / gradebook advanced rules / discussion / proctoring are **P2**.

---

## 6. Next exact steps (in order)

1. ~~M1 migration~~ **Done (live)**  
2. ~~M2 learning_activities~~ **Done (live)**  
3. ~~M3 learningActivities + async assignment~~ **Done**  
4. ~~M4 submissions + storage~~ **Done (live)**  
5. ~~M5 rubric + gradebook~~ **Done (live)**  
6. ~~M6 Student Today + Teacher marking/at-risk cockpits~~ **Done**  
7. Full `npm test` + PR + Trust Gate CI  
8. ~~P1 Learning Coach~~ **Done (live, migration 027)**  
9. ~~P1 Office hours~~ **Done (live, migration 028 — reuses booking)**  
10. ~~P1 Recording → catch-up~~ **Done (live, migration 029 — external provider URL, learning artifact)**  
11. ~~P1 Online pacing / at-risk enrichment~~ **Done (term_pace, idle days, completion %)**  
12. ~~Seeded write-path E2E~~ **Done (photo hand-in + coach hours, live DB, screenshots)**  
13. ~~Rubric marking UI~~ **Done (AssignmentReviewPage criterion taps)**  
14. Optional: live provider webhook endpoint (Meet/Zoom) — `sessionRecordingService.ingestRecording` is ready  
15. P2 (later): quizzes, discussion, report cards, proctoring, richer analytics

---

## 7. Handoff rule

If you take over: **update §3/§4/§6/§8 in this file in the same PR as code.**  
Chat history is not the source of truth.

---

## 8. P2 tracker

Full plan: [`2026-09-22-digital-learning-spine-P2.md`](./2026-09-22-digital-learning-spine-P2.md)

| ID | Item | Status |
|---|---|---|
| P2 plan doc | Areas P2A–P2D, invariants, testing rules | **Done** |
| P2A-1 | Deterministic quizzes (MCQ/TF/matching/short-answer keys) | **Done** (live 031–033; UI student+teacher; keys staff-only) |
| P2A-2 | Quiz behaviour polish (timer, shuffle, retakes, delayed release) | **Done** (migration 034) |
| P2A-3 | Advanced rubrics (weights, comments, revise+reason, moderation) | **Done** (migration 035) |
| P2A-4 | Assessment packs + objective rollup | **Done** (migration 036 + `/assessments/pack/:id`) |
| P2A-5 | Exam workflows | Deferred / P3 |
| P2C-1 | Report cards from live gradebook | **Done** (teacher comment + parent read-only + print) |
| P2C-2 | Parent-facing summary + print/PDF | **Done** (print stylesheet; branded PDF pack can deepen) |
| P2B-1 | Evidence-cited analytics | **Done** (`/intelligence/learner` + NOT_ENOUGH honesty) |
| P2B-2 | AI gap detection (recommend-only) | Not started |
| P2B-3 | Pacing / intervention suggestions | Not started |
| P2D-1 | Community layer + stage policy flags | Not started |
| P2D-2 | Teacher-led communities | Not started |
| P2D-3 | Structured peer review (formative) | Not started |
| P2D-4 | Moderated peer + clubs (policy-gated) | Not started |

Testing rule: unit tests + **signed-in UI tests with screenshots for every role touched** + STATUS updated in the same PR.
