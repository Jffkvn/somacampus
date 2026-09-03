# SOMACAMPUS
## Implementation Blueprint
### Version 1.1 — September 2026

> **Purpose:** This document converts the SomaCampus product specification into an implementation contract for a coding agent, engineer, or small engineering team.
>
> The goal is not to redesign the product. The product decisions already exist in `SOMACAMPUS_v1_7.md`. This document exists because a broad product specification can still be implemented incorrectly, especially when an existing repository is used as the starting point.

---

# 0. IMPLEMENTATION AUTHORITY

## 0.1 Relationship to the product specification

`SOMACAMPUS_v1_7.md` remains the product feature specification and product architecture reference.

This document is the implementation authority for:

- repository strategy
- code reuse boundaries
- UI and UX constraints
- route structure
- role based navigation
- screen behaviour
- state transitions
- core vertical slices
- database interaction expectations
- implementation order
- definition of done
- acceptance testing

Where an older revision of the product specification conflicts with the current engineering direction, this document takes precedence for implementation.

## 0.2 Current owner decisions that are locked

The implementation must preserve these decisions:

1. SomaCampus is a **school first product**.
2. The product has a **completely new user interface and information architecture**.
3. Existing JantaHR, payroll, employee portal, warehouse, inventory, asset, notification, authentication, and related business logic may be reused where it is proven and useful.
4. Reuse of working code does **not** mean reuse of OneHub's visual shell, navigation, dashboards, layouts, page templates, or visual language.
5. The teacher's daily school workflow is the first critical product loop.
6. Teacher arrival begins with employee clock in.
7. Student attendance is then recorded against the relevant class and saved to every affected student's longitudinal attendance history.
8. The teacher teaches according to the timetable.
9. After a lesson, the teacher confirms what happened and records a normal operational lesson note.
10. The lesson note is visible to authorised school leadership.
11. Private teacher reflection is separate and remains private.
12. Fees are reconciled from uploaded school payment data such as Excel or CSV. SomaCampus does not require direct MTN Mobile Money or Airtel Money collection integration for the initial product.
13. Student work, observations, assessments, assignments, attendance, and lessons contribute to longitudinal learner evidence.
14. AI assists the teacher and school but does not silently make consequential educational decisions.
15. The first production curriculum is Cambridge Primary for the confirmed pilot school.
16. Online and hybrid learning is a second implementation stage after the core school loop is proven.
17. Special needs and autism support is later.
18. Homeschool remains later still.
19. The application shell must use a new dark teal navigation system with nested submenus, airy dashboards, meaningful charts, selective glassmorphism, semantic status colours, and generous spacing.
20. The supplied screenshots are visual references only and must not be copied literally.

---

# 1. THE SINGLE MOST IMPORTANT IMPLEMENTATION RULE

## DO NOT COPY THE ONEHUB USER INTERFACE

This is a hard requirement, not a suggestion.

The following may be reused from existing repositories where technically sound:

- database access patterns
- Supabase configuration patterns
- authentication implementation
- RLS helper functions
- permission utilities
- tested HR logic
- tested payroll logic
- tested attendance logic
- employee self service logic
- leave logic
- inventory logic
- asset logic
- notifications
- audit logging
- report generation utilities
- established validation utilities
- established file handling utilities
- established tests that prove business rules

The following must **not** be copied into the SomaCampus product experience:

- OneHub sidebar
- OneHub top navigation
- OneHub dashboard composition
- OneHub page templates
- OneHub cards merely because they already exist
- OneHub table layouts merely because they already exist
- OneHub route hierarchy
- OneHub module ordering
- OneHub HR first information architecture
- OneHub typography system if it causes the product to look like OneHub
- OneHub color treatment if it becomes the inherited visual identity
- OneHub empty states
- OneHub form layouts where they conflict with SomaCampus workflows
- OneHub dashboard widgets
- OneHub settings structure
- OneHub visual hierarchy

**Business logic can be borrowed. Product experience cannot be inherited.**

---

# 2. REPOSITORY STRATEGY

## 2.1 Start with a new SomaCampus application repository

The implementation target is a new application repository or a clean product directory.

Recommended structure:

```text
SomaCampus/
  README.md
  ARCHITECTURE.md
  IMPLEMENTATION_BLUEPRINT.md
  PRODUCT_SPEC.md
  CHANGELOG.md
  package.json
  tsconfig.json
  vite.config.ts
  public/
  src/
    app/
    components/
    modules/
    shared/
    lib/
    styles/
    types/
  supabase/
    migrations/
    seed/
    functions/
  tests/
  e2e/
```

The existing systems are **source repositories**, not the parent product.

## 2.2 Suggested source repositories

Use the existing tested repositories as references or sources for selective implementation:

```text
jantahr-egypro-payroll
jantahr-egypro-employee-portal
jantahronehub
egyprowarehousemanagement
```

The implementation agent should inspect these repositories before copying anything.

For every reused subsystem, record:

```text
Source repository
Source module/file
What is being reused
Why it is trusted
What changes are required
What tests prove it works
What SomaCampus interface will expose it
```

## 2.3 Reuse protocol

Use this sequence:

```text
INSPECT
  ↓
IDENTIFY PROVEN LOGIC
  ↓
COPY OR ADAPT
  ↓
ISOLATE FROM OLD UI
  ↓
RENAME DOMAIN REFERENCES WHERE NECESSARY
  ↓
WRITE/PORT TESTS
  ↓
INTEGRATE INTO SOMACAMPUS
```

Do not perform:

```text
COPY ENTIRE APPLICATION
  ↓
CHANGE BRANDING
  ↓
ADD SCHOOL MENU ITEMS
```

That is exactly the failure this blueprint is designed to prevent.

---

# 3. PRODUCT INFORMATION ARCHITECTURE

The product must visually and conceptually feel like a school operating and learning platform.

## 3.1 Primary navigation

The default school navigation should be approximately:

```text
Today
Teaching
Students
Classes
Curriculum
Timetable
Calendar
Fees
Communication
Administration
```

Exact visibility depends on role.

## 3.2 Secondary administration navigation

Administration may contain:

```text
School Setup
People
HR
Payroll
Inventory
Assets
Reports
Users & Permissions
AI Settings
Audit Log
```

A teacher should not see HR, Payroll, Inventory, and Assets as the first level of the product unless their permissions explicitly require those areas.

## 3.3 Role landing pages

Teacher:

```text
/teacher/today
```

Principal or Director:

```text
/dashboard/school
```

Finance user:

```text
/fees
```

HR user:

```text
/administration/hr
```

Parent:

```text
/parent/home
```

Student:

```text
/student/home
```

Administrator:

```text
/admin/overview
```

The codebase must not force every role through one generic dashboard.

---

# 4. VISUAL DESIGN CONTRACT

## 4.1 Design direction

SomaCampus must have a modern, calm, premium SaaS interface that feels purpose built for education. The provided visual references establish the desired direction: generous spacing, dashboard driven layouts, strong hierarchy, clean cards, clear charts, a dark navigation rail, and a polished application shell. They are references for quality and composition, not templates to copy.

The interface should communicate:

- calm
- trustworthy
- educational
- modern
- friendly
- organised
- premium but approachable
- highly usable
- mobile competent

It must not look like:

- OneHub
- JantaHR
- payroll software
- a legacy school MIS
- a generic ERP
- a dense government administration portal

## 4.2 Dark teal navigation system

The primary application navigation should use a **dark teal** visual treatment. The exact hue should be tuned against the final SomaCampus logo asset when supplied, but the navigation should remain distinctly dark teal rather than navy, black, grey, or purple.

