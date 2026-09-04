# SOMACAMPUS PHASE 7 ARCHITECTURE CONTRACT
## Revised Architecture Directive: Native School Finance, Payroll & HR

**Document Status:** Approved Architecture Contract  
**Project:** SomaCampus  
**Phase:** 7  
**Scope:** Native School Finance, Payroll Engine, Staff HR Self-Service, Activity Clearance Firewall & Institutional Money Picture  
**Target Repository:** `https://github.com/Jffkvn/somacampus`  

---

## 1. Purpose & Authoritative Principles

This document is the master architecture contract for SomaCampus Phase 7, updating and superseding previous specifications where necessary.

The key architectural decision is final:

> **SomaCampus must have its own native payroll system and payroll engine.**

The existing JantaHR repositories (`janthr-egypro-payroll`, `jantahr-egypro-employee-portal`, `jantahronehub`) have been thoroughly audited at the code level. The statutory calculations, payroll composition logic, database safeguards, leave calculations, salary advance workflows, and related implementations are established, tested implementations. They serve as the **authoritative reference implementation** for SomaCampus payroll.

Do not redesign these business rules unnecessarily.  
Do not replace proven payroll logic with newly invented calculations.

Instead:

> **Port and adapt the proven JantaHR payroll implementation into SomaCampus's native architecture while preserving its tested behaviour and statutory correctness.**

JantaHR is therefore a **development and reference source**, not a runtime dependency.

### The Ten Architectural Principles:
1. **SomaCampus owns payroll**: Native calculation engine and schema; no duplicated authority.
2. **JantaHR is reference knowledge, not runtime**: Port tested, legally compliant behaviour directly.
3. **Preserve proven statutory calculations**: Port July 1, 2026 URA PAYE bands, 10% super-earner surcharge, NSSF Cap 222 (5%/10%), 173.33h overtime, and contractor WHT 6% without redesigning.
4. **Single-writer composition**: All downstream features must invoke `buildPayrollItem()`. Derived math must never be independently recreated.
5. **Historical payroll is immutable & reproducible**: Frozen calculation snapshots; salary and statutory changes must never rewrite past finalized runs.
6. **Payroll periods are independent from academic periods**: `School -> Payroll Period -> Payroll Run` operates on its own employment calendar, not as a child of academic terms.
7. **Financial status and operational participation clearance are decoupled**: A student can have unpaid fees but be cleared on a "Promise to Pay" basis.
8. **Teacher financial privacy is absolute**: Hard database RLS boundary; teachers never see student fee balances, parent arrears, or employee salaries.
9. **Financial and payroll security enforced at DB/API boundary**: No reliance on UI hiding; drop all permissive `USING (true)` policies.
10. **Operational school money movement, not general accounting**: Tracks Money In (fees, activities) and Money Out (finalized payroll, school expenses) without double-entry ERP bloat.

---

## 2. 5-Category Classification of Audited Capabilities

In accordance with Section 24 of the Revised Directive, all audited capabilities are classified into five explicit categories:

