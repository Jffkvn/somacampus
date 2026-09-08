# AGENTS.md — SomaCampus Multi-Agent Engineering Instructions

Welcome to SomaCampus. All AI agents, subagents, and automated review bots operating in this repository MUST strictly adhere to the rules and skills defined herein.

---

## 1. Production Trust Gate & Core Engineering Rules
Read and adhere to the 7 Non-Negotiable Engineering Laws:
👉 **[Production Trust Gate Rules](.agents/rules/production-trust-gate.md)**

### Summary of Inviolable Rules:
1. **Mock Honesty & Zero In-Memory Cheats**: Runtime services (`src/modules/*/*Service.ts`) must never declare mutable mock/fallback arrays (`let mock* = []`) to mask missing tables or RPCs. Fail closed on DB errors.
2. **Database Contract Alignment**: Forms, selects, and service methods must match PostgreSQL constraints. Free-text inputs must be preserved in dedicated columns (e.g. `exit_notes`), never discarded.
3. **Server-Side Data Protection**: Sensitive data (parent contact numbers, payroll compensation) must be gated in PostgreSQL via RPCs/RLS, never purely via client-side JSX hiding.
4. **Honest E2E Testing**: No green ticks if PostgREST errors or 4xx/5xx occur. Shell renders must be labeled `SMOKE_ONLY`.
5. **Archive-Never-Delete**: Operational records must use soft-archival (`is_active = false`, closed date intervals), never hard `DELETE`.
6. **Live Migration Verification**: A feature requiring a migration is incomplete until verified against the live PostgreSQL catalog.
7. **Client-Side Auth Hardening**: Dev persona switcher must clear on signOut, default to least-privilege, and only exist in `DEV` mode.

---

## 2. Mandatory Verification Skill
When modifying code or reviewing PRs, invoke the verification skill:
👉 **[somacampus-verify Skill](.agents/skills/somacampus-verify/SKILL.md)**

Run the complete verification gate:
```bash
npm run verify:all
```
Or run individual verification stages:
- `npm run verify:trust` — Scans for mock rot and in-memory cheats
- `npm run verify:contracts` — Audits UI-to-DB schema and constraint contracts
- `npm run verify:migrations` — Audits migration naming, permissions, and RLS policies
- `npm run typecheck` — TypeScript type validation
- `npm test` — Vitest unit and service test suite
