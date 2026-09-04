# SOMACAMPUS PHASE 7
## School Finance, Payroll & Operational Money Management
### Master Architecture Audit + Implementation Prompt

You are the senior software architect and implementation engineer for SomaCampus.

Repository:

`https://github.com/Jffkvn/somacampus`

You are extending an existing production-oriented school management platform.

SomaCampus Phases 1 through 6 are already implemented.

Do not treat SomaCampus as a greenfield application.

Do not rewrite existing domains simply because Phase 7 introduces finance.

---

# 1. CRITICAL REFERENCE REPOSITORIES

Before designing Phase 7, you MUST inspect these three existing JantaHR repositories.

## A. Payroll Administration

`https://github.com/Jffkvn/janthr-egypro-payroll`

This is the latest payroll implementation.

It has been built and thoroughly tested.

Treat this repository as the primary technical reference for:

Payroll

Staff compensation

Payroll processing

Salary structures

Payroll administration

Payroll-related workflows

Payroll calculations

Payroll records

Payroll UI patterns

Payroll permissions

Payroll data model

Do not rebuild payroll from scratch without first determining exactly what already exists here.

The goal is to understand how its proven payroll functionality can be incorporated into SomaCampus.

---

# 2. EMPLOYEE PORTAL

`https://github.com/Jffkvn/janthr-egypro-employee-portal`

This is the employee-facing side.

Study it to understand the employee experience, including capabilities such as:

Leave requests

Salary advance requests

Employee requests

Employee information

Employee-facing notifications

Request status

The SomaCampus teacher/staff experience will live under:

**People / HR**

Teachers should not receive an entirely unrelated HR experience merely because they are using SomaCampus.

The existing employee portal is the technical and functional reference.

However:

DO NOT blindly copy the employee portal UI.

Understand its functionality and workflows first.

---

# 3. JANTAHR ONEHUB

`https://github.com/Jffkvn/jantahronehub`

This repository is a reference implementation only.

Study its code for:

Request flows

Approval flows

Status transitions

Notifications

Notification triggering

Request lifecycle

Approver logic

Workflow state

Activity/history

Integration patterns

DO NOT TAKE ANY UI FEATURE FROM ONEHUB.

No OneHub UI feature should be copied into SomaCampus.

No OneHub navigation should be copied.

No OneHub dashboard should be copied.

No OneHub visual design should be copied.

No OneHub feature should be introduced simply because it exists there.

The instruction is:

**READ THE CODE. LEARN THE IMPLEMENTATION PATTERNS. DO NOT COPY THE PRODUCT.**

---

# 4. IMPORTANT REFERENCE RULE

The three JantaHR repositories are:

REFERENCE IMPLEMENTATIONS.

They are NOT instructions to copy entire applications into SomaCampus.

Use them to answer:

"How have we already solved this problem successfully?"

Do not answer:

"How can we make SomaCampus look like JantaHR?"

SomaCampus must remain SomaCampus.

Its UI, navigation, school terminology and information architecture remain authoritative.

---

# 5. PHASE 7 REAL WORLD MODEL

SomaCampus is being built for how schools actually operate in Uganda.

Schools do not necessarily collect fees through SomaCampus.

A parent may pay:

Bank

Mobile Money

Cash

Other school-approved channel

The accountant/bursar then records the transaction in SomaCampus against the intended student.

Therefore SomaCampus is primarily:

**the school's financial operational record system.**

It is not the school's bank.

It is not required to process the money itself.

It is not intended to replace full accounting software.

---

# 6. CORE SCHOOL MONEY FLOW

The real-world workflow is:

Parent pays school through:

Bank / Mobile Money / Cash / Other approved channel

↓

School receives or verifies payment

↓

Accountant records transaction in SomaCampus

↓

Transaction is associated with:

Student

Purpose

Academic context

Payment channel

Reference

Amount

Date

↓

SomaCampus updates the student's financial position

↓

Management sees the school's operational financial picture.

---

# 7. FINANCE + PAYROLL + EXPENSES

The Phase 7 management picture is:

## MONEY IN

School Fees

Activity Fees

Club Fees

Trip Fees

Other Student Charges

Other School Income where appropriate

## MONEY OUT

Payroll

Lunch/Food

Electricity

Water

Internet

Transport

Maintenance

Learning Materials