Recommended direction:

```text
Primary navigation background
  deep teal / blue green

Primary navigation text
  white / very light neutral

Active navigation item
  lighter translucent teal surface + logo/accent colour

Hover
  subtle light translucent surface

Section headings
  muted light text
```

The dark teal sidebar is a **SomaCampus design element**, not a reused OneHub sidebar with its colour changed. It must be implemented as a new navigation component.

## 4.3 Navigation must support nested submenus

The application uses a clear primary sidebar with expandable sections. A school product has enough functional depth that a flat list becomes noisy.

Desktop example:

```text
TODAY

TEACHING                    v
  My Classes
  Lessons
  Assignments
  Worksheets
  Quizzes
  Resources

STUDENTS                    v
  All Students
  Classes
  Attendance
  Learning Profiles

ACADEMICS                   v
  Curriculum
  Timetable
  Calendar
  Gradebook
  Report Cards

FINANCE                     v
  Fees
  Student Accounts
  Payment Imports
  Reconciliation

COMMUNICATION               v
  Announcements
  Messages

ADMINISTRATION              v
  School Setup
  People
  HR
  Payroll
  Inventory
  Assets
  Reports
  Users & Permissions

SETTINGS
```

Rules:

1. Sections are expandable/collapsible.
2. The current section expands automatically when the user enters a child route.
3. The active child route is visually obvious.
4. The sidebar remembers expanded state where practical.
5. Teachers see a teaching first menu.
6. Finance users see finance first.
7. Administrators see administration capabilities without forcing teachers through them.
8. Mobile navigation becomes a slide in drawer or sheet.
9. A collapsed desktop sidebar may show icons only, but tooltips must preserve discoverability.

## 4.4 Dashboard design: visual, not congested

Dashboards must not become collections of small cards. The primary school dashboard should use deliberate visual hierarchy.

Preferred composition:

```text
┌────────────────────────────────────────────────────────────┐
│ Greeting / school context                         Actions │
├────────────┬────────────┬────────────┬────────────────────┤
│ Students   │ Teachers   │ Attendance │ Lessons Today     │
│ 1,260      │ 84         │ 96.4%      │ 82 / 86           │
├───────────────────────────────────┬────────────────────────┤
│                                   │                        │
│ Attendance / academic trend       │ Today's schedule      │
│       CHART                       │      TIMELINE         │
│                                   │                        │
├───────────────────────────────────┼────────────────────────┤
│                                   │                        │
│ Teaching activity / completion    │ Alerts / attention    │
│       CHART                       │        LIST            │
│                                   │                        │
└───────────────────────────────────┴────────────────────────┘
```

Not every dashboard needs all four chart areas. The composition should adapt to role and available data.

Rules:

- Use charts where trends or comparisons matter.
- Use compact metric cards only for headline numbers.
- Do not place ten or twelve equal cards across the top.
- Keep meaningful whitespace between sections.
- Allow the eye to identify the most important information in less than five seconds.
- Every metric card must drill into the underlying data.
- Empty states should be useful and calm rather than visually noisy.

## 4.5 Chart requirements

The school dashboard should use real visualisations, not decorative placeholder shapes.

Appropriate charts include:

- attendance trend over time
- lesson completion by day or week
- fee collection versus outstanding balances
- assessment performance trend
- class comparison
- student support trend
- resource usage

Use charts selectively. A dashboard containing too many charts is still congested.

Charts should include:

- clear title
- useful legend only where necessary
- readable labels
- tooltips
- time range or filter where useful
- accessible text summary where appropriate
- responsive behaviour

## 4.6 Glassmorphism: use deliberately, not everywhere

Glassmorphism is part of the SomaCampus visual language, but it must be used with restraint. The goal is a polished layered interface, not frosted glass on every element.

Use glass treatment primarily for:

- top header
- floating utility panels
- selected dashboard cards
- command/search overlays
- modal and drawer surfaces
- contextual panels over subtle background gradients

Avoid glass treatment for:

- every table row
- every button
- dense data entry forms
- long text areas
- every navigation item

Suggested treatment:

```css
background: rgba(..., 0.55 - 0.75);
backdrop-filter: blur(16px - 24px);
border: 1px solid rgba(..., 0.12 - 0.20);
box-shadow: subtle layered shadow;
border-radius: 14px - 20px;
```

The effect must remain performant and readable. Do not rely on translucency alone to communicate hierarchy.

## 4.7 Background treatment

The main application canvas should normally use a very light neutral background with subtle tonal depth. A restrained radial or mesh gradient may appear behind the glass surfaces.

Do not use an animated, noisy, heavily saturated background.

The background should make the dark teal navigation and content cards feel distinct.

## 4.8 Colour system

The final logo colours are primary brand colours. The UI may introduce additional semantic colours where they improve usability.

Required semantic states:

```text
Success   green
Pending   amber
Warning   orange
Critical  red
Info      blue/cyan
Neutral   slate/grey
```

Examples:

- pending fee reconciliation → amber
- overdue fees → red
- lesson completed → green
- lesson not completed → amber or red depending on severity
- student requiring attention → orange/red
- imported file processing → blue/info

Semantic colours must not be used as random decoration.

## 4.9 Typography

Typography should feel modern and highly readable.

Requirements:

- clear display scale for page titles
- readable body text
- medium weight for labels
- strong numerical hierarchy in metrics
- restrained use of very small text
- comfortable line height

Do not imitate OneHub's typography simply because the existing components already use it.

## 4.10 Spacing system

SomaCampus should use a consistent spacing scale based on a small token system.

Target guidance:

```text
4px   micro spacing
8px   icon / control spacing
12px  compact spacing
16px  standard component spacing
24px  card / section padding
32px  major section separation
40-48px major page breathing room
```

Desktop pages should generally have generous horizontal gutters and should not stretch content edge to edge simply because a large monitor is available.

Mobile pages should use approximately 16px horizontal page padding unless a specific full width control requires otherwise.

## 4.11 Cards and panels

Cards should have clear purpose. A card must contain a coherent information unit or action.

Preferred characteristics:

- moderate radius
- subtle shadow
- light border
- clear internal spacing
- concise heading
- meaningful content

Avoid:

- excessive tiny cards
- deep nested cards
- card inside card inside card
- using a card simply to place one button

## 4.12 Tables

Tables are necessary for administration but must not dominate teacher workflows.

Teacher workflows should prefer:

- lists
- roster views
- timeline views
- quick action rows
- cards
- compact mobile layouts

Administrative finance, HR, inventory and reporting screens may use richer tables with filtering and pagination.

## 4.13 Forms

Forms must follow the business workflow, not the database schema.

Do not expose twenty database fields because the entity has twenty columns.

Use:

- grouped fields
- sensible defaults
- progressive disclosure
- inline validation
- clear required fields
- save state feedback
- keyboard friendly controls

## 4.14 Responsive behaviour

Three explicit layout states should be supported:

```text
Desktop      ≥ 1280px
Tablet       768px - 1279px
Mobile       < 768px
```

The application must not simply shrink the desktop UI. It should rearrange information according to task importance.

## 4.15 Motion

Use subtle motion for:

- sidebar expand/collapse
- page transitions where helpful
- drawer opening
- success confirmation
- chart/filter transitions

Avoid decorative animation that slows down operational work.

## 4.16 Current design research reference

The design direction is consistent with current open source React dashboard patterns visible in recent GitHub projects: React plus TypeScript, Tailwind, shadcn/ui, responsive collapsible sidebars, nested navigation, dark/light theming, interactive charts, and strong reusable component systems are common patterns. Recent examples include TanStack + shadcn dashboards, modern Next.js/shadcn dashboards, and React 19 + Tailwind 4 dashboard templates. citeturn450736search0turn450736search2turn450736search4

