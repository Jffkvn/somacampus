# SomaCampus Core Operations — Automated Browser Verification

Automated end-to-end browser test suite and visual verification report executed against `http://localhost:5173` via Chrome DevTools Protocol (CDP).

Runner Script: [`scripts/run-browser-tests.mjs`](../../scripts/run-browser-tests.mjs)  
Report Data: [`docs/verification/browser_test_report.json`](./browser_test_report.json)

---

## 1. Route Verification Matrix

| # | Route | Role Tested | Surface Verified | Status | Screenshot Evidence |
|---|---|---|---|---|---|
| 1 | `/students/new` | Principal | Student Admission 4-Step Wizard & Completeness Meter | **PASS** | [01_admissions_wizard.png](./screenshots/01_admissions_wizard.png) |
| 2 | `/admissions` & `/admissions/queue` | Principal | Candidate Review Queue & Approve / Reject Split View | **PASS** | [02_admissions_queue.png](./screenshots/02_admissions_queue.png) |
| 3 | `/staff` | Principal | Faculty & Staff Directory with Department Filters & + Hire CTA | **PASS** | [03_staff_directory.png](./screenshots/03_staff_directory.png) |
| 4 | `/staff/new` | Principal | Staff Onboarding Wizard & Official Subject Appointments | **PASS** | [04_staff_hire_wizard.png](./screenshots/04_staff_hire_wizard.png) |
| 5 | `/staff/:id` (Personal) | Principal | 6-Domain Personnel Dossier with Demographic Records | **PASS** | [05_staff_dossier_personal.png](./screenshots/05_staff_dossier_personal.png) |
| 6 | `/staff/:id` (Leave) | Principal | Leave Entitlement Quotas & Balances Tab | **PASS** | [06_staff_dossier_leave.png](./screenshots/06_staff_dossier_leave.png) |
| 7 | `/staff/:id` (Payroll) | Principal | Statutory Compensation & Bank Details with Role Firewall | **PASS** | [07_staff_dossier_payroll.png](./screenshots/07_staff_dossier_payroll.png) |
| 8 | `/classes` | Principal | Class Stages, Stream Capacities, Form Teacher Allocation | **PASS** | [08_classes_management.png](./screenshots/08_classes_management.png) |
| 9 | `/administration/hr/approvals` | Principal | Leadership Executive Queues for Staff Leave & Salary Advances | **PASS** | [09_hr_approvals_cockpit.png](./screenshots/09_hr_approvals_cockpit.png) |
| 10 | `/administration/inventory` | Principal | Warehouse Store, Consumables Reorder Alerts & Goods Receipts | **PASS** | [10_inventory_cockpit.png](./screenshots/10_inventory_cockpit.png) |
| 11 | `/planning/timetable/draft` | Principal | Master Timetable Architecture with Clean Status Pill | **PASS** | [11_timetable_draft.png](./screenshots/11_timetable_draft.png) |
| 12 | `/calendar` | Principal | Whole-School Term Calendar with Event Creation & Sample Seeding | **PASS** | [12_school_calendar.png](./screenshots/12_school_calendar.png) |
| 13 | `/finance/expenses` | Principal | Operating Expenses Ledger & Reporting Cycle Summary | **PASS** | [13_expenses_logging.png](./screenshots/13_expenses_logging.png) |
| 14 | `/teacher/today` | Teacher | Rapid Morning Briefing, Clock-In Status & Schedule | **PASS** | [14_teacher_today.png](./screenshots/14_teacher_today.png) |
| 15 | `/teaching/classes/:id/attendance` | Teacher | Morning Class Register with One-Click Mark All Present | **PASS** | [15_bulk_attendance_register.png](./screenshots/15_bulk_attendance_register.png) |
| 16 | `/teaching/resources` | Teacher | Approved Resource Library 3-Column Responsive Cards | **PASS** | [16_resource_library.png](./screenshots/16_resource_library.png) |

---

## 2. Visual Screenshots

### 01. Student Admission Wizard (`/students/new`)
![Student Admission Wizard](./screenshots/01_admissions_wizard.png)

### 02. Admissions Review Queue (`/admissions` & `/admissions/queue`)
![Admissions Queue](./screenshots/02_admissions_queue.png)

### 03. Staff & Faculty Directory (`/staff`)
![Staff Directory](./screenshots/03_staff_directory.png)

### 04. Staff Hire Wizard (`/staff/new`)
![Staff Hire Wizard](./screenshots/04_staff_hire_wizard.png)

### 05. Staff Personnel Dossier (`/staff/:id`)
![Staff Dossier](./screenshots/06_staff_dossier_leave.png)

### 06. Classes & Streams Management (`/classes`)
![Classes Management](./screenshots/08_classes_management.png)

### 07. HR Operations & Approvals Cockpit (`/administration/hr/approvals`)
![HR Approvals](./screenshots/09_hr_approvals_cockpit.png)

### 08. Warehouse, Store & Asset Control (`/administration/inventory`)
![School Store & Inventory](./screenshots/10_inventory_cockpit.png)

### 09. Master Timetable Architecture (`/planning/timetable/draft`)
![Master Timetable](./screenshots/11_timetable_draft.png)

### 10. School Calendar (`/calendar`)
![School Calendar](./screenshots/12_school_calendar.png)

### 11. School Operating Expenses (`/finance/expenses`)
![School Operating Expenses](./screenshots/13_expenses_logging.png)

### 12. Teacher Today Workspace (`/teacher/today`)
![Teacher Today](./screenshots/14_teacher_today.png)

### 13. Bulk Attendance Register (`/teaching/classes/.../attendance`)
![Bulk Attendance Register](./screenshots/15_bulk_attendance_register.png)

### 14. Approved Resource Library (`/teaching/resources`)
![Resource Library](./screenshots/16_resource_library.png)