| Category | Definition | Concrete Implementations |
| :--- | :--- | :--- |
| **1. Proven Reference Implementation** | Existing tested JantaHR behaviour to preserve when porting | • **Uganda PAYE Engine** (`calculations.js`): 2026 bands (0–335k @ 0%, 335k–410k @ 10%, 410k–485k @ 25%, >485k @ 30%) + 10% super-earner surcharge > UGX 10,000,000.<br>• **NSSF Act Cap 222**: 5% employee, 10% employer (total 15%).<br>• **Overtime Math**: 173.33 standard monthly hours, 1.5x multiplier.<br>• **Worker Tax Classes**: `local`, `global`, `contractor` (WHT 6%), `exempt`.<br>• **Single-Writer Item Composer**: `buildPayrollItem()` in `payrollItem.js` (clamping net pay $\ge 0$).<br>• **Leave Working Days**: `rpc_calculate_leave_working_days` (excluding weekends & active public holidays).<br>• **Effective Leave Balance**: `effectiveLeaveBalances.js` (subtracting pending unapproved requests).<br>• **Salary Advance Math**: 50% basic pay cap, 1–3 month installment amortization. |
| **2. Native SomaCampus Adaptation** | Proven behaviour adapted to SomaCampus's People, Tenancy & Permissions model | • **Staff Identity**: `auth.uid() -> people.auth_user_id -> employees.person_id`.<br>• **Multi-Tenancy**: `company_id` adapted to `school_id UUID REFERENCES schools(id)`.<br>• **Employee Payroll Profile**: `employee_payroll_profiles` with effective date ranges (`effective_from`, `effective_to`).<br>• **Independent Payroll Calendar**: `payroll_periods` (e.g. `2026-09-01 -> 2026-09-30`), independent of academic terms.<br>• **Role Mapping**: `owner/admin/cfo` adapted to `admin/principal/bursar`.<br>• **Statutory Versioning**: `payroll_tax_configurations` table supporting future statutory updates. |
| **3. SomaCampus Native Domain** | Functionality specific to the school platform | • **Student Fee Engine**: `fee_structures`, `fee_categories`, `student_charges`.<br>• **Multi-Target Payment Intake**: `fee_payments`, `payment_allocations`, overpayment credits (`unallocated_amount`).<br>• **Derived Fee Balance**: `student_fee_accounts` operational summary derived deterministically from ledger.<br>• **School Activities & Clubs**: `school_activities`, `activity_enrolments`.<br>• **Decoupled Clearance Ledger**: `activity_clearances` (`cleared`, `not_cleared`, `pending_review` + `basis`).<br>• **Teacher Financial Firewall**: Purging leaky fields from academic models; reduced `ActivityParticipantProjection`.<br>• **School Operating Expenses**: `school_expenses`, `school_expense_categories` (Money Out).<br>• **Institutional Money Picture**: `/dashboard/school` Money In vs Money Out operational movement. |
| **4. Engineering Patterns** | Proven implementation patterns applied wherever relevant | • **Database Immutability Triggers**: `guard_finalised_payroll_items`, `guard_payroll_run_status`.<br>• **Workflow State Transition Trigger**: `enforce_employee_workflow_transition()`.<br>• **Half-Day Shape Constraint**: `CHECK (day_portion = 'full' OR (start_date = end_date AND num_days = 0.5))`.<br>• **Single Open Advance Invariant**: `CREATE UNIQUE INDEX ... WHERE status IN ('pending', 'active', 'flagged')`.<br>• **Concurrency Protection**: `SELECT ... FOR UPDATE` row locks in atomic stored procedures.<br>• **Vector Payslip PDF**: Client-side `@react-pdf/renderer` templates. |
| **5. Do Not Import as Dependency** | Components that must NOT remain external dependencies or be copied | • JantaHR Payroll runtime API or database.<br>• JantaHR Employee Portal application.<br>• OneHub UI design, HTML, CSS tokens, or color schemes (`#128f76`).<br>• Full double-entry ERP general ledger (QuickBooks/Xero). |

---

## 3. Tenancy, People & Employee Ownership Model

SomaCampus already has an established People model. Phase 7 builds directly upon this model without creating a duplicate employee master table:

```
schools (Tenant Root)
   └── people (Physical humans: first_name, last_name, email, phone, auth_user_id)
         ├── employees (Staff: school_id, person_id, employee_number, job_title, hire_date)
         │     └── employee_payroll_profiles (Effective-dated financial configuration)
         ├── students (Learners: school_id, person_id, admission_number, status)
         └── student_guardians (Parents: student_id, guardian_person_id)
```

### `employee_payroll_profiles` Schema
```sql
CREATE TABLE public.employee_payroll_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  
  -- Effective Dating
  effective_from DATE NOT NULL,
  effective_to DATE, -- NULL indicates current active configuration
  
  -- Pay Basis & Tax Classification (Orthogonal Concepts)
  pay_basis TEXT NOT NULL DEFAULT 'salaried' CHECK (pay_basis IN ('salaried', 'hourly')),
  tax_treatment TEXT NOT NULL DEFAULT 'local' CHECK (tax_treatment IN ('local', 'global', 'contractor', 'exempt')),
  
  -- Base Salary & Rates
  base_salary NUMERIC(14,2) NOT NULL CHECK (base_salary >= 0),
  hourly_rate NUMERIC(14,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  currency TEXT NOT NULL DEFAULT 'UGX',
  
  -- Statutory Flags & Overrides
  nssf_applicable BOOLEAN NOT NULL DEFAULT true,
  custom_wht_rate NUMERIC(5,2), -- for contractors
  custom_overtime_rate NUMERIC(14,2),
  
  -- Payment Routing
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'mobile_money', 'cash', 'cheque')),
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  mobile_money_number TEXT,
  mobile_money_provider TEXT CHECK (mobile_money_provider IS NULL OR mobile_money_provider IN ('mtn', 'airtel')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX employee_payroll_profiles_lookup_idx 
  ON public.employee_payroll_profiles(employee_id, effective_from, effective_to);
```

