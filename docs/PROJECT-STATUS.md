# SomaCampus — Project Status

> **Honest headline:** the full Phase 1–7 scope is **code-complete, NOT production-hardened**.
> Hardening (this batch) is still in progress.

## Completed phases

- [x] **Phase 1 — Teacher day** ✅
- [x] **Phase 2 — Daily workflow** ✅
- [x] **Phase 3 — Monitoring** ✅
- [x] **Class-teacher / daily-attendance** ✅
- [x] **Phase 4 — Evidence** ✅
- [x] **Phase 5 — Intelligence** ✅
- [x] **Phase 6 — Curriculum + planning** ✅
- [x] **Phase 7 — Finance / payroll / HR** ✅ code-complete (hardening = this batch)

## Queued (in order)

1. Corrective migrations
2. Hardening (this batch)
3. Tenant-isolation design
4. CI hardening

## Standing decisions

- Standalone `somacampus` repository; OneHub/JantaHR are business-logic references only —
  see `docs/ADR-001-standalone-repository.md`.
- Zero legacy UI reuse — see `REUSE_REGISTER.md`.
