# SomaCampus — AI Gateway Plan (whole product)

**Date:** 2026-09-22  
**Charter:** [`2026-09-22-digital-learning-spine.md`](./2026-09-22-digital-learning-spine.md)  
**P3:** [`2026-09-22-digital-learning-spine-P3.md`](./2026-09-22-digital-learning-spine-P3.md)  
**Live tracker:** [`2026-09-22-digital-learning-spine-STATUS.md`](./2026-09-22-digital-learning-spine-STATUS.md) §10  

> **One gateway · many tasks · one key · different risk gates.**  
> Not `exam-ai` / `payroll-ai` / `timetable-ai` stacks.

---

## 0. Locked AI principle (charter wording)

> **AI may draft, extract, explain, summarise, or recommend.**  
> **Deterministic rules** (answer keys, rubric sums, school grading formulas) **may compute results** — they are not AI.  
> **A responsible human must approve** any consequential academic, financial, HR, or operational decision **before it is authoritative system data**.  
> **AI never invents academic facts or bypasses that approval.**

Supporting locks (already in product):
1. **AI never writes score/grade/marks** as author of record (extract/summarise only, teacher confirms).
2. **One gateway** — extend `supabase/functions/ai-teaching-assistant` (`provider.ts`, `guard.ts`, `aiSchemas.ts`).
3. **Keys** — `AI_PROVIDER` (default `gemini`) · `GEMINI_API_KEY` · `GEMINI_MODEL` on the **edge function** env. Never `VITE_*`. OpenAI later via the same provider switch.
4. **Mark entry cost policy** — **manual per class is the default**; photo/OCR assist is school-config **off by default** (small schools / one-offs only — not 1,000+ learner exam weeks).
5. **No exam-hall / proctor AI** in core roadmap (sitting stays at the school).
6. **Evidence or silence** — analysis/comments cite `learning_result` / observation ids (P2B).
7. **Audit every call** — `task` · actor · `input_refs` · model · `output_hash` · `approved_by/_at`.
8. Ship unit tests + **signed-in UI tests (screenshots)** + STATUS updated in the same PR.

---

## 1. Risk-tiered gates (same model, different unlock)

| AI job | Risk | Gate before authoritative |
|---|---|---|
| Draft exam question / paper | Low | Teacher edit + **Approve paper** |
| “Sarah scored 74” (extract) | **High** (academic record) | Teacher **verify rows** (two-tier confirm) |
| “P5 is weak on fractions” | Medium | Evidence links + teacher accept |
| Report / parent comment draft | Medium-high | Teacher edit + **Issue** (immutable snapshot) |
| Timetable explain / propose swap | Medium | Principal **publish / attest** |
| Payroll variance brief | **High** (money) | Deterministic compare first + **Bursar approve** |
| HR letter / JD draft | Medium | HR approve |

**Two-tier confirm on mark extract (P3-E):**
- High-confidence rows → checkbox **confirm selected**
- Low-confidence rows → **must edit**, not just tick  
- Output includes `confidence` + `sourceLine` (photo `bbox` later). Never silently fills the mark column.

**Per-question regenerate** on papers is v2 polish — whole-paper regen + edit is enough to ship.

---

## 2. Pipelines (AI slots only where they help)

```text
PAPER    past paper + teacher brief → AI draft → teacher edit → APPROVE → PRINT
MARKS    (default) teacher types class sheet → record_exam_mark
         (opt-in) photo → AI extract → tiered confirm → record_exam_mark
RESULTS  marks → deterministic grade (mean | total | aggregate·division)
REPORT   evidence → AI comment draft (cited) → teacher edit → ISSUE (immutable)
ANALYSIS results → AI explain_results (must cite) → teacher accept → suggestions
TIMETABLE scorecard (authoritative) → AI explain / propose swap → Principal attest
PAYROLL  rule compare last 2 months vs run (authoritative flags) → AI brief → Bursar approve
```

---

## 3. Gateway task catalogue