Cleaning

Security

Activities

Office Expenses

Other School Expenses

The director/principal should be able to see:

**What came in**

**What went out**

**What is outstanding**

**What has been committed**

**What the school is spending money on**

**Payroll cost**

This is an operational management picture.

It is NOT full accounting.

---

# 8. PAYROLL IS A FIRST CLASS EXISTING SYSTEM

Payroll must NOT be designed as an afterthought.

The existing:

`janthr-egypro-payroll`

application contains the latest payroll implementation.

Study its actual code before deciding how SomaCampus should expose payroll.

Determine:

What functionality exists

What data exists

What workflows exist

What calculations exist

What permissions exist

What tables/services exist

What could be shared

What could be integrated

What must remain separate

Do not duplicate payroll calculations in SomaCampus if the proven implementation already solves them.

The architectural decision must explicitly determine whether SomaCampus:

A. shares the payroll data layer

B. consumes payroll services

C. integrates through a defined interface

D. imports payroll summaries

E. embeds/adapts the payroll implementation

or another approach justified by the actual repositories.

Do not guess.

---

# 9. EMPLOYEE / TEACHER HR

Teachers and staff should have access to their own HR capabilities through:

**People / HR**

The staff experience should support the functionality already proven in:

`janthr-egypro-employee-portal`

Examples include:

Leave

Salary advance

Requests

Employee information

Notifications

Request status

The exact feature set must be determined by inspecting the repository.

Do not invent additional HR functionality merely because it sounds useful.

---

# 10. TEACHER FINANCIAL PRIVACY

This is mandatory.

Teachers MUST NOT see student fee status.

A teacher should NOT see:

Outstanding balance

Amount owed

Amount paid

Payment history

Parent arrears

Invoice totals

Fee debt

Financial account information

Teachers should not be able to infer a family's financial situation through academic screens.

---

# 11. CLUB / ACTIVITY CLEARANCE IS DIFFERENT

Teachers DO need to know whether a student is permitted to participate in activities they supervise.

For example:

Student:

School fees:

UGX 1,500,000 paid

Football:

UGX 150,000 unpaid

School decision:

Cleared to participate

Reason:

Promise to Pay

Teacher should see:

**Football: Cleared**

or:

**Football: Cleared • Payment promised**

Teacher should NOT see:

"Parent owes UGX 150,000."

That is a financial privacy violation.

The system must separate:

FINANCIAL STATUS

from

OPERATIONAL CLEARANCE.

---

# 12. ACTIVITY / CLUB MODEL

Activities must be a first-class concept.

Examples:

Football

Swimming

Music

Drama

Debate

Chess

Clubs

Trips

Other paid activities

A student may:

not participate

be enrolled

be paid

be unpaid

be waived

be sponsored

be provisionally cleared

be cleared through administrative approval

be suspended from participation

The exact states should be designed explicitly.

---

# 13. PAYMENT AND PARTICIPATION ARE NOT THE SAME

This is critical.

Example:

Student is enrolled in football.

Fee:

UGX 150,000

Payment:

UGX 0

Clearance:

Approved

Reason:

Promise to Pay

Therefore:

Payment status = Unpaid

Participation clearance = Cleared

Never collapse those into one boolean.

---

# 14. CLEARANCE BASIS

Operational clearance should support a defined basis.

Examples:

Paid

Waived

Sponsored

Included

Administrative Approval

Promise to Pay

Other approved reason

The exact enumeration should be determined during architecture design.

A clearance record must be auditable.

Record:

Who cleared the student

When

For which activity

For which period

Reason/basis

Optional expiry

Notes where necessary

---

# 15. TEACHER ACTIVITY VIEW

Teacher-facing activity information should be intentionally minimal.

Example:

### Football

| Student | Status |
|---|---|
| Sarah | ✓ Cleared |
| David | ✓ Cleared • Promise to Pay |
| Peter | Not Cleared |
| Mary | Not Participating |

Do NOT show:

Amount

Outstanding balance

Payment history

Parent details

Financial account information

The teacher gets exactly what they need to safely run the activity.

Nothing more.

---

# 16. FEE STRUCTURE

School fees remain distinct from activities.

A school may define:

Tuition

Development Fee

Lunch

Transport

Uniform

Boarding

Other school charges

Activities should not automatically become indistinguishable from these.

