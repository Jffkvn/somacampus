# Seed validation note

`supabase/seed.sql` is hand-written and has bitten us twice: malformed UUIDs
(11- and 13-char groups that Postgres rejects at apply time) and rows that
silently fail constraints (`status='enrolled'` vs the `active/completed/
withdrawn` CHECK, missing `school_id NOT NULL`).

## Rule

Run the validator before committing any seed edit:

```bash
npm run seed:check
```

## What it checks (`scripts/validate-seed.mjs`, zero dependencies)

1. **Malformed UUIDs** — any UUID-shaped string that isn't strict 8-4-4-4-12
   hex, reported with file:line.
2. **Duplicate ids** — the same id inserted twice in one table, which
   `ON CONFLICT DO NOTHING` would silently swallow.
3. **Dangling foreign keys** — any `*_id` value never defined as an `id`
   anywhere in the seed file.

Exit 0 = clean (`18 tables, 70 ids, 176 fk references` at time of writing).
Exit 1 = problems listed, one per line. Fix them all before applying —
Postgres errors at `supabase db push` / seed time are harder to trace back
to the offending row.

## Live data vs seed

`seed.sql` is the source of truth for fresh environments, but the pilot
database has drifted (rows inserted via scripts with different values).
When fixing seed vocabulary, also check the live rows match — see the
`2026-09-04` enrolment incident (`enrolled` vs `active`, 0 live rows).
