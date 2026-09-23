# P3 Completion / Hardening Pass

**Date:** 2026-09-22  
**Status tracker (live):** [`2026-09-22-digital-learning-spine-STATUS.md`](./2026-09-22-digital-learning-spine-STATUS.md)  
**Rule:** tick each item in this file **in the same PR** as the fix.

> P3 core is implemented. This pass is **finish & harden**, not rebuild.

### Locked product wording
- SomaCampus owns **assessment creation, marks, grading, academic records, reports**.
- The school owns **how the exam is administered and supervised** (in person · PDF · camera · other).
- **Manual mark entry is the default**; photo of first-page marks is optional **read + teacher confirm**.
- **AI never becomes the mark or the grade.**

---

## Checklist

### Priority 1 — Academic-record correctness
- [x] **H1** Fix `reportCardService` objective `maxScore` (ceiling from rubric `maxPoints`, never earned points)
- [x] **H2** Report window = **Academic Year + Term** (`currentAcademicWindow` from `academic_years.is_current`)
- [x] **H3** Report subject averages use **P3 grading** when a `grading_scales` row exists

### Priority 2 — Paper authoring (no dead ends)
- [x] **H4** Teacher can **edit / add / delete** questions (text + marks) before approve
- [x] **H5** AI failure → `createManualDraft` **persists** paper (Approve never blocked)

### Priority 3 — Mark-sheet photo (optional path)
- [x] **H6** Real **photo upload** (`capture=environment`) → vision extract (`photoDataUrl` on `extract_marks`) → confirm

### Priority 4 — Governance & handoff
- [x] **H7** Approve audit fills `output_hash` + `approved_at` (paper approve path)
- [x] **H8** `.env.example` → `AI_PROVIDER` / `GEMINI_*` / `OPENAI_*` / `RECORDING_WEBHOOK_SECRET`
- [x] **H9** STATUS **CURRENT STATE** block added (single entry point for handoff)

### Priority 5 — School branding
- [x] **H10** Report pack school code derived from school name (no hardcoded `GCC`)

---

## Done log
- **2026-09-22** — All H1–H10 applied in one hardening pass. `npm test` 953 passed · typecheck PASS.
- H1: `reportCardService` + `buildRubricMarks` now carry `maxPoints` ceiling.
- H2: `currentAcademicWindow(schoolId)` reads `academic_years.is_current`.
- H3: subject averages recomputed via `gradingDomain.buildSubjectResults` when a scale exists.
- H4: paper builder question text/marks edit · delete · add · redo.
- H5: `paperService.createManualDraft` persists deterministic draft on AI failure.
- H6: mark-sheet photo input + `photoDataUrl` through `extract_marks` → Gemini/OpenAI vision.
- H7: `paper.approve` writes `ai_gateway_audit` with `output_hash` + `approved_at`.
- H8/H9: env + STATUS handoff cleaned for LLM pickup.
- H10: `ReportPackDocument` schoolCode from school name (3-letter).