There are also current open source glassmorphism component systems designed to work with shadcn-style React stacks, which supports using glass as a controlled visual layer rather than inventing a bespoke component system from scratch. citeturn450736search5

The web search used for this revision did not return usable publicly indexed X posts for the requested dashboard/glassmorphism queries. Therefore no X post is treated as evidence or copied as a design reference.

## 4.17 Do not copy the supplied screenshots literally

The uploaded screenshots establish desired qualities:

- strong dashboard hierarchy
- dark navigation rail
- clean data cards
- charts
- calendar/schedule presence
- comfortable spacing
- modern forms
- polished SaaS feel

They are not implementation templates. Do not reproduce another product's exact sidebar, labels, colours, illustrations, page proportions, or component arrangement.

The design target is:

> **SomaCampus should feel like a modern premium education SaaS product, with a dark teal navigation system, light airy workspace, selective glassmorphism, rich data visualisation, clear nested navigation, excellent spacing, and extremely low friction for teachers.**

## 4.18 Visual acceptance gate

A phase fails visual acceptance if any of the following is true:

- it resembles OneHub with branding changed
- the sidebar is copied from OneHub
- the dashboard is mostly a wall of equal cards
- charts are absent where trend data exists
- spacing is cramped
- primary actions are unclear
- the glass effect reduces text readability
- the teacher workflow requires repeated context selection
- mobile interaction is awkward

A screenshot or live preview should be reviewed at desktop and mobile widths before a UI phase is marked complete.

---

# 5. THE CORE PRODUCT VERTICAL SLICE

The first working product is not "all modules".

The first product is this:

```text
Teacher arrives
      ↓
Clock in
      ↓
Today view
      ↓
Next class
      ↓
Student attendance
      ↓
Teach
      ↓
Confirm lesson
      ↓
Lesson note
      ↓
Submit
      ↓
Principal sees lesson activity
      ↓
Student profiles retain attendance
```

This vertical slice must work end to end before broad module expansion.

---

# 6. SCREEN SPECIFICATION: TEACHER TODAY

## Route

```text
/teacher/today
```

## Purpose

This is the teacher's home screen.

It answers:

> What do I need to do today?

## Primary content

Top section:

```text
Good morning, Sarah
Tuesday, 3 September

[ Clocked in ]
```

If not clocked in:

```text
Good morning, Sarah

You haven't clocked in yet.

[ Clock In ]
```

## After clock in

Show:

```text
TODAY

08:00
P5 Blue
Mathematics
24 students
[ Open class ]

09:00
P5 Blue
English
24 students
[ Open class ]

11:00
P5 Blue
Science
24 students
[ Open class ]
```

The current or next class should receive stronger visual emphasis.

## School events

Show relevant events from the school calendar without overwhelming the teaching list.

Example:

```text
TODAY'S SCHOOL EVENTS
Parents' meeting • 15:00
```

## Teacher shortcuts

Only show high value shortcuts:

```text
My Classes
Student Profiles
Resources
My Attendance
Leave
```

Do not put payroll as the dominant shortcut.

---

# 7. SCREEN SPECIFICATION: CLOCK IN

## Purpose

Connect the teacher's first action of the day to the tested JantaHR attendance system.

## Behaviour

Teacher taps:

```text
[ Clock In ]
```

The system uses the existing attendance validation logic where applicable, including configured location or device validation.

On success:

```text
You're clocked in
08:01

Today's classes are ready.
[ View Today ]
```

## Data outcome

A valid employee attendance event is created in the HR attendance domain.

The teaching domain does not create a second competing teacher attendance record.

SomaCampus reads the resulting attendance state.

## Failure behaviour

If location or another validation fails:

```text
We could not verify your clock in.

[ Try again ]
[ Request correction ]
```

Do not expose technical error details to the teacher.

---

# 8. SCREEN SPECIFICATION: STUDENT ATTENDANCE

## Route

```text
/teaching/classes/:classId/attendance
```

or opened contextually from a timetable lesson.

## Purpose

Take attendance quickly and attach it to the students' historical record.

## Default state

Load the roster automatically.

Example:

```text
P5 Blue
Mathematics
08:00

30 students

[ MARK ALL PRESENT ]

John     Present
Mary     Present
David    Present
Peter    Present
...

[ Save Attendance ]
```

The preferred interaction is:

```text
Mark all present
      ↓
Tap exceptions
      ↓
Change status
      ↓
Save
```

## Statuses

At minimum:

```text
Present
Absent
Late
Excused
```

## Data requirements

Saving attendance must create durable attendance records containing at minimum:

- student
- class
- stream where applicable
- lesson/session context where applicable
- teacher
- date
- status
- recorded_by
- recorded_at

## Student profile consequence

A saved attendance record must immediately contribute to the student's attendance history.

The student profile must be able to show:

- attendance today
- attendance this week
- attendance this term
- attendance history
- absences
- lateness
- excused absences

## Correction

The teacher can correct an accidental entry unless school policy requires another permission.

The original change must remain auditable.

---

# 9. SCREEN SPECIFICATION: CLASS / LESSON

## Route

```text
/teaching/classes/:classId/lessons/:lessonId
```

The system should normally arrive at this screen from the timetable.

## Top context

```text
P5 Blue
Mathematics
Wednesday 08:00
Mrs Sarah

Water Cycle
Current curriculum position
```

The top context should be informative but compact.

## Before teaching

Show:

```text
Today's lesson

Curriculum objective
Topic
Previous lesson
Relevant resources

[ Start lesson ]
```

The teacher should not need to build a lesson record from scratch if the timetable already supplies context.

## During or after lesson

The teacher may optionally capture quick information while teaching:

```text
[ Speak a note ]
[ Quick note ]
[ Add observation ]
```

However, the required end state is a lesson completion record.

---

# 10. SCREEN SPECIFICATION: CONFIRM LESSON

## Required action

At the end of the lesson, the teacher sees:

```text
LESSON COMPLETE?

[ Completed as planned ]
[ Partially completed ]
[ Not completed ]

[ Class struggled ]
[ Class advanced quickly ]
```

## Lesson note

Prompt:

```text
What happened in the lesson?

[ Speak ] [ Type ]
```

The note is intended to be short and operational.

Example:

> Covered evaporation and condensation. Most students understood the diagram. Five students needed additional explanation.

## Submit button

```text
[ Submit Lesson ]
```

Do not label this action "Send to AI" or "Generate AI report".

## After submit

Show:

```text
Lesson recorded ✓

Visible to authorised school leadership.

Next steps

[ Create Homework ]
[ Create Worksheet ]
[ Create Quiz ]
[ Add Observations ]
[ Capture Student Work ]
```

---

# 11. LESSON RECORD DATA CONTRACT

A submitted lesson must retain:

```text
lesson_id
school_id
academic_year_id
term_id
teacher_id
class_id
stream_id
subject_id
timetable_entry_id
scheduled_start
scheduled_end
actual_started_at
actual_completed_at
curriculum_version_id
curriculum_level_id
curriculum_subject_id
curriculum_topic_id
curriculum_objective_id
lesson_status
lesson_note
attendance_session_id
created_at
submitted_at
updated_at
```

Optional relationships:

```text
resources
assignments
observations
evidence
attachments
```

## Lesson status must be explicit

Do not represent lesson completion simply as `true/false`.

Use a controlled status such as:

```text
completed
partial
not_completed
struggled
advanced
```

The exact database enum can follow engineering conventions, but the user meaning must remain intact.

