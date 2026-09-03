# SOMACAMPUS
## Product Feature Specification & Product Architecture
### Version 1.7 — September 2026

---

# 0. VERSION 1.1 REVISION NOTES

Three decisions from the first-school planning review are now locked in, not open questions:

1. **Timetable is MUST HAVE in MVP.** It is not just a scheduling convenience, it is the context engine that tells the teacher AI who is teaching what, to whom, where, and when, without the teacher re-stating it every time.
2. **School calendar and events are MUST HAVE in MVP**, as a module distinct from timetable. Timetable answers "what class happens when." Calendar answers "what is happening at the school." It must support school-wide and targeted events such as Sports Day, Cultural Day, Parents' Day, examinations, trips, staff meetings, holidays, ceremonies, deadlines, and custom events.
3. **The first school deployment activates one curriculum framework only.** The curriculum engine remains multi-framework by design, but NCDC and Cambridge are not built out simultaneously just for completeness. The school selects its curriculum at setup; a second framework is added only after the AI pipeline is validated against the first.
4. **Timetable and school calendar are both part of the MVP.** Timetable drives recurring teaching schedules and classroom context; calendar drives one-off and recurring school events and shared notifications.
5. **The first production curriculum is whichever single framework the first target school actually uses.** NCDC and Cambridge are architectural options, not simultaneous first-release content commitments.

See the revised MVP boundary and priority matrix in section 111.

---

# 0A. VERSION 1.3 REVISION NOTES

Four further decisions, from the market research and codebase review:

1. **Fee collection is designed around school owned payment channels and reconciliation**, not a mandatory payment gateway inside SomaCampus. The finance module records the school's fee obligations, payments, balances, receipts, and clearance status, while actual collection can happen through the school's existing telco or bank channels.
2. **Accessibility output (plain text version and read-aloud audio) is generated alongside AI produced homework, worksheets, and quizzes from the start**, at negligible extra cost since the content is already being generated (sections 25 to 27).
3. **The product is framed as one engine with several front doors**: mainstream schools now, special needs and autism focused schools as product #2 once a pilot partner exists, homeschool families as product #3, built last (new section 1A). Two schema decisions are made now to keep the homeschool door open without cost: a student is not hard bound to exactly one school (section 12), and a parent account already supports multiple children with independent progress views (section 8).
4. **The technical foundation is not a blank slate.** SomaCampus reuses thoroughly tested code selectively from the existing JantaHR and warehouse systems while remaining a new school first application on the same React, TypeScript, and Supabase technology stack.

---

# 0B. VERSION 1.4 REVISION NOTES

Two further decisions:

1. **Gradebook is split into two tracks** (section 49): a formal, teacher entered graded track with per class or per subject weighting configuration, and a diagnostic track (homework, quizzes, worksheets) that feeds the student learning profile (section 30) but never counts toward a grade unless a teacher explicitly promotes a specific piece of work.
2. **The technical foundation questions were resolved around code reuse, not UI reuse** (section 3A): SomaCampus is a fresh school first application and repository. Proven HR, payroll, employee portal, inventory, and asset functionality may be selectively copied or adapted from the existing JantaHR systems, but SomaCampus does not become a branch of OneHub and does not inherit either existing UI.

---

# 0C. VERSION 1.5 REVISION NOTES

The September 2026 school workflow review makes four further decisions:

1. **The daily teacher workflow is explicitly sequential:** teacher clocks in through the integrated JantaHR attendance flow, takes student attendance for the class, teaches according to the timetable, then confirms each completed lesson and records a visible lesson note. Student attendance is permanently attached to each student's attendance history and profile.
2. **Lesson completion is a first class school record.** A completed lesson records what was taught, curriculum context, class, subject, teacher, time/date, attendance context, completion status, and the teacher's lesson note. Ordinary lesson notes are visible to authorised school leadership such as the Principal, Director, Deputy, or Academic Lead. Private teacher reflection remains separate and private.
3. **SomaCampus will not integrate directly with MTN Mobile Money or Airtel Money for school fee collection.** Schools already receive their own telco issued Mobile Money collection codes. SomaCampus will instead support controlled fee reconciliation by importing payment or clearance data from Excel/CSV, validating it, matching rows to student accounts, handling unmatched or duplicate payments, and updating balances and clearance status.
4. ~~SomaCampus starts as a fresh school first codebase, treating OneHub as a source to borrow from rather than a parent to build inside of.~~ **Superseded by section 0D below.**

---

# 0D. VERSION 1.6 REVISION NOTES

Four updates from the pilot planning discussion:

1. **The first pilot site is confirmed:** Grace's school, a small, registered, accredited Cambridge center in Uganda. This makes the first activated curriculum pack (section 16) concretely Cambridge Primary, not an open placeholder, and the teacher marketplace idea is now explicitly deferred to a later, separate product rather than being part of SomaCampus (see section 105).
2. **An online/hybrid learning extension joins the mainstream front door**, not as a fourth front door alongside special needs and homeschool, but as a feature of the same pilot school: online students attending Grace's physical accredited center occasionally, taught by a mix of her own teachers and Kenyan online teachers (new section 13A).
3. **Sequencing is now three steps, not two:** build and prove the day to day core and AI teaching loop first, then the online/hybrid extension, then the special needs and autism front door. Homeschool remains sequenced last of all (section 1A).
4. **The OneHub question is resolved: build on OneHub.** Section 0C point 4 and section 3A's "fresh codebase" framing are reversed. SomaCampus is built as new modules added onto OneHub's existing modular architecture, as originally decided in version 1.4, not as a standalone codebase that merely borrows OneHub's logic. The reasoning: a solo builder splitting effort across two codebases before either has a paying customer accumulates duplicated maintenance faster than it accumulates product. See section 3A for the restored decision, and section 3B for how the product avoids presenting as an HR tool despite this.

---

# 1. PRODUCT DEFINITION

## 1.1 Product name

**SomaCampus**

## 1.2 Product purpose

SomaCampus is a school operating and learning platform designed around one primary objective:

> **Give teachers more time and better information to teach, support individual learners, and improve educational outcomes.**

It combines:

- School administration
- Student information
- Fees
- Attendance
- Teacher HR and payroll
- Academic management
- Parent engagement
- Student work capture
- Resource management
- AI assisted teaching workflows
- Learning analytics

The system is designed as a curriculum-agnostic engine, validated first against exactly one curriculum framework used by the first target school. The initial framework is selected during school setup, and the second framework is added only after the first has been validated:

1. **Uganda NCDC / UNEB aligned schools**, or
2. **Cambridge schools**

Only one of these is activated for the first production deployment (see section 16). The engine is built to extend to both, and later to:

- Kenya
- Tanzania
- Rwanda
- Zambia
- Malawi
- other African education systems

The system must therefore separate the **school platform engine** from the **curriculum and country configuration layer**.

---

# 1A. PRODUCT ROADMAP: ONE ENGINE, SEVERAL FRONT DOORS

SomaCampus is one shared engine, one database, one set of core operational modules (fees, HR, attendance, timetable, calendar), built once and reused rather than duplicated. On top of that shared engine, different school types get a different front door, the same way multi-tenancy lets one system look and behave differently per customer without forking the codebase.

**Front door 1, mainstream schools (this build).** Standard primary and secondary schools, the account structure, curriculum, and AI teaching pipeline described throughout this document. The pilot is Grace's school, a small, registered, accredited Cambridge center, which is why Cambridge Primary is the concrete first curriculum pack (section 16) rather than an open placeholder. This front door also carries the online/hybrid learning extension (section 13A), since it belongs to the same pilot school rather than a distinct market.

