# SomaCampus Digital Learning Spine — Implementation Plan

**Date:** 2026-09-22  
**Status:** **LOCKED** architecture · P0 in progress  
**Supersedes:** broad “Online Learning Centre = LMS” readings of `PHASE-9-ONLINE-LEARNING-CENTRE.md`  
**Repo:** SomaCampus (Phase 6 academic core + Phase 9 Online Centre)

> **This document is the source of truth** for the Digital Learning Spine.  
> Conversation history is not. Another agent must be able to continue from this file + `docs/plans/2026-09-22-digital-learning-spine-STATUS.md`.

---

## 0. Product principle (LOCKED)

> **SomaCampus is a school operating system with an integrated digital learning spine.**

It is **NOT**:

- a Moodle / Canvas clone  
- a Zoom clone  
- a native WebRTC / SFU classroom  
- a second curriculum system  

School operations remain the OS. The academic model stays shared. Online is another **delivery context**.

---

## 1. Locked architectural law (LOCKED)

### Two Operations, One Academic Core

Physical, online, and hybrid **MUST** share one of each:

- curriculum frameworks / versions / subjects / stages  
- learning objectives  
- schemes of work · medium-term plans · teaching sequences  
- **learning activities**  
- assignments · submissions · assessments  
- evidence · observations  
- gradebook · progress · interventions · academic history  

**Do not** create parallel curriculum/gradebook trees for online learners.

---

## 2. Plan vs Learning Activity vs Delivery (LOCKED)

These are **three different concepts**. Do not collapse them.

| Layer | Meaning | Entities |
|---|---|---|
| **PLAN** | What the school intends to teach | `schemes_of_work` → `medium_term_plans` → `teaching_sequences` → `teaching_sequence_objectives` → `learning_objectives` |
| **LEARNING ACTIVITY** | What the learner is expected to do | **`learning_activities` (NEW — single spine entity)** |
| **DELIVERY** | What actually happened | `lessons` (physical report) · `online_sessions` (live slot) |

Rules:

1. A `teaching_sequence` is a **planned sequence**, not a reusable digital lesson.  
2. Existing physical `lessons` is a **delivery/reporting record** (`lesson_status`, `visible_lesson_note`, `class_id NOT NULL`). It is **not** the online lesson-content hierarchy.  
3. `online_sessions` are **scheduled/live delivery events**.  
4. **Neither** `lessons` nor `online_sessions` **owns the curriculum.** A live session is one activity type, not the parent of learning.

---

## 3. Existing Phase 6 backbone (LOCKED — reuse, do not duplicate)

Authoritative planning model (already in migrations `20260910000000` / `20260910000001`):

```text
schemes_of_work
      ↓
medium_term_plans
      ↓
teaching_sequences
      ↓
teaching_sequence_objectives
      ↓
learning_objectives
```

Plus `lesson_learning_objectives` (delivered lesson ↔ objective).

**Do NOT create:** `courses` / `course_units` / `course_lessons` as a parallel tree.

---

## 4. `learning_activities` — the only new core academic entity

P0 activity types (**only these three**):

```text
ASSIGNMENT
RESOURCE
LIVE_SESSION
```

Future (do **not** build in P0): `QUIZ`, `ASSESSMENT`, `DISCUSSION`, `VIDEO`, `PRACTICE`, `OFFLINE_PRACTICAL`, `PROJECT`.

### Ownership (LOCKED)

```text
teaching_sequence_id   NULLABLE
online_offering_id     NULLABLE
CHECK (num_nonnulls(teaching_sequence_id, online_offering_id) >= 1)
```

- Sequence-backed: curriculum-driven term work  
- Offering-backed: self-paced packs, tutoring packages, flexible programmes  
- Both may be set when an offering consumes a scheme’s sequence  

### Optional session link

```text
online_session_id  NULLABLE  -- delivery provenance only
```

If `online_session_id` is set, the session **must** belong to the same `online_offering_id` when the activity is offering-scoped.

---

## 5. Online offering → scheme is optional (LOCKED)

```text
online_offerings.scheme_of_work_id   NULLABLE
online_offerings.delivery_pace       term_paced | self_paced | sessional
```

| Pace | Meaning |
|---|---|
| `term_paced` | Consumes school Scheme of Work / term plan |
| `self_paced` | Learning activities without a physical weekly timetable |
| `sessional` | Tutoring / flexible; structure is scheduled sessions |