---

# 12. LEADERSHIP LESSON VISIBILITY

## Route

```text
/dashboard/school/teaching
```

or:

```text
/dashboard/school/lessons
```

## Purpose

Allow Principal, Director, Deputy, or Academic Lead to see whether teaching is happening and what teachers recorded.

## Example view

```text
TODAY'S TEACHING

Teacher      Class    Subject      Time      Status
Sarah        P5 Blue  Mathematics  08:00     Completed
David        P6 Red   English      08:00     Completed
James        P4 Green Science      09:00     Not completed
```

Clicking a lesson opens:

```text
Teacher
Class
Subject
Scheduled time
Actual submission time
Curriculum position
Lesson status
Lesson note
Resources
Homework
Observations
```

## Leadership boundary

Leadership can see the operational lesson note.

Leadership does **not** automatically see private teacher reflection.

---

# 13. STUDENT PROFILE SCREEN

## Route

```text
/students/:studentId
```

## Purpose

This is one of the most important screens in the product.

The student profile is not just a demographic record. It becomes the longitudinal learner record.

## Header

```text
AMARI K.
P5 Blue
Admission No. 2026/0142

Attendance 96%
```

## Tabs

```text
Overview
Attendance
Learning
Assignments
Assessments
Evidence
Interventions
Family
Fees
```

Visibility is permission based.

## Overview

Show:

```text
Attendance
Current curriculum position
Recent teacher observations
Recent learning evidence
Strengths
Support areas
Recent interventions
```

## Attendance tab

Show a chronological record.

Example:

```text
3 Sep     Present
2 Sep     Present
1 Sep     Late
29 Aug    Absent
```

Filters:

```text
Term
Class
Date range
Status
```

## Learning tab

Show subject based progress and evidence, not just scores.

Example:

```text
MATHEMATICS
Fractions          Developing
Equivalent fractions Secure
Word problems      Needs support
```

## Evidence tab

Show approved evidence only as formal evidence.

Raw AI drafts remain clearly identified as drafts.

---

# 14. PRINCIPAL / DIRECTOR SCHOOL DASHBOARD

## Route

```text
/dashboard/school
```

## Design goal

The dashboard should answer:

> What is happening in my school today?

## Suggested sections

The dashboard should use a balanced visual composition rather than a dense wall of cards.

```text
School today

Students      Teachers      Attendance      Lessons
1,204         84            96.4%           82 / 86

Attendance trend / teaching completion trend
                 CHART

Today's schedule                   Attention
08:00 P5 Mathematics               7 students
09:00 P5 English                   3 lessons pending
11:00 P5 Science                   2 fee exceptions

Fees collection vs outstanding     Academic trend
                 CHART                  CHART
```

The exact chart mix should adapt to the role and the amount of real data available. Avoid decorative charts with no operational meaning.

## Teaching activity card

A leadership user should be able to quickly see:

```text
Lessons expected today
Lessons completed
Lessons pending
Lessons not completed
Teachers with missing lesson records
```

## Drill down

Dashboard metrics must lead to the underlying records rather than dead end cards.

---

# 15. FINANCE SCREEN: FEES

## Route

```text
/fees
```

## Fee model

SomaCampus records obligations and reconciles actual payments.

The school may receive money through:

- school owned Mobile Money collection codes
- bank accounts
- cash office processes
- other approved channels

SomaCampus does not need to directly control those collection channels.

## Core fee account

For each student:

```text
Total assessed
Paid
Outstanding
Discounts
Waivers
Arrears
Clearance status
```

## Upload payment file

Route:

```text
/fees/import
```

Primary action:

```text
[ Upload Excel / CSV ]
```

---

# 16. PAYMENT IMPORT WORKFLOW

The payment import workflow must be built as a controlled reconciliation process.

```text
Upload file
    ↓
Inspect columns
    ↓
Map columns
    ↓
Validate rows
    ↓
Match students/accounts
    ↓
Detect duplicates
    ↓
Show exceptions
    ↓
Review
    ↓
Confirm import
    ↓
Apply payment records
    ↓
Update balances
    ↓
Update clearance
    ↓
Audit log
```

## Example columns

Support common columns such as:

```text
Student Admission Number
Student Name
Payer Name
Payment Reference
Payment Date
Amount
Payment Channel
Term
Invoice / Account Reference
Clearance Status
```

The importer must allow column mapping because school exported files will not all have identical headers.

## Match confidence

Prefer deterministic identifiers:

1. SomaCampus student ID
2. Admission number
3. Invoice/reference number
4. Controlled school account number
5. Name matching only as a fallback

Name matching alone must not silently apply a payment to the wrong student.

## Exception queue

Unmatched rows go to:

```text
Unmatched payments
```

Example:

```text
John K.     UGX 250,000     Possible match: 2 students
Mary A.     UGX 100,000     No confident match
```

Staff chooses the correct account or leaves it unresolved.

## Duplicate handling

Likely duplicates should be flagged before final confirmation.

## Import audit

Store:

```text
file name
uploaded by
uploaded at
source type
row count
matched count
unmatched count
duplicate count
accepted count
rejected count
resulting balance changes
```

---

# 17. PARENT EXPERIENCE

Parent is not the same interface as school administration.

## Route

```text
/parent/home
```

## Parent home

Show children first.

```text
My children

Amari
P5 Blue
Attendance 96%

Aurora
P7 Red
Attendance 98%
```

A parent can have multiple children.

## Child view

```text
Fees
Attendance
Homework
Quizzes
Recent work
Teacher feedback
Learning summary
School announcements
```

The interface should be understandable to a non technical parent.

---

# 18. CLASS VIEW

## Route

```text
/classes/:classId
```

## Purpose

Give teacher and authorised leadership a class level view.

Suggested tabs:

```text
Overview
Students
Attendance
Lessons
Assignments
Assessments
Learning
Resources
```

## Overview

Show:

- class roster
- today's timetable
- attendance today
- recent lessons
- current curriculum position
- students needing attention
- upcoming assignments

---

# 19. TIMETABLE

## Route

```text
/timetable
```

## Main use

The timetable is both scheduling infrastructure and teacher context.

## Teacher view

```text
Mon
08:00 P5 Mathematics
09:00 P5 English
11:00 P5 Science
```

## Administrator view

Support:

- class timetable
- teacher timetable
- room allocations
- conflict detection
- substitution
- effective dates
- term specific timetables

## Critical implementation rule

When a teacher opens a scheduled lesson, the timetable entry is the source of contextual defaults.

---

# 20. SCHOOL CALENDAR

## Route

```text
/calendar
```

Calendar is distinct from timetable.

Timetable asks:

> What class happens when?

Calendar asks:

> What is happening at the school?

Events can include:

- Sports Day
- Cultural Day
- Parents' Day
- examination periods
- trips
- staff meetings
- training days
- ceremonies
- admission days
- holidays
- deadlines
- custom events

Events can target:

- school
- staff
- parents
- students
- class
- stream
- department
- selected users

---

# 21. CURRICULUM IMPLEMENTATION

## First production curriculum

Cambridge Primary is the initial production curriculum pack for the confirmed pilot school.

The engine must remain abstract enough to support future frameworks.

## Curriculum hierarchy

```text
Framework
  ↓
Version
  ↓
Level / Stage
  ↓
Subject
  ↓
Strand
  ↓
Topic
  ↓
Learning Objective
  ↓
Competency
```

## No giant prompt

Do not put the entire curriculum into every AI request.

Use structured retrieval based on:

```text
school
curriculum
level
subject
topic
current teaching position
objective
```

---

# 22. CURRENT TEACHING POSITION

