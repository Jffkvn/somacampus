# ADR-001: Standalone SomaCampus Repository

**Status:** Accepted

**Date:** 2026-09-04

**Supersedes:** `SOMACAMPUS_v1_7.md` §0D (lines 48–59) and §3A (lines 256–258). Those sections
locked a "build on OneHub / jantahronehub" decision. That decision is reversed by this ADR.
`SOMACAMPUS_v1_7.md` is a versioned spec and is intentionally left unedited; this ADR is the
record of the reversal.

## Context

v1.7 §0D point 4 resolved "the OneHub question" as *build on OneHub*: SomaCampus as new modules
added onto OneHub's existing modular architecture, justified by a solo-maintenance argument
(splitting one builder's effort across two codebases before either has a paying customer
accumulates duplicated maintenance faster than it accumulates product). §3A (lines 256–258)
restored that decision technically: SomaCampus domains slot in as sibling modules under OneHub's
`src/modules/`, with HR features ported from `janthr-egypro-payroll` / `janthr-egypro-employee-portal`
into OneHub's `hr` module and the `warehouse` module as the inventory foundation.

Reality went the other way: SomaCampus is a **standalone `somacampus` repository** with **native**
payroll/HR ports and **no OneHub runtime**. There is no shared runtime, no sibling-module
arrangement, and no OneHub dependency.

## Decision

1. **Standalone repository.** SomaCampus lives and builds in its own repo. It does not run inside,
   alongside, or on top of OneHub at runtime.
2. **OneHub / JantaHR are reference implementations for business logic only.** What may be ported
   (adapted, re-scoped to `school_id` multi-tenancy) is backend logic: payroll bands, leave rules,
   advance caps, warehouse patterns, calculation routines, validation rules, and schema ideas.
   See `REUSE_REGISTER.md` for the per-subsystem ledger.
3. **UI rule: ZERO copying — not even a bit.** No sidebar, nav, dashboard, cards, tables,
   typography, color treatment, empty states, or form layouts are taken from OneHub, JantaHR, or
   egypro. OneHub UI design, HTML, CSS tokens, and color schemes are explicitly banned, including
   `#128f76`.
4. **The dark-teal sidebar is native SomaCampus.** Per Implementation Blueprint §347, the dark-teal
   navigation is a SomaCampus design element implemented as a new navigation component — not a
   reused OneHub sidebar with its colour changed.

## Consequences

- The v1.7 §0D solo-maintenance / monorepo argument is **rejected**: the cost of duplicated
  maintenance is accepted in exchange for a standalone codebase with no shared-runtime coupling.
- Ports are kept honest by **reference parity fixtures, not shared runtime**: ported business logic is verified
  by tests in this repo (e.g. payroll, leave, advances, inventory suites), never by depending on
  the source system at runtime.
- `REUSE_REGISTER.md` remains the authority on reuse boundaries; every entry carries a
  zero-UI-reuse status.
