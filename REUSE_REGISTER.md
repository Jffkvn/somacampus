# SomaCampus: Proven Code Reuse Register

> **Authority on reuse boundaries:** `docs/ADR-001-standalone-repository.md` is the authoritative
> record that SomaCampus is a standalone repository — OneHub/JantaHR are business-logic references
> only, and zero legacy UI is reused, not even a bit.

> **Mandate:** SomaCampus reuses proven backend logic, database schemas, calculation routines, and validation rules from legacy repositories. **Zero legacy UI components, layouts, forms, sidebars, or stylesheets are reused or inherited.**

---

## Subsystem 1: Employee Directory & Staff Dossier Logic
- **Source Repository & Path**: `JantaHROnehub/src/modules/hr/api/employees.ts`, `egypro/src/pages/EmployeeDossier.jsx`, `JantaHROnehub/supabase/migrations/0010_hr_employees.sql`
- **Used For**: Employee profiles, employment status, department assignment, job title history, and staff contact data.
- **Trust Basis**: Tested production implementation across JantaHR and OneHub with verified Postgres constraints.
- **Copied / Adapted**: Data models, RPCs, employee status lifecycle, and validation logic.
- **Adaptation Required**: Adapted to fit SomaCampus's multi-tenant `school_id` scoping and distinguish teaching staff from administrative staff.
- **Tests Covering It**: `employees.test.ts`, unit tests for staff profile loading and status transitions.
- **UI Contamination Status**: **ZERO UI REUSE**. All screens, cards, dossiers, and forms are designed fresh in the SomaCampus dark teal visual system.

---

## Subsystem 2: Teacher Arrival & Clock-In Attendance Logic
- **Source Repository & Path**: `Egypro OneHub Next/src/modules/attendance/services/attendanceService.ts`, `egypro/supabase/migrations/20260819190000_pay_basis_and_approved_run_lock.sql`
- **Used For**: Teacher morning arrival, GPS/geofence verification, clock-in/out timestamps, hours worked calculations.
- **Trust Basis**: Verified attendance logging logic with hardware/browser geolocation capture.
- **Copied / Adapted**: Clock-in validation algorithm, timestamp persistence, and validation status enum (`verified_gps`, `verified_manual`, `flagged`).
- **Adaptation Required**: Teacher clock-in updates the HR attendance log while immediately unlocking the teacher's daily timetable and classroom context in SomaCampus. Student attendance is completely decoupled into its own domain.
- **Tests Covering It**: Teacher arrival unit tests, geolocation validation test suite.
- **UI Contamination Status**: **ZERO UI REUSE**. Replaced by a clean, restrained glass card in `/teacher/today`.

---

## Subsystem 3: Leave Management Workflows
- **Source Repository & Path**: `JantaHROnehub/supabase/migrations/0085-0088`, `JantaHROnehub/src/modules/hr/api/leave.ts`, `egypro/src/pages/Leave.jsx`, `egypro/supabase/migrations/20260819200000_half_day_leave.sql`
- **Used For**: Teacher and staff leave requests, balance calculations, half-day leave deductions, and approval state machine.
- **Trust Basis**: 368 passing unit tests in OneHub, proven production rules in `egypro`.
- **Copied / Adapted**: Leave balance calculation formulas, leave type definitions, half-day deduction logic, approval transitions.
- **Adaptation Required**: Integration with academic terms (substitute teacher notifications on approved leave).
- **Tests Covering It**: `leave.test.ts`, leave balance calculation tests.
- **UI Contamination Status**: **ZERO UI REUSE**. Accessed via secondary administrative routes with SomaCampus styling.

---

## Subsystem 4: Staff Advances & Expense Requests
- **Source Repository & Path**: `JantaHROnehub/supabase/migrations/0089-0090`, `JantaHROnehub/src/modules/hr/api/staffAdvances.ts`, `egypro-portal/src/pages/Advances.jsx`
- **Used For**: Staff advance requests, limit validation against monthly salary, payroll repayment schedules.
- **Trust Basis**: Production-tested self-service workflows in `egypro-portal`.
- **Copied / Adapted**: Advance eligibility validation, repayment installment computation, and deduction hooks for payroll runs.
- **Adaptation Required**: Scoped strictly under secondary staff self-service.
- **Tests Covering It**: `staffAdvances.test.ts`, `employeeServices.test.jsx`.
- **UI Contamination Status**: **ZERO UI REUSE**. New clean dialog and status badge components.

---

