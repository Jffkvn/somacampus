# SomaCampus Phase 9: Online Learning Centre — Architectural Record & Hardening

## Overview & Foundational Invariants

SomaCampus Phase 9 introduces the **Online Learning Centre**, operating on the principle of **Two Operations, One Academic Core**:
1. **Physical School** (Centred on classes, streams, daily morning register, and timetable blocks)
2. **Online Learning Centre** (Centred on programmes, offerings, flexible slots, sessional bookings, and digital sessions)

Both operations share:
- A single unified academic curriculum engine (Phase 6 learning objectives & frameworks).
- A single assignment & evidence repository (`assignments`, `student_submissions`, `teacher_observations`).
- A single financial and billing ledger (`student_charges`, `fee_categories`).
- A single payroll engine (`school_payroll_runs`, `school_payroll_items`).
- A single identity model (`people`, `students`, `employees`, `user_roles`).

### Master Invariants

1. **Participation ≠ Physical Attendance**:
   - Physical morning roll-call attendance remains strictly preserved at the stream level.
   - Online learning records per-session **participation status** (`pending`, `present`, `absent`, `late`, `partial`, `excused`) with session signal duration evidence, never modifying stream attendance records.

2. **Online-Only Students Are First-Class**:
   - Online learners do not require fake classes, streams, timetables, or morning registers.
   - Enrolments are tracked in `online_enrolments`.

3. **Academic Integrity & Origin Constraints**:
   - Shared academic tables `assignments` and `teacher_observations` enforce origin integrity via database constraints:
     - Physical: `online_session_id IS NULL AND class_id IS NOT NULL`
     - Online: `online_session_id IS NOT NULL` (where `class_id` is optional).
   - Assignment authorization checks (`is_authorised_assignment_creator`) authenticate online teachers via session or offering assignments when `online_session_id` is present.

4. **RLS is the Authority**:
   - Teachers receive 0 internal pricing rows and 0 peer compensation rows through direct Supabase queries.
   - Leadership (`admin`, `principal`, `bursar`) retains administrative visibility.
   - Learners (`student`, `guardian`) see `display_mode = 'PUBLIC'` pricing only.

5. **Single Payroll Engine Integration**:
   - Sessional pay from approved completed online sessions flows directly into Phase 7 payroll.
   - Tracked idempotently via `online_session_payroll_claims` using unique constraint `(source_type = 'ONLINE_SESSION', source_id = session.id)`.

6. **Cross-Tenant Relationship Integrity**:
   - Enforced at the database boundary via `check_online_cross_tenant_integrity()` trigger across all 9 online tables.

---

## Schema Migrations

- `20260914000000_online_centre.sql`: Core online programmes, offerings, pricing options, slot templates, bookings, enrolments, sessions, participants, engagements, assignments, and compensation rules.
- `20260914000001_online_admissions.sql`: Online enquiries, offers, acceptance status machine.
- `20260914000002_online_cockpit.sql`: Teacher online sessions cockpit view.
- `20260914000003_online_academic_links.sql`: Initial nullable `online_session_id` reference on shared academic tables.
- `20260914000004_classroom_signals.sql`: Provider-agnostic classroom links and technical signal telemetry.
- `20260915000000_online_cross_tenant_integrity.sql`: Database-level foreign key tenant isolation trigger.
- `20260915000001_online_rls_hardening.sql`: RLS authority hardening, zero teacher pricing leakage, peer compensation firewall.
- `20260915000002_online_academic_safe_origin.sql`: Safe `class_id` nullable alteration with origin check constraints and online assignment creator authorization.
- `20260915000003_online_transactions_and_payroll_bridge.sql`: Atomic offer acceptance, atomic booking confirmation RPC, and idempotent sessional payroll claims table.

---

## Service Architecture

- `onlineCentreService.ts`: Public catalogue, offering details, and slot lookups.
- `onlineBookingService.ts`: Admissions offer acceptance and conflict-checked booking confirmations.
- `onlineTeachingService.ts`: Teacher session lifecycle (start, note, complete, cancel, no-show) and participation marking.
- `onlineAcademicService.ts`: Classless session assignments, submission reviews, and session observations.
- `onlineClassroomService.ts`: Provider links (Zoom, Google Meet, Teams, custom) and technical signal ingest with reconnect-aware duration calculation.
- `centreOpsService.ts`: Leadership dashboard for session volume, teaching load, invoiced charges, sessional teacher costs, and gross contribution.
- `parentService.ts`: Guardian projection allowlist for child's upcoming online sessions and participation history.

---

## Verification & Test Metrics

- **Discovered Tests**: 554 tests across 64 test suites.
- **Mocked / Unit Tests Passing**: 529 passed across 59 active test suites (100% passing).
- **Live DB-Skipped Tests**: 25 skipped (5 integration suites requiring local Supabase instance).
- **TypeScript Typecheck**: Zero errors (`tsc -b --pretty false`).
- **Production Bundle Build**: Clean build (`vite build` completed in ~5s).
