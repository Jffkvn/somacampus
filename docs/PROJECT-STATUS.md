# SomaCampus — Project Status

> **Honest headline:** Phases 1–8 are **implemented and live-validated**.
> Phase 7 hardening batch is complete (merged, CI green). Full-app tenant
> lockdown and CI hardening remain queued (see below).

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

## Queued (in order)

1. Tenant-isolation design (finance-scoped proof exists; full read lockdown separate)
2. CI hardening (gate `seed:check`, live-DB nightly)
3. Phase 9+ (advanced learning, hybrid, special needs, homeschool)

## Standing decisions

- Standalone `somacampus` repository; OneHub/JantaHR are business-logic references only —
  see `docs/ADR-001-standalone-repository.md`.
- Zero legacy UI reuse — see `REUSE_REGISTER.md`.
