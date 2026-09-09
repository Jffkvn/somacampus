# SomaCampus Core Operations — Automated Browser Verification

Automated browser **traversal** suite and visual verification report executed against `http://localhost:5173` via Playwright and Chrome DevTools Protocol.

**Honesty label:** every route result below is **SMOKE_ONLY** (DOM/shell presence + console-error scan). It is **not** a transactional database verification. The authoritative machine-readable report is `browser_test_report.json` (`reportClassification: SMOKE_ONLY_TRAVERSAL`).

Runner Script: [`scripts/verify-browser-playwright.mjs`](../../scripts/verify-browser-playwright.mjs)  
Report Data: [`docs/verification/browser_test_report.json`](./browser_test_report.json)

---

## 1. Route Verification Matrix

| # | Route | Role Tested | Surface Verified | Status | Screenshot Evidence |
|---|---|---|---|---|---|
| 0 | `/admin/overview` | Admin | School Operations & Governance Cockpit (Replaces placeholder) | **SMOKE_ONLY** | [00_admin_overview_cockpit.png](./screenshots/00_admin_overview_cockpit.png) |
| 1 | `/students/new` | Admin | Student Admission 4-Step Wizard & Completeness Meter | **SMOKE_ONLY** | [01_admissions_wizard.png](./screenshots/01_admissions_wizard.png) |
| 2 | `/admissions` & `/admissions/queue` | Admin | Candidate Review Queue & Approve / Reject Split View | **SMOKE_ONLY** | [02_admissions_queue.png](./screenshots/02_admissions_queue.png) |
| 3 | `/staff` | Admin | Faculty & Staff Directory with Department Filters & + Hire CTA | **SMOKE_ONLY** | [03_staff_directory.png](./screenshots/03_staff_directory.png) |
| 4 | `/staff/new` | Admin | Staff Onboarding Wizard & Official Subject Appointments | **SMOKE_ONLY** | [04_staff_hire_wizard.png](./screenshots/04_staff_hire_wizard.png) |
| 5 | `/staff/:id` (Personal) | Admin | 6-Domain Personnel Dossier with Demographic Records | **SMOKE_ONLY** | [05_staff_dossier_personal.png](./screenshots/05_staff_dossier_personal.png) |
| 6 | `/staff/:id` (Leave) | Admin | Leave Entitlement Quotas & Balances Tab | **SMOKE_ONLY** | [06_staff_dossier_leave.png](./screenshots/06_staff_dossier_leave.png) |
| 7 | `/staff/:id` (Payroll) | Admin | Statutory Compensation & Bank Details with Role Firewall | **SMOKE_ONLY** | [07_staff_dossier_payroll.png](./screenshots/07_staff_dossier_payroll.png) |
| 8 | `/classes` | Admin | Class Stages, Stream Capacities, Form Teacher Allocation | **SMOKE_ONLY** | [08_classes_management.png](./screenshots/08_classes_management.png) |
| 9 | `/administration/hr/approvals` | Admin | Leadership Executive Queues for Staff Leave & Salary Advances | **SMOKE_ONLY** | [09_hr_approvals_cockpit.png](./screenshots/09_hr_approvals_cockpit.png) |
| 10 | `/administration/inventory` | Admin | Warehouse Store, Consumables Reorder Alerts & Goods Receipts | **SMOKE_ONLY** | [10_inventory_cockpit.png](./screenshots/10_inventory_cockpit.png) |
| 11 | `/planning/timetable/draft` | Admin | Master Timetable Architecture with Clean Status Pill | **SMOKE_ONLY** | [11_timetable_draft.png](./screenshots/11_timetable_draft.png) |
| 12 | `/calendar` | Admin | Whole-School Term Calendar with Event Creation & Sample Seeding | **SMOKE_ONLY** | [12_school_calendar.png](./screenshots/12_school_calendar.png) |
| 13 | `/finance/expenses` | Admin | Operating Expenses Ledger & Reporting Cycle Summary | **SMOKE_ONLY** | [13_expenses_logging.png](./screenshots/13_expenses_logging.png) |
| 14 | `/teacher/today` | Teacher | Rapid Morning Briefing, Clock-In Status & Schedule | **SMOKE_ONLY** | [14_teacher_today.png](./screenshots/14_teacher_today.png) |
| 15 | `/teaching/classes/:id/attendance` | Teacher | Morning Class Register with One-Click Mark All Present | **SMOKE_ONLY** | [15_bulk_attendance_register.png](./screenshots/15_bulk_attendance_register.png) |
| 16 | `/teaching/resources` | Teacher | Approved Resource Library 3-Column Responsive Cards | **SMOKE_ONLY** | [16_resource_library.png](./screenshots/16_resource_library.png) |
| 17 | `/teaching/assignments/new` | Teacher | Cambridge Primary AI Assignment Studio (5-Layer Grounding & Human Gate) | **SMOKE_ONLY** | [17_ai_teaching_assignment_studio.png](./screenshots/17_ai_teaching_assignment_studio.png) |
| 18 | `/teaching/assignments/:id` | Teacher | Closed-Loop Evidence Extraction (Zero AI Grading) & Next-Step Intervention | **SMOKE_ONLY** | [18_ai_evidence_extraction_loop.png](./screenshots/18_ai_evidence_extraction_loop.png) |

