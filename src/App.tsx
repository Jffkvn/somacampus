import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { TeacherTodayPage } from './modules/teacher/TeacherTodayPage';
import { SchoolDashboardPage } from './modules/leadership/SchoolDashboardPage';
import { LiveLessonsMonitorPage } from './modules/leadership/LiveLessonsMonitorPage';
import { FeesPage } from './modules/fees/FeesPage';
import { ModulePlaceholder } from './components/ui/ModulePlaceholder';
import { LoginPage } from './modules/auth/LoginPage';
import { LessonCockpitPage } from './modules/teaching/LessonCockpitPage';
import { StudentDirectoryPage } from './modules/students/StudentDirectoryPage';
import { StudentDetailPage } from './modules/students/StudentDetailPage';
import { AssignmentsListPage } from './modules/teaching/AssignmentsListPage';
import { AssignmentCreatePage } from './modules/teaching/AssignmentCreatePage';
import { AssignmentReviewPage } from './modules/teaching/AssignmentReviewPage';
import { CurriculumExplorerPage } from './modules/curriculum/CurriculumExplorerPage';
import { SchemesOfWorkPage } from './modules/planning/SchemesOfWorkPage';
import { SchemeDetailPage } from './modules/planning/SchemeDetailPage';
import { PayrollDashboardPage } from './modules/payroll/PayrollDashboardPage';
import { MyHRPage } from './modules/hr/MyHRPage';
import { ActivitiesPage } from './modules/activities/ActivitiesPage';
import { AnnouncementsPage } from './modules/communication/AnnouncementsPage';
import { MessagesPage } from './modules/communication/MessagesPage';
import { NotificationPreferencesPage } from './modules/notifications/NotificationPreferencesPage';
import { ParentHomePage } from './modules/parent/ParentHomePage';
import { SchoolCalendarPage } from './modules/calendar/SchoolCalendarPage';
import { ExpensesPage } from './modules/expenses/ExpensesPage';
import { AuthProvider, useAuth } from './lib/authContext';
import { LoadingState } from './components/ui/LoadingState';
import { canAccessPath } from './lib/teacherPrivacy';
import { getRoleLandingRoute } from './config/permissions';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#002b36]">
        <LoadingState label="Verifying institutional session..." className="text-white bg-transparent border-0" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

/**
 * D11: role gate for money/leadership routes. The sidebar hides these links
 * by role, but direct-URL navigation bypasses the sidebar — without this,
 * a teacher could type /fees, /expenses, /payroll or /dashboard/school and
 * read institutional cash, payroll and fee ledgers. Denied roles fall back
 * to their own landing route. Academic + self-service HR paths stay open.
 */
