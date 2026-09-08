# SomaCampus AI Teaching Loop: Operational Architecture & Verification Walkthrough

## 1. Executive Summary

This document certifies the end-to-end implementation and live database verification of the **Closed Operational AI Teaching Loop** in SomaCampus. 

The entire workflow is anchored in a concrete primary school vertical slice:
- **School**: Grace's Cambridge Centre (GCC) — `school_id: '22222222-2222-2222-2222-222222222222'`
- **Cohort**: Primary 5 Mathematics (Stage 5 Blue) — `class_id: '55555555-5555-5555-5555-555555555551'`
- **Teacher**: David Musoke — `teacher_id: '99999999-9999-9999-9999-999999999992'`
- **Curriculum Standard**: Cambridge Primary **`5Nn.01`** (*Understand that equivalent fractions represent the same quantity, and convert between fractions, decimals and percentages*).

Every consequential action remains strictly **teacher-controlled**.

---

## 2. Inviolable Governance Laws & Production Invariants

1. **Law 1 — Mock Honesty & Zero In-Memory Cheats**:
   Runtime services (`src/modules/*/*Service.ts`) never declare mutable mock/fallback arrays (`let mock* = []`) to mask missing tables or RPCs. Services fail closed on DB errors. Verified clean across 39 services via `npm run verify:trust`.

2. **Law 2 — Absolute Rule: Zero AI Grading**:
   AI does **NOT** score, grade, assign percentages, calculate marks, or diagnose student pathology. AI acts strictly as an analytical observer that extracts qualitative misconceptions and learning progress.

3. **Law 3 — Server AI Provider Boundary**:
   Zero secrets or Gemini API keys in Vite client bundles. Client requests route through the deployed Supabase Edge Function `ai-teaching-assistant`.

4. **Law 4 — Database Publication Gate**:
   PostgreSQL trigger `trg_assignments_ai_publication_gate` and CHECK constraint `chk_assignments_ai_approval_publish_gate` physically reject any direct SQL, RPC, script, or service attempting to publish an AI draft without verified educator approval (`approval_state = 'approved'`).

5. **Law 5 — Multi-Tenant Resource Isolation**:
   Resource library records are isolated by tenant (`school_id`) with Row Level Security enforcing strict school boundaries.

---

## 3. The 9-Stage Closed Operational Loop

The teaching loop connects curriculum planning, student physical work, evidence extraction, longitudinal profiling, and next-lesson intervention:

```
                               ┌─────────────────────────────────────────┐
                               │ 1. Cambridge Primary Standard (5Nn.01)   │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 2. Resource Library (Search-1st)        │
                               │    [Use As-Is] [Adapt] [Generate Ground] │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 3. Server Edge Function (5-Layer Engine)│
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 4. Human Educator Review & Approval     │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 5. Database Publication Gate (Enforced) │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 6. Student Work Captured (Notebook/Doc) │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 7. AI Evidence Extraction               │
                               │    (Strictly Qualitative • NO GRADING)  │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 8. Teacher Approves Observation         │
                               │    ──► Saved to Longitudinal Profile    │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │ 9. AI Suggests Targeted Next Step       │
                               │    ──► Teacher Accepts Intervention     │
                               │    ──► Pre-Lesson Briefing for Tomorrow │
                               └─────────────────────────────────────────┘
```

### Stage-by-Stage Implementation Details

#### Stage 1: Cambridge Primary Standard Grounding
- Anchored in authoritative Cambridge Primary Standard `5Nn.01`.
- Verified in `src/curriculum/packs/cambridge_primary.ts`.