---

## 4. Effective Dating & Historical Immutability

Employee payroll configuration must support historical effective dates:
* **Example:**
  * 01 Jan 2026 $\rightarrow$ 30 Sep 2026: Base salary = UGX 1,500,000
  * 01 Oct 2026 $\rightarrow$ Onwards: Base salary = UGX 1,800,000
* A September 2026 payroll record permanently retains the UGX 1,500,000 salary basis.
* Opening historical payroll months later will **never** dynamically recalculate it using the employee's new salary.
* Finalized payroll runs store a **frozen calculation snapshot** (`calculation_settings` JSONB) of all components, tax rates, and parameters.

---

## 5. Independent Payroll Calendar vs Academic Periods

> [!IMPORTANT]
> **Architectural Invariant:** Payroll periods are strictly independent from academic periods. Payroll is **not** a child of `Academic Year -> Term`.

Payroll operates on its own employment calendar:
```
School
   ↓
Payroll Period (e.g. 2026-09-01 → 2026-09-30)
   ↓
Payroll Run
```

Academic periods (`academic_year_id`, `term_id`) may be associated optionally for institutional management reporting, but the payroll engine periodizes strictly by employment calendar dates.

### `payroll_periods` Schema
```sql
CREATE TABLE public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_month TEXT NOT NULL, -- 'YYYY-MM'
  label TEXT NOT NULL,        -- e.g. 'September 2026'
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CHECK (period_start = date_trunc('month', period_start)::date),
  CHECK (period_end = (period_start + interval '1 month - 1 day')::date),
  UNIQUE (school_id, period_month)
);
```

---

## 6. Statutory Versioning

To ensure SomaCampus safely accommodates future statutory changes (e.g. subsequent URA tax amendment acts) without rewriting historical records:

```sql
CREATE TABLE public.payroll_tax_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE, -- NULL indicates national default
  effective_from DATE NOT NULL,
  effective_to DATE,
  
  -- Uganda Statutory Settings (July 1, 2026 baseline)
  paye_bands JSONB NOT NULL,
  surcharge_threshold NUMERIC(14,2) NOT NULL DEFAULT 10000000,
  surcharge_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  nssf_employee_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  nssf_employer_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  overtime_multiplier NUMERIC(5,4) NOT NULL DEFAULT 1.5,
  standard_monthly_hours NUMERIC(6,2) NOT NULL DEFAULT 173.33,
  default_wht_rate NUMERIC(5,4) NOT NULL DEFAULT 0.06,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Every `school_payroll_runs` record captures the exact `tax_configuration_id` and stores the calculation parameters in its frozen `calculation_settings` JSONB snapshot.

---

## 7. Authoritative Payroll Calculation & Single-Writer Composition

### Porting `calculations.js` (`src/modules/payroll/calculations.ts`)
The proven statutory rules from JantaHR are ported with zero alterations:
```typescript
export const UG_PAYE_BANDS_2026 = [
  { min: 0, max: 335000, rate: 0.00 },
  { min: 335000, max: 410000, rate: 0.10 },
  { min: 410000, max: 485000, rate: 0.25 },
  { min: 485000, max: Infinity, rate: 0.30 },
];

export function calculateUgandaPAYE(grossMonthly: number, bands = UG_PAYE_BANDS_2026): number {
  let tax = 0;
  for (const band of bands) {
    if (grossMonthly <= band.min) break;
    const upper = band.max === Infinity ? grossMonthly : Math.min(grossMonthly, band.max);
    tax += (upper - band.min) * band.rate;
  }
  if (grossMonthly > 10000000) {
    tax += (grossMonthly - 10000000) * 0.10;
  }
  return Math.round(tax);
}