**Front door 2, special needs and autism focused schools (future, product #2).** Same operational core, with an individual learning plan builder (similar to an IEP, three to five specific goals per student, tracked weekly), a material generator with a 3D print export option for tactile teaching aids, a visual drag and drop daily schedule builder, and parent updates centred on progress toward individual goals rather than grades. Built only once a real special needs or autism focused school is ready to pilot it, not speculatively. Notably, Grace's school already has a few autistic children enrolled, which may make it a natural second-phase pilot for this front door as well, though it is not built until the core and the online/hybrid extension are proven first.

**Front door 3, homeschool families (future, product #4, built last).** A materially different buyer (an individual parent, not a school) and a different payment model (individual subscription, not a school invoice), so it is sequenced last and only once the others are proven. See sections 12 and 111 for the two schema decisions made now to keep this option open without cost.

**Sequencing discipline, three steps:** first, build and prove the day to day core and AI teaching loop with the pilot school. Second, add the online/hybrid extension. Third, add the special needs and autism front door. Homeschool remains sequenced last of all. Presenting these as equally built, or building them simultaneously, undermines the pitch, the strength of this plan is one proven step at a time, not several unfinished ones.

**Explicitly out of scope for SomaCampus:** a teacher staffing marketplace (matching schools with on-demand or freelance teachers) was considered alongside this work and is deliberately kept as a separate, later product rather than a SomaCampus feature. See section 105.

---

# 2. CORE PRODUCT PHILOSOPHY

SomaCampus follows six principles.

## 2.1 Teacher first

The system exists primarily to help the teacher teach.

Administrative functionality is important but should not dominate the teacher experience.

## 2.2 AI should be invisible

Teachers should not need to understand prompting, models, tokens, or AI settings.

They should perform normal actions such as:

- Complete Lesson
- Record Observation
- Create Homework
- Review Work
- Prepare Quiz

and SomaCampus uses AI behind those workflows.

The interface should generally avoid labels such as:

> AI Homework Generator

when a simpler natural workflow is possible.

## 2.3 Teacher remains the authority

AI may:

- extract
- summarise
- analyse
- draft
- suggest
- organise
- recommend

AI must not silently make consequential educational decisions.

Teacher judgment is preserved.

For important records, the system stores:

**System/AI view**

and

**Teacher view**

separately.

The teacher may select:

- Agree
- Partially agree
- Disagree
- Edit
- Add context

## 2.4 Data entry must be extremely low friction

Every important data workflow should support one or more of:

- Tap
- Bulk selection
- Voice
- Camera
- Upload
- Quick note

The system must work effectively from a teacher's phone.

## 2.5 Build once, reuse many times

Approved educational resources should become reusable assets.

An approved P5 Science worksheet should not need to be regenerated every year.

## 2.6 Learning data compounds

Every lesson, submission, assessment, observation and intervention should contribute to a longitudinal learner profile.

The product should become more useful as more school data accumulates.

---

# 3. HIGH LEVEL PRODUCT ARCHITECTURE

```text
                          SOMACAMPUS
                              |
        +---------------------+----------------------+
        |                     |                      |
   ADMIN / SCHOOL        TEACHER WORKSPACE     PARENT / STUDENT
        |                     |                      |
        +---------------------+----------------------+
                              |
                       ACADEMIC ENGINE
                              |
          +-------------------+-------------------+
          |                   |                   |
      Curriculum         Learning Data       Resources
       Engine               Engine             Library
          |                   |                   |
          +-------------------+-------------------+
                              |
                         AI SERVICE LAYER
                              |
       +----------------------+------+----------------------+
       |                      |                     |
   Text / Reasoning       Vision / OCR          Voice
       |                      |                     |
       +----------------------+------+----------------------+
                              |
                      AI MODEL GATEWAY
                              |
             +----------------+----------------+
             |                |                |
          GPT-5.6 Luna      Gemini          Other models
          primary test      multimodal       as required
```

---

# 3A. TECHNICAL FOUNDATION

SomaCampus is not starting from an empty codebase. It builds on existing, working, tested infrastructure rather than being written from zero:

- **Decision: build on jantahronehub (OneHub).** Its modular `src/modules/` structure means every new SomaCampus domain, students, academics, fees, timetable, curriculum, resources, AI services, slots in as a sibling module rather than requiring architectural surgery. 368 passing tests and proper row level security are already in place. This is a deliberate reversal of the "fresh codebase" framing in an earlier revision of this document (see section 0D), made because splitting a solo builder's effort across two codebases before either has a paying customer accumulates duplicated maintenance faster than it accumulates product.
- **Port the latest HR features from `janthr-egypro-payroll` and `jantahr-egypro-employee-portal` into OneHub's `hr` module.** The payroll app is currently ahead of OneHub on HR feature depth after two weeks of active development there; that work gets carried over into OneHub rather than left behind or rebuilt. This is a bounded, one-time task, done before new SomaCampus modules are added on top.
- **egyprowarehousemanagement**: an earlier standalone inventory system; the OneHub `warehouse` module is the candidate to build the inventory and asset management module (section 46) on, with a decision pending on whether the standalone app is retired once feature parity is confirmed.
- Stack: React, TypeScript, and Supabase (Postgres with Row-Level Security for multi-tenant isolation), staying on this stack rather than introducing a different language such as Rust, since the actual constraints on this product (ecosystem maturity for things like mobile money integration, hiring, development speed) all favour it, and none of the narrow cases where a systems language would help (video processing, real-time collaborative tools, high-frequency processing) apply here.
- **Decision: completely new UI, not a modernization of OneHub's or the payroll app's existing interface.** Neither current UI carries forward. Usability is treated as a first-order product requirement, not a visual refresh layered on top of old screens, given how central low-friction daily use is to the entire teacher-first philosophy (section 2). The underlying business logic (HR, payroll, warehouse) is what gets ported and reused, the interface is designed fresh against SomaCampus's own users, teachers, principals, parents, students, not inherited from either existing app.

---

# 3B. NAVIGATION AND PRODUCT FRAMING: NOT AN HR TOOL

Building on OneHub's codebase does not mean SomaCampus should look, navigate, or feel like an HR and payroll product with a school bolted onto the side. This is a real risk worth naming plainly, since OneHub's existing structure and default routing are HR and payroll first, and it must not carry over into how SomaCampus presents itself.

**Since the UI is being built completely new (section 3A), this is already largely solved at the code level.** What remains is a deliberate information architecture decision, not an engineering one:

- **Default landing screen by role is academic, not administrative.** A teacher opens SomaCampus to their "Today" view, timetable, current lesson, attendance to take, not to a staff or payroll screen. A principal opens to the school-wide academic and operational dashboard (section 95), not to payroll. HR and payroll surface only for whoever actually has that permission, a bursar, an HR admin, not as the front door for every user.
- **Primary navigation order reflects what a teacher, parent, or principal actually does daily**, roughly: Today/Dashboard, Teaching (lessons, homework, worksheets, quizzes), Students, Fees and Clearance, Communication, Calendar. HR, Payroll, and Inventory sit under a secondary "Administration" or "Staff" area, visible only to the roles that need them, never in the primary navigation a teacher or parent sees.
- **Internal module naming does not need to change.** OneHub's `hr` and `payroll` modules can keep their existing names in the codebase; this is a routing and navigation decision in the new SomaCampus shell, not a rename of proven, tested backend code.

---

# 4. USER ROLES

## 4.1 School Administrator

**Priority: MUST HAVE**

Can configure and manage the school.

Core access:

- School settings
- Academic year
- Terms
- Classes
- Streams
- Subjects
- Curriculum
- Students
- Parents
- Teachers
- Fees
- Attendance overview
- Academic results
- Reports
- HR
- Payroll
- Inventory
- Assets
- Resources
- AI usage policy
- User management
- Audit logs

---

# 5. PRINCIPAL / HEADTEACHER

**Priority: MUST HAVE**

This should be a configurable leadership role rather than necessarily a separate account type.

The principal can see:

- school dashboard
- teacher activity
- attendance
- academic performance
- fee status
- lesson completion
- assessment trends
- student interventions
- teacher observations where permissions allow
- school resources
- HR
- payroll
- inventory

The principal should not need to approve ordinary teacher operations such as:

- student attendance corrections
- lesson submission
- homework creation
- normal student observations

Approval workflows should only exist where the school explicitly wants them.

Leadership roles are permission bundles, not hard-coded account types. A small school may combine Principal, Administrator, and Bursar responsibilities in one account, while a larger school may separate Director, Principal, Deputy, Academic Lead, and finance roles. The underlying permission system remains the same.

---

# 6. DEPUTY / ACADEMIC LEAD

**Priority: SHOULD HAVE**

A role between principal and teacher.

Permissions can include:

- curriculum monitoring
- lesson completion monitoring
- academic performance
- teacher support
- assessment review
- resource approval
- intervention monitoring

This role should be configurable because schools have different organisational structures.

**Revision:** Deputy/Academic Lead is an optional role, not a mandatory part of the core workflow. It, along with roles such as Bursar, Accountant, and Librarian, should be built on the same underlying permission system as the required roles (Administrator, Principal, Teacher, Parent) rather than as separately hard-coded account types. A small school may collapse Principal, Administrator, and Bursar into one person; a larger school may run a full Director to Teacher hierarchy. The product should be the same either way, only the permission assignments differ. Concretely, permissions like "can manage school calendar", "can view teacher lesson completion", "can view payroll", "can view student records", and "can approve official reports" should be assignable to any role, with Deputy/Academic Lead simply being one preconfigured bundle of them.

---

# 7. TEACHER

**Priority: MUST HAVE**

The teacher is the central user.

Teacher workspace:

- Today's classes
- Timetable
- Attendance
- Lesson completion
- Lesson history
- Assignments
- Worksheets
- Quizzes
- Student work
- Student observations
- Class performance
- Student profiles
- Resources
- Teacher reflection
- HR/payroll
- Leave
- Personal attendance
- Private notes

The teacher's interface should prioritise teaching functions over HR functions.

---

# 8. PARENT

**Priority: MUST HAVE**

Parent access should focus on:

- children
- fees
- attendance
- homework
- quizzes
- submitted work
- teacher feedback
- learning summaries
- school communication
- parent-child activities

Parents should be able to manage multiple children under one account.

---

# 9. STUDENT

**Priority: SHOULD HAVE**

For younger students, the system should primarily support teacher/parent facilitated activities.

Student access:

- assigned homework
- quizzes
- assignments
- submission
- feedback
- learning history
- resources

Open-ended AI student tutoring is **not part of the initial product**.

Future AI study assistance should target older students, approximately 16+, and be designed as guided learning rather than answer generation.

---

# 10. ORGANISATION / SCHOOL MANAGEMENT

## 10.1 Multi-school architecture

**Priority: MUST HAVE**

The database should support:

```text
Organisation
    |
    +-- School A
    |
    +-- School B
    |
    +-- School C
```

One customer may operate one school or multiple schools.

Each school may have:

- branding
- curriculum
- academic year configuration
- fee structure
- grading system
- user permissions
- school policies

---

# 11. SCHOOL CONFIGURATION

## Priority: MUST HAVE

Features:

- school profile
- logo
- colours
- contacts
- address
- academic calendar
- terms
- classes
- streams
- subjects
- departments
- grading settings
- attendance settings
- fee settings
- communication settings
- AI policies
- curriculum selection

---

# 12. STUDENT INFORMATION SYSTEM

## Priority: MUST HAVE

Student profile should include:

### Identity

- student ID
- legal name
- preferred name
- date of birth
- gender
- photo
- admission number
- nationality where required
- emergency contacts

### Academic

- school
- year
- class
- stream
- subjects
- curriculum
- competencies
- results
- attendance
- assignments
- submissions
- assessments

### Family

- parent/guardian relationships
- contact information
- authorised contacts

### Learning profile

- strengths
- areas requiring support
- teacher observations
- AI generated analysis drafts
- interventions
- learning evidence
- progress over time

### Important design principle

The student profile is not simply an information record.

It becomes the learner's **longitudinal academic evidence record**.

**Revision:** The relationship between a student and a school should be modelled as an association, not a hard foreign key baked into the student record itself. For the current build this makes no visible difference, a student still belongs to exactly one school in practice. But it means a future homeschool parent (see section 111 and the deferred roadmap) can be represented as their own minimal "school" without a schema rewrite, since homeschool support is intentionally not part of this build, only kept possible without cost now.

---

# 13. ADMISSIONS AND ENROLMENT

## Priority: MUST HAVE

Features:

- application
- applicant record
- document uploads
- admission decision
- student creation
- class allocation
- stream allocation
- parent creation
- fee setup
- admission history

---

# 13A. ONLINE / HYBRID LEARNING EXTENSION

## Priority: FUTURE (second sequencing step, after the core and AI teaching loop are proven)

This extends the mainstream front door at the pilot school rather than standing up a separate online school business. Grace's school is an accredited Cambridge center; the extension lets it enrol online students who attend the physical center occasionally, taught by a mix of her existing on-site teachers and Kenyan online teachers.

Implications for the data model, kept in mind now even though this is not built in the first phase:

- A student enrolment should be able to indicate a delivery mode (on-site, online, or hybrid) without that being a different kind of student record
- A teacher assignment should support a teacher who is not physically at the school, which the timetable and room entities (sections 48 and 75) should not structurally prevent
- Attendance for an online session is conceptually the same event as attendance for an on-site one (present, absent, late), just without a physical room, so the attendance entities should not hard-require a room
- Occasional physical attendance for an otherwise online student is a normal, not exceptional, pattern to allow for

Nothing here should be built ahead of the core teaching loop being proven. The purpose of this section is to make sure the schema decided now doesn't quietly foreclose it.

---

# 14. ACADEMIC STRUCTURE

## Priority: MUST HAVE

Entities:

- academic year
- term
- class
- stream
- subject
- teacher assignment
- student enrolment
- teaching assignment

This becomes the backbone of all academic activity.

---


---

# 15. SCHOOL CALENDAR & EVENTS

## Priority: MUST HAVE

The school calendar is a shared school-wide scheduling layer and is distinct from the timetable.

### Timetable answers

> What class happens when?

### Calendar answers

> What is happening at the school?

The calendar must support:

- term start and end dates
- school holidays
- Sports Day
- Cultural Day
- Parents' Day
- examinations
- trips
- assemblies
- staff meetings
- training days
- ceremonies
- admission/open days
- deadlines
- public/custom school events

Events may target:

- whole school
- teachers/staff
- parents
- students
- a class
- a stream
- a department
- selected users

### Calendar event fields

- title
- description
- event type
- start date/time
- end date/time
- all-day flag
- location
- organiser
- visibility
- target audience
- recurrence
- reminder settings
- status

### Calendar entities

#### school_calendars

- id
- school_id
- academic_year_id
- name
- status

#### calendar_events

- id
- school_calendar_id
- title
- description
- event_type
- start_datetime
- end_datetime
- all_day
- location
- created_by
- visibility
- recurrence
- status

#### calendar_event_targets

- event_id
- target_type
- target_id

### Calendar integration

Calendar events should surface automatically in:

- teacher dashboard
- parent dashboard
- student dashboard
- administrator dashboard

Optional notifications may be scheduled automatically, for example:

- 7 days before
- 1 day before
- same-day reminder

The calendar should also be available to the teacher as part of the daily context view so the teacher can immediately see both teaching commitments and school events.

---

# 15A. CURRICULUM ENGINE

## Priority: MUST HAVE

This is one of the most important architectural components.

SomaCampus must not hard-code itself to Uganda.

Instead:

```text
Curriculum Framework
        |
        +-- Country / Provider
        |
        +-- Education Level
        |
        +-- Stage / Class
        |
        +-- Subject
        |
        +-- Strand
        |
        +-- Topic
        |
        +-- Learning Objective
        |
        +-- Competency
        |
        +-- Suggested Activities
```

For Uganda, NCDC's current primary structure is particularly suitable for this approach. NCDC describes P5–P7 as subject-based and identifies subjects including English, Mathematics, Social Studies, Integrated Science, Local Language, CAPE and Religious Education.

NCDC's P7 curriculum materials also explicitly organise topics, learning outcomes, content/language competences and suggested activities.

For Cambridge, the same abstraction works because Cambridge Primary curriculum frameworks are subject-specific and organised around strands and learning objectives for each stage.

---

# 16. CURRICULUM PACKS

## Priority: Curriculum abstraction is MUST HAVE. Exactly one activated curriculum pack is MUST HAVE for the first deployment. Every additional pack is SHOULD/LATER and is added only after the first production curriculum has been validated.

**Revision:** NCDC and Cambridge Primary are not both built out for version 1. The school selects its curriculum during setup (Uganda NCDC, Cambridge Primary, or Other/Custom), and exactly one real curriculum pack is activated for the first production environment. **The pilot school (Grace's school) is an accredited Cambridge center, so Cambridge Primary is the concrete curriculum pack being built and validated first, not an open placeholder.** The architecture underneath already supports additional packs without re-architecture, so adding the second framework later, most likely NCDC given the wider Ugandan market, is primarily a curriculum content, mapping, testing, and validation exercise rather than a platform rebuild.

Candidate packs, in the order they'd realistically get added:

### Uganda

NCDC

### Cambridge

Cambridge Primary

Future:

### Kenya

CBC

### Tanzania

Tanzania national curriculum

### Rwanda

National curriculum

### Zambia

National curriculum

### Malawi

National curriculum

The product engine remains unchanged.

Only the curriculum pack changes.

---

# 17. CURRICULUM VERSIONING

## Priority: MUST HAVE

Curriculum information must be versioned.

Example:

```text
NCDC
  Primary
    P5
      Science
        2026 Framework
```

If curriculum requirements change:

```text
2026
2027
```

should remain historically distinguishable.

A lesson created under an old curriculum should not silently change when the curriculum is updated.

---

# 18. CURRICULUM GROUNDING ARCHITECTURE

Do not give an AI model one giant permanent prompt containing the entire syllabus.

Instead:

```text
Teacher
   ↓
Current lesson
   ↓
School curriculum
   ↓
Class
   ↓
Subject
   ↓
Current topic
   ↓
Learning objective
   ↓
Retrieve relevant curriculum context
   ↓
AI
```

The teacher never needs to say:

> "This is P5 Uganda Science."

The school configuration already knows it.

The AI request receives the relevant curriculum context automatically.

This provides:

- lower token usage
- better relevance
- stronger curriculum control
- easier curriculum updates
- support for multiple systems
- cleaner auditing

---

# 18A. CURRENT TEACHING POSITION

## Priority: MUST HAVE

For each teacher, class, and subject combination, the system tracks where that class currently sits in the curriculum sequence. The position is informed by submitted lessons and timetable context and is distinct from the per-student Learning Mastery Map, which tracks individual competency rather than class pacing.

```text
P5 Science

✓ Living Things
✓ Materials
✓ States of Matter
→ Water Cycle
○ Weather
○ Soil
```

This is set automatically as lessons are submitted against curriculum objectives, and the teacher can override it directly if the class is ahead of or behind the recorded position. Its purpose is to stop AI generated homework, worksheets, and quizzes from drifting out of sequence, generation requests are grounded against the current position by default rather than requiring the teacher to specify it each time.

---

# 19. LESSON MANAGEMENT

## Priority: MUST HAVE

The lesson record is part of the teacher's normal classroom workflow and is the authoritative school record that a lesson took place.

### Daily operating sequence

```text
Teacher clocks in
      ↓
Teacher opens today's timetable
      ↓
Take student attendance
      ↓
Teach the scheduled lesson
      ↓
Confirm lesson completed
      ↓
Add a short visible lesson note
      ↓
Submit lesson record
```

### Teacher selects

The system should use the timetable to prefill:

- class
- subject
- teacher
- date
- expected start/end time
- room where applicable

The teacher should be able to correct the context when a substitution or schedule change occurs, subject to permissions.

### Teacher records

**Lesson status**

- completed as planned
- partially completed
- not completed
- class struggled
- class advanced quickly

**What did you teach?**

Input options:

- typing
- voice
- quick notes
- previous lesson continuation

**Lesson note**

A short operational note describing what happened in the lesson. This is a normal school record and is visible to authorised leadership users such as the Principal, Director, Deputy, or Academic Lead.

### Submit lesson

The system records:

- lesson
- teacher
- class
- subject
- scheduled timetable entry
- actual date/time
- curriculum position
- lesson status
- student attendance reference
- teacher lesson note
- lesson evidence where supplied
- linked resources
- linked assignments or follow up actions

Once submitted, the lesson appears in:

- teacher lesson history
- class academic history
- curriculum coverage
- leadership teaching activity views
- the relevant student's learning timeline where student specific evidence is attached

### Suggested next actions

Immediately after submission:

- Create homework
- Create worksheet
- Create quiz
- Add student observations
- View previous resources
- Capture classroom evidence

No need to expose AI terminology.

### Lesson visibility rule

The **lesson note is not the same as private teacher reflection**.

- Lesson note: operational teaching record, visible to authorised school leadership.
- Private reflection: genuinely private teacher workspace, excluded from leadership dashboards and performance reports unless the teacher explicitly promotes content into an official record.

---

# 20. TEACHER ATTENDANCE

## Priority: MUST HAVE

Teacher attendance is integrated into the SomaCampus teacher experience using the proven JantaHR attendance implementation.

### Morning workflow

```text
Teacher arrives at school
      ↓
Clock in
      ↓
Attendance event stored in JantaHR attendance history
      ↓
SomaCampus opens the teacher's school day
      ↓
Today's timetable and classes are shown
```

Potentially includes:

- GPS
- geofence
- IP validation
- clock in
- clock out
- lateness
- leave integration

The teacher should not have to switch to a separate HR application just to start the school day. The same login and integrated workspace should make the attendance event available to both HR and the teacher's daily teaching context.

Implementation rule: reuse the thoroughly tested JantaHR attendance code where practical, but expose it through SomaCampus's own teacher first interface.

---

# 21. STUDENT ATTENDANCE

## Priority: MUST HAVE

Teacher managed and recorded against the actual class session.

### Default workflow

```text
Teacher opens scheduled class
        ↓
Student roster loads automatically
        ↓
[MARK ALL PRESENT]
        ↓
Deselect or change exceptions
        ↓
[Save Attendance]
```

Example:

```text
P5 Blue
30 students

[MARK ALL PRESENT]

Exceptions:
[ ] John   Absent
[ ] Mary   Late
[ ] David  Excused
```

Teacher can assign:

- Present
- Absent
- Late
- Excused
- Other configured statuses

### Student profile requirement

Every saved attendance event becomes part of the student's permanent attendance history and is immediately available from the student's profile.

This means a student's profile can answer:

- days present
- days absent
- days late
- excused absences
- attendance trend
- attendance by term
- attendance by subject/class where the school configuration supports it

Attendance should not exist only as a class register screen. It is a longitudinal learner record that can later contribute to parent summaries, intervention analysis, and school reporting.

### Correction

Teacher can reopen attendance and correct an accidental entry. The original value, correction time, and correcting user should remain auditable.

Principal/deputy approval is not required for ordinary corrections unless a particular school chooses that policy.

Student attendance remains a separate data domain from teacher attendance.

---

# 22. BULK ACTION ENGINE

## Priority: MUST HAVE

This should be a reusable UI/data capability, not a collection of individual features.

Every appropriate module should support:

**Select all**

**Deselect exceptions**

**Apply action**

Examples:

- all students present
- all homework assigned
- all students received resource
- all students marked as submitted
- bulk fee updates
- bulk parent notifications
- bulk resource assignment

This is critical for adoption.

---

# 23. TEACHER CLASSROOM EVIDENCE

## Priority: MUST HAVE

Teacher can record evidence quickly.

Possible evidence types:

- completed activity
- classroom observation
- student participation
- misconception
- behaviour note
- intervention
- achievement
- support needed
- follow-up required

Input:

- voice
- text
- photo
- attachment

The system converts unstructured input into structured records.

---

# 24. PRIVATE TEACHER REFLECTION

## Priority: MUST HAVE

This is a separate privacy domain.

Example:

> "I think I spent too long explaining the introduction."

AI may help the teacher reflect.

The reflection is:

- private to teacher
- excluded from normal leadership dashboards
- excluded from teacher performance reports
- not used as evidence against the teacher

Unless a future explicitly configured feature changes this behaviour, private reflection remains private.

---

# 25. HOMEWORK

## Priority: MUST HAVE

Teacher completes a lesson.

After submission:

**Create homework**

The AI uses:

- lesson
- curriculum
- class level
- subject
- previous lesson
- school settings

to prepare a draft.

Teacher can:

- review
- edit
- save
- assign
- reuse a resource

Homework is stored as a permanent academic resource.

---

# 26. WORKSHEETS

## Priority: MUST HAVE

AI can create a worksheet from:

- lesson
- topic
- competency
- previous resource

Teacher reviews before publishing.

Supports:

- printable PDF
- mobile view
- answer key
- multiple difficulty levels
- school branding
- reusable resource
- **a plain, simplified text version**
- **a read-aloud audio option**

**Revision:** The plain text and read-aloud versions are generated alongside the main worksheet in the same request, not as a separate task the teacher has to trigger. Since the AI is already producing the worksheet content, this adds negligible cost and no extra step for the teacher, while genuinely helping a student who struggles reading, is learning to read, or is blind. This applies to homework (section 25) and quizzes (section 27) as well, not only worksheets.

---

# 27. QUIZZES

## Priority: MUST HAVE

Online quizzes.

Question types:

- multiple choice
- true/false
- short answer
- matching
- fill-in-the-blank
- image-based questions

The platform records raw interaction data.

Examples:

- answer
- correctness
- attempt
- response time
- question
- topic
- competency
- date

AI analyses patterns but does not independently determine official student grades. Quiz results route to the student learning profile (section 30) as diagnostic evidence, not to the gradebook (section 49), unless a teacher explicitly promotes a specific quiz into a class's formal graded assessments.

---

# 28. STUDENT WORK CAPTURE

## Priority: MUST HAVE

Teacher can:

- photograph work
- upload image
- upload PDF
- attach work to student
- attach work to assignment
- attach work to lesson

AI extracts useful information and prepares a draft.

Example:

### AI draft

> Student demonstrates understanding of...

Teacher sees:

**AI observation**

and

**Teacher observation**

Teacher can:

- accept
- amend
- add notes
- disagree
- discard

Only the teacher-approved version becomes the formal record.

---

# 29. LEARNING EVIDENCE MODEL

## Priority: MUST HAVE

Every piece of evidence may connect:

```text
Student
   ↓
Lesson
   ↓
Assignment
   ↓
Submission
   ↓
Observation
   ↓
Competency
```

This creates the basis for longitudinal learning profiles.

---

# 30. STUDENT LEARNING PROFILE

## Priority: MUST HAVE

The profile should eventually show:

### Academic progress

- competency
- assessments
- assignments
- quizzes
- teacher observations

### Engagement

- attendance
- homework completion
- participation

### Strengths

- teacher observations
- evidence history
- positive achievements

### Support areas

- recurring difficulties
- interventions
- follow-up

### Trends

- improving
- stable
- declining

AI should propose analysis.

Teacher remains the authority.

---

# 31. LEARNING MASTERY MAP

## Priority: SHOULD HAVE

For each subject:

```text
Topic
  |
  +-- Competency 1   Secure
  +-- Competency 2   Developing
  +-- Competency 3   Needs support
```

This supports future intervention and curriculum progression.

---

# 32. AI INTERVENTION SUPPORT

## Priority: SHOULD HAVE

Teacher selects a learner/group.

System can prepare:

- remedial activity
- additional examples
- short explanation
- targeted worksheet
- mini quiz
- extension activity
- suggested teaching approach

Teacher approves what to use.

---

# 33. NEXT LESSON RECOMMENDATION

## Priority: SHOULD HAVE

After analysing:

- previous lesson
- quiz
- assignment
- observations
- curriculum objective

SomaCampus may show:

> **Suggested next steps**

1. Revisit concept X
2. Support students A, B and C
3. Give extension activity to group D

The teacher decides.

---

# 34. RESOURCE LIBRARY

## Priority: MUST HAVE

This is a foundational component.

Resources can include:

- lesson plans
- worksheets
- homework
- quizzes
- exam papers
- revision sheets
- diagrams
- teacher notes
- school-created materials

Hierarchy:

```text
School
  |
  +-- Curriculum
       |
       +-- Level
            |
            +-- Subject
                 |
                 +-- Topic
                      |
                      +-- Resources
```

Example:

```text
School
  → NCDC
    → P5
      → Science
        → Water Cycle
          → Worksheet
          → Homework
          → Quiz
          → Diagram
```

---

# 35. RESOURCE VERSIONING

## Priority: MUST HAVE

Every resource should have:

- creator
- creation date
- curriculum
- class
- subject
- topic
- objective
- version
- approval state
- usage count
- rating
- last used

States:

**Draft**

**Teacher Approved**

**School Approved**

**Archived**

---

# 36. RESOURCE REUSE / AI CACHE

## Priority: MUST HAVE

Before generating:

```text
Teacher request
      ↓
Search approved resources
      ↓
Existing suitable resource?
      |
     YES
      ↓
Reuse / Adapt
```

Only generate new AI material when necessary.

This saves:

- API cost
- teacher time
- duplicate content
- inconsistent quality

A good approved resource can serve future academic years.

---

# 37. PARENT PORTAL

## Priority: MUST HAVE

Parents can access:

- fee status
- attendance
- assignments
- quizzes
- submitted work
- teacher feedback
- learning summary
- announcements

---

# 38. PARENT + CHILD ACTIVITIES

## Priority: SHOULD HAVE

For younger children, SomaCampus can deliberately create activities designed for parent participation.

Example:

> **Try this together**
>
> Find five objects at home that can roll and five that cannot.
>
> Ask your child to explain why.

Parent/child activities should not depend on the child independently navigating an AI assistant.

This becomes a bridge between:

**School**

and

**home learning**

---

# 39. WEEKLY PARENT LEARNING DIGEST

## Priority: SHOULD HAVE

Instead of a noisy social feed:

### This week's learning

John learned:

- fractions
- equivalent fractions
- word problems

Completed:

3 assignments

Teacher observation:

Strong visual understanding.

Needs practice:

Written reasoning.

This provides useful parental visibility without increasing teacher workload.

---

# 40. STUDENT PORTAL

## Priority: SHOULD HAVE

Student can:

- see assignments
- complete quizzes
- submit work
- see teacher feedback
- access approved resources
- see personal progress

Students cannot view:

- classmates' private data
- teacher private reflections
- administrative records

---

# 41. STUDENT AI

## Priority: LATER

Do not introduce open-ended AI tutoring for younger students.

Future:

**16+ guided study assistant**

It should teach:

- question formulation
- reasoning
- research
- explanation

rather than simply answering homework.

---

# 42. FEES MANAGEMENT

## Priority: MUST HAVE

Features:

- fee structures
- term fees
- class fees
- student accounts
- payment records
- balances
- clearance status
- discounts
- waivers
- arrears
- receipts
- reporting
- **Excel/CSV payment import**
- payment reconciliation
- unmatched payment queue
- duplicate payment detection
- bulk clearance updates

### School Payment Model

SomaCampus does **not** directly process Mobile Money collections in the first deployment. Schools collect money through their own telco issued Mobile Money codes, bank accounts, cash office processes, or other existing school channels.

The finance office then imports an Excel or CSV file showing payments received or students cleared. The system validates the file, previews the changes, matches each payment to a student account, flags rows it cannot confidently match, detects likely duplicates, and applies approved updates to balances and clearance status.

Recommended import columns include:

- student admission number or SomaCampus student ID
- student name
- payer name where available
- payment reference where available
- payment date
- amount
- payment channel
- term or invoice reference where available
- clearance status where the source file provides one

The import must be auditable. Staff should see which file was uploaded, who uploaded it, when it was processed, how many rows were matched, how many were rejected or left unmatched, and what student balances were changed.

Potential later integrations:

- bank statement reconciliation
- payment gateways
- school specific payment provider integrations
- one running parent account across fees, exam registration, trips, and uniforms instead of separate bills

---

# 43. HR AND PAYROLL

## Priority: MUST HAVE

Do not build a new HR engine.

Port/reuse JantaHR's existing functionality.

Expected capabilities include:

- employee profiles
- onboarding
- attendance
- leave
- payroll
- payslips
- advances
- adjustments
- pay grades
- historical payroll
- employee self-service

The school system should consume the proven JantaHR architecture rather than recreate it.

---

# 44. TEACHER HR WORKSPACE

## Priority: MUST HAVE

Teacher account should contain:

**My HR**

- profile
- attendance
- leave
- payslips
- requests
- employment information

and:

**My Teaching**

- timetable
- classes
- students
- lessons
- assignments
- assessments
- resources

Same login.

---

# 45. PAYROLL INTEGRATION WITH SCHOOL STRUCTURE

## Priority: MUST HAVE

Teacher can simultaneously belong to:

```text
Employee
   |
   +-- Department
   +-- Employment contract
   +-- Payroll
   +-- Attendance
   |
   +-- Teacher profile
        |
        +-- Subjects
        +-- Classes
```

Teaching assignments must not be confused with employment records.

---

# 46. INVENTORY

## Priority: MUST HAVE

Reuse existing inventory functionality.

Examples:

- textbooks
- laboratory equipment
- computers
- furniture
- sports equipment
- stationery
- consumables

Capabilities:

- stock
- custody
- issue
- return
- location
- low stock
- movement history

---

# 47. ASSET MANAGEMENT

## Priority: MUST HAVE

For durable assets:

- asset ID
- serial number
- category
- location
- custodian
- purchase date
- value
- condition
- maintenance
- history

---

# 48. TIMETABLE

## Priority: MUST HAVE

Timetable is a core academic and teacher-context module, not merely an administrative scheduling utility.

Features:

- class timetable
- teacher timetable
- subject schedule
- room allocation
- conflict detection
- substitute teacher allocation
- effective dates for timetable changes
- term-specific timetables
- recurring schedule entries
- teacher daily view
- class daily view

### Timetable context

The active timetable entry should automatically provide context to the teacher workflow:

- class
- stream
- subject
- teacher
- room
- date/time
- term
- current curriculum position

This context should be available to the AI gateway without requiring the teacher to re-enter it.

### Timetable entities

#### timetables

- id
- school_id
- academic_year_id
- term_id
- name
- status

#### timetable_entries

- id
- timetable_id
- class_id
- stream_id
- subject_id
- teacher_id
- room_id
- day_of_week
- start_time
- end_time
- recurrence
- effective_from
- effective_to

#### rooms

- id
- school_id
- name
- room_type
- capacity
- status

Future enhancement:

AI-assisted timetable creation and optimisation.

---

# 49. GRADEBOOK

## Priority: MUST HAVE

**Revision:** The gradebook only holds formal, teacher entered graded assessments (mid-term exams, end-term exams, and whatever else a class treats as official). It does not average in homework, quizzes, or worksheets automatically. Those stay diagnostic, feeding the student learning profile (section 30) so the AI and teacher can see patterns and understanding, without becoming part of an official grade. This reflects how grading actually works across classes in practice, not every piece of work is meant to count.

### Two tracks, not one

**Formal graded track (this section).** Manually entered by the teacher for assessments the school has designated as official. AI does not replace teacher marking here.

**Diagnostic track (routes to section 30, Student Learning Profile).** Homework, quizzes, and worksheets. These inform the AI's understanding of a student's progress and what a teacher should focus on next, but never contribute to a grade unless a teacher explicitly promotes a specific piece of work into the formal track for a given class.

### Per class or per subject weighting

Which assessments count toward the term grade, and how much each is worth, is configured per class or per subject, not fixed platform-wide, because this genuinely varies:

- Some classes weight mid-term and end-term together, for example 30 percent mid-term plus 70 percent end-term
- Some classes count only the end-term exam, with mid-term and other tests contributing nothing to the final grade
- The configuration should support both without either being a special case in the code, a class's grading rule is just "which assessments, and what weight each carries"

### Features:

- assessment
- score
- grading scale
- comments
- subject result
- term result
- class result
- **per class or per subject weighting configuration**
- **explicit distinction between formal (graded) and diagnostic (ungraded) assessments**

---

# 50. EXAM MANAGEMENT

## Priority: SHOULD HAVE

Features:

- assessment creation
- exam schedules
- candidate lists
- marks capture
- analysis
- report integration

AI may help generate drafts but teacher/school remains responsible for final assessment.

---

# 51. REPORT CARDS

## Priority: MUST HAVE

Generate report cards from approved school records.

AI may prepare narrative comments for teacher review.

Teacher remains responsible for final comment.

---

# 52. SUBSTITUTE MANAGEMENT

## Priority: SHOULD HAVE

When teacher is unavailable:

- assign substitute
- show lessons
- show resources
- show class roster
- record substitute lesson activity

---

# 53. COMMUNICATION

## Priority: MUST HAVE

Channels:

- in-app notifications
- email
- SMS
- WhatsApp integration later where commercially/technically appropriate

Messages should be template-driven to reduce teacher workload.

---

# 54. SCHOOL AI ASSISTANT

## Priority: SHOULD HAVE

For authorised administrators.

Examples:

> "Which students have outstanding fees?"

> "Which class has the lowest attendance?"

> "What percentage of P5 completed the latest science quiz?"

> "Which students have shown declining performance in mathematics?"

> "Which resources are most frequently reused?"

The assistant answers from authorised school data.

It should not expose data a user cannot otherwise access.

---

# 55. AI SERVICES ARCHITECTURE

AI should be implemented as independent services behind one gateway.

## AI Service 1: Lesson Structuring

Input:

- teacher text
- teacher voice transcript
- class
- subject
- curriculum context

Output:

- lesson summary
- objectives
- topic
- curriculum alignment
- activity
- teacher observation

---

## AI Service 2: Homework Drafting

Input:

- lesson
- curriculum
- age level
- previous work

Output:

- homework draft
- instructions
- answer key
- difficulty metadata

---

## AI Service 3: Worksheet Drafting

Output:

- printable worksheet
- sections
- questions
- answer key
- difficulty level
- resource metadata

---

## AI Service 4: Quiz Drafting

Output:

- question bank
- answer options
- correct answer
- competency tags
- difficulty
- explanations

---

## AI Service 5: Student Work Extraction

Input:

- photo
- PDF
- scanned work

Output:

- student identification where possible
- assignment identification where possible
- extracted answers
- observable evidence
- draft teacher observation

Important:

**This is not autonomous grading.**

The service extracts evidence and prepares a draft report/observation for the teacher. The teacher reviews, edits, agrees/disagrees, and submits the final human-approved record.

---

# 56. AI SERVICE 6: Quiz Analytics

Input:

Raw quiz data.

Output:

- class trends
- topic performance
- question difficulty
- common misconceptions
- students needing attention
- possible reteaching areas

No automatic official grading decisions.

---

# 57. AI SERVICE 7: Student Profile Analysis

Input:

- historical assessments
- teacher-approved observations
- assignments
- quiz patterns
- attendance
- interventions

Output:

- trend summaries
- strengths
- emerging support needs
- recommended follow-up

The output remains advisory.

---

# 58. AI SERVICE 8: Intervention Builder

Input:

- target competency
- student's evidence
- previous performance
- curriculum

Output:

- remedial activity
- additional examples
- mini worksheet
- mini quiz
- extension activity

---

# 59. AI SERVICE 9: Parent Summary

Input:

Approved learning evidence.

Output:

- simple parent-friendly summary
- achievements
- current learning
- suggested home activity

Never expose raw internal AI reasoning.

---

# 60. AI SERVICE 10: Resource Classification

When a resource is created:

AI determines metadata such as:

- curriculum
- level
- subject
- topic
- competency
- difficulty
- resource type

Teacher can edit metadata.

---

# 61. AI SERVICE 11: Resource Search / Retrieval

Teacher:

> "Show me last year's P5 Science resources about water."

System searches approved resources.

AI can optionally rank:

- best match
- recently used
- highly rated
- curriculum-aligned

---

# 62. AI SERVICE 12: Voice-to-Data

Teacher speaks naturally.

Example:

> "P5 struggled with converting fractions today. Sarah and Peter understood it but John and David need more support."

The system turns this into structured records:

- lesson reflection
- student observations
- competency
- support flags

Teacher reviews before formal student records are committed.

---

# 63. AI SERVICE 13: Document / Curriculum Processing

Used by administrators during curriculum configuration.

Input:

- official curriculum documents
- school curriculum documents
- curriculum updates

Output:

- structured curriculum objects
- topics
- objectives
- competency relationships

Human validation is required before official curriculum content becomes active.

---

# 64. AI SERVICE 14: AI "WHAT NEXT?"

Context-aware recommendations.

Examples:

- create homework
- create quiz
- review class performance
- identify struggling students
- prepare remedial activity
- reuse existing resource

This is the main form of "Teacher AI."

---

# 65. AI MODEL GATEWAY

Never couple SomaCampus directly to one vendor.

Architecture:

```text
SomaCampus Feature
       ↓
AI Gateway
       ↓
Task Router
       |
       +-- low-cost reasoning
       +-- multimodal reasoning
       +-- vision
       +-- speech
       +-- image generation
       ↓
Provider adapters
       |
       +-- OpenAI
       +-- Google
       +-- Anthropic
       +-- future providers
```

---

# 66. INITIAL MODEL STRATEGY

GPT-5.6 Luna is currently a particularly attractive candidate for high-volume SomaCampus operations.

OpenAI currently lists:

- $0.20 / 1M input tokens
- $0.02 / 1M cached input tokens
- $1.20 / 1M output tokens
- 1.05M context window

and explicitly positions Luna for cost-sensitive, high-volume workloads.

Gemini 3.7 Flash is another important candidate, currently listed at:

- $0.75 / 1M input
- $3.75 / 1M output
- 1M context

at its current introductory pricing through December 31, 2026.

The production system should therefore begin with model abstraction rather than committing the entire product to one provider.

---

# 67. AI TASK ROUTING

Example:

| Task | Initial candidate |
|---|---|
| Lesson structuring | GPT-5.6 Luna |
| Homework drafting | GPT-5.6 Luna |
| Worksheet drafting | GPT-5.6 Luna |
| Quiz drafting | GPT-5.6 Luna |
| Parent summary | GPT-5.6 Luna |
| Resource metadata | GPT-5.6 Luna |
| Student work analysis | Luna + multimodal benchmark |
| Voice workflow | Speech service + Luna or Gemini |
| Complex curriculum reasoning | Luna/Terra/Claude benchmark |
| Image generation | Dedicated image service |
| Large curriculum processing | Luna / Gemini |

These are **initial routing candidates, not permanent decisions**.

---

# 68. AI QUALITY GATE

Before any model becomes production default, run a SomaCampus benchmark.

Test:

### NCDC

- P4
- P5
- P6
- P7

### Cambridge

- Stage 1
- Stage 3
- Stage 5 / representative stages

Test tasks:

1. lesson → homework
2. lesson → worksheet
3. lesson → quiz
4. lesson → curriculum alignment
5. student-work photo → draft observation
6. voice → structured lesson
7. quiz → analysis
8. student history → intervention
9. learning record → parent summary
10. existing resource → adaptation
11. timetable context → lesson context
12. curriculum-constrained generation

Score:

- correctness
- curriculum alignment
- hallucination
- teacher editing required
- usefulness
- consistency
- response time
- cost

---

# 69. DATABASE ARCHITECTURE

The product should be designed around a relational core with flexible metadata.

Likely PostgreSQL/Supabase-compatible structure.

---

# 70. CORE TENANCY ENTITIES

### organisations

- id
- name
- status
- created_at

### schools

- id
- organisation_id
- name
- code
- logo
- branding
- country
- timezone
- settings

### school_settings

- school_id
- academic settings
- attendance settings
- grading settings
- AI settings
- communication settings

---

# 71. USER ENTITIES

### users

- id
- auth identity
- email
- phone
- status

### roles

- id
- name

### user_roles

- user_id
- school_id
- role_id

### permissions

- id
- permission_code

### role_permissions

- role_id
- permission_id

---

# 72. PEOPLE ENTITIES

A common people table is useful.

### people

- id
- legal name
- preferred name
- date of birth
- contact information
- photo
- metadata

Then specialised records:

### employees

- person_id
- employee number
- employment status
- department
- contract
- payroll profile

### students

- person_id
- admission number
- status
- admission date

### parents_guardians

- person_id
- relationship data

---

# 73. FAMILY ENTITIES

### families

- id
- family name

### family_members

- family_id
- person_id
- relationship
- primary_contact

### student_guardians

- student_id
- guardian_id
- relationship
- communication permissions

This supports one parent having multiple children.

---

# 74. ACADEMIC ENTITIES

### academic_years

### terms

### classes

### streams

### subjects

### class_subjects

### student_enrolments

### teacher_assignments

### teaching_loads

---

# 75. TIMETABLE ENTITIES

### timetables

### timetable_entries

Fields:

- class
- subject
- teacher
- room
- day
- start
- end
- term

### room_allocations

---

# 75A. SCHOOL CALENDAR ENTITIES

### school_calendars

- id
- school_id
- academic_year_id
- name
- status

### calendar_events

- id
- school_calendar_id
- title
- description
- event_type
- start_datetime
- end_datetime
- all_day
- location
- created_by
- visibility
- recurrence
- status

### calendar_event_targets

- id
- event_id
- target_type
- target_id

### calendar_event_reminders

- id
- event_id
- reminder_type
- scheduled_for
- status

---

# 76. CURRICULUM ENTITIES

### curriculum_frameworks

Examples:

- NCDC
- Cambridge Primary

### curriculum_versions

### curriculum_levels

### curriculum_subjects

### curriculum_strands

### curriculum_topics

### curriculum_objectives

### curriculum_competencies

### curriculum_relationships

Relationships may include:

```text
Objective
   |
   +-- Topic
   +-- Strand
   +-- Subject
   +-- Level
   +-- Framework
```

---

# 77. LESSON ENTITIES

### lessons

- id
- teacher
- class
- subject
- date
- term
- curriculum objective
- topic
- status

### lesson_notes

### lesson_observations

### lesson_reflections

### lesson_resources

### lesson_activity_records

---

# 78. ATTENDANCE ENTITIES

### teacher_attendance

### student_attendance

These must remain separate because they answer different questions.

Student attendance:

- student
- class
- teacher
- timetable entry / lesson reference where applicable
- date
- status
- recorded_by
- recorded_at
- corrected_at
- correction_reason
- correction_by

The student attendance record is a longitudinal school record and must be queryable directly from the student profile.

Teacher attendance:

- employee
- date
- clock_in
- clock_out
- location
- validation result
- source event / JantaHR reference

### lesson completion fields

The lesson entity should also support:

- scheduled_timetable_entry_id
- started_at
- completed_at
- completion_status
- visible_teacher_note
- submitted_by
- submitted_at

---

# 78A. FEES AND PAYMENT IMPORT ENTITIES

### fee_structures

Defines what a student or class owes for an academic year and term.

### student_fee_accounts

Tracks:

- student
- academic year
- term
- assessed amount
- discounts / waivers
- amount paid
- balance
- clearance status

### fee_payments

Stores each recognised payment:

- student
- payment date
- amount
- payment reference
- payment channel
- source
- imported or manually entered flag
- reconciliation status

### fee_payment_imports

Stores the uploaded Excel/CSV file and its processing audit trail:

- file
- uploaded_by
- uploaded_at
- source description
- row count
- matched count
- unmatched count
- duplicate count
- rejected count
- processing status

### fee_payment_import_rows

Stores row level validation and matching results so finance staff can resolve exceptions without losing the source record.

Fields should include:

- import_id
- source_row_number
- raw values / normalised values
- matched student_id where available
- matched payment_id where available
- match status
- validation errors
- duplicate flag
- applied_at

### fee_clearance_records

Stores the student's clearance state for a term or defined school period, including who confirmed the status and when.

The payment import process must not silently overwrite a student's account. It should validate, preview, report exceptions, then apply approved changes inside an auditable transaction.

---

# 79. ASSIGNMENT ENTITIES

### assignments

- lesson_id
- class
- subject
- title
- instructions
- due_date
- resource_id

### assignment_recipients

### submissions

### submission_files

### submission_status

---

# 80. ASSESSMENT ENTITIES

### assessments

### assessment_questions

### assessment_options

### assessment_attempts

### student_answers

### assessment_results

### assessment_competency_links

---

# 81. STUDENT EVIDENCE ENTITIES

### student_evidence

Generic evidence object supporting:

- assessment
- assignment
- photo
- observation
- teacher note
- classroom activity

Fields:

- student
- evidence_type
- source
- date
- lesson
- competency
- attachment
- teacher visibility
- parent visibility

---

# 82. TEACHER VS AI OPINION ENTITIES

### ai_observations

Stores:

- model
- prompt/version
- generated analysis
- confidence metadata where applicable
- timestamp

### teacher_observations

Stores:

- teacher opinion
- edited observation
- final status

### observation_reviews

Possible states:

- agrees
- partially_agrees
- disagrees
- edited
- rejected

The final formal record should clearly identify the human-approved state.

---

# 83. LEARNING PROFILE ENTITIES

### student_competency_progress

- student
- competency
- status
- evidence_count
- last_updated

### student_interventions

- student
- competency
- intervention
- teacher
- date
- result

### student_strengths

### student_support_areas

---

# 84. RESOURCE ENTITIES

### resources

- id
- school
- title
- type
- curriculum
- level
- subject
- topic
- objective
- visibility
- approval_state

### resource_versions

### resource_files

### resource_tags

### resource_usage

### resource_ratings

### resource_reviews

---

# 85. AI ENTITIES

### ai_requests

- id
- school
- user
- task_type
- model
- input_tokens
- cached_tokens
- output_tokens
- cost_estimate
- duration
- status

### ai_outputs

### ai_prompt_versions

### ai_model_configs

### ai_usage_policies

### ai_usage_limits

### ai_failures

---

# 86. AI AUDITABILITY

Every meaningful AI-generated object should be traceable to:

- user
- school
- date
- task
- model
- prompt/template version
- source data
- result
- teacher action

This is important for debugging, quality control and education-sector trust.

---

# 87. AI USAGE MANAGEMENT

## Priority: MUST HAVE

School administrators can select:

### Open

AI available within normal fair-use policies.

### Managed

Usage controls enabled.

Possible controls:

- monthly AI budget
- monthly request allowance
- image generation allowance
- premium model allowance
- per-feature limits

Teachers do not need to see token numbers.

---

# 88. AI COST CONTROL

Before making a new AI request:

1. Check for reusable resource.
2. Check cache.
3. Retrieve only necessary curriculum context.
4. Use lowest-cost suitable model.
5. Avoid unnecessary image generation.
6. Batch compatible operations.
7. Store approved output.
8. Reuse approved material.

---

# 89. CACHING STRATEGY

Cache levels:

### Level 1
Prompt/context caching.

### Level 2
Curriculum retrieval caching.

### Level 3
Resource reuse.

### Level 4
School-specific generated resources.

### Level 5
Common curriculum resources.

A resource that has already been approved should generally be reused or adapted instead of regenerated.

---

# 90. FILE STORAGE

The system will need substantial object storage.

Store:

- student photos
- student work
- PDFs
- report cards
- worksheets
- lesson attachments
- curriculum documents
- resource files

Storage should separate:

**private student data**

from:

**school resources**

and:

**system curriculum assets**

---

# 91. SECURITY ARCHITECTURE

## Priority: MUST HAVE

Core principles:

- tenant isolation
- role-based access control
- least privilege
- row-level security
- encryption
- secure file URLs
- audit logging
- session management
- account recovery
- admin activity logs

---

# 92. DATA VISIBILITY MODEL

Different information has different visibility.

Example:

### Teacher private reflection

Teacher only.

### Student observation

Teacher + authorised academic leadership.

### Parent summary

Parent/guardian + student where appropriate.

### Payroll

Employee + authorised HR/admin.

### Fees

Parent + authorised school staff.

### School-wide analytics

Authorised leadership.

This should be enforced technically.

---

# 93. PARENT DATA RULE

Parents must only see information relating to their authorised children.

A parent with:

- Child A
- Child B

must see both through the same family account.

---

# 94. STUDENT PRIVACY RULE

A student may see:

- own results
- own feedback
- own submissions
- own resources

but not:

- classmates' records
- teacher private notes
- administrative information

---

# 95. SCHOOL DASHBOARD

## Priority: MUST HAVE

Leadership overview:

### People

Students  
Teachers  
Staff

### Finance

Collected  
Outstanding  
Clearance

### Attendance

Today  
Trend  
Classes with concern

### Academics

Class performance  
Subject performance  
Assessment trends

### Teaching

Lessons completed  
Lessons outstanding / partial  
Teacher lesson notes  
Assignments  
Resource reuse

### Student support

Students requiring attention  
Interventions

---

# 96. TEACHER DASHBOARD

This is the most important screen.

Example:

```text
Good morning, Sarah

STAFF ATTENDANCE
[ Clocked in 07:41 ]

TODAY

P5 Mathematics
08:00
24 students

P5 English
09:00
24 students

P5 Science
11:00
24 students

--------------------------------

CURRENT CLASS

[Mark Attendance]

All present
[Mark all present]

--------------------------------

LESSON

P5 Mathematics | Fractions

[ Confirm Lesson Completed ]

Lesson note
[ Speak ] [ Type ]

[ Submit Lesson ]

--------------------------------

AFTER SUBMISSION

Lesson recorded.

Next actions:

[ Create Homework ]
[ Create Worksheet ]
[ Create Quiz ]
[ Add Observations ]

--------------------------------

STUDENTS TO WATCH

3 students may need additional support.

[ View ]
```

This is the design direction.

---

# 97. TEACHER WORKFLOW — IDEAL DAILY LOOP

```text
Open SomaCampus
      ↓
Clock in for the school day
      ↓
See today's timetable
      ↓
Open current class
      ↓
Mark student attendance in bulk
      ↓
Teach
      ↓
Confirm lesson completed
      ↓
Speak/type visible lesson note
      ↓
Submit lesson
      ↓
Optional homework / worksheet / quiz
      ↓
Students complete work
      ↓
Teacher photographs/uploads work
      ↓
System prepares draft evidence
      ↓
Teacher reviews/amends
      ↓
Approved evidence enters learner profile
      ↓
AI identifies useful patterns
      ↓
Teacher sees "What next?"
```

The teacher should not feel like they are performing administrative data entry throughout this loop.

---

# 98. PARENT DAILY/WEEKLY LOOP

```text
Parent receives update
      ↓
See fees / attendance / homework
      ↓
See child's recent work
      ↓
Complete parent-child activity
      ↓
Child submits activity
      ↓
Teacher sees evidence
```

---

# 99. SCHOOL LEADERSHIP LOOP

```text
School dashboard
      ↓
See staff clock in / student attendance / fees / academics
      ↓
See which scheduled lessons are complete, partial, or outstanding
      ↓
Read teacher lesson notes
      ↓
Identify concern
      ↓
Inspect class/student evidence
      ↓
Compare system analysis with teacher observation
      ↓
Take action
```

---

# 100. MODULE PRIORITY SUMMARY

## MUST HAVE

### School foundation
- organisation
- school
- users
- roles
- permissions
- school configuration

### Students
- admissions
- student records
- families
- parent relationships
- enrolment

### Academic
- academic years
- terms
- classes
- streams
- subjects
- teacher assignments
- **timetable**
- **school calendar & events**
- lessons
- attendance
- assignments
- submissions
- gradebook
- report cards

### Finance
- fees
- balances
- payments
- clearance

### HR
- full JantaHR functionality reused

### Operations
- inventory
- assets

### Teacher tools
- bulk actions
- classroom evidence
- private reflection
- voice entry
- photo capture
- student work upload

### AI
- lesson structuring
- homework drafting
- worksheet drafting
- quiz drafting
- student-work extraction
- quiz analytics
- parent summaries
- resource classification
- curriculum grounding
- AI gateway

### Resources
- resource library
- versioning
- approval
- reuse
- adaptation

### Parents
- portal
- fees
- attendance
- assignments
- work
- feedback

---

# 101. SHOULD HAVE

- optional academic leadership roles / permission bundles
- mastery map
- intervention builder
- next-lesson recommendations
- parent-child activities
- weekly learning digest
- substitute management
- exam management
- school AI assistant
- resource ratings
- AI quality dashboards
- advanced analytics
- multi-level differentiation
- image-rich worksheet generation
- curriculum authoring/validation tools

---

# 102. LATER

- student AI study assistant for 16+
- transport
- library
- boarding
- alumni
- advanced AI teacher coaching
- multilingual expansion beyond initial English support
- Swahili
- French
- additional African curricula
- broader country deployments
- predictive school analytics
- advanced timetable optimisation
- external education integrations

---

# 103. MULTILINGUAL ARCHITECTURE

Not a current product priority.

But the architecture must support language metadata from day one.

Example:

```text
Resource
   |
   +-- language = English
```

Future:

```text
Resource
   |
   +-- English
   +-- Swahili
   +-- French
```

Priority expansion:

1. English
2. Swahili
3. French
4. additional local languages based on market

Swahili is especially relevant for Tanzania/Kenya and future regional expansion.

---

# 104. COUNTRY EXPANSION MODEL

The platform should separate:

### Core application

Same globally.

### Country / curriculum pack

Contains:

- curriculum
- grading conventions
- academic structures
- fee/payment integrations
- reporting requirements
- terminology
- communication integrations
- local settings

Only the curriculum/country pack required by the target school needs to be activated in a deployment. Multiple packs may exist in the platform architecture, but the first production implementation should validate one pack before adding another.

### Example

```text
SomaCampus Core
       |
       +-- Uganda Pack
       |      +-- NCDC
       |      +-- Uganda settings
       |
       +-- Cambridge Pack
       |
       +-- Kenya Pack
       |
       +-- Tanzania Pack
       |
       +-- Rwanda Pack
```

---

# 105. WHAT SHOULD NOT BE BUILT INTO THE CORE

Avoid making the platform depend directly on:

- Uganda-specific class naming
- Uganda-specific grading logic
- NCDC-only data structures
- one payment provider
- one AI provider
- one school type

Those belong in configurable modules.

**Also explicitly out of scope:** a teacher staffing marketplace, matching schools with on-demand or freelance teachers. This was considered alongside SomaCampus and deliberately kept separate, as a possible later, standalone product with a different buyer and business model, not a SomaCampus feature (see section 1A).

---

# 106. APPROVAL WORKFLOWS

Not everything needs approval.

## Teacher can do independently

- attendance
- lesson submission
- homework creation
- worksheet creation
- quiz creation
- student evidence draft review
- ordinary resource creation

## Optional school approval

- school-wide publication
- official exam
- official report card
- curriculum resource approval
- large parent broadcast

This prevents unnecessary management bottlenecks.

---

# 107. AI HUMAN-IN-THE-LOOP RULE

For educational evidence:

```text
AI drafts
   ↓
Teacher reviews
   ↓
Teacher edits / accepts / rejects
   ↓
Human-approved record
```

Never:

```text
AI
 ↓
Official permanent student judgment
```

without human review.

---

# 108. AI RESOURCE GENERATION RULE

Before generation:

```text
Search resource library
       ↓
Suitable resource?
   YES ↓
Reuse
       ↓
Need changes?
       ↓
Adapt
```

Only generate from scratch when necessary.

---

# 109. AI CONTEXT STACK

Every teacher AI request receives context automatically.

Example:

```text
Global SomaCampus rules
        ↓
School policies
        ↓
Curriculum framework
        ↓
Academic year
        ↓
Term
        ↓
Class
        ↓
Subject
        ↓
Current curriculum objective
        ↓
Lesson history
        ↓
Approved resources
        ↓
Teacher's input
```

Teacher sees only the simple action.

---

# 110. DATABASE RELATIONSHIP OVERVIEW

```text
SCHOOL
 |
 +-- USERS
 |
 +-- EMPLOYEES
 |     |
 |     +-- JantaHR / Payroll
 |
 +-- STUDENTS
 |     |
 |     +-- ENROLMENTS
 |     +-- PARENTS
 |     +-- LEARNING PROFILE
 |     +-- EVIDENCE
 |     +-- ATTENDANCE
 |
 +-- ACADEMIC
 |     |
 |     +-- CLASSES
 |     +-- SUBJECTS
 |     +-- TIMETABLE
 |     +-- SCHOOL CALENDAR
 |     +-- LESSONS
 |     +-- ASSIGNMENTS
 |     +-- ASSESSMENTS
 |
 +-- CURRICULUM
 |
 +-- RESOURCES
 |
 +-- FEES
 |
 +-- INVENTORY
 |
 +-- ASSETS
 |
 +-- AI
```

---

# 111. MVP DEFINITION

The first production release should not attempt to build the whole roadmap.

The MVP should be the smallest product that demonstrates the central SomaCampus thesis.

## MVP

### Foundation

- school
- users
- roles
- permissions
- students
- parents/families
- classes
- streams
- subjects
- academic years
- terms
- **school calendar & events**

### Teacher

- teacher dashboard
- **timetable**
- morning staff clock in
- student attendance
- lessons and lesson completion
- visible lesson notes
- voice/text lesson capture
- classroom evidence
- private reflection

### Academic

- timetable
- school calendar & events
- lesson records and completion monitoring
- assignments
- submissions
- gradebook
- report cards
- basic reports

### AI

- lesson structuring
- homework
- worksheet
- quiz
- student-work photo analysis
- quiz analytics

### Resources

- resource library
- reuse
- adaptation

### Parent

- fees
- payment and clearance status
- attendance
- assignments
- work
- feedback

### HR

- JantaHR reuse

### Operations

- inventory
- assets

### Curriculum

- curriculum abstraction
- **one activated curriculum pack for the first deployment**
- curriculum versioning

---

# 112. FIRST VERTICAL SLICE

Before building every module, prove this workflow end to end:

```text
School creates P5 Science
        ↓
Teacher clocks in
        ↓
Teacher opens the scheduled P5 Science lesson
        ↓
Marks class attendance in one action
        ↓
Attendance is saved to every student profile
        ↓
Teaches lesson
        ↓
Confirms lesson completed
        ↓
Speaks/types visible lesson note
        ↓
Lesson record becomes visible to authorised leadership
        ↓
Lesson is structured automatically where AI assistance is useful
        ↓
Teacher submits
        ↓
"Create Homework"
        ↓
Existing P5 Science resources checked
        ↓
If none suitable → AI creates draft
        ↓
Teacher reviews
        ↓
Homework assigned
        ↓
Students submit
        ↓
Teacher photographs work
        ↓
AI prepares draft observation
        ↓
Teacher edits/approves
        ↓
Student profile updated
        ↓
Quiz results analysed
        ↓
Teacher sees recommended next steps
        ↓
Parent receives learning summary

Finance reconciliation slice:

```text
School receives its normal telco / bank payment data
        ↓
Accounts uploads Excel/CSV
        ↓
SomaCampus validates and previews rows
        ↓
Match payments to student accounts
        ↓
Flag unmatched / duplicate rows
        ↓
Apply approved payments
        ↓
Balances and clearance status update
        ↓
Audit record retained
```

If the teaching slice and finance reconciliation slice work beautifully, we have the core school operating product.

---

# 113. SUCCESS METRICS

The most important KPI should not be:

**Number of AI generations.**

Instead:

### Teacher time saved

How much preparation/admin time is reduced?

### Teacher adoption

How many lessons are recorded digitally?

### Evidence capture

How many pieces of meaningful student evidence enter the system?

### Resource reuse

What percentage of content is reused rather than regenerated?

### Teacher correction rate

How often does AI require substantial editing?

### Student engagement

Assignment completion and quiz participation.

### Parent engagement

Parent portal/activity usage.

### Learning interventions

How many identified support needs receive follow-up?

---

# 114. THE ULTIMATE DATA LOOP

The product's long-term architecture should create this:

```text
Teacher Clock In
     ↓
Timetable
     ↓
Student Attendance
     ↓
Lesson Completed
     ↓
Lesson Note
     ↓
Teaching
     ↓
Assignment
     ↓
Student Work
     ↓
Assessment
     ↓
Teacher Observation
     ↓
AI Analysis
     ↓
Learning Profile
     ↓
Intervention
     ↓
Next Lesson
     ↓
Parent Engagement
     ↓
New Evidence
```

That is the core SomaCampus intellectual property.

---

# 115. PRODUCT MOAT

The moat is not:

> "SomaCampus uses AI."

The moat becomes:

> **SomaCampus understands the relationship between curriculum, teaching, learner evidence, teacher judgment and school operations.**

Over time the platform knows:

- what was taught
- when it was taught
- what was assigned
- what students produced
- what the teacher observed
- how students performed
- what interventions occurred
- what improved
- which resources worked
- what the next teacher should know

That is substantially harder to recreate than an AI worksheet generator.

---

# 116. FINAL PRODUCT STRUCTURE

## SOMACAMPUS

### School Administration
- school setup
- users
- roles
- settings

### Students & Families
- admissions
- student records
- families
- parents
- student portal

### Academics
- curriculum
- classes
- subjects
- timetable
- school calendar & events
- lessons
- assignments
- assessments
- gradebook
- report cards

### Teacher Workspace
- daily teaching
- attendance
- classroom evidence
- student work
- teacher reflection
- HR

### Learning Intelligence
- learner profiles
- evidence
- competency progress
- interventions
- analysis

### Teacher Assistance
- lesson capture
- homework
- worksheets
- quizzes
- resource reuse
- next steps

### Parent Engagement
- fees
- attendance
- learning
- homework
- child work
- parent-child activities

### Finance
- fee structures
- student fee accounts
- payment records
- Excel/CSV payment imports
- reconciliation
- balances
- clearance
- receipts

### People
- JantaHR
- payroll
- employee attendance
- leave

### Operations
- inventory
- assets

### Resources
- curriculum resources
- school resources
- teacher resources
- versioning
- reuse

### AI Platform
- AI gateway
- text
- vision
- voice
- analysis
- retrieval
- caching
- cost management
- audit

---

# 117. PRODUCT NORTH STAR

The final product should make the following possible:

> **A teacher can walk into class with nothing more than a phone, teach normally, speak or photograph what happened, and SomaCampus quietly turns those everyday activities into organised school records, useful teaching materials, meaningful learner evidence, and better next-step decisions.**

The teacher spends less time doing administration.

The teacher spends more time:

**teaching**

**observing**

**helping individual children**

**and improving learning.**

That is what SomaCampus should be.