// Exported for the router-level gate tests (teacher-privacy.test.tsx);
// behavior unchanged.
export const RequireAccess: React.FC<{ path: string; children: React.ReactNode }> = ({ path, children }) => {
  const { role } = useAuth();
  if (!canAccessPath(role, path)) {
    return <Navigate to={getRoleLandingRoute(role)} replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Application Workspace */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            {/* Default landing redirects to Teacher Today */}
            <Route index element={<Navigate to="/teacher/today" replace />} />

            {/* Core Phase 1 Established Domains */}
            <Route path="teacher/today" element={<TeacherTodayPage />} />
            <Route path="dashboard/school" element={<RequireAccess path="/dashboard/school"><SchoolDashboardPage /></RequireAccess>} />
            <Route path="fees" element={<RequireAccess path="/fees"><FeesPage /></RequireAccess>} />

          {/* Teacher Secondary Routes */}
          <Route
            path="teacher/classes"
            element={
              <ModulePlaceholder
                title="Assigned Classes"
                moduleName="Teacher Workspace"
                description="View assigned class rosters, curriculum progress, and subject allocations."
                scheduledPhase="Backlog (deferred past Phase 2)"
              />
            }
          />
          <Route
            path="teacher/timetable"
            element={
              <ModulePlaceholder
                title="Teacher Weekly Timetable"
                moduleName="Schedule & Context"
                description="Full weekly recurring timetable schedule and classroom allocations."
                scheduledPhase="Backlog (deferred past Phase 2)"
              />
            }
          />

          {/* Teaching Slice Routes */}
          <Route path="teaching/lessons" element={<LiveLessonsMonitorPage />} />
          <Route
            path="teaching/classes/:classId/lessons/:lessonId"
            element={<LessonCockpitPage />}
          />
          <Route
            path="teaching/classes/:classId/attendance"
            element={
              <ModulePlaceholder
                title="Fast Bulk Attendance Register"
                moduleName="Attendance Engine"
                description="Mark all present in one click, adjust exceptions, and persist to student longitudinal records."
                scheduledPhase="Backlog (deferred past Phase 2)"
              />
            }
          />
          <Route path="teaching/assignments" element={<AssignmentsListPage />} />
          <Route path="teaching/assignments/new" element={<AssignmentCreatePage />} />
          <Route path="teaching/assignments/:assignmentId" element={<AssignmentReviewPage />} />
          <Route
            path="teaching/worksheets"
            element={
              <ModulePlaceholder
                title="Worksheets & Accessibility Formats"
                moduleName="Teaching Loop"
                description="Curriculum-aligned worksheets with plain-text and audio accessibility outputs."
                scheduledPhase="Phase 5 (Teaching Acceleration)"
              />
            }
          />
          <Route
            path="teaching/quizzes"
            element={
              <ModulePlaceholder
                title="Diagnostic Quizzes"
                moduleName="Teaching Loop"
                description="Interactive student quizzes feeding the diagnostic learning profile."
                scheduledPhase="Phase 5 (Teaching Acceleration)"
              />
            }
          />
          <Route
            path="teaching/resources"
            element={
              <ModulePlaceholder
                title="Approved Resource Library"
                moduleName="Resources Engine"
                description="Search, reuse, and adapt approved curriculum and school materials."
                scheduledPhase="Phase 5 (Teaching Acceleration)"
              />
            }
          />

          {/* Students & Learning Routes */}
          <Route path="students" element={<StudentDirectoryPage />} />
          <Route path="students/:studentId" element={<StudentDetailPage />} />
          <Route
            path="students/attendance"
            element={
              <ModulePlaceholder
                title="School-wide Attendance History"
                moduleName="Attendance Engine"
                description="Longitudinal student attendance records, trends, and audited corrections."
                scheduledPhase="Phase 4 (Student Profile & Evidence)"
              />
            }
          />

          {/* Academics & Schedule Routes */}
          {/* Phase 6 Curriculum Engine & Academic Planning */}
          <Route path="curriculum" element={<CurriculumExplorerPage />} />
          <Route path="curriculum/:frameworkCode" element={<CurriculumExplorerPage />} />
          <Route path="planning/schemes" element={<SchemesOfWorkPage />} />
          <Route path="planning/schemes/:schemeId" element={<SchemeDetailPage />} />
          <Route path="activities" element={<ActivitiesPage />} />

          <Route
            path="timetable"
            element={
              <ModulePlaceholder
                title="School Master Timetable"
                moduleName="Schedule & Context"
                description="School-wide recurring schedule, room allocations, and conflict detection."
                scheduledPhase="Backlog (deferred past Phase 2)"
              />
            }
          />
          {/* Phase 8E Task 1: read-only audience-filtered view (RequireAccess
              keeps the route-gate pattern; teacherPrivacy default-allows this
              path and the service + RLS arbitrate the rows). */}
          <Route path="calendar" element={<RequireAccess path="/calendar"><SchoolCalendarPage /></RequireAccess>} />
          <Route
            path="classes"
            element={
              <ModulePlaceholder
                title="Classes & Streams"
                moduleName="Academics"
                description="Stage classes, streams, room assignments, and student enrolment capacities."
                scheduledPhase="Backlog (deferred past Phase 2)"
              />
            }
          />

          {/* Finance Routes */}
          <Route path="expenses" element={<RequireAccess path="/expenses"><ExpensesPage /></RequireAccess>} />
          <Route path="payroll" element={<RequireAccess path="/payroll"><PayrollDashboardPage /></RequireAccess>} />
          <Route
            path="fees/import"
            element={
              <RequireAccess path="/fees/import">
              <ModulePlaceholder
                title="Payment Statement Import & Reconciliation"
                moduleName="Finance & Reconciliation"
                description="Excel/CSV statement upload, deterministic admission number matching, and exception resolution."
                scheduledPhase="Backlog (Phase 6 scope, unbuilt)"
              />
              </RequireAccess>
            }
          />

          {/* Staff & HR Portal Submenu Routes (Native submenus, no OneHub tabs) */}
          <Route path="people/hr" element={<Navigate to="/people/hr/leave" replace />} />
          <Route path="people/hr/leave" element={<MyHRPage section="leave" />} />
          <Route path="people/hr/advances" element={<MyHRPage section="advances" />} />
          <Route path="people/hr/payslips" element={<MyHRPage section="payslips" />} />

          {/* Parent & Student Portal Routes */}
          <Route
            path="parent/home"
            element={
              <RequireAccess path="/parent/home">
                <ParentHomePage />
              </RequireAccess>
            }
          />
          <Route
            path="student/home"
            element={
              <ModulePlaceholder
                title="Student Learning Cockpit"
                moduleName="Student Experience"
                description="Access diagnostic quizzes, classroom worksheets, and learning objectives."
                scheduledPhase="Phase 5 (Teaching Acceleration)"
              />
            }
          />

          {/* Communication Routes */}
          <Route path="communication/announcements" element={<AnnouncementsPage />} />
          {/* Phase 8D messaging: parent-teacher threads; participation + RLS
              is the data arbiter, RequireAccess keeps the route-gate pattern
              consistent with the notifications route. */}
          <Route path="communication/messages" element={<RequireAccess path="/communication/messages"><MessagesPage /></RequireAccess>} />
          {/* Phase 8C notifications: self-scoped preferences, open to all
              authenticated roles (canAccessPath default-allows unlisted paths;
              RLS + service scoping is the data arbiter). The feed itself lives
              in the TopHeader bell dropdown — no feed route. */}
          <Route path="notifications/preferences" element={<RequireAccess path="/notifications/preferences"><NotificationPreferencesPage /></RequireAccess>} />

          {/* Administration Routes */}
          <Route
            path="admin/overview"
            element={
              <RequireAccess path="/admin/overview">
              <ModulePlaceholder
                title="School Administration & Setup"
                moduleName="Administration"
                description="School settings, curriculum framework configuration, academic terms, and grading rules."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
              </RequireAccess>
            }
          />
          <Route path="administration/hr" element={<MyHRPage />} />
          <Route path="administration/payroll" element={<RequireAccess path="/administration/payroll"><PayrollDashboardPage /></RequireAccess>} />
          <Route
            path="administration/inventory"
            element={
              <RequireAccess path="/administration/inventory">
              <ModulePlaceholder
                title="Warehouse, Inventory & Assets"
                moduleName="Operational Systems"
                description="Textbooks, lab equipment, stationery consumables, and asset custody tracking."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
              </RequireAccess>
            }
          />
          <Route
            path="administration/audit"
            element={
              <RequireAccess path="/administration/audit">
              <ModulePlaceholder
                title="System Audit Trail"
                moduleName="Administration"
                description="Immutable audit log of all financial, attendance, and administrative modifications."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
              </RequireAccess>
            }
          />

          {/* Fallback 404 handler */}
          <Route path="*" element={<Navigate to="/teacher/today" replace />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
