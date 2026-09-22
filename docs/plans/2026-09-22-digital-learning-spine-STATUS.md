# Digital Learning Spine — STATUS / HANDOFF

**Last updated:** 2026-09-22 (start of P0)  
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

_(Updated as work lands.)_

| Slice | Files | Status |
|---|---|---|
| Charter + STATUS docs | `docs/plans/2026-09-22-digital-learning-spine*.md` | **Done** |
| M1 origin migration | `supabase/migrations/20260922000023_learning_spine_origins.sql` | **Done — pushed live** |
| M2 learning_activities | `supabase/migrations/20260922000024_learning_activities.sql` | **Done — pushed live** |
| M3 async assignment service | — | Not started |
| M4 submissions + storage | — | Not started |
| M5 rubric + gradebook | — | Not started |
| M6 Student/Teacher cockpits | — | Not started |

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

---

## 4. Tests / verification

| Check | Result |
|---|---|
| `npx supabase db push` (M1+M2) | **Applied live** (`vhivioulpbdyaynkqpja`) |
| `npm run verify:migrations` | **PASS** (87 files, 0 errors, 15 pre-existing warnings) |
| `npm run verify:columns` | **PASS** (100 tables, 1060 columns) |
| `npm run typecheck` | **PASS** |
| `npx vitest run src/test/assignment-service.test.ts src/test/ai-teaching-loop-e2e.test.ts` | **PASS** (4 passed, 1 skipped live-gated) |
| Full `npm test` | _(run before merge)_ |

---

## 5. Known gaps / risks

- `teacher_observations_origin_check` still forces class or session — must move with M1.  
- `is_authorised_assignment_creator` is class/session-oriented — update for offering teachers.  
- No submission file model yet (photo-first is P0).  
- Student/Teacher “Today” are not learning cockpits yet.  
- Quizzes / gradebook advanced rules / Learning Coach / office hours / recordings are **P1+**.

---

## 6. Next exact steps (in order)

1. ~~M1 migration~~ **Done (live)**  
2. ~~M2 learning_activities~~ **Done (live)**  
3. **M3** — `learningActivitiesService` + async `assignmentService.createAssignment` without `online_session_id` (offering-scoped)  
4. **M4** — submission state machine + photo-first Storage policies  
5. **M5** — rubric + minimal gradebook  
6. **M6** — Student Today + Teacher marking/at-risk cockpits  
7. Full `npm test` + PR + Trust Gate CI

---

## 7. Handoff rule

If you take over: **update §3/§4/§6 in this file in the same PR as code.**  
Chat history is not the source of truth.