## Subsystem 5: Payroll Engine & East African Statutory PAYE/NSSF
- **Source Repository & Path**: `JantaHROnehub/src/modules/payroll/api/payroll.ts`, `egypro/src/lib/calculations.js`, `egypro/src/lib/payrollItem.js`, `egypro/supabase/migrations/20260827183000_update_statutory_paye_bands_2026.sql`
- **Used For**: Gross-to-net salary calculation, statutory PAYE tax bands (Uganda/Kenya), NSSF employee/employer deductions, payroll run locks.
- **Trust Basis**: Thoroughly audited payroll tax math and immutable snapshot logic.
- **Copied / Adapted**: Pure mathematical calculation functions, payroll run state machine (`draft` -> `review` -> `approved` -> `locked`).
- **Adaptation Required**: Abstracted behind SomaCampus `payrollService` with teacher teaching load adjustments.
- **Tests Covering It**: `payroll.test.ts`, statutory calculation unit test suite.
- **UI Contamination Status**: **ZERO UI REUSE**. No legacy payroll wizards or bulky tables.

---

## Subsystem 6: Payslip Generation
- **Source Repository & Path**: `egypro-portal/src/components/PayslipPDF.jsx`, `@react-pdf/renderer`
- **Used For**: Generating printable/downloadable PDF payslips for teachers and school staff.
- **Trust Basis**: Production PDF generation structure with accurate earnings and deductions breakdown.
- **Copied / Adapted**: `@react-pdf/renderer` document layout structure.
- **Adaptation Required**: Replaced corporate branding with official SomaCampus school header, school logo, and clean typography.
- **Tests Covering It**: Payslip generation integration tests.
- **UI Contamination Status**: **ZERO UI REUSE**. Rendered in clean download card.

---

## Subsystem 7: Warehouse, Inventory & Consumables Logic
- **Source Repository & Path**: `JantaHROnehub/src/modules/warehouse/api/inventory.ts`, `Warehouse Management/src/lib/db.ts`
- **Used For**: School textbooks, laboratory equipment, stationery consumables, reorder level alerts, stock issuance.
- **Trust Basis**: Tested stock balance updates, transactional deductions, and inventory categorization.
- **Copied / Adapted**: Item catalog schema, stock decrement RPCs, low-stock threshold triggers.
- **Adaptation Required**: Scoped to school inventory categories (textbooks, science lab reagents, sporting gear).
- **Tests Covering It**: `inventory.test.ts`.
- **UI Contamination Status**: **ZERO UI REUSE**. 100% new SomaCampus inventory tables and action drawers.

---

## Subsystem 8: Asset Custody & Maintenance Tracking
- **Source Repository & Path**: `JantaHROnehub/supabase/migrations/0057_add_asset_custody.sql`, `egypro/src/pages/Assets.jsx`
- **Used For**: Tracking durable school assets (laptops, lab microscopes, school buses, projectors), custodian staff assignments, and condition logging.
- **Trust Basis**: Tested asset custody transfer and maintenance history schema.
- **Copied / Adapted**: Asset table schema, custody assignment audit triggers, condition state enums.
- **Adaptation Required**: School department and room allocation linkage.
- **Tests Covering It**: Asset custody unit tests.
- **UI Contamination Status**: **ZERO UI REUSE**. Modern card and drawer UI.

---

## Subsystem 9: Event-Driven Notification Queue
- **Source Repository & Path**: `JantaHROnehub/supabase/migrations/0050, 0051, 0060`, `src/modules/notifications`
- **Used For**: System notifications, unread badges, delivery status tracking, and event routing.
- **Trust Basis**: Tested queue with delivery claims and retry safety.
- **Copied / Adapted**: Database notification table schema, trigger functions, and unread count queries.
- **Adaptation Required**: Educational event types (missing lesson note alert, fee reconciliation exception, calendar reminder).
- **Tests Covering It**: Notification delivery unit tests.
- **UI Contamination Status**: **ZERO UI REUSE**. Replaced by a floating top-header glass notification popover.

---

## Subsystem 10: Excel / CSV Import & Validation Pattern
- **Source Repository & Path**: `JantaHROnehub/src/modules/hr/api/employeeImports.ts`, `@e965/xlsx`
- **Used For**: Core file parsing, column normalization, and row-level validation.
- **Trust Basis**: Robust spreadsheet parsing handling varying row encodings and header variations.
- **Copied / Adapted**: Spreadsheet parsing utilities and row mapping validation pattern.
- **Adaptation Required**: **Adapted specifically for Fee Payment Reconciliation**: parsing school bank/telco payment spreadsheets, matching student admission numbers, and detecting duplicate transactions.
- **Tests Covering It**: File parsing test suite and row validation tests.
- **UI Contamination Status**: **ZERO UI REUSE**. Completely new multi-step fee import reconciliation wizard with live matching preview.
