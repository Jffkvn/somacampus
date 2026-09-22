# Digital Learning Spine — P2 Plan (Advanced Learning Platform)

**Date:** 2026-09-22  
**Parent charter:** [`2026-09-22-digital-learning-spine.md`](./2026-09-22-digital-learning-spine.md)  
**Live tracker:** [`2026-09-22-digital-learning-spine-STATUS.md`](./2026-09-22-digital-learning-spine-STATUS.md) §8

> P0 = a learner can learn online.  
> P1 = the school can run online learning.  
> **P2 = a sophisticated academic platform** (assess → report → understand → gather).

Do **not** reopen LOCKED charter decisions. Especially: one academic core / one gradebook, AI never writes score/grade/marks, Progress ≠ completion, no native WebRTC, no AI auto-grading, no duplicate curriculum tree.

---

## 1. Product areas (ship order)

```text
P2A Assessment Engine → P2C Reporting → P2B Academic Intelligence → P2D Learning Community
```

| Area | Question | Contents |
|---|---|---|
| **P2A** | How do we assess against the curriculum? | Quizzes → richer rubrics → assessment packs → exams (last) |
| **P2C** | How does the school report from the same data? | Report cards → parent summary → print/PDF |
| **P2B** | Why is this learner behind? | Evidence-cited analytics → AI gaps → pacing suggestions |
| **P2D** | How do learners learn together safely? | Community layer → teacher-led → structured peer → clubs |

Quizzes/assessments/exams write to **`learning_results`** (extend `result_source`). Report cards read that gradebook. **No second grader.**

---

## 2. P2A — Assessment Engine

### P2A-1 Deterministic quizzes (first slice) — **DONE**
- Types: **MCQ · True/False · Matching · Short answer (key)**.
- Defer: multi-select, ordering, fill-blank, image stems (images stay human-marked).
- Question bank (school-scoped) · marks per question · pass mark · max attempts.
- Quiz parent: `teaching_sequence_id` and/or `online_offering_id` (same law as activities).
- Attempt → score = deterministic key sum. Result: `result_source = 'quiz'`.
- Weak-network: draft attempts autosave; resume on reconnect.
- Teacher override = **new** `learning_results` row + reason (history kept). Never silent overwrite.

### P2A-2 Quiz behaviour polish
Timers · shuffle · retake policy · delayed release · objective links.

### P2A-3 Advanced rubrics
Weights · per-criterion comments · evidence on criteria · moderation · history.  
Total stays a **deterministic** function of teacher taps (explicit weights only).

### P2A-4 Assessment packs
Baseline · diagnostic · unit · midterm · end-of-term · project · practical · oral — mapped to learning objectives:  
`Student → Subject → Curriculum → Objectives → Evidence → Result`.

### P2A-5 Exams (P3 unless stable)
Papers · schedule · candidates · duration · grade boundaries · audit.  
**Out of scope:** invigilation, seating, exam-hall hardware.

---

## 3. P2C — Reporting — **P2C-1/2 DONE**
1. Report card from **live** academic data only (subjects, objectives, assessments, scores, teacher comments, strengths, next steps, engagement/attendance where applicable).
2. Parent-facing wording (guardian-safe).
3. Print / PDF + archived version (Archive-Never-Delete).
4. **DoD:** one term report for one learner with objective-level breakdown from the live gradebook.

---

## 4. P2B — Academic Intelligence
1. **Evidence-cited analytics** (student · class · teacher · school · online centre). Every claim names the rows. Else: “Not enough evidence.”
2. **AI gap detection** — repeated misconceptions from teacher-confirmed evidence. **Recommend only.**
3. **Pacing / intervention suggestions** — store evidence links + rationale. Never auto-assign or auto-grade.

---

## 5. P2D — Learning Community

**Principle: Community maturity follows learner maturity.**  
Default is **teacher-led at every age**. Peer is a **school policy flag** (stage + optional age floor), not a birthday.

| Typical band | Model |
|---|---|
| 5–10 | Teacher → learners only (challenges, show-and-tell, curated responses) |
| 11–12 | Teacher-led + controlled peer (structured peer review, moderated replies) |
| 13–17 | Moderated communities · clubs · study groups · peer Q&A |
| 18+ | Out of P2 |

### Architecture
One Community & Collaboration layer (same pattern as Learning Coach flags):  
scope = school · programme · cohort · stage · type · moderator · safeguarding flags.  
Types: `teacher_led` · `study_group` · `peer_review` · `club`.  
Moderation queue **mandatory** before free peer. Under-13: parent read visibility.

### Hard rules
- Peer scores **never** enter the gradebook without teacher confirmation.
- Structured peer review uses **teacher-owned rubric prompts** first.
- Group work with contribution tracking comes **after** structured peer review.

---

## 6. Testing rules (every P2 slice)
1. Unit/domain tests for scoring + policy pure functions.
2. Service tests — fail closed on DB errors; honest empties on mock.
3. **UI tests with screenshots for every role touched** (signed-in, not shells).
4. Write-path E2E with seeded live data when academic data is mutated.
5. Update **STATUS §3 / §4 / §8 in the same PR.**

---

## 7. Status legend
| Mark | Meaning |
|---|---|
| Not started | Scoped only |
| In progress | Code/UI landing |
| Done | Merged + tests + STATUS updated |
| Deferred / P3 | Intentionally later |

---

## 8. Explicit P2 non-goals
- Native WebRTC/SFU · AI auto-grading · second curriculum tree · fake physical classes for online-only learners
- Open social network for young children · unsupervised peer without school policy
- Exam invigilation / seating / proctoring hardware
- Vanity analytics without evidence citations