#### Stage 2: Resource Library Search-Before-Generate
- Service: [`src/modules/teaching/resourceLibraryService.ts`](../../src/modules/teaching/resourceLibraryService.ts)
- Page: [`src/modules/teaching/ResourceLibraryPage.tsx`](../../src/modules/teaching/ResourceLibraryPage.tsx)
- Live remote table: `public.school_resources` (6 approved Cambridge items seeded for Grace's Cambridge Centre).
- Actions available in Assignment Studio:
  - **[Use As-Is]**: Directly applies vetted school curriculum resources.
  - **[Adapt with AI]**: Modifies approved school material to differentiate for specific student needs.
  - **[Generate Grounded Draft]**: Generates new content strictly anchored in vetted school resources and Cambridge standards.

#### Stage 3: Server AI Provider Boundary
- Edge Function: [`supabase/functions/ai-teaching-assistant/index.ts`](../../supabase/functions/ai-teaching-assistant/index.ts)
- Proxies requests to Gemini server-side or provides high-precision grounded synthesis when running offline.

#### Stage 4 & 5: Human Educator Approval & Database Publication Gate
- Form: [`src/modules/teaching/AssignmentCreatePage.tsx`](../../src/modules/teaching/AssignmentCreatePage.tsx)
- Domain Guard: [`src/modules/teaching/assignmentDomain.ts`](../../src/modules/teaching/assignmentDomain.ts)
- Migration: [`supabase/migrations/20260919000000_ai_teaching_loop_hardening.sql`](../../supabase/migrations/20260919000000_ai_teaching_loop_hardening.sql)
- If `is_ai_drafted = true` and `requires_human_approval = true`, database trigger `trg_assignments_ai_publication_gate` aborts with exception if `approval_state != 'approved'` or `ai_draft_approved_by IS NULL`.

#### Stage 6: Physical and Digital Student Work Capture
- Review Page: [`src/modules/teaching/AssignmentReviewPage.tsx`](../../src/modules/teaching/AssignmentReviewPage.tsx)
- Roster lists all enrolled pupils (John Okello, Grace Achieng, Brian Kigozi, Doreen Nalubega).
- Supports physical evidence:
  - `workType: 'notebook' | 'written' | 'photo_reference' | 'file_reference'`
  - `workSummary` notes physical page numbers, exercises attempted, and observed working.

#### Stage 7: AI Qualitative Evidence Extraction (No AI Grading)
- Teacher clicks **[AI Evidence]** for a submission.
- Calls `teachingAiService.extractObservationDraftFromWork`.
- Renders amber card with mandatory governance badge:
  `Strictly Qualitative Evidence • No AI Grading, Marks, or Diagnostic Labels`
- Drafts concrete qualitative observations (e.g. *Learner demonstrates understanding of common denominator fractions, but showed friction converting unlike denominators in questions 5-7*).

#### Stage 8: Teacher Approval into Student Longitudinal Profile
- Teacher inspects and edits observation text freely.
- Clicks **[Approve & Record Evidence]**.
- Persists to remote PostgreSQL table `teacher_observations` linked to `student_id`, `teacher_id`, `class_id`, `subject_id`, and `assignment_id`.

#### Stage 9: Targeted Next-Step Intervention & Next-Lesson Briefing
- For students exhibiting friction or misconceptions, teacher clicks **[Suggest Next Step]**.
- AI proposes a targeted 14-day small-group retrieval action (e.g. *Conduct structured 15-minute small-group retrieval practice with concrete fraction strips twice weekly*).
- Teacher clicks **[Accept Intervention]**.
- Persisted to PostgreSQL table `interventions` (`status = 'active'`) with linked evidence in `intervention_evidence`.
- Immediately becomes visible in the teacher's Morning Workspace ([Teacher Today](../../src/modules/teacher/TeacherTodayPage.tsx)) pre-lesson briefing for the next scheduled class!

---

## 4. Visual Certification Evidence

### Step 1: Resource Library & Search-Before-Generate (`/teaching/resources`)
Vetted Cambridge Primary learning materials available for one-click adoption or adaptation:
![Resource Library](./screenshots/16_resource_library.png)

### Step 2: Cambridge AI Teaching Assignment Studio (`/teaching/assignments/new`)
5-layer curriculum grounding engine with explicit human approval checkbox:
![AI Assignment Studio](./screenshots/17_ai_teaching_assignment_studio.png)

### Step 3: Qualitative Evidence Extraction Modal (`/teaching/assignments/:id`)
Strictly qualitative misconception and progress extraction with zero AI grading badge:
![AI Evidence Extraction](./screenshots/18_ai_evidence_extraction_loop.png)

### Step 4: AI Next-Step Targeted Intervention Flow
Educator acceptance gate linking evidence to longitudinal intervention profile:
![AI Intervention Suggestion](./screenshots/19_ai_intervention_suggestion.png)

---

## 5. Verification Results Matrix

All verification commands executed against the live remote database and local Vite server:

| Verification Gate | Command | Scope | Result |
|---|---|---|---|
| **Production Trust Gate** | `npm run verify:trust` | 39 runtime services | **0 errors, 0 warnings** (Zero mock rot) |
| **Database Contracts** | `npm run verify:contracts` | UI forms to PostgreSQL constraints | **PASS** (100% aligned) |
| **Migration Safety** | `npm run verify:migrations` | 60 remote migrations catalog | **PASS** (RLS verified, no ungrantable statements) |
| **Type Validation** | `npm run typecheck` | TypeScript compiler (`tsc -b`) | **PASS** (0 type errors) |
| **Automated Tests** | `npm test` | Vitest test suites | **80 passed (700 tests passed, 0 failed)** |
| **Browser Traversal** | `node scripts/verify-browser-playwright.mjs` | 20 operator routes in Chrome | **PASS (0 console errors, 0 runtime errors)** |
