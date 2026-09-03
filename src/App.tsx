import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { TeacherTodayPage } from './modules/teacher/TeacherTodayPage';
import { SchoolDashboardPage } from './modules/leadership/SchoolDashboardPage';
import { FeesPage } from './modules/fees/FeesPage';
import { ModulePlaceholder } from './components/ui/ModulePlaceholder';
import { LoginPage } from './modules/auth/LoginPage';
import { AuthProvider, useAuth } from './lib/authContext';
import { LoadingState } from './components/ui/LoadingState';

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
            <Route path="dashboard/school" element={<SchoolDashboardPage />} />
            <Route path="fees" element={<FeesPage />} />

          {/* Teacher Secondary Routes */}
          <Route
            path="teacher/classes"
            element={
              <ModulePlaceholder
                title="Assigned Classes"
                moduleName="Teacher Workspace"
                description="View assigned class rosters, curriculum progress, and subject allocations."
                scheduledPhase="Phase 2 (Teacher Daily Slice)"
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
                scheduledPhase="Phase 2 (Teacher Daily Slice)"
              />
            }
          />

          {/* Teaching Slice Routes */}
          <Route
            path="teaching/lessons"
            element={
              <ModulePlaceholder
                title="Live Lessons Monitor"
                moduleName="Academics"
                description="Live teaching monitor showing scheduled, active, and completed class periods."
                scheduledPhase="Phase 3 (Leadership Monitoring)"
              />
            }
          />
          <Route
            path="teaching/classes/:classId/lessons/:lessonId"
            element={
              <ModulePlaceholder
                title="Active Lesson Cockpit"
                moduleName="Teaching Loop"
                description="Lesson delivery, teaching notes, student attendance linkage, and completion submission."
                scheduledPhase="Phase 2 (Teacher Daily Slice)"
              />
            }
          />
          <Route
            path="teaching/classes/:classId/attendance"
            element={
              <ModulePlaceholder
                title="Fast Bulk Attendance Register"
                moduleName="Attendance Engine"
                description="Mark all present in one click, adjust exceptions, and persist to student longitudinal records."
                scheduledPhase="Phase 2 (Teacher Daily Slice)"
              />
            }
          />
          <Route
            path="teaching/assignments"
            element={
              <ModulePlaceholder
                title="Homework & Assignments"
                moduleName="Teaching Loop"
                description="Create and assign homework linked directly to completed lessons."
                scheduledPhase="Phase 5 (Teaching Acceleration)"
              />
            }
          />
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
          <Route
            path="students"
            element={
              <ModulePlaceholder
                title="Student Directory"
                moduleName="Students"
                description="Enrolled student directory with academic, attendance, and family filters."
                scheduledPhase="Phase 4 (Student Profile & Evidence)"
              />
            }
          />
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
          <Route
            path="timetable"
            element={
              <ModulePlaceholder
                title="School Master Timetable"
                moduleName="Schedule & Context"
                description="School-wide recurring schedule, room allocations, and conflict detection."
                scheduledPhase="Phase 2 (Teacher Daily Slice)"
              />
            }
          />
          <Route
            path="calendar"
            element={
              <ModulePlaceholder
                title="School Calendar & Events"
                moduleName="Calendar Engine"
                description="Whole-school and targeted events: Sports Day, exams, meetings, and term dates."
                scheduledPhase="Phase 2 (Teacher Daily Slice)"
              />
            }
          />
          <Route
            path="classes"
            element={
              <ModulePlaceholder
                title="Classes & Streams"
                moduleName="Academics"
                description="Stage classes, streams, room assignments, and student enrolment capacities."
                scheduledPhase="Phase 2 (Teacher Daily Slice)"
              />
            }
          />

          {/* Finance Routes */}
          <Route
            path="fees/import"
            element={
              <ModulePlaceholder
                title="Payment Statement Import & Reconciliation"
                moduleName="Finance & Reconciliation"
                description="Excel/CSV statement upload, deterministic admission number matching, and exception resolution."
                scheduledPhase="Phase 6 (Finance & Reconciliation)"
              />
            }
          />

          {/* Parent & Student Portal Routes */}
          <Route
            path="parent/home"
            element={
              <ModulePlaceholder
                title="Family Portal & Child Progress"
                moduleName="Parent Portal"
                description="Monitor children learning progress, attendance records, and fee payment clearance."
                scheduledPhase="Phase 4 (Student Profile & Evidence)"
              />
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
          <Route
            path="communication/announcements"
            element={
              <ModulePlaceholder
                title="Announcements & Broadcasts"
                moduleName="Communication"
                description="Targeted school announcements for staff, parents, and classes."
                scheduledPhase="Phase 5 (Teaching Acceleration)"
              />
            }
          />

          {/* Administration Routes */}
          <Route
            path="admin/overview"
            element={
              <ModulePlaceholder
                title="School Administration & Setup"
                moduleName="Administration"
                description="School settings, curriculum framework configuration, academic terms, and grading rules."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
            }
          />
          <Route
            path="administration/hr"
            element={
              <ModulePlaceholder
                title="Staff Directory & HR Workflows"
                moduleName="Operational Systems"
                description="Staff profiles, leave requests, advances, and employment records (JantaHR proven logic)."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
            }
          />
          <Route
            path="administration/payroll"
            element={
              <ModulePlaceholder
                title="Payroll Computation Engine"
                moduleName="Operational Systems"
                description="Salary calculation, statutory PAYE/NSSF deductions, and payslip generation."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
            }
          />
          <Route
            path="administration/inventory"
            element={
              <ModulePlaceholder
                title="Warehouse, Inventory & Assets"
                moduleName="Operational Systems"
                description="Textbooks, lab equipment, stationery consumables, and asset custody tracking."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
            }
          />
          <Route
            path="administration/audit"
            element={
              <ModulePlaceholder
                title="System Audit Trail"
                moduleName="Administration"
                description="Immutable audit log of all financial, attendance, and administrative modifications."
                scheduledPhase="Phase 7 (Operational Systems)"
              />
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