**Do not** force every online offering into a Scheme of Work.

---

## 6. Locked assignment / observation origin model

Replace `assignments_origin_check` (and the same rule on `teacher_observations`) with **mutually exclusive** origins:

### Physical

```text
class_id              REQUIRED
online_offering_id    NULL
online_session_id     NULL
```

### Online async

```text
class_id              NULL
online_offering_id    REQUIRED
online_session_id     NULL
```

### Session-linked online

```text
class_id              NULL
online_offering_id    REQUIRED
online_session_id     REQUIRED   -- must belong to offering
```

**No** `class_id + online_offering_id` on one row without a future documented business case.

Constraint sketch (SQL):

```sql
CHECK (
  (
    class_id IS NOT NULL
    AND online_offering_id IS NULL
    AND online_session_id IS NULL
  )
  OR (
    class_id IS NULL
    AND online_offering_id IS NOT NULL
    AND online_session_id IS NULL
  )
  OR (
    class_id IS NULL
    AND online_offering_id IS NOT NULL
    AND online_session_id IS NOT NULL
  )
)
```

Enforce **session ∈ offering** with FK shape or trigger (not frontend only).  
Update `is_authorised_assignment_creator` for offering/lesson teachers, not only class/session.

**This single migration unlocks asynchronous learning.**

---

## 7. Assignment ≠ live session (LOCKED)

```text
Unit / Sequence
  → Learning Activity (ASSIGNMENT)
  → due Friday

Live Session (optional LIVE_SESSION activity)
  → Tuesday 10:00
```

The session is related delivery. It does **not** own the assignment.  
`online_session_id` on assignments is **provenance**, not the academic parent.

---

## 8. Submissions — photo-first (LOCKED)

Default for primary (Cambridge, Uganda/Kenya connectivity):

```text
Open assignment → Snap/Upload → compress → Storage → submission → teacher review
```

- **Photo-first, not photo-only** — multi-photo, text, PDF, document; audio/video later  
- Mobile / shared phone / intermittent 3G–MiFi from day one  
- Tolerate **interrupted uploads**  
- Authenticated Supabase Storage: tenant isolation, student/teacher/guardian access, **no public bucket**

### Submission states (LOCKED minimum)

```text
draft | submitted | late | missing | revision_requested | resubmitted | reviewed
```

Resubmit **must not** destroy history.

---

## 9. AI / scoring rule (LOCKED)

> **Machine scoring = deterministic answer-key / item logic only.**  
> **AI never writes `score`, `grade`, or `marks`.**  
> **Teacher owns every human-marked result.**

AI may: analyse evidence, extract misconceptions, suggest next steps, draft rubrics/feedback, summarize progress, draft parent comms.  
AI may **not** publish academic grades.

---

## 10. Assessment + gradebook (LOCKED shape)

- Assignment ≠ assessment.  
- One **gradebook** for assignment/rubric/quiz/assessment results (no parallel graders).  
- P0: human **rubric** marking (criteria × levels → deterministic total + teacher feedback).  
- P1+: deterministic quizzes (MCQ/TF/matching/short-answer keys), formative/diagnostic/summative types.

Rubric example (teacher taps levels; system sums):

```text
Understanding 3/4 · Method 4/4 · Accuracy 2/4 · Explanation 3/4 → total
```

---

## 11. Progress ≠ completion (LOCKED)

Keep separate:

- activity completion  
- evidence of learning  
- assessment result  
- teacher observation  

They combine into a **learning picture** → intervention.  
Clicking “complete” ≠ mastery.

---

## 12. Live video strategy (LOCKED)

- **Never** native WebRTC/SFU / custom media server.  
- External providers OK: Meet / Zoom / Teams / custom (`buildClassroomLink`).  
- **Do not** stop forever at `target="_blank"`.  
- P1 provider integration priority: meeting create → join-from-app → participant events → **recording webhook** → recording row → catch-up.  
- `online_session_recordings(session_id, provider, url, started_at, ended_at)` — external storage OK.  
- Recording is a **learning artifact** under the activity/lesson, not a bare MP4 library.

---

## 13. Roles & coaching (LOCKED direction)

