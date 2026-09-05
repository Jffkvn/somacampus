# Phase 8E: School Calendar — Implementation Plan (as built)

> Status: implemented, merged, live-validated 2026-09-05.

**Goal:** Audience-filtered school calendar view for staff, parents, and students.

**Architecture:** `calendarService` audience matrix (school→related, teachers→staff, parents→guardians, students→enrolled, class→scoped, fail-closed) + `SchoolCalendarPage` (grouped by date) + `/calendar` route + parent nav item. No migrations for the page itself.

**Live catch fixed in-batch:** probe showed parents could read `teachers`-audience events via direct API (old `USING(true)` policy made app filtering decorative). Fixed with migration `20260913000007_calendar_audience_rls.sql`, re-proven across three personas (Florence hidden / Sarah sees / Amari hidden, school events visible to all), cleaned.

**What was built:** `calendarService.ts`, `SchoolCalendarPage.tsx`, `calendar-service.test.ts`, parent nav entry, student class resolver fix.