The architecture should support separate financial categories.

---

# 17. STUDENT FINANCIAL ACCOUNT

The student financial account is the authoritative operational view.

It should be able to explain:

Charges

Payments

Allocations

Adjustments

Waivers

Refunds where supported

Outstanding balance

Academic context

Payment references

The system should make it possible for an accountant to answer:

"What does this student owe?"

"What has the parent paid?"

"What was that payment for?"

"What remains?"

"Was an exception approved?"

---

# 18. MANUAL PAYMENT RECORDING

MVP assumes manual recording.

Example:

Accountant sees bank statement:

Date:

4 September 2026

Reference:

BANK123456

Amount:

UGX 1,200,000

Payer:

Jane Doe

The accountant opens SomaCampus:

Student:

John Doe

Payment:

UGX 1,200,000

Channel:

Bank

Reference:

BANK123456

Purpose:

School Fees

The system records it.

This must be fast.

A school accountant should not have to navigate through ten screens to record one payment.

---

# 19. PAYMENT PURPOSE

A payment must have a clear purpose.

Examples:

School Fees

Club

Trip

Transport

Lunch

Other

A single payment may potentially cover multiple obligations.

The architecture must support allocation.

Do not assume:

one payment = one fee.

---

# 20. PAYMENT ALLOCATION

Example:

Parent pays:

UGX 1,000,000

Student has:

Tuition = UGX 800,000

Lunch = UGX 200,000

Allocation:

Tuition = UGX 800,000

Lunch = UGX 200,000

Payment = UGX 1,000,000

This must reconcile exactly.

---

# 21. OVERPAYMENTS

Support:

Overpayment

Unallocated payment

Credit

Future allocation

The exact model should be defined in the architecture contract.

Do not silently lose money because the payment is larger than the current obligation.

---

# 22. FINANCIAL CORRECTIONS

Do not allow historical payments to be casually overwritten.

For example:

Payment:

UGX 500,000

Incorrect reference

An accountant should correct it through an auditable mechanism.

Do not simply mutate the historical financial truth without preserving what happened.

---

# 23. SCHOOL EXPENSES

Add a lightweight operational expenses module.

This is deliberately NOT a full accounting system.

A school should be able to record:

Expense category

Amount

Date

Payment channel

Description

Reference

Recorded by

Optional supplier/payee

Optional attachment/receipt

Examples:

Lunch food

Electricity

Water

Internet

Cleaning

Maintenance

Stationery

Transport

Security

Activities

Other

---

# 24. MANAGEMENT MONEY PICTURE

The Director/Principal should have a dashboard showing operational money movement.

Example:

### September 2026

Fees Collected

UGX 84,200,000

Activity Income

UGX 4,600,000

Other Income

UGX 1,200,000

---

Payroll

UGX 31,400,000

School Expenses

UGX 12,800,000

---

Operational Net

UGX 45,800,000

Outstanding Student Charges

UGX 28,400,000

These are management indicators.

Do not represent this as formal accounting profit unless an appropriate accounting model exists.

Use clear terminology such as:

Money In

Money Out

Net Operational Movement

Outstanding Student Charges

---

# 25. PAYROLL IN THE MANAGEMENT PICTURE

Payroll should be one of the major money-out categories.

The Director should be able to see:

Payroll for current period

Payroll by department where supported

Payroll status

Total payroll cost

Paid/unpaid payroll status

The implementation must use the proven JantaHR payroll logic rather than creating a second incompatible payroll engine.

---

# 26. FINANCIAL DASHBOARD PERMISSIONS

The management dashboard should be available only to authorised roles.

Potentially:

Director

Principal

School Administrator

Accounts / Finance Officer

The exact roles must follow the existing SomaCampus identity and permission architecture.

Teachers must not see the financial management dashboard.

---

# 27. PARENT FINANCE

Parents should eventually be able to see their own children's financial information.

A parent may have:

Child A

Child B

Child C

The parent experience should allow switching between children.

The financial model remains student-specific.

Do not create a family balance as the underlying financial source of truth.

---

# 28. PARENT PAYMENT INSTRUCTIONS

For MVP, SomaCampus does not need to process payment.

The school can configure payment instructions such as:

Bank details

Mobile Money number

Payment reference instructions

Account name

Payment notes

Parents can then make payment externally.

