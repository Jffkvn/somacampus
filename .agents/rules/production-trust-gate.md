# SomaCampus Production Trust Gate & Engineering Rules

These rules are non-negotiable across all development, testing, refactoring, and review workflows in the SomaCampus codebase.

---

## 1. Mock Honesty & Zero In-Memory Cheats
- **Never Declare In-Memory Fallbacks in Runtime Code**: Service files (`src/modules/*/*Service.ts`) must NEVER declare mutable in-memory state arrays (e.g., `let mock* = []`, `const fallback* = []`) to mask missing tables or RPCs.
- **Fail Closed on Database Failures**: When the database is unreachable, schema cache errors occur, or RLS denies access, services must throw honest, descriptive errors. They must never silently return synthetic records.
- **No Hardcoded Zeroes or Synthetic IDs**: Never write synthetic placeholders like `usedDays: 0` or `id: 'mock-' + Date.now()` in runtime services to get a green test. Tests must pass against real domain logic or explicit test-suite mocks (`vi.spyOn`, `vi.mock`), never by corrupting runtime code.

---

## 2. Database Contract Alignment
- **PostgreSQL is the Inviolable Source of Truth**: UI dropdowns, form payloads, and service methods must match PostgreSQL schema definitions:
  - Dropdown values must align with `CHECK` constraints (e.g., `student_enrolments.exit_reason`).
  - If the UI needs granular user-facing options not yet in the database enum, the service layer must normalize to an allowed enum value at the boundary and preserve the raw text in an explicit notes column (e.g., `exit_notes`).
  - Never silently drop user input at the service boundary.
- **Identity Types**: Always distinguish between Supabase Auth UIDs (`auth.users.id`) and institutional identity (`public.people.id`). Foreign keys referencing `people(id)` must be resolved via `resolvePeopleId()` before write.

---

## 3. Server-Side Data Protection (Defense in Depth)
- **Database-Level Gating Required**: Sensitive personal and financial data (guardian personal phones, staff compensation, payroll slips, cash movement ledgers) MUST be gated in PostgreSQL via `SECURITY DEFINER` RPCs or Row Level Security (RLS).
- **Never Rely Exclusively on React Conditional Rendering**: Gating via `{canManage ? phone : null}` in JSX is client-side cosmetic hiding, not security. Non-office roles must receive redacted or emergency-only payloads directly from the database response.

---

## 4. Honest End-to-End Testing (No Superficial Green Ticks)
- **Zero Tolerated PostgREST or API Errors**: An automated E2E browser run MUST NOT declare `PASS` if any of the following occur during traversal:
  - PostgREST errors (`PGRST*` like ambiguous joins or missing tables).
  - Unhandled JavaScript exceptions (`pageerror`).
  - HTTP 4xx or 5xx responses on application API endpoints.
- **Smoke vs Verification Labeling**: If a test checks only that the page renders a shell/heading without verifying underlying data persistence, it must be explicitly labeled as `SMOKE_ONLY`, never claimed as "100% verified and production ready."

---

## 5. Archive-Never-Delete Doctrine
- **Soft-Archival Only**: In school operations (pupils, staff, timetable appointments, curriculum allocations, attendance records, inventory items), historical auditability is mandatory.
- **Forbid Raw Hard Deletes**: Code must never invoke `.delete()` on operational records. Use `is_active = false`, `archived_at = now()`, or closed validity date intervals (`effective_to = now()`).

---

## 6. Live Migration Verification
- **A Migration File on Disk is Not a Live Feature**: A feature that requires a migration is NOT complete until that migration has been applied to the target live/staging database and verified against the PostgreSQL catalog (`information_schema` or live RPC probe).
- **Safe SQL Standards**: Never write SQL statements requiring ungrantable permissions on hosted platforms (e.g., `COMMENT ON storage.buckets`). Always reference `public.people`, not non-existent tables like `public.users`.

---

## 7. Client-Side Privilege Escalation Hardening
- **Dev Persona Switcher Bounds**:
  - The `somacampus_dev_role` localStorage override must be cleared immediately upon `signOut()`.
  - Initial fallback role must default to least-privilege (`teacher` or `student`), never `principal` or `admin`.
  - The dev role switcher must be strictly gated behind `import.meta.env.DEV` so it cannot be invoked in production bundles.
