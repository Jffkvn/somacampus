# SomaCampus — Project Status

> **Honest headline:** Phases 1–9 are fully implemented and production hardened. Phase 9 final hardening is complete: Official Teaching Subjects staff qualifications domain, management-approved Teaching Allocations (human meeting + AI-assisted workflows), deterministic CSP timetable constraint solver (0 hard conflicts, clock-time breaks, zero heuristic fallbacks), transactional RLS projection synchronization, and historical payroll rate precision.

## Completed phases

- [x] **Phase 1 — Teacher day** ✅
- [x] **Phase 2 — Daily workflow** ✅
- [x] **Phase 3 — Monitoring** ✅
- [x] **Class-teacher / daily-attendance** ✅
- [x] **Phase 4 — Evidence** ✅
- [x] **Phase 5 — Intelligence** ✅
- [x] **Phase 6 — Curriculum + planning** ✅
- [x] **Phase 7 — Finance / payroll / HR** ✅ + hardened ✅
  (`docs/plans/` batch: docs, corrective migrations, mock-fallback removal,
  reconciliation, snapshots, privacy, allocation/audit, route guards)
- [x] **Phase 8A — Parent identity & portal** ✅ ([plan](plans/2026-09-04-phase8a-parent-foundation.md))
- [x] **Phase 8B — Announcements** ✅ ([plan](plans/2026-09-05-phase8b-announcements.md))
- [x] **Phase 8C — Notifications** ✅ ([plan](plans/2026-09-05-phase8c-notifications.md))
- [x] **Phase 8D — Messaging** ✅ ([plan](plans/2026-09-05-phase8d-messaging.md))
- [x] **Phase 8E — Calendar** ✅ ([plan](plans/2026-09-05-phase8e-calendar.md))
- [x] **Phase 8F — AI drafting (advisory-only)** ✅ ([plan](plans/2026-09-05-phase8f-ai-drafting.md))
- [x] **Phase 9 — Online Learning Centre** ✅ + hardened ✅ ([plan](plans/PHASE-9-ONLINE-LEARNING-CENTRE.md))
  (Two operations, one academic core; cross-tenant integrity trigger, RLS authority, classless academic support, presence duration reconnect math, single payroll engine integration)
- [x] **Phase 9I — Advisory AI Assistance & School Timetable Engine** ✅ + Final Hardening ✅ ([plan](plans/PHASE-9-ONLINE-LEARNING-CENTRE.md))
  (Official Staff Teaching Subjects, Teaching Allocation domain, 2-step planning meeting + AI-assisted draft generator with workload limits, zero heuristic modulo fallbacks, zero mock UI fallbacks, deterministic CSP backtracking solver with clock-time break enforcement, atomic approval RPCs with compatibility projection sync, and historical sessional payroll rate precision)
- [x] **Operational Usability & Hardening (Batch A)** ✅
  (Withdrawal reason DB mapping, server-side guardian contact gating, end-to-end inventory requests and receipts, real leave entitlement calculation, student dossier print-all-tabs)
- [x] **Operational Trust Gate & Integrity (Batch B)** ✅
  (HR decision attribution and actorRole threading, single-open-advance DB invariant, real school holidays table, admissions atomicity with compensating rollback, honest E2E smoke labeling)
- [x] **Production Trust Gate Infrastructure & Exit Notes Migration** ✅
  (Codified 7 non-negotiable engineering rules in `.agents/rules/production-trust-gate.md`, created `.agents/skills/somacampus-verify/` with automated mock-rot, DB-contract, and migration audits, added `20260918000001_enrolment_exit_notes.sql` persisting pupil exit justification notes)
- [x] **Closed Operational AI Teaching Loop & Zero AI Grading (Cambridge Primary 5Nn.01)** ✅ ([walkthrough](verification/AI_TEACHING_LOOP_WALKTHROUGH.md))
  (Complete closed loop: Cambridge 5Nn.01 standard grounding → school Resource Library search-before-generate → server-side Edge Function boundary → database trigger/CHECK publication gate → physical/digital student work capture → strictly qualitative AI evidence extraction with zero AI grading → educator approval into longitudinal profile → AI next-step intervention with teacher acceptance gate → pre-lesson briefing integration)

## Queued (in order)

1. Tenant-isolation design (finance & online proofs complete; school-wide full read audit)
2. CI hardening (gate `verify:all` in CI pipeline, nightly live-DB probe)
3. Phase 10 — Special Educational Needs (SEN) & Inclusive Education (Phase 9 Online/Hybrid operational)

## Standing decisions

- Standalone `somacampus` repository; OneHub/JantaHR are business-logic references only —
  see `docs/ADR-001-standalone-repository.md`.
- Zero legacy UI reuse — see `REUSE_REGISTER.md`.