| `task` | Lane | Status | Output contract |
|---|---|---|---|
| `generate_assignment_draft` | Academic | **Exists** | Draft; `aiDraftApprovedBy` |
| `suggest_intervention` | Academic | **Exists** | Evidence-linked suggestion |
| `session_summary` | Academic | **Exists** | Session note draft |
| `draft_comms` | Academic | **Exists** | Message draft |
| `draft_exam_paper` | Academic | Wire from P3-D | Sections/questions/marks; `isDraft` |
| `extract_marks` | Academic | Wire from P3-E | Rows + `confidence` + `sourceLine` |
| `explain_results` | Academic | New (P2B name: **evidence-cited analysis**) | Claims + evidence refs |
| `draft_report_comment` | Academic | New | Comment + evidence refs only |
| `timetable_explain` / `propose_swap` | Ops | New | Swap + scorecard delta |
| `payroll_run_brief` | **Ops (not P3)** | New after AI-1 | Narrative over rule flags |

One name for analysis: **evidence-cited analysis** (do not fork P2B).

---

## 4. Lanes (keep the product story clean)

| Lane | Owns | AI role |
|---|---|---|
| **Academic (P0–P3)** | Learn → assess → record → report | Papers · extract · analysis · comments |
| **School ops** | Timetable · payroll · HR · inventory | Explain · propose · brief |
| **P4 / customer-funded** | Exam hall | None in core |

**Payroll (egypro pattern) — ops lane:**
1. **Deterministic compare first** (SQL, free, auditable): current vs last month vs month-before per staff; flags = new joiner · ±% jump · missing line · OT spike · allowance add/remove.  
2. **AI brief second** over those flags only.  
3. **Bursar approves** — AI never posts payroll.

**Timetable:** scorecard/solver stays authoritative; AI only explains and proposes.

---

## 5. Evidence-cited comments

- Every claim in an AI report/parent comment maps to result/observation ids the teacher can see.  
- Must not imply mastery the gradebook does not support (**Progress ≠ completion**).  
- Teacher edit + **Issue** freezes the snapshot (P3-C law).

---

## 6. Gateway audit

Store per call: `task` · `actor_id` · `input_refs[]` · `model` · `output_hash` · `approved_by` · `approved_at` · `school_id`.  
Head teachers and bursars will ask *“who signed this?”*

---

## 7. Ship order

| ID | Item | Lane | Status |
|---|---|---|---|
| **AI-0** | This plan + principle + tracker | — | **Done** |
| **AI-1** | Payroll **rule compare** (2-month variance flags) | Ops | Not started |
| **AI-2** | Payroll **AI brief** (`payroll_run_brief`) | Ops | Not started |
| **AI-3** | Wire `draft_exam_paper` → gateway (replace stub) | Academic | Not started |
| **AI-4** | Wire `extract_marks` + tiered confirm (photo path **off by default**) | Academic | Not started |
| **AI-5** | `explain_results` (evidence-cited; reuse P2B) | Academic | Not started |
| **AI-6** | `draft_report_comment` (evidence-cited) | Academic | Not started |
| **AI-7** | Timetable explain / propose swap | Ops | Not started |
| **AI-8** | `ai_gateway_audit` table + wiring | Core | Not started |
| **AI-9** | HR / comms polish (optional) | Ops | Not started |

---

## 8. Testing rules

1. Domain tests for risk gates (tiered confirm, evidence-required claims).  
2. Provider tests already cover fail-closed Gemini config (`AI_PROVIDER_UNCONFIGURED`).  
3. Never accept model output that claims grades without a human path.  
4. Write-path E2E for every new authoritative write (approve paper · confirm marks · issue comment).  
5. Cost: tiny OCR fixtures in CI — never bulk 1,000-learner photo extract.

---

## 9. Non-goals

- Separate AI products per module · `VITE_*` AI keys · AI auto-grading / auto-payroll / auto-publish  
- Proctoring / exam-hall AI · second curriculum or gradebook  
- Silent mark fill · un-cited report comments · invented academic facts  
- Bulk photo OCR for large exam weeks (see cost policy)  