For each teacher/class/subject combination, store the latest known curriculum position.

Example:

```text
P5 Science

✓ Living Things
✓ Materials
✓ States of Matter
→ Water Cycle
○ Weather
○ Soil
```

Submitting a lesson should update the teaching position when appropriate.

The teacher must be able to override the position.

The current position is used to ground future resource generation.

---

# 23. ASSIGNMENTS

## Route

```text
/teaching/assignments
```

Assignments are connected to lessons wherever possible.

A teacher completes a lesson and can immediately:

```text
[ Create Homework ]
```

The assignment creation context is prefilled with:

- class
- subject
- lesson
- curriculum
- topic
- objective

Teacher can review and edit before assignment.

---

# 24. WORKSHEETS

Teacher can create or reuse worksheets.

Outputs should support:

- printable PDF
- mobile view
- answer key
- difficulty metadata
- curriculum metadata
- school branding
- simplified plain text version
- read aloud audio

These accessibility forms are produced alongside the main content where AI is used, not as a separate cumbersome teacher task.

---

# 25. QUIZZES

Quiz data must preserve raw interaction evidence.

Store:

- question
- answer
- correctness
- attempt number
- response time
- topic
- competency
- date

Quiz results are diagnostic by default.

They become formal gradebook evidence only when the teacher explicitly promotes the assessment.

---

# 26. STUDENT WORK CAPTURE

The teacher can:

```text
Take photo
Upload image
Upload PDF
Attach to student
Attach to assignment
Attach to lesson
```

AI may extract useful evidence.

AI must not silently grade the child.

Correct pattern:

```text
Student work
    ↓
AI extraction
    ↓
Draft observation
    ↓
Teacher review
    ↓
Accept / Edit / Disagree / Discard
    ↓
Approved evidence
    ↓
Student learning profile
```

---

# 27. TEACHER OBSERVATION

Teacher observations are first class evidence.

Types may include:

- classroom participation
- misconception
- achievement
- behaviour note
- support need
- intervention
- follow up

Input methods:

- voice
- text
- photo
- attachment

AI can structure the input, but the teacher's approved record is the formal record.

---

# 28. PRIVATE TEACHER REFLECTION

Private reflection must live in a separate privacy boundary.

Example:

> I spent too long explaining the introduction.

That record:

- is visible to the teacher
- is not shown in standard leadership reports
- is not used as teacher performance evidence
- remains private unless explicitly promoted

Do not simply hide reflection through a front end flag. The permission boundary must exist in the data access policy.

---

# 29. RESOURCE LIBRARY

Resources are reusable academic assets.

Resource types include:

- lesson plans
- worksheets
- homework
- quizzes
- exam papers
- revision sheets
- diagrams
- teacher notes
- school created materials

Metadata should include:

- creator
- creation date
- curriculum
- level/class
- subject
- topic
- objective
- version
- approval state
- usage count
- rating
- last used

States:

```text
Draft
Teacher Approved
School Approved
Archived
```

## Search before generation

The default AI resource flow should be:

```text
Teacher asks
   ↓
Search approved resources
   ↓
Suitable resource found?
   ↓
Reuse / Adapt
```

Only generate a new resource when necessary.

---

# 30. AI PRODUCT BOUNDARY

AI is a service behind ordinary school workflows.

Teachers should see:

```text
Create Homework
Create Worksheet
Prepare Quiz
Capture Evidence
Suggested Next Steps
```

They should not need to see:

```text
Prompt
Model temperature
Token budget
Vector store
LLM provider
```

## AI may

- extract
- summarise
- analyse
- draft
- suggest
- organise
- recommend

## AI may not

- silently assign official grades
- silently create consequential student records
- make disciplinary decisions
- replace teacher judgement
- change official school records without explicit user action

---

# 31. AI SERVICE BOUNDARIES

Implement behind a gateway with independently testable services.

```text
AI Gateway
  ├── Lesson Structuring
  ├── Homework Drafting
  ├── Worksheet Drafting
  ├── Quiz Drafting
  ├── Student Work Extraction
  ├── Quiz Analytics
  ├── Student Profile Analysis
  ├── Intervention Builder
  └── Parent Summary
```

Each request should capture enough metadata to reproduce or audit the output.

---

# 32. DATA MODEL IMPLEMENTATION RULES

The relational model should follow the product specification but implementation should prioritise the critical workflow first.

Core groups:

```text
Tenant
  organisations
  schools
  school_settings

Identity
  users
  roles
  permissions
  user_roles

People
  people
  students
  employees
  parents_guardians
  families
  family_members
  student_guardians

Academics
  academic_years
  terms
  classes
  streams
  subjects
  class_subjects
  student_enrolments
  teacher_assignments

Schedule
  timetables
  timetable_entries
  rooms

Calendar
  school_calendars
  calendar_events
  calendar_event_targets

Curriculum
  frameworks
  versions
  levels
  subjects
  strands
  topics
  objectives
  competencies

Teaching
  lessons
  lesson_notes
  lesson_observations
  lesson_resources
  lesson_activity_records
  teacher_reflections

Attendance
  employee attendance source
  student attendance sessions
  student attendance records

Learning
  assignments
  submissions
  evidence
  assessments
  observations
  interventions
  learning profile

Resources
  resources
  versions
  files
  tags
  usage

Finance
  fee structures
  student fee accounts
  payment records
  payment imports
  payment import rows
  reconciliation decisions
  receipts

Operations
  HR
  payroll
  inventory
  assets

AI
  requests
  outputs
  prompt versions
  model configs
  usage
  failures
```

---

# 33. CORE RELATIONSHIP: LESSON TO LEARNER PROFILE

The key academic data relationship is:

```text
Timetable Entry
      ↓
Lesson
      ↓
Student Attendance
      ↓
Lesson Note
      ↓
Assignment / Resource
      ↓
Submission
      ↓
Student Evidence
      ↓
Teacher Observation
      ↓
Approved Evidence
      ↓
Student Learning Profile
      ↓
Intervention
      ↓
Next Lesson
```

This relationship must be explicit in code and database design.

Do not build lessons, assignments, evidence, and student profiles as isolated CRUD modules.

---

# 34. AUTHORIZATION MODEL

Authorization is school scoped.

At minimum the system must answer:

```text
Which school?
Which user?
Which role?
Which permission?
Which record?
```

## Role examples

Required roles:

```text
Administrator
Principal
Teacher
Parent
```

Optional permission bundles:

```text
Director
Deputy
Academic Lead
Bursar
Accountant
Librarian
HR Admin
Finance Admin
```

Permissions should be granular.

Examples:

```text
school.view_dashboard
school.manage_calendar
students.view
students.edit
students.view_learning
attendance.record_student
attendance.correct_student
lessons.create
lessons.view_own
lessons.view_school
lessons.view_leadership
teacher_reflection.view_own
teacher_reflection.view_other = false by default
fees.view
fees.import
fees.reconcile
fees.correct
hr.view
payroll.view
inventory.view
inventory.manage
reports.view
```

---

# 35. ROW LEVEL SECURITY REQUIREMENTS

Every school scoped record must be protected by database policy.

The implementation should not rely only on React route guards.

For every sensitive table, answer:

```text
Can teacher A access school B?
Can parent A access child C?
Can teacher A see teacher B's private reflection?
Can finance user access payroll?
Can principal see lesson notes?
Can a student see another student's evidence?
```

Default deny.

Grant only required scope.

---

# 36. TEACHER ACCESS RULES

Teacher can:

- see their assigned classes
- see enrolled students in those classes
- record student attendance
- submit their own lesson records
- view relevant past lesson records
- create assignments for their classes
- capture student work for authorised students
- create observations
- view student learning information needed for teaching
- see their own HR information