After the school verifies it, the accountant records the transaction.

Do not claim a payment was received merely because a parent says they paid.

---

# 29. FINANCE AND ACADEMIC CONTEXT

Financial obligations may be associated with:

Academic Year

Term

Class

Stream

Student

Activity period

But historical financial records must remain stable.

Do not calculate historical charges from the student's current class.

---

# 30. FINANCE MUST NOT BREAK ACADEMIC WORKFLOW

Existing SomaCampus teaching architecture remains authoritative.

Teacher workflow remains:

Clock In

→ Timetable

→ Daily Attendance already recorded

→ Teach

→ Lesson Complete

→ Lesson Note

→ Student Work

→ Evidence

→ Intelligence

→ Intervention

→ Next Lesson

Finance must not insert financial checks into this workflow.

Especially:

DO NOT BLOCK ACADEMIC TEACHING BECAUSE OF FEES.

Teachers must not see fee arrears.

---

# 31. ATTENDANCE REGRESSION RULE

The existing attendance invariant remains absolute:

Student attendance is recorded once per class/stream per morning/day.

NOT per lesson.

NOT per subject.

NOT per timetable period.

Do not add:

Take Attendance

Mark Attendance

Attendance Modal

or equivalent to Lesson Cockpit.

Finance implementation must not touch this.

---

# 32. ONEHUB WORKFLOW LEARNING

Study OneHub specifically to learn:

How requests are represented

How request states transition

How approvals work

How notifications are generated

How notification state is stored

How request history is represented

How different actors interact with a request

How workflows are surfaced to the user

Then implement appropriate patterns inside SomaCampus.

Do NOT import OneHub's product surface.

---

# 33. UI RULE

SomaCampus UI remains SomaCampus.

Do not copy:

OneHub navigation

OneHub dashboard

OneHub cards

OneHub layouts

OneHub feature menus

OneHub visual language

OneHub widgets

OneHub screens

The payroll repository may be used to understand existing payroll functionality and interaction patterns, but SomaCampus should adapt those capabilities into its own existing design system.

Use:

Existing SomaCampus components

Existing AppShell

Existing navigation

Existing typography

Existing cards

Existing tables

Existing forms

Existing modal patterns

Existing loading states

Existing empty states

Existing responsive patterns

---

# 34. PEOPLE / HR NAVIGATION

The application should investigate a coherent:

**People / HR**

area.

For a teacher:

My HR

Leave

Requests

Salary information

Salary advance

Notifications

and other existing employee capabilities actually supported by the employee portal.

For authorised administrators:

Staff

Payroll

Leave administration

Requests

Payroll management

Employee records

and other capabilities supported by the proven payroll system.

Do not blindly expose the same navigation to every role.

---

# 35. FINANCE NAVIGATION

Finance should remain separate from People/HR where that improves clarity.

Potential structure:

Finance

Overview

Student Accounts

Fees

Payments

Activities

Expenses

Reports

Settings

People / HR

Staff

Leave

Requests

Payroll

The final navigation must be based on the existing SomaCampus AppShell and actual role model.

Do not create unnecessary navigation complexity.

---

# 36. DATABASE DESIGN

The architecture must distinguish at minimum:

Student financial obligations

Payments

Payment allocations

Activities

Activity enrolments

Activity clearance

Expenses

Payroll records

Financial audit events

Do not create one giant:

school_finance

table.

Do not create one:

student_balance

field as the only source of truth.

---

# 37. FINANCIAL TRUTH

Maintain separation between:

WHAT THE SCHOOL CHARGED

WHAT THE SCHOOL RECEIVED

HOW THE PAYMENT WAS APPLIED

WHAT THE SCHOOL SPENT

WHAT THE SCHOOL OWES STAFF

WHAT A STUDENT IS CLEARED TO PARTICIPATE IN

These are separate concepts.

---

# 38. PAYROLL BOUNDARY

The architecture document MUST explicitly answer:

Where does payroll live?

Which data belongs to JantaHR?

Which data belongs to SomaCampus?

How does SomaCampus know payroll totals?

How does SomaCampus know payroll status?

How are employees linked?

How are schools linked?

How are payroll periods linked?

How are staff identities linked?

How are permissions enforced?

How are duplicate payroll records prevented?

How will the system behave if payroll data is temporarily unavailable?