export function calculateUgandaNSSF(grossMonthly: number) {
  const employee = Math.round(grossMonthly * 0.05);
  const employer = Math.round(grossMonthly * 0.10);
  return { employee, employer, total: employee + employer };
}
```

### The Single-Writer Item Composer (`src/modules/payroll/payrollItem.ts`)
All downstream features (run creation, editing, overtime quick-save, payslip generation, exports, dashboards) **must** invoke `buildPayrollItem()`. Independent derivations of net pay are strictly forbidden.

```typescript
export function buildPayrollItem(input: PayrollItemInput): PayrollItemCalculated {
  const calc = calculateUgandaPayslip({ ... });
  const advance = Number(input.advanceDeduction || 0);
  const unpaid = Number(input.unpaidLeaveDeduction || 0);
  
  // Post-tax deductions clamped at 0
  const netPay = Math.max(0, calc.netPay - advance - unpaid);
  
  return {
    gross_salary: calc.grossSalary,
    overtime_hours: input.overtimeHours || 0,
    overtime_amount: calc.overtimePay,
    allowances: calc.allowances,
    other_deductions: calc.otherDeductions,
    paye: calc.paye,
    nssf_employee: calc.nssfEmployee,
    nssf_employer: calc.nssfEmployer,
    wht_amount: calc.whtAmount || 0,
    advance_deduction: advance,
    unpaid_leave_deduction: unpaid,
    net_pay: netPay,
    employee_type: calc.employeeType,
    pct_month_worked: calc.pctMonthWorked,
  };
}
```

---

## 8. Explicit Payroll Lifecycle & Database Safeguards

### State Machine Lifecycle
```
DRAFT
  ↓
CALCULATED
  ↓
UNDER_REVIEW
  ↓
APPROVED
  ↓
FINALIZED
```

### Immutable Database Guards
1. **`guard_finalised_payroll_items` Trigger:**
   Throws check violation if an `UPDATE` or `DELETE` is attempted on `school_payroll_items` whose parent run is in `'approved'` or `'finalized'`.
2. **`guard_payroll_run_status` Trigger:**
   Prevents moving an `'approved'` or `'finalized'` payroll run back to `'draft'`.
3. **Orthogonal Pay Basis Check:**
   `CHECK (pay_basis IN ('salaried', 'hourly'))` kept strictly distinct from tax classification.

---

## 9. Salary Advances: Baseline & Invariants

Adapted from JantaHR with all proven invariants intact:
* **Single Open Advance Invariant:**
  ```sql
  CREATE UNIQUE INDEX staff_advances_one_open_per_employee_idx
    ON public.staff_advances(employee_id)
    WHERE status IN ('pending', 'active', 'flagged');
  ```
  Guarantees at the database level that no employee can hold multiple open advances.
* **Cap Policy:** 50% of gross base salary (`advance_cap_percentage`).
* **Amortization:** `monthly_deduction = amount / num_instalments` (1 to 3 months).
* **Automatic Recovery:** Monthly deduction is subtracted post-tax in `buildPayrollItem()`. On run finalization, an atomic RPC inserts into `advance_repayments` with unique constraint `UNIQUE (advance_id, payroll_period_id, source)`.

---

## 10. Staff HR: Leave & Working Days Engine

* **Effective Balance Calculator (`effectiveLeaveBalances.ts`):** Merges institutional quota with employee balances, subtracting pending unapproved requests.
* **Working Days RPC (`rpc_calculate_leave_working_days`):**
  Uses `generate_series()` between `start_date` and `end_date`, excluding Saturdays/Sundays (`extract(isodow from day_value) BETWEEN 1 AND 5`) and active `public_holidays`.
* **Half-Day Constraint:**
  ```sql
  CHECK (day_portion = 'full' OR (start_date = end_date AND num_days = 0.5))
  ```
* **Separation of Concerns:** Leave is owned by HR. Approved unpaid leave records pass an unworked day deduction figure to Payroll. HR does not calculate payroll.

---

## 11. School Fees & Derived Balance Invariant

SomaCampus is the **operational record of school fee activity**, not an external payment processor.

### Core Architecture
```
student_charges (Debit obligation: tuition, lunch, transport, club)
      ↑
payment_allocations (Credit application)
      ↑