👉 **For the complete architecture, live schema contracts, and governance walkthrough, see: [AI_TEACHING_LOOP_WALKTHROUGH.md](./AI_TEACHING_LOOP_WALKTHROUGH.md)**

---

## 2. Visual Screenshots

### 00. School Setup & Administration Cockpit (`/admin/overview`)
![Admin Overview Cockpit](./screenshots/00_admin_overview_cockpit.png)

### 01. Student Admission Wizard (`/students/new`)
![Student Admission Wizard](./screenshots/01_admissions_wizard.png)

### 02. Admissions Review Queue (`/admissions` & `/admissions/queue`)
![Admissions Queue](./screenshots/02_admissions_queue.png)

### 03. Staff & Faculty Directory (`/staff`)
![Staff Directory](./screenshots/03_staff_directory.png)

### 04. Staff Hire Wizard (`/staff/new`)
![Staff Hire Wizard](./screenshots/04_staff_hire_wizard.png)

### 05. Staff Personnel Dossier (`/staff/:id`)
![Staff Dossier](./screenshots/05_staff_dossier_personal.png)

### 06. Staff Leave Balances & Entitlements (`/staff/:id` - Leave)
![Staff Leave](./screenshots/06_staff_dossier_leave.png)

### 07. Staff Statutory Payroll & Compensation (`/staff/:id` - Payroll)
![Staff Payroll](./screenshots/07_staff_dossier_payroll.png)

### 08. Classes & Streams Management (`/classes`)
![Classes Management](./screenshots/08_classes_management.png)

### 09. HR Operations & Approvals Cockpit (`/administration/hr/approvals`)
![HR Approvals](./screenshots/09_hr_approvals_cockpit.png)

### 10. Warehouse, Store & Asset Control (`/administration/inventory`)
![School Store & Inventory](./screenshots/10_inventory_cockpit.png)

### 11. Master Timetable Architecture (`/planning/timetable/draft`)
![Master Timetable](./screenshots/11_timetable_draft.png)

### 12. School Calendar (`/calendar`)
![School Calendar](./screenshots/12_school_calendar.png)

### 13. School Operating Expenses (`/finance/expenses`)
![School Operating Expenses](./screenshots/13_expenses_logging.png)

### 14. Teacher Today Workspace (`/teacher/today`)
![Teacher Today](./screenshots/14_teacher_today.png)

### 15. Bulk Attendance Register (`/teaching/classes/.../attendance`)
![Bulk Attendance Register](./screenshots/15_bulk_attendance_register.png)

### 16. Approved Resource Library (`/teaching/resources`)
![Resource Library](./screenshots/16_resource_library.png)

### 17. Cambridge AI Teaching Assignment Studio (`/teaching/assignments/new`)
![AI Teaching Assignment Studio](./screenshots/17_ai_teaching_assignment_studio.png)

### 18. Qualitative Evidence Extraction Modal (`/teaching/assignments/:id`)
![AI Evidence Extraction](./screenshots/18_ai_evidence_extraction_loop.png)

### 19. AI Targeted Next-Step Intervention Flow
![AI Intervention Suggestion](./screenshots/19_ai_intervention_suggestion.png)
