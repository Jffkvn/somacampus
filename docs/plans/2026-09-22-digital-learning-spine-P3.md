# Digital Learning Spine — P3 Plan (Assessment & Academic Records)

**Date:** 2026-09-22  
**Parent charter:** [`2026-09-22-digital-learning-spine.md`](./2026-09-22-digital-learning-spine.md)  
**P2 plan:** [`2026-09-22-digital-learning-spine-P2.md`](./2026-09-22-digital-learning-spine-P2.md)  
**Live tracker:** [`2026-09-22-digital-learning-spine-STATUS.md`](./2026-09-22-digital-learning-spine-STATUS.md) §9

> **P0 Learn · P1 Run · P2 Understand · P3 Record**  
> P3 is **not** a digital examination hall. It is where the school **makes, marks, counts, and reports** formal assessment.

---

## 0. Product principle (LOCK)

1. **SomaCampus digitises where software creates real operational and learning value, and fits around physical, paper, teacher-led workflows schools will keep using.**
2. **SomaCampus records and processes school assessment; it does not replace the physical examination system or national examination authorities.**
3. **One academic core / one gradebook** — formal exam marks write `learning_results` (extend `result_source`). No second grader.
4. **AI never writes score/grade/marks** — AI may draft papers and assist mark-sheet entry; **the teacher confirms** every academic result.
5. **Live academic data ≠ issued historical document** — issued term reports are immutable snapshots.
6. **Examination administration is outside SomaCampus** (in-person / school policy). No invigilation, proctoring, seating, exam browser in P3.
7. Ship with unit tests + **signed-in role UI tests (screenshots)** + STATUS updated in the same PR.

---

## 1. Teacher’s week (the product)

```text
Past papers / format template
    → teacher sets topics (curriculum objectives)
    → SomaCampus drafts paper (teacher edits & APPROVES)
    → PRINT → school runs the sitting (outside SomaCampus)
    → teacher marks scripts
    → enter marks (photo assist later; human confirms)
    → school grading config (mean | total | aggregate/division)
    → learning_results (one gradebook)
    → ISSUE term report (immutable)
    → print or send to parent portal
```

---

## 2. Scope by slice (ship order)

| ID | Slice | Scope | Status |
|---|---|---|---|
| **P3-A** | **Grading & aggregates** | School grading table (% → grade) · formula `mean` \| `total` \| `aggregate_division` · subject weights optional · division labels | **In progress** |
| **P3-B** | **Exam sitting + mark entry** | Thin exam (subject, class, term, date, max marks, venue text) · candidates from enrolments · mark column · write `learning_results` | Not started |
| **P3-C** | **Paper production** | Format template from past paper (sections, marks, stems heuristics) · topic-driven draft · teacher edit/approve · **printable PDF** | Not started |
| **P3-D** | **Issued term reports** | Issue snapshot (immutable) · marks per subject · mean/total/aggregate · comments · branding · print + parent portal | Not started |
| **P3-E** | **Results slip** | Compact formal output (subjects, marks, grades, aggregate/division, school header) | Not started |
| **P3-F** | **Paper evidence + mark-sheet assist** | Attach photo/scan of mark sheet or script · **suggest** extracted marks · teacher **confirm** | Not started |
| **P3-G** | **Promotion record (thin)** | Year → next · promoted/repeat/transfer · decided by + date + reason | Not started |

### Explicitly out of P3
- Online invigilation · webcam proctoring · seating · biometrics · secure exam browser · live exam monitoring  
- Replacing UNEB / Cambridge infrastructure  
- Auto-committed extracted marks (suggest only)  
- Promotion ↔ fees clearance engines (unless a customer funds it)

### Customer-funded / later (not on the active roadmap)
**Digital Examination Infrastructure** (the hall). Only if a paying customer requires it.

---

## 3. Architecture notes

- **Exam** is a thin container around results (not a parallel LMS).  
- **Paper** (P3-C) is an artifact: draft → approved → printable. Sittings stay physical.  
- **Grading config** is per school (never hard-code Uganda only — but ship UG aggregate/division as a named preset).  
- **Issued report** stores a **JSON snapshot + render params** so later gradebook edits cannot mutate history.  
- Extract assist (P3-F) never writes without `confirm` (same law as quiz keys / suggestions).  
- `delivery` policy flag only: `in_person_only` (default) | `pdf_allowed`. Not an exam engine.

---

## 4. Testing rules (every P3 PR)

1. Unit/domain tests for grading math (boundaries, weights, aggregate, division).  
2. Service tests — fail closed on DB errors; honest empties on mock.  
3. **Signed-in UI tests with screenshots** for every role touched (teacher · student · parent).  
4. Write-path E2E with seeded live data when academic data is mutated (marks → `learning_results`, issue report).  
5. **Update STATUS §3 / §4 / §9 in the same PR.**

---

## 5. Success criteria (P3 done when…)

1. Teacher configures a grading table (e.g. 80–100 = A) and formula (`mean` / `total` / `aggregate_division`).  
2. Teacher creates a thin exam sitting and enters marks for a candidate list; rows appear in `learning_results`.  
3. Teacher drafts a paper from a template + topics, edits it, **prints** a school-style exam.  
4. School **issues** a term report (marks per subject + configured overall) that **cannot change** if the gradebook later changes.  
5. Parent can view/download the issued report.  
6. Full `npm test` + signed-in UI screenshots + Trust Gate green.

---

## 6. Non-goals recap
Digital exam hall · AI auto-grading · second gradebook · forced digital sittings · national examination certification.
