# SomaCampus — Project Status

> **Honest headline:** Phases 1–9 are implemented. Phase 9 has completed substantial security and integrity hardening. Phase 9I advisory AI is implemented. Timetable generation and live database authorization remain in final hardening before production sign-off.

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
- [x] **Phase 9I — Advisory AI Assistance & School Timetable Engine** ✅ ([plan](plans/PHASE-9-ONLINE-LEARNING-CENTRE.md))
  (7 capabilities: Session Summary, Pre-Session Briefing, Next Steps, Online Scheduling, Teacher Allocation, Parent Communication Drafts, and School Timetable Policy Engine with deterministic CSP solver, conflict diagnostics, and combined physical+online workload tracking)

## Queued (in order)

1. Tenant-isolation design (finance & online proofs complete; school-wide full read audit)
2. CI hardening (gate `seed:check`, live-DB nightly)
3. Phase 10 — Advanced Learning & Hybrid Education

## Standing decisions

- Standalone `somacampus` repository; OneHub/JantaHR are business-logic references only —
  see `docs/ADR-001-standalone-repository.md`.
- Zero legacy UI reuse — see `REUSE_REGISTER.md`.