Teacher cannot automatically:

- see another teacher's private reflection
- edit another teacher's lesson records
- access payroll administration
- access another class's student records unless permission exists
- change official student results without proper authority

---

# 37. PRINCIPAL ACCESS RULES

Principal can generally:

- view school dashboard
- view school attendance
- view lesson completion
- view operational lesson notes
- view academic performance
- view student learning evidence where permitted
- view fee status
- view school events
- view teacher activity

Principal does not automatically gain:

- private teacher reflection
- unrestricted HR records
- unrestricted payroll data

Permissions determine the exact scope.

---

# 38. PARENT ACCESS RULES

Parent can see only authorised children.

Parent can view:

- fees
- attendance
- assignments
- quizzes
- submitted work
- teacher feedback
- learning summaries
- school communication

Parent cannot see:

- another family's child
- private teacher reflection
- internal staff records
- administrative audit information

---

# 39. FILE AND MEDIA ARCHITECTURE

Store uploaded media using a consistent file object layer.

Use files for:

- student photographs
- student work
- lesson attachments
- worksheets
- generated PDFs
- school documents
- receipts
- inventory attachments

Every file must have:

```text
owner/school
uploaded_by
source domain
linked record
mime type
size
storage key
created_at
```

Access checks must be performed before issuing signed URLs or exposing files.

---

# 40. NOTIFICATION ARCHITECTURE

Notifications should be event driven.

Examples:

```text
Lesson missing
Assignment posted
Parent announcement
Fee import completed
Payment exception
Calendar reminder
Intervention assigned
Teacher request updated
```

The teacher should not receive notification noise for routine successful operations.

---

# 41. REPORTING

Reports should be generated from approved records.

Initial school reporting should include:

- attendance
- lesson completion
- curriculum coverage
- student performance
- fee status
- payment reconciliation
- interventions
- teacher activity

Report generation should not reimplement business logic independently from the underlying records.

---

# 42. AUDITABILITY

Audit events are required for consequential changes.

Examples:

```text
student created
student updated
attendance corrected
lesson edited after submission
fee import uploaded
payment manually reconciled
fee balance changed
assessment score changed
student evidence approved
permission changed
```

Audit events should capture:

```text
actor
school
action
entity
entity_id
before

after
reason where required
created_at
```

---

# 43. ERROR HANDLING

The school product must fail gracefully.

Teacher facing example:

```text
We could not save your attendance.

Your changes are still on this device.

[ Retry ]
```

Do not show raw Supabase, Postgres, API, or stack trace errors to teachers or parents.

Where appropriate, critical teacher workflows should support temporary offline queuing.

The initial offline scope should be deliberately narrow:

- attendance
- quick lesson notes
- limited classroom evidence capture

Do not attempt full offline replication of the whole application in MVP.

---

# 44. BULK ACTION ENGINE

Implement a reusable bulk action component and service pattern.

Required pattern:

```text
Select all
   ↓
Deselect exceptions
   ↓
Apply action
   ↓
Show result
```

First use case:

```text
Student attendance
```

Then reuse for:

- assignment distribution
- resource assignment
- parent notifications
- selected student interventions
- fee updates where appropriate

---

# 45. PHASED IMPLEMENTATION PLAN

## Phase 0: Repository and foundation

Build:

- new SomaCampus application
- new UI foundation
- authentication
- school tenancy
- roles and permissions
- core layout
- design system
- database migration framework
- audit foundation
- file abstraction
- notifications abstraction

Do not import the entire OneHub interface.

## Phase 1: Teacher school day

Build only what is needed for:

```text
Clock in
Today
Timetable
Student roster
Attendance
Lesson completion
Lesson note
Leadership lesson visibility
```

This is the first true product milestone.

## Phase 2: Student record

Build:

- student profiles
- family relationships
- attendance history
- class membership
- basic academic context

## Phase 3: Teaching loop

Build:

- assignments
- homework
- worksheets
- quizzes
- resources
- observations
- student work capture

## Phase 4: Learning intelligence

Build:

- evidence model
- longitudinal learning profile
- competency progress
- interventions
- basic AI analysis

## Phase 5: School leadership

Build:

- school dashboard
- teaching activity
- curriculum coverage
- attendance analytics
- student support dashboard

## Phase 6: Finance

Build:

- fee structures
- student accounts
- payment records
- Excel/CSV import
- reconciliation
- clearance
- receipts
- finance reports

## Phase 7: Proven operational systems

Integrate tested:

- HR
- payroll
- employee attendance
- leave
- inventory
- assets

## Phase 8: AI expansion

Build:

- stronger retrieval
- resource reuse
- student work extraction
- profile analysis
- intervention builder
- parent summaries

## Phase 9: Online/hybrid

Only after school core is stable.

## Phase 10: Special needs

Only after a pilot partner is ready.

## Phase 11: Homeschool

Build last.

---

# 46. PHASE 1 DEFINITION OF DONE

Phase 1 is complete only when this sequence works in a real browser and on a phone sized viewport:

```text
Teacher logs in
      ↓
Teacher clocks in
      ↓
Teacher sees today's timetable
      ↓
Teacher opens current class
      ↓
Roster loads automatically
      ↓
Teacher marks all present
      ↓
Teacher changes exceptions
      ↓
Attendance saves
      ↓
Student profiles reflect attendance
      ↓
Teacher teaches
      ↓
Teacher confirms lesson status
      ↓
Teacher speaks/types lesson note
      ↓
Lesson submits
      ↓
Leadership dashboard shows lesson
      ↓
Leadership opens lesson note
```

No phase 1 demo should substitute mock cards for the real data path.

---

# 47. ACCEPTANCE TESTS: TEACHER DAY

## Test T01: clock in

Given a valid teacher employee record,
when the teacher taps Clock In,
then the JantaHR attendance event exists,
and SomaCampus recognises the teacher as clocked in.

## Test T02: today's timetable

Given a teacher with assigned timetable entries,
when they open Today,
then the day's classes appear in chronological order.

## Test T03: class context

Given a timetable entry,
when the teacher opens it,
then class, subject, teacher, date, scheduled time, and applicable room context are already populated.

## Test T04: attendance default

Given a class roster,
when attendance opens,
then the teacher can mark all students present in one action.

## Test T05: attendance exception

Given 30 students,
when the teacher marks all present and changes one to absent,
then exactly one absent record and the remaining present records are persisted.

## Test T06: student history

After T05,
when the affected student's profile opens,
then today's attendance status is visible.

## Test T07: lesson submit

Given an active timetable lesson,
when the teacher selects a lesson status, enters a note, and submits,
then a durable lesson record exists.

## Test T08: leadership visibility

Given a principal with lesson visibility permission,
when they open teaching activity,
then the submitted lesson appears.

## Test T09: private reflection

Given a teacher has private reflection content,
when a principal views the teacher's lesson,
then private reflection does not appear unless explicitly promoted and authorised.

---

# 48. ACCEPTANCE TESTS: FINANCE IMPORT

## Test F01: upload

Staff uploads a valid CSV.
The system previews the file without changing student balances.

## Test F02: column mapping

Staff maps Admission Number and Amount.
The importer validates the mapping before import.

## Test F03: deterministic match

A payment with a valid admission number matches the correct student.

## Test F04: unmatched

A row without a confident match is held in the unmatched queue.
It is not silently posted.

## Test F05: duplicate

A duplicate payment reference is flagged before final confirmation.

## Test F06: commit

After confirmation, payment records are created and student balances update.

