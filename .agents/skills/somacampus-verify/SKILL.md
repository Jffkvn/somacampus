---
name: somacampus-verify
description: >-
  Executes the SomaCampus 5-stage production trust verification gate.
  Use whenever verifying code changes, running pre-commit or pre-push quality checks,
  checking mock honesty, auditing UI-DB schema contracts, auditing data protection and RLS boundaries,
  or validating E2E test runs.
---

# SomaCampus Production Trust Verification Gate

This skill equips agents, subagents, and engineers to rigorously verify that SomaCampus codebase changes adhere to the 7 Non-Negotiable Engineering Laws defined in `.agents/rules/production-trust-gate.md`.

---

## The 5-Stage Verification Gate Runbook

Before any code is merged to `main` or declared "done", execute all 5 stages in sequence:

```
┌────────────────────────────────────────────────────────┐
│ Stage 1: Mock Rot & In-Memory Cheat Detection          │
│ node .agents/skills/somacampus-verify/scripts/         │
│      detect-mock-rot.mjs                               │
└────────────────────────┬───────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────┐
│ Stage 2: Schema & DB Contract Audit                    │
│ node .agents/skills/somacampus-verify/scripts/         │
│      audit-db-contracts.mjs                            │
└────────────────────────┬───────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────┐
│ Stage 3: Migration Catalog & SQL Safety Audit          │
│ node .agents/skills/somacampus-verify/scripts/         │
│      check-migration-sync.mjs                          │
└────────────────────────┬───────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────┐
│ Stage 4: Typecheck & Full Automated Unit/Module Tests  │
│ npm run typecheck && npm test                          │
└────────────────────────┬───────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────┐
│ Stage 5: Honest Browser E2E Traversal                  │
│ node scripts/verify-browser-playwright.mjs             │
└────────────────────────────────────────────────────────┘
```

---

## Stage 1: Mock Rot & In-Memory Cheat Detection

**Script**: `node .agents/skills/somacampus-verify/scripts/detect-mock-rot.mjs`

### What it checks:
1. Scans all runtime service files (`src/modules/**/*Service.ts` and `src/services/**/*.ts`).
2. Flags mutable in-memory arrays (e.g. `let mock* = []`, `const fallback* = []`, `let memoryStore = []`).
3. Flags hardcoded zeroes used as synthetic metric placeholders (e.g. `usedDays: 0`, `balance: 0`).
4. Flags swallow-and-mask error patterns (`catch (e) { return []; }` or returning fake data on error).
5. Enforces fail-closed behavior: runtime services MUST throw informative errors on DB failures.

---

## Stage 2: Schema & DB Contract Audit

**Script**: `node .agents/skills/somacampus-verify/scripts/audit-db-contracts.mjs`

### What it checks:
1. Parses PostgreSQL migration files in `supabase/migrations/` for `CHECK` constraints, column names, and enum types.
2. Compares UI select/radio options and service types against DB constraints:
   - Withdrawal reasons (`student_enrolments.exit_reason` CHECK constraint).
   - Staff and pupil status enums.
   - Role names (`admin`, `principal`, `bursar`, `teacher`, etc.).
3. Verifies that user-provided freeform input has a dedicated persistence column (e.g., `exit_notes` on withdrawals).
4. Verifies that foreign keys targeting institutional identities use `public.people(id)` rather than Supabase Auth UIDs (`auth.users(id)`).

---

## Stage 3: Migration Catalog & SQL Safety Audit

**Script**: `node .agents/skills/somacampus-verify/scripts/check-migration-sync.mjs`

### What it checks:
1. Validates migration filename chronological order and naming format (`YYYYMMDDHHMMSS_name.sql`).
2. Checks for forbidden SQL patterns:
   - `COMMENT ON storage.buckets` (ungrantable permission on managed Supabase).
   - Direct references to non-existent tables like `public.users`.
   - `USING (true)` RLS policies on institutional tenant data.
   - Raw `DELETE FROM` statements in production RPCs (Archive-Never-Delete doctrine).
3. Verifies migration completeness and idempotency (`IF NOT EXISTS`, `OR REPLACE`).

---

## Stage 4: Typecheck & Full Automated Unit Tests

**Command**: `npm run typecheck && npm test`

### Standards:
- Zero TypeScript errors (`tsc --noEmit` must return code 0).
- All Vitest test suites must pass without skipped regressions.
- Test mocks must use Vitest mocking utilities (`vi.spyOn`, `vi.mock`, `msw`) and live in `src/test/`, NEVER embedded in runtime source code.

---

## Stage 5: Honest Browser E2E Traversal

**Command**: `node scripts/verify-browser-playwright.mjs`

### Standards:
1. Every traversed route monitors `console.error` and `pageerror`.
2. If any route triggers:
   - PostgREST errors (`PGRST*`),
   - HTTP 4xx or 5xx API failures, or
   - Uncaught JavaScript runtime exceptions,
   the route MUST NOT be marked `PASS`. It must be marked `FAIL` or `WARN` with full error details.
3. Tests that only verify DOM element visibility without data mutations must be labeled honestly as `SMOKE_ONLY (DOM rendered, no data mutation asserted)`.
4. Artifact reports (`browser_test_report.json`) must accurately reflect all errors and warning counts.

---

## One-Line Verification Shortcut

```bash
npm run verify:all
```
