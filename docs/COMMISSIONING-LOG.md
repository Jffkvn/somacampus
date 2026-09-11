# SomaCampus — Live Commissioning Log

> Running record of end-to-end flows verified against the LIVE database by real
> user testing (Principal, Bursar) + targeted live probes. A flow is PASS only
> when the real UI operation succeeds live — never from unit tests alone.
> Last updated: 2026-09-11 (branch ux/commissioning-pass).

## PASS (live-verified)

| # | Flow | Verified | Notes |
|---|------|----------|-------|
| 1 | Principal login + role resolution | 2026-09-10 | `resolve_my_app_roles()` returns principal; UI Role badge correct |
| 2 | Create class | 2026-09-10 | After browser-data clear (earlier failure was stale session) |
| 3 | Hire staff (+ compensation + dossier) | 2026-09-10 | Anthony Mabirizi EMP-2026-0006, full dossier renders |
| 4 | Submit admission application | 2026-09-10 | Amina Kato, guardian + placement captured |
| 5 | Approve & enrol admission | 2026-09-10 | Required DB fix `20260922000000` (phantom `people.school_id`) |
| 6 | Log operating expense | 2026-09-10 | Required live category seeding (10 rows) + fixture-fallback removal |
| 7 | Record fee payment + receipt | 2026-09-10 | Required atomic RPC `20260922000001`–`03` (3 live iterations: missing staging table, WHERE-less DELETE) |
| 8 | Appoint official teaching subjects | 2026-09-11 | Via authoritative RPC (timetable path rerouted) |
| 9 | Save timetable workload policies | 2026-09-11 | "Policies Saved" confirmed in UI |
| 10 | Stock request → approve → issue | 2026-09-11 | Full inventory loop |
| 11 | Add store items | 2026-09-11 | — |
| 12 | Create calendar events | 2026-09-11 | Required write policies `20260922000004` |
| 13 | Create announcements | 2026-09-11 | AI draft → review → publish path used |

## FIXED (code + live, merged to main)

- `20260922000000` approve_admission_application schema references
- `20260922000001`–`03` atomic record_fee_payment RPC
- `20260922000004` calendar write policies + target_class_id
- `20260922000005` leadership may file stock requests
- Expense fixture-UUID fallback removed; category management added
- Fees page: real enrolled pupils (fixture ghosts removed); inline errors replace alert()
- Hire dead fallback removed; subjects via authoritative RPC
- Thread creation archive-rollback; observations require classId

## OPEN (user-reported, queued)

1. Calendar: edit/delete events (UX pass #1)
2. Announcements: edit/cancel/delete + multi-audience (UX pass #2)
3. Timetable: weights explainer, dashboard refresh, architecture guide (UX pass #3)
4. Centered approval modal (UX pass #4)
5. Fee profile route + clickable names (UX pass #5)
6. Ledger paid-0 display vs unallocated credit visibility (follow-up)
7. Fee/charge assessment engine (separate finance workstream)

## Rejected theories (recorded so we don't revisit)

- "Missing user_roles rows" — live has all 10; identity layer healthy.
- "Missing classes INSERT policy" — `classes_leadership_write` exists.
- "Interventions bad column" — `curriculum_objective_id` exists (Phase 6).
- "Announcements FK mismatch" — personId correctly resolved via people lookup.