- **Learning Coach** (parent/guardian) is **configurable** per school/stage — not hard-coded US hours.  
- Optional capabilities: schedule, assignments, overdue, progress, grades, feedback, alerts, offline-work verify, hours sign-off, teacher chat.  
- **Office hours / 1:1** — reuse existing booking patterns (`online_slot_templates`); no second scheduler.  
- Online **engagement** is multi-signal (participation, async work, assessments, coach confirm). School policy defines reporting. Physical attendance ≠ online participation.

---

## 14. Hybrid learners (LOCKED)

**One learner · one academic history · multiple delivery contexts.**  
No duplicate students. No fake physical classes for online-only learners.  
Hybrid may mix physical days/subjects and online days/subjects; schedule + academic record stay coherent.

---

## 15. P0 / P1 / P2 roadmap (LOCKED)

### P0 — Digital Learning Spine

1. **Academic origin correction** (assignments + observations): exclusive origin, `online_offering_id`, optional `online_session_id`, session⊆offering  
2. **`learning_activities`** table + service (types ASSIGNMENT | RESOURCE | LIVE_SESSION)  
3. **Async assignment workflow** — no session required; due / overdue / late / resubmit / revision / history  
4. **Photo-first submission** — compress, multi-image, Storage RLS, interrupted upload  
5. **Human rubric marking** — criteria, levels, deterministic total, teacher feedback  
6. **Minimal gradebook** — student × activity × result × feedback  
7. **Student Today cockpit** — Today · Learning · Due · Overdue · Feedback · Progress · Next  
8. **Teacher cockpit** — marking queue · at-risk foundation (deterministic) · keep OnlineDay / SessionCockpit  

### P1 — Complete online school ops

- Learning Coach (configurable)  
- Office hours (reuse booking)  
- Provider integration (one provider) + recording → catch-up  
- Online pacing / at-risk enrichment  

### P2 — Later

- Deterministic quizzes as one assessment type  
- Discussion / community  
- Report cards  
- Advanced assessment / proctoring  
- Richer analytics  

### Explicit non-goals

- Native WebRTC/SFU  
- AI auto-grading  
- Duplicate LMS curriculum tree  
- Fake physical classes for online-only learners  
- Requiring live video before async work exists  

---

## 16. Success criteria

### Spine DoD (P0 complete)

An online-only Primary learner can, **without a live session**:

1. open an offering/sequence  
2. see a learning activity (assignment/resource)  
3. open resources  
4. photograph handwritten work  
5. submit (photo-first)  
6. receive teacher rubric feedback  
7. see result in gradebook / progress  
8. see due / overdue / next  

A teacher can:

1. see marking queue  
2. review photo submission  
3. apply rubric + feedback  
4. see at-risk foundation signals  

### School DoD (P0–P1)

Full journey: enrol → course path → live when scheduled → async otherwise → assessments → feedback → progress → catch-up on recording → coach/teacher comms → one academic record.

---

## 17. Security / RLS notes (must implement with features)

- Submission files: school-scoped, student-owned, teacher-authorized, guardian-limited, signed URLs  
- Assignments/activities: origin coherent + creator authorized (class teacher / offering teacher / session teacher)  
- Gradebook: teacher write, student/guardian read-scoped  
- Recordings: student/guardian/course permission  
- Online-only students never require `classes.class_id`

---

## 18. Related docs

- Status / handoff: [`2026-09-22-digital-learning-spine-STATUS.md`](./2026-09-22-digital-learning-spine-STATUS.md)  
- Phase 9 ops (sessional centre): [`PHASE-9-ONLINE-LEARNING-CENTRE.md`](./PHASE-9-ONLINE-LEARNING-CENTRE.md)  
- Product audit: [`../audits/2026-09-deep-online-hybrid-school-audit.md`](../audits/2026-09-deep-online-hybrid-school-audit.md)  
- UI: [`2026-09-15-ui-revamp-institutional-glass.md`](./2026-09-15-ui-revamp-institutional-glass.md)

---

## 19. Implementation order (P0 coding)

```text
M1  Migration: origin CHECK + online_offering_id + session∈offering
    + observations same law + is_authorised_assignment_creator update
    + online_offerings.scheme_of_work_id + delivery_pace
M2  Migration: learning_activities (+ optional activity objectives)
M3  Service: learningActivities / async assignment create without session
M4  Service: submissions (state machine) + Storage policy docs
M5  Rubric + gradebook rows
M6  Student Today + Teacher marking/at-risk UI
```

Each slice: typecheck + tests + `verify:*` + update STATUS doc.