Do not duplicate payroll logic without a compelling reason.

---

# 39. HR EMPLOYEE BOUNDARY

Similarly document:

Where employee requests live

Where leave records live

Where salary advance records live

Where notifications live

How employee identity maps to SomaCampus

How teachers access their own HR information

How administrators approve requests

How notifications reach staff

Do not create a parallel employee database without justification.

---

# 40. MULTI-SCHOOL SAFETY

All finance and payroll data must remain correctly scoped to the school.

No cross-school access.

No cross-school student balances.

No cross-school payments.

No cross-school payroll visibility.

No cross-school expenses.

No cross-school employee requests.

RLS is mandatory.

---

# 41. TEACHER DATA FIREWALL

Even if the teacher can access a Student record academically, that does NOT imply access to financial data.

Financial RLS must explicitly prevent teachers from reading:

student balances

student payments

student charges

parent payment history

financial reports

financial adjustments

Financial information must not accidentally leak through joins or API responses.

---

# 42. ACTIVITY CLEARANCE FIREWALL

Teachers may receive a deliberately reduced projection:

Student

Activity

Period

Clearance status

Clearance label

Optional operational note such as:

"Payment promised"

They must NOT receive:

amount

payment reference

invoice

balance

parent financial information

---

# 43. AUDIT REQUIREMENTS

Financial actions must preserve:

Who

What

When

Why

Where relevant:

Original value

New value

Reason

Approver

Reversal

Adjustment

Clearance decision

---

# 44. AI BOUNDARY

AI may help management understand financial data.

AI may:

Summarise collection trends

Summarise expenses

Draft management reports

Highlight unusual spending patterns

Summarise outstanding charges

Suggest follow-up lists

Summarise payroll costs

AI must NOT:

Record payments

Change balances

Approve waivers

Approve refunds

Clear a student for activities

Approve salary advances

Approve leave

Modify payroll

Make financial decisions silently

All consequential actions remain deterministic and authorised.

---

# 45. AUDIT FIRST

Before writing implementation code:

Inspect SomaCampus.

Inspect:

database

migrations

services

types

RLS

routes

roles

students

parents

academic years

terms

employees

attendance

timetable

existing UI

tests

seed data

Then inspect all three JantaHR repositories.

Do not begin coding before completing this audit.

---

# 46. REQUIRED AUDIT DOCUMENT

Create:

`SOMACAMPUS_PHASE7_ARCHITECTURE.md`

It must contain:

1. SomaCampus current architecture relevant to Finance
2. Existing student/parent/employee relationships
3. Existing school tenancy model
4. Existing academic-year/term model
5. Existing role/permission model
6. Existing RLS strategy
7. JantaHR Payroll architecture findings
8. JantaHR Employee Portal architecture findings
9. OneHub workflow/notification findings
10. What should be reused
11. What should be integrated
12. What should remain separate
13. What must NOT be copied
14. Finance domain model
15. Activity/club model
16. Clearance model
17. Payment model
18. Allocation model
19. Expense model
20. Payroll integration boundary
21. Employee HR integration boundary
22. Parent financial access
23. Teacher financial firewall
24. Management dashboard
25. RLS design
26. Audit design
27. Migration strategy
28. Service boundaries
29. Testing strategy
30. Browser verification plan
31. Explicit non-goals
32. Risks
33. Open architectural questions

---

# 47. REQUIRED FINANCE DEMO DATA

Create deterministic demo scenarios.

At minimum:

Student A:

Fees fully paid

Club paid

Club cleared

Student B:

Fees partially paid

Club unpaid

Club cleared through Promise to Pay

Student C:

Fees unpaid

No club participation

Student D:

Fees paid

Football enrolled

Football waived

Student E:

Overpayment

Student F:

Payment recorded but unallocated

Also include:

School expenses

Payroll records or payroll integration data

Multiple children under one parent

Different payment channels

Historical term data

---

# 48. REQUIRED END-TO-END DEMONSTRATION

Demonstrate:

Accountant:

Creates/uses fee structure

↓

Student charges exist

↓

Bank payment is received

↓

Accountant records payment manually

↓

Payment is associated with intended student

↓

Payment is allocated

↓

Student balance updates

↓

Statement updates

Then:

Accountant records football payment/obligation

↓

Student is enrolled in football

↓

Student is cleared