## Test F07: audit

The import file, uploader, timestamp, row counts, and resulting actions are auditable.

---

# 49. ACCEPTANCE TESTS: STUDENT PROFILE

## Test S01

Student profile loads demographic, family, academic, and attendance context according to permissions.

## Test S02

Attendance history displays chronological records.

## Test S03

Approved evidence is visible in the Learning or Evidence view.

## Test S04

Private teacher reflection is never exposed through student or parent views.

---

# 50. ACCEPTANCE TESTS: PERMISSIONS

At minimum test these pairs:

```text
Teacher → own class
Teacher → another class
Teacher → own reflection
Teacher → another teacher reflection
Principal → school teaching activity
Parent → own child
Parent → another child
Finance user → fee records
Finance user → payroll
HR user → employee data
Student → own work
Student → another student's work
```

Every denied case must fail safely.

---

# 51. E2E TEST STRATEGY

Use real database-backed integration for critical workflows.

E2E priority:

1. authentication
2. teacher clock in
3. teacher Today
4. attendance
5. lesson completion
6. leadership visibility
7. student profile
8. fee import
9. permission boundaries

Avoid testing only visual snapshots.

The critical tests must prove data actually moved through the product.

---

# 52. SEED DATA FOR DEVELOPMENT

Provide a realistic development seed:

```text
1 school
1 academic year
2 terms
3 classes
3 streams
6 subjects
10 teachers
100 students
8 parents
sample timetable
sample calendar events
sample curriculum objects
sample lessons
sample attendance
sample assignments
sample evidence
sample fees
sample payment import
```

The seed should be sufficient to demonstrate the product without manually creating dozens of records.

---

# 53. DEMO SCENARIO

The standard demo should be:

```text
Teacher: Sarah
Class: P5 Blue
Subject: Mathematics
Lesson: Water Cycle
Students: 30
```

Demo sequence:

1. Sarah logs in.
2. Sarah clocks in.
3. Today shows Mathematics at 08:00.
4. Sarah opens P5 Blue.
5. Attendance defaults to all present.
6. Sarah marks two exceptions.
7. Attendance saves.
8. Sarah completes the Water Cycle lesson.
9. Sarah speaks a lesson note.
10. Lesson submits.
11. Principal opens teaching dashboard.
12. Principal sees Sarah's completed lesson.
13. Principal opens the lesson note.
14. Principal opens one affected student's profile.
15. Student attendance is already present in the profile history.
16. Sarah creates homework.
17. Homework is linked to the lesson.

This demo should feel like a real school day, not a software feature tour.

---

# 54. ADMINISTRATIVE UI RULE

Do not let administrative CRUD become the product's dominant experience.

A teacher should not need to navigate:

```text
Admin
  ↓
Academic Management
  ↓
Classes
  ↓
P5
  ↓
Students
  ↓
Attendance
```

to take attendance for the next class.

Instead:

```text
Today
  ↓
P5 Mathematics
  ↓
Mark Attendance
```

Context is the product.

---

# 55. CONTEXT ENGINE RULE

The system should continually infer useful context from:

```text
User
School
Role
Date
Time
Timetable
Class
Subject
Curriculum
Current teaching position
Students
Recent evidence
```

Every additional context the system already knows is one less thing the teacher must type.

---

# 56. NO AI THEATRE

Do not build UI whose primary purpose is to demonstrate that AI exists.

Bad:

```text
AI Command Center
Generate with AI
Ask Gemini
AI Insights
Prompt Assistant
```

Good:

```text
Create Homework
Suggested Next Steps
Review Student Work
Prepare Worksheet
```

The AI should be experienced as acceleration, not as a separate product.

---

# 57. NO FAKE COMPLETENESS

A module is not considered complete because:

- a sidebar item exists
- a page loads
- a form saves local state
- mock data appears
- a card displays a number
- a button has a click handler

A feature is complete when:

```text
UI
 ↓
Validation
 ↓
Authorisation
 ↓
Database
 ↓
Audit where needed
 ↓
Downstream relationship
 ↓
Correct display to the next role
```

all work correctly.

---

# 58. NO PREMATURE PLATFORM EXTRACTION

Do not turn SomaCampus into a generic software platform merely because reusable code exists.

Extract shared abstractions only when:

- duplication is proven
- behaviour is stable
- the abstraction has two real consumers
- the abstraction does not obscure school domain concepts

The product should remain understandable to a school engineer.

---

# 59. PROVEN CODE REUSE REGISTER

Create a document in the repository:

```text
REUSE_REGISTER.md
```

Each reused subsystem gets an entry.

Example:

```text
## JantaHR attendance

Source:
jantahr-egypro-payroll

Used for:
employee clock in/out

Trust basis:
existing tested production implementation

Copied/adapted:
attendance service + validation utilities

Not copied:
legacy HR attendance screens

SomaCampus UI:
Teacher Today / Clock In

Tests:
list test identifiers here
```

This prevents accidental UI inheritance.

---

# 60. TECHNICAL DECISION RECORDS

For uncertain engineering decisions, create:

```text
/docs/decisions/
```

Examples:

```text
ADR-001-new-somacampus-repository.md
ADR-002-ui-not-reused.md
ADR-003-jantahr-attendance-reuse.md
ADR-004-fee-import-reconciliation.md
ADR-005-student-longitudinal-profile.md
```

Do not allow important architecture decisions to live only in chat history.

---

# 61. IMPLEMENTATION AGENT OPERATING INSTRUCTIONS

The coding agent must follow this sequence at the start of work:

```text
1. Read PRODUCT_SPEC.md
2. Read IMPLEMENTATION_BLUEPRINT.md
3. Read ARCHITECTURE.md
4. Inspect existing repository structure
5. Inspect reusable source repositories
6. Create/confirm reuse register
7. Build the new SomaCampus shell
8. Implement Phase 0
9. Implement Phase 1 vertical slice
10. Run tests
11. Demonstrate Phase 1
12. Only then expand
```

The agent must not begin by copying an existing application's entire `src/` tree.

---

# 62. IMPLEMENTATION AGENT: REQUIRED SELF CHECK BEFORE CODING

Before writing significant code, the agent must be able to answer:

```text
What is the teacher's first action?
What does the teacher see after clocking in?
How is the next class identified?
How is attendance saved?
Where does that attendance appear later?
How does a lesson get marked completed?
Who sees the lesson note?
Who cannot see private reflection?
How does a school import payment data?
How are unmatched payments handled?
Where is student longitudinal evidence stored?
Which existing code is being reused?
Which existing UI is explicitly not being reused?
```

If the agent cannot answer these, it is not ready to implement.

---

# 63. IMPLEMENTATION AGENT: REQUIRED OUTPUT AFTER EACH PHASE

At the end of each phase, provide:

```text
Implemented
Changed files
Database migrations
Reusable code imported
Tests added
Tests passed
Screens completed
Known limitations
Next phase
```

Do not report "done" simply because the UI renders.

---

# 64. CODE QUALITY RULES

Use:

- strict TypeScript
- typed domain models
- explicit validation
- explicit permissions
- small domain services
- reusable components where justified
- database constraints for important invariants
- migrations for schema changes
- automated tests for business rules

Avoid:

- giant monolithic page components
- duplicated business rules in UI and service layers
- permission logic based only on route names
- hard coded school IDs
- hidden magic state
- duplicate student identity records
- AI outputs being written directly as official records

---

# 65. DOMAIN BOUNDARIES

Suggested module layout:

