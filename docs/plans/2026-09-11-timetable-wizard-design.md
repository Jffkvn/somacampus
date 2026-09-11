# Timetable Wizard Redesign — Design Doc (2026-09-11)

## Problem (verified live)

1. Allocations cannot save: `academic_years`/`terms` had RLS enabled with
   zero policies → reads returned [] → `academicYearId === ''` → guard blamed
   visible inputs ("complete all fields"). Fixed by `20260922000007` policies;
   year + 3 terms now resolve (seeded 2026-2027 + T1/T2/T3).
2. Builder UX overwhelms: jargon titles, inverted tabs (Master before Step 1),
   static PUBLISHED badge contradicting 0 approved, no next-step guidance.
3. Master vs Builder share one component; no dedicated printable grid.

## Design (approved: wizard, plain language)

- **Step 0 Foundation** (new): year → terms → classes → subjects → periods,
  inline create for anything missing. Wizard cannot advance without them.
- **Step 1 Staffing**: inline class×subject grid, teacher dropdowns filtered
  to appointed staff, Auto-fill button, Approve all. Replaces modal-per-pair.
- **Step 2 Generate**: one button; plain-English result card
  (placed/unplaced + reasons); loop back to Step 1 rows on gaps.
- **Step 3 Review & Publish**: week preview → Publish freezes Master;
  later changes mark Master stale with Republish action.
- **Master**: dedicated view grid (class/teacher filters), 3 print modes
  (class wall A4, staffroom master, teacher personal) via print stylesheet.
  Excel export deferred.
- **Post-publish edits**: quick slot tweak (click → reassign/swap + instant
  conflict warning → Save & Update Live) vs structural revision (wizard
  re-opens prefilled, live stays active, Republish versions). Version column
  need to be confirmed against `timetables` table in build.
- **Language**: Teacher Assignments / Generate Schedule / Weekly Timetable.
  Status badge derived from state, never static.
- **Preserved**: solver, allocation RPCs, approval invariant, AI plan path
  (alternative inside Step 1). Builder stays as Advanced until replacement
  confirmed. Rooms: no entity seen — dropped from v1 pending verification.

## Open build questions

- `timetables` version column for draft-while-live versioning.
- Rooms entity existence (filters + conflicts).
- Swap-validation logic is new hand-rolled code (not the CSP solver).
