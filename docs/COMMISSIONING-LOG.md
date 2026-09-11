# SomaCampus — Live Commissioning Log

> Running record of end-to-end flows verified against the LIVE database by real
> user testing (Principal, Bursar) + targeted live probes. A flow is PASS only
> when the real UI operation succeeds live — never from unit tests alone.
> Last updated: 2026-09-11 (branch ux/commissioning-pass, UX items 1-3 done, 4-5 pending retest).

## PASS (live-verified)

| # | Flow | Verified | Why it failed at first → what fixed it |
|---|------|----------|----------------------------------------|
| 1 | Principal login + role resolution | 2026-09-10 | First session behaved role-less (stale browser state). Clearing browser data + server-resolved roles via `resolve_my_app_roles()` fixed it. No backfill was ever needed — all 10 `user_roles` rows already existed. |
| 2 | Create class | 2026-09-10 | Same stale session as #1. The contract (`classes_leadership_write`) already existed — nothing to fix in code. |
| 3 | Hire staff (+ compensation + dossier) | 2026-09-10 | Same stale session; hire RPC + compensation profile were already correct (Anthony Mabirizi EMP-2026-0006 hired, dossier renders). Dead direct-insert fallback later removed to prevent future half-hires. |
| 4 | Submit admission application | 2026-09-10 | Worked once session was clean (Amina Kato + guardian + placement). |
| 5 | Approve & enrol admission | 2026-09-10 | Real code bug: approval RPC inserted `school_id` into `people`/`students` (columns don't exist) + wrong guardian columns. Fixed by `20260922000000` rewriting 3 inserts; verified on scratch Postgres. |
| 6 | Log operating expense | 2026-09-10 | Two stacked causes: (a) `school_expense_categories` empty live + service silently substituting a fake UUID → FK violation; fixed by seeding 10 real categories + removing the fallback + inline category creation. Blocking `alert()`s replaced with banners (they froze the modal). |
| 7 | Record fee payment + receipt | 2026-09-10 | Three iterations: (a) fixture ghost pupil + missing `student_account_id` → rebuilt as atomic `record_fee_payment` RPC (`...01`); (b) staging table created inside loop → no-charge pupils crashed (`...02`); (c) defensive WHERE-less DELETE rejected by live Postgres (`...03`). |
| 8 | Appoint official teaching subjects | 2026-09-11 | Timetable path did direct upserts bypassing the authoritative RPC. Rerouted through `appoint_teacher_subject`. |
| 9 | Save timetable workload policies | 2026-09-11 | Worked once RLS helpers resolved (identity fix #1). "Policies Saved" confirmed in UI. |
| 10 | Stock request → approve → issue | 2026-09-11 | Principals without `employees` rows couldn't file (`...05` allows leadership). Orphan risk closed with archive-rollback. |
| 11 | Add store items | 2026-09-11 | Worked once identity resolved. |
| 12 | Create calendar events | 2026-09-11 | Dead feature: zero write policies existed. Added leadership policies + real `target_class_id` (`...04`). |
| 13 | Create announcements | 2026-09-11 | Worked once identity resolved; AI-draft review path used as designed. |
| 14 | Calendar edit + delete | 2026-09-11 | Missing UI (policies existed). Edit reuses create modal; delete with confirm. Code + live probe pending your retest. |
| 15 | Announcement edit/cancel/delete + multi-audience | 2026-09-11 | Missing UI + `additional_audiences` column (`...06` live). Cancel = expire (history kept); delete = principal-only. Code + live probe pending your retest. |
| 16 | Timetable weights/dashboard/guide | 2026-09-11 | Dashboard was stale until reload (now refreshes on save). Weights + builder steps explained in plain English. No logic changed. |

## FIXED (code + live, merged to main)

- `20260922000000` approve_admission_application schema references
- `20260922000001`–`03` atomic record_fee_payment RPC
- `20260922000004` calendar write policies + target_class_id
- `20260922000005` leadership may file stock requests
- Expense fixture-UUID fallback removed; category management added
- Fees page: real enrolled pupils (fixture ghosts removed); inline errors replace alert()
- Hire dead fallback removed; subjects via authoritative RPC
- Thread creation archive-rollback; observations require classId

## PASS update (2026-09-11)

| 17 | Save teaching allocation | Root cause found + unblocked: `academic_years`/`terms` had RLS with zero policies → reads [] → `academicYearId` empty → guard blamed visible fields. Fixed by `20260922000007` policies; seeded year 2026-2027 + Terms 1–3; guard now names the missing piece field-by-field. Pending your retest with Stage 6 / Mathematics / Anthony / 4. |
| 19 | Draft preview: Friday scroll, slot edit, break/lunch bands | 2026-09-11 | Preview grid scrolls horizontally (Friday reachable); per-slot Edit (teacher swap with clash warning, remove slot); ☕ Break 10:15–10:45 + 🍽️ Lunch bands interleaved chronologically; solver lunch extended 45m→60m (12:15–13:15, afternoons shifted). Pending your retest. |
| 18 | Guided timetable wizard | 2026-09-11 | New `TimetableWizard`: Foundation (year/terms/classes/subjects status + inline create) → Staffing (inline grid, qualified-only dropdowns, auto-fill, approve) → Generate (plain-English result) → Publish chain. Mounted as Guide-me default on builder; classic as Advanced. Wizard render tests 3/3. |

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