```text
src/modules/
  school/
  identity/
  students/
  families/
  teachers/
  admissions/
  academics/
  curriculum/
  timetable/
  calendar/
  attendance/
  lessons/
  assignments/
  assessments/
  learning/
  resources/
  parents/
  communications/
  fees/
  ai/
  hr/
  payroll/
  inventory/
  assets/
  reports/
```

The school domain is first.

HR, payroll, inventory, and assets are supporting domains.

---

# 66. SHARED SERVICES

Shared services may include:

```text
shared/
  auth/
  permissions/
  database/
  files/
  notifications/
  audit/
  validation/
  date-time/
  exports/
```

Shared components should be extracted based on actual need.

---

# 67. MOBILE RESPONSIVENESS GATES

Before declaring a teacher workflow complete, test at least:

```text
390 x 844
768 x 1024
1280 x 800
```

Phone is the primary acceptance environment for teacher workflow.

Parent workflows must also be phone competent.

Administration can be optimised for desktop without becoming unusable on smaller screens.

---

# 68. PERFORMANCE GATES

The application should feel immediate for common teacher actions.

Target experience:

```text
Open Today
Open class
Load roster
Save attendance
Submit lesson
```

should not involve unnecessary serial network requests.

Prefetch where useful, particularly:

- today's timetable
- current roster
- relevant student summaries
- current curriculum context

Do not optimise prematurely at the expense of correctness.

---

# 69. SECURITY GATES

Before pilot deployment, verify:

- cross school isolation
- parent child isolation
- teacher class scope
- student privacy
- file access control
- private reflection isolation
- payroll permission separation
- finance permission separation
- audit integrity
- service role key handling
- signed URL expiry

Never expose privileged Supabase credentials in browser code.

---

# 70. DATA INTEGRITY GATES

Important invariants should be protected at the database level where practical.

Examples:

```text
A student attendance record belongs to one student and one school.
A timetable entry belongs to one school.
A lesson belongs to one school.
A lesson teacher must be authorised for that school.
A lesson class must belong to the same school.
A student guardian relationship cannot cross schools accidentally.
A payment import belongs to one school.
A payment row cannot be committed twice accidentally.
```

---

# 71. FINANCE RECONCILIATION INVARIANTS

A committed payment must:

1. belong to a school
2. have an identifiable payment date
3. have an amount
4. have a source/import reference where available
5. identify the student account
6. be traceable to its import or manual reconciliation decision

Unmatched rows are not equivalent to paid balances.

---

# 72. ACADEMIC RECORD INVARIANTS

A formal academic record should distinguish:

```text
Official graded record
Diagnostic evidence
Teacher observation
AI draft
Teacher approved record
Private teacher reflection
```

Never flatten these into one generic "result" table if doing so removes their meaning.

---

# 73. STUDENT EVIDENCE INVARIANT

AI output is not automatically formal evidence.

Correct state machine:

```text
Draft
  ↓
Teacher review
  ↓
Approved
```

Possible rejection path:

```text
Draft
  ↓
Rejected / discarded
```

---

# 74. GRADEBOOK INVARIANT

The gradebook is the formal assessment track.

Homework, worksheets, and diagnostic quizzes do not automatically become formal grades.

A specific item may be promoted by a teacher according to the configured school grading rules.

---

# 75. ONLINE / HYBRID PREPARATION

Do not build online school infrastructure in the first phase merely because it exists in the roadmap.

The schema should not prevent:

```text
Student delivery mode:
on-site
online
hybrid
```

A teacher may eventually be remote.

A session may eventually lack a physical room.

But these future properties must not complicate the core school day implementation unnecessarily.

---

# 76. SPECIAL NEEDS PREPARATION

Do not build the full special needs front door now.

Preserve enough model flexibility for later:

```text
student support areas
individual goals
interventions
parent communication
visual schedule support
```

Do not allow future special needs requirements to distort the first school's core workflow.

---

# 77. HOMESCHOOL PREPARATION

Homeschool is future scope.

Do not build homeschool UI in MVP.

Preserve:

- parent with multiple children
- flexible student enrolment relationship
- learner progress independent of a single school record where practical
- future programme participation concepts

Future homeschool can become:

```text
Parent
  ↓
Children
  ↓
Curriculum
  ↓
Flexible pacing
  ↓
Learning evidence
  ↓
Optional school/community programmes
```

---

# 78. PRODUCT SUCCESS METRICS

Measure the product by outcomes such as:

```text
Teacher time saved
Teacher adoption
Lessons digitally recorded
Student evidence captured
Resource reuse
Teacher correction rate
Student engagement
Parent engagement
Interventions completed
```

Do not optimise for:

```text
Number of AI generations
Number of prompts
Number of AI buttons clicked
```

---

# 79. NORTH STAR EXPERIENCE

The finished product should make this feel normal:

```text
Teacher arrives
   ↓
One tap to clock in
   ↓
Today's school day is already prepared
   ↓
Open next class
   ↓
Attendance is fast
   ↓
Teach normally
   ↓
Speak a short note
   ↓
Confirm lesson
   ↓
School record is automatically organised
   ↓
Principal can see that teaching happened
   ↓
Student profile retains the right evidence
   ↓
Next teaching action is obvious
```

The teacher should feel that SomaCampus is **removing work**, not assigning the teacher another administrative system.

---

# 80. FINAL IMPLEMENTATION PRINCIPLE

The implementation must preserve one central truth:

> **SomaCampus is not a collection of school software modules. It is a connected school workflow.**

The system knows:

```text
who is teaching
what they are teaching
which children are in front of them
who attended
what was taught
what happened
what work followed
what students produced
what the teacher observed
what the school knows
what the child is learning
what should happen next
```

Every major implementation decision should strengthen that chain.

If a shortcut makes one page faster to build but breaks the chain, reject the shortcut.

If reusing proven code saves engineering time without forcing the old product's UI or domain assumptions onto SomaCampus, reuse it.

If copying an existing screen is easier but makes SomaCampus feel like OneHub, do not copy it.

---

# 81. FINAL BUILD ORDER

```text
NEW SOMACAMPUS REPOSITORY
        ↓
NEW DESIGN SYSTEM
        ↓
AUTH + SCHOOL TENANCY
        ↓
ROLES + RLS
        ↓
TEACHER TODAY
        ↓
CLOCK IN
        ↓
TIMETABLE
        ↓
STUDENT ATTENDANCE
        ↓
STUDENT PROFILE
        ↓
LESSON COMPLETION
        ↓
VISIBLE LESSON NOTES
        ↓
PRINCIPAL TEACHING VIEW
        ↓
ASSIGNMENTS
        ↓
RESOURCES
        ↓
STUDENT WORK
        ↓
EVIDENCE
        ↓
LEARNING PROFILE
        ↓
AI ASSISTANCE
        ↓
FEES + EXCEL/CSV RECONCILIATION
        ↓
HR / PAYROLL / INVENTORY / ASSETS REUSE
        ↓
PARENT EXPERIENCE
        ↓
ONLINE / HYBRID
        ↓
SPECIAL NEEDS
        ↓
HOMESCHOOL
```

---

# 82. RELEASE GATE

Do not call SomaCampus pilot ready until the following statement is true:

> **A real teacher can arrive at school, clock in, see the correct timetable, take attendance from their phone, teach a lesson, confirm the lesson, leave a visible lesson note, and have that activity appear correctly to school leadership while the attendance and learning information becomes part of the appropriate student records.**

Then finance must also satisfy:

> **A real school accounts user can upload an Excel or CSV payment file, review matching and exceptions, confirm the import, update student balances and clearance, and trace every imported payment back to its source file and reconciliation action.**

Everything else is expansion around these proven loops.

---

## END OF IMPLEMENTATION BLUEPRINT
