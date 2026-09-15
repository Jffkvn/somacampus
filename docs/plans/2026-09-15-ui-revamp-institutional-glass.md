# SomaCampus UI Revamp Plan — Institutional Glass

**Date:** 2026-09-15  
**Status:** P0 + P1 complete · P2/P3 open  
**Last updated:** 2026-09-15 (SlideToConfirm + Toasts)  
**Sources:** SmoothUI · Bencho · Amicro · Best Designs on X · macOS Liquid Glass · live repo audit  
**North star:** Calm school OS (macOS-adjacent chrome) — not a dark marketing playground

---

## 1. Decisions locked

| Decision | Choice |
|---|---|
| **Demo credentials (login personas)** | **Keep during commissioning / testing.** Treated as **public** (repo is public; password is in the client bundle). **Must remove + rotate before any external pilot / parent URL / production.** Prefer `import.meta.env.DEV` gating as the cheap hardening when we touch login later — **not blocking UI U0.** |
| Motion library fork | **Decide in U0:** `tailwindcss-animate` (cheap fix dead classes) **or** Motion (springs). One engine, not both. |
| Glass doctrine | **Chrome only** (sidebar rail, top header, sheets/popovers). Never glass on fee ledgers, payroll, registers, medical. |
| Charts | **Recharts stays** until post-commissioning freeze. Dither is **Tier 3**, one surface only, after. |
| shadcn / Tailwind v4 | **No** until a deliberate migration phase. Copy patterns, not registries. |
| Timing | **No U1+ visual work during an active Principal walkthrough.** Freeze UI after U0 if commissioning is live. |
| Product priority vs polish | Credentials/security debt and commissioning flows beat decorative motion. |

---

## 2. Baseline (verified on repo)

- Tokens: `brand-teal #006c8b`, `nav-deep #002732`, status palette, Plus Jakarta Sans + JetBrains Mono, 3 shadows, `rounded-2xl` heavy use  
- Primitives: Button, Card, StatCard, StatusPill, Modal, LoadingState, EmptyState  
- **Motion is dead:** JSX uses `animate-in fade-in zoom-in-95` but `tailwindcss-animate` is **not installed**; `tailwind.config.js` → `plugins: []`  
- Modal: hard cut (`if (!isOpen) return null`), no focus trap, no exit  
- Glass: `--glass-*` tokens + one `.glass-panel` used only via `Card` `glass` prop; TopHeader uses ad-hoc `backdrop-blur` (second dialect)  
- Charts: Recharts; JS chunk ~2.0MB  
- Login: personas + prefilled `SomaCampus2026!` (accepted for testing — see §1)  
- Design tests: `src/test/design-system.test.tsx` exists  

**Honest macOS fit:** ~chrome look, not interaction language. Treat chrome glass as greenfield + unify TopHeader tokens.

---

## 3. Principles

1. **Chrome = glass. Content = paper.**  
2. **Motion = state feedback** (saved, paid, submitted) — cut decoration.  
3. **Numbers are the hero** on KPIs (count-up, not snap).  
4. **Irreversible actions** need a deliberate confirm gesture.  
5. **`prefers-reduced-motion`** everywhere.  
6. **Print CSS** for payslips/statements: no motion, no glass.  
7. **Density first** on registers, ledgers, timetable.  
8. **One chart engine** at a time.

---

## 4. Phased roadmap

### P0 — Make the system honest (before more polish) — **DONE**

| Item | Detail | Status |
|---|---|---|
| **U0a Motion engine** | Pick **one**: install `tailwindcss-animate` **or** Motion. Un-break all dead `animate-in` / `fade-in` / `zoom-in-95` classes. | Done (`tailwindcss-animate`) |
| **U0b Modal** | Enter + exit animation, **focus trap**, Escape to close, `aria-modal`. | Done |
| **U0c Reduced motion** | Global guard; no infinite spinners that ignore it where avoidable. | Done |
| **U0d Exit criteria** | No dead animate utilities; modal keyboard path tested; `npm test` + design-system suite green. | Done |

### P1 — System kit + chrome — **DONE**

| Item | Detail | Status |
|---|---|---|
| **Tokens** | Concentric radius scale (`xs…2xl`); elevation levels; unify TopHeader blur with `glass-panel` / `--glass-*`. | Done |
| **Print** | `@media print` for payslip + fee statement (strip blur/motion). | Done |
| **Number Flow** | StatCard values (attendance %, cash, payroll totals). Dependency-light / copy-port. | Done |
| **Sidebar** | Accordion + collapse springs; active item morph. | Done (accordion spring) |
| **Command palette** | ⌘K — **narrow v1:** students, staff, primary routes. Expand later. | Done (role-filtered nav) |
| **Slide-to-confirm** | One primitive; inventory: finalize payroll, submit register, approve/disburse. | Done — payroll approve/finalize + attendance sticky submit |
| **Toasts** | Clear “Payment recorded · Receipt #…” style status. | Done — fees, payroll, attendance |