Teacher opens activity participant list

↓

Teacher sees:

"Cleared"

or:

"Cleared • Promise to Pay"

Teacher does NOT see:

UGX amount

balance

payment history

parent financial information

Then:

Director opens management dashboard

↓

Sees:

Money In

Money Out

Payroll

Expenses

Outstanding student charges

Activity income

Operational movement

Then:

Teacher opens:

People / HR

↓

Teacher can access their employee functionality

↓

Leave/request/salary advance workflow works according to the existing employee portal architecture.

Then:

Authorised administrator:

↓

opens HR/Payroll

↓

accesses the proven payroll functionality.

---

# 49. TESTING

Test:

Fee structures

Charges

Payments

Allocation

Partial payment

Full payment

Overpayment

Unallocated payment

Adjustments

Waivers

Activity enrolment

Activity clearance

Promise to Pay clearance

Teacher financial isolation

Teacher activity clearance visibility

Parent financial access

Multi-child parent

Expenses

Payroll integration

Employee HR access

Request workflow

Notifications

School isolation

RLS

Audit history

Historical academic periods

---

# 50. REGRESSION TESTS

All existing Phase 1–6 tests must remain green.

Explicitly verify:

Daily attendance remains once per morning/day.

Lesson Cockpit has no attendance action.

Teacher workflow remains intact.

Curriculum remains intact.

Academic planning remains intact.

Learning Evidence remains intact.

Learning Intelligence remains intact.

Interventions remain intact.

Timetable remains intact.

Leadership monitoring remains intact.

---

# 51. QUALITY GATES

Do not declare Phase 7 complete until:

`npm run typecheck`

passes.

`npm run build`

passes.

`npm test`

passes.

Existing tests remain green.

Finance tests pass.

RLS tests pass.

Payroll integration tests pass.

Teacher privacy tests pass.

Activity clearance tests pass.

Parent access tests pass.

Seed validation passes.

Browser verification succeeds.

No academic workflow regressions exist.

---

# 52. PHASE 7 IMPLEMENTATION ORDER

After the architecture contract is approved:

### Phase 7A

Architecture audit

### Phase 7B

Financial data foundation

### Phase 7C

Fees and student charges

### Phase 7D

Payments and allocation

### Phase 7E

Activities, clubs and clearance

### Phase 7F

Expenses

### Phase 7G

Payroll integration

### Phase 7H

People / HR employee experience

### Phase 7I

Management dashboard

### Phase 7J

Parent finance

### Phase 7K

Reports

### Phase 7L

Security, testing and browser verification

---

# 53. NON-GOALS

Do NOT turn SomaCampus into:

QuickBooks

Xero

Sage

A banking platform

A payment processor

A general ledger

A tax system

A procurement ERP

A full accounting suite

A replacement for JantaHR payroll

A replacement for the JantaHR employee portal

A clone of OneHub

Do not build duplicate systems where proven JantaHR functionality already exists.

---

# 54. FINAL ARCHITECTURAL PRINCIPLE

SomaCampus should give a school one operational picture.

Academic:

Who is teaching?

Who is learning?

What happened?

What evidence exists?

What needs to happen next?

People:

Who works here?

What do staff need?

What requests are pending?

What is payroll?

Finance:

What money came in?

What was it for?

What remains outstanding?

What money went out?

How much is payroll?

What are school expenses?

Which students are operationally cleared for paid activities?

The director/principal should be able to understand the school without opening five unrelated systems.

But this does NOT mean merging every database into one giant application model.

The systems should have clear domain boundaries and well-defined integration points.

---

# 55. START NOW

Your first task is NOT implementation.

Your first task is:

**REPOSITORY AUDIT ONLY.**

Inspect:

SomaCampus

JantaHR Payroll

JantaHR Employee Portal

JantaHR OneHub

Then produce:

`SOMACAMPUS_PHASE7_ARCHITECTURE.md`

Do not write Finance migrations yet.

Do not write Finance UI yet.

Do not copy JantaHR UI.

Do not copy OneHub UI.

Do not invent financial tables before understanding the existing models.

Do not redesign payroll before understanding the existing payroll implementation.

Do not expose student financial information to teachers.

Do not add financial restrictions to academic teaching.

Do not add per-lesson attendance.

The architecture document must make the integration boundaries explicit before implementation begins.