fee_payments (Verified bank deposit, mobile money, cash receipt)
```

> [!IMPORTANT]
> **Source of Truth Rule:** The financial source of truth consists of `Charges`, `Payments`, `Allocations`, and `Adjustments`. Student balances are **derived**. The `student_fee_accounts` operational summary table is updated deterministically via database triggers; it is never an independently mutable source of truth.

* **Overpayment Handling:** Payments exceeding outstanding charges retain an `unallocated_amount` that can be automatically applied to future term charges.

---

## 12. Activity Clearance vs Financial Payment Decoupling

> [!IMPORTANT]
> **The Core Rule:** Financial Payment $\neq$ Operational Clearance.  
> A student can have unpaid fees but remain enrolled and academically engaged. A student can have an unpaid activity fee and still be cleared on a "Promise to Pay" basis.

### Decoupled Model
* `clearance_status`: `'cleared'` | `'not_cleared'` | `'pending_review'`
* `clearance_basis`: `'paid'` | `'waived'` | `'sponsored'` | `'promise_to_pay'` | `'included'` | `'administrative_approval'`

---

## 13. Teacher Financial Privacy Firewall

### The Firewall Invariant
**Teachers MUST NEVER receive student fee balances, parent arrears, invoices, payment receipts, or employee salaries.**

1. **Database RLS Boundary:**
   * Drop the insecure `USING (true)` policy on `student_fee_accounts`.
   * Restrict `student_fee_accounts`, `student_charges`, `fee_payments`, `fee_adjustments`, and `school_expenses` strictly to `['admin', 'principal', 'bursar']`.
2. **Purge Leaky Fields from Academic Models:**
   * Remove `feeBalance` and `feeClearanceStatus` from `StudentLearningSummary` in `src/types/domain.ts` and `src/modules/students/studentService.ts`.
3. **Teacher Activity Projection View:**
   When teachers view activity rosters, the database returns a restricted projection:
   ```typescript
   export interface ActivityParticipantProjection {
     studentId: string;
     studentName: string;
     className: string;
     clearanceStatus: 'cleared' | 'not_cleared' | 'pending_review';
     clearanceLabel: string; // e.g. "✓ Cleared • Promise to Pay"
     operationalNote?: string;
   }
   ```
   Zero monetary numbers or arrears are present in this contract.

---

## 14. School Expenses & Institutional Money Picture

* **Operational Money Out:** Tracks operational payments (`school_expenses`: food/lunch, electricity, water, internet, maintenance, stationery, transport) with payee, category, and receipts.
* **Finalized Payroll Feed:** Finalized payroll expenditure automatically feeds into the institutional money movement ledger as a primary operational expense.
* **Institutional Dashboard (`/dashboard/school`):**
  Presents a clear **Money In vs Money Out** operational summary with Net Operational Movement, collection rate, and outstanding charges.

---

## 15. Testing & Verification Strategy

1. **Parity Unit Tests (`src/test/payroll-parity.test.ts`):**
   * Verifies exact parity between SomaCampus payroll calculations and the JantaHR test suite (`calculations.test.js`, `payrollItem.test.js`).
   * Tests all 2026 PAYE brackets, 10% super-earner surcharge, NSSF 5%/10%, overtime, and contractor WHT 6%.
2. **Database Invariant & Security Tests (`src/test/finance-invariants.test.ts`):**
   * Verifies teacher role receives empty results or permission errors on financial tables.
   * Verifies single open advance constraint.
   * Verifies finalized payroll immutability triggers.
3. **Full Regression Suite:**
   * Ensures all 31 existing test suites (168 tests) remain 100% green.
   * Ensures the morning class attendance invariant is completely intact.
4. **Interactive Browser Verification:**
   * Execution of Bursar, Teacher, Principal, and Employee workflows in the live web application.

---

## 16. Navigation Hierarchy & Zero OneHub UI Duplication

### Academics-First Navigation Order
SomaCampus is an **academics-first platform**. Personal HR and payroll utilities must never usurp pedagogical workflow:
1. `Today` (Morning clock-in, schedule, attendance coverage)
2. `School Cockpit` (Leadership overview)
3. `Teaching` (Classes, Live Lessons, Assignments, Worksheets, Quizzes, Resources)
4. `Academics` (Curriculum Explorer, Schemes of Work, Activities, Timetable, School Calendar, Classes & Streams)
5. `Students` (Student Directory, Attendance Roster)
6. `Finance` (Fee Accounts, Operating Expenses, Payroll Engine, Payment Imports)
7. `Communication` (Announcements)
8. `Administration` (School Setup, Inventory & Assets, Audit Log)
9. `My HR & Payslips` (**Strictly the last item on the navigation menu**)

### Native Expandable Submenu (Zero OneHub Horizontal Tabs)
* **Zero UI copying**: Horizontal tab navigation rows (such as those in OneHub) are prohibited.
* **Native Accordion Navigation**: Staff HR features are navigated via the native SomaCampus sidebar accordion with direct sub-routes:
  - `Leave & Balances` (`/people/hr/leave`)
  - `Salary Advances` (`/people/hr/advances`)
  - `My Payslips` (`/people/hr/payslips`)
* **Dedicated Sub-Views**: Each submenu item renders a focused, dedicated view with its own header, context-specific action button, and table—providing an uncluttered, native experience adhering strictly to SomaCampus design tokens.