### P2 — Workflow surfaces + bench

| Item | Detail |
|---|---|
| **Fees** | Cash / Allocated / Unallocated as hero triad (already 5 KPIs — refine hierarchy). |
| **Payroll** | Locked/finalized state more “sealed”; confirm gestures. |
| **Attendance** | Keep sticky tally; confirm submit motion. |
| **Hire wizard** | Prefer **sheets** over stacked modals. |
| **Morning brief inbox** | Product feature (exceptions first) — **separate stream** from design-system PRs. |
| **`/design` bench** | Dev-only live gallery; regression home for `design-system.test.tsx`. |

### P3 — After commissioning freeze

| Item | Detail |
|---|---|
| Dither charts | **One** surface (e.g. attendance or cash trend); SVG fallback. |
| Dark leadership cockpit | Scoped to morning brief only. |
| Login cleanup | Strip personas from prod bundle / DEV-gate; **rotate** Supabase passwords. |
| Recharts retirement | Only after dither proves itself on one surface. |

---

## 5. Explicit non-goals

- Full glassmorphism on content  
- Siri Orb / Power Off / scramble-as-identity in production UI  
- Tailwind v4 + shadcn migration mid-commissioning  
- GSAP + dither + Recharts all at once  
- Multi-agent UI chrome  
- Login redesign before credential policy changes (post-testing)

---

## 6. Security note (credentials)

```text
NOW (testing)
  • Keep one-click personas + prefilled password for commissioning speed
  • Treat SomaCampus2026! as PUBLIC (public GitHub + live Supabase)

BEFORE external pilot / production
  • Remove prefilled password + persona shortcuts from production build
  • Prefer DEV-only gating (same pattern as role switcher)
  • Rotate those users’ passwords in Supabase
  • Confirm no service-role key in client bundle
```

**Not a P0 UI task.** It is a **release gate**.

---

## 7. Guardrails

- Every phase: `typecheck` + `npm test` + design-system tests  
- No visual freeze-break during live Principal walkthroughs  
- Accessibility: focus, keyboard, reduced-motion, contrast on glass chrome  
- Performance budget: Motion OK; avoid stacking backdrop-filters on low-end school laptops  
- Bundle: one motion lib; retire Recharts only after a replacement ships  

---

## 8. Success criteria

| Area | Done when | Status |
|---|---|---|
| Motion | Animations actually run; reduced-motion respected | Yes |
| Modal | Keyboard-complete; exit visible | Yes |
| KPIs | Number changes feel intentional | Yes (count-up) |
| Money UI | Cash vs allocated vs credit unmistakable | Partial (KPIs yes; layout not redesigned) |
| Irreversible | Confirm gesture on payroll finalize / register submit | **Yes** (payroll + attendance) |
| Release | Demo credentials out of prod bundle + passwords rotated | Not yet (testing keep) |

---

## 9. Open items

1. U0 engine choice: **tailwindcss-animate vs Motion** (decide before U0 PR)  
2. Capacitor/Android path still live? (affects mobile chrome)  
3. When commissioning freeze lifts for P2 surface work  

---

## 10. Summary order

```text
P0  Motion real + Modal a11y + reduced-motion          ✅ DONE
P1  Tokens + print + Number Flow + sidebar + ⌘K
    + slide-confirm + toasts                            ✅ DONE
P2  Fees/payroll/attendance/hire polish + /design bench + morning brief (separate)
P3  Dither (one) + dark brief cockpit + credential strip + rotate
```

**Credentials:** keep for testing · remove before production · DEV-gate when convenient.

## 11. Change log

| Date | Change | PR / commit |
|---|---|---|
| 2026-09-15 | Plan written | `23417ce` |
| 2026-09-15 | **P0** motion + Modal a11y + reduced-motion | PR #9 → `7aa8de5` |
| 2026-09-15 | **P1** tokens, Number Flow, accordion, print, ⌘K, glass header | PR #10 → `04cdc74` |
| 2026-09-15 | **P1 finish** SlideToConfirm (payroll approve/finalize, attendance submit) + Toasts (fees/payroll/attendance) | this PR |
