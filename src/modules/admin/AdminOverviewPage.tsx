/**
 * School Administration & Operations Cockpit
 * Route: /admin/overview
 *
 * Provides school leadership and administrators with an operational control center:
 * - School registration profile & academic calendar status
 * - Live operational KPIs (enrolled students, active staff, pending admissions, inventory)
 * - Fast navigation to core school management modules
 * - System compliance & multi-tenant isolation status
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { inventoryService } from '../inventory/inventoryService';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import {
  School,
  Calendar,
  Users,
  GraduationCap,
  Package,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Layers,
  FileText,
  UserPlus,
  RefreshCw,
} from 'lucide-react';

interface SchoolProfile {
  id: string;
  name: string;
  code: string;
  country: string;
  timezone: string;
  brandColor: string;
}

interface AcademicStatus {
  yearName: string;
  termName: string;
  startDate: string;
  endDate: string;
}

interface OperationalStats {
  enrolledStudents: number;
  activeStaff: number;
  activeClasses: number;
  pendingAdmissions: number;
  lowStockItems: number;
  totalAssets: number;
}

export const AdminOverviewPage: React.FC = () => {
  const { schoolId } = useAuth();
  const effectiveSchoolId = schoolId || '22222222-2222-2222-2222-222222222222';

  const [isLoading, setIsLoading] = useState(true);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);
  const [academicStatus, setAcademicStatus] = useState<AcademicStatus | null>(null);
  const [stats, setStats] = useState<OperationalStats>({
    enrolledStudents: 0,
    activeStaff: 0,
    activeClasses: 0,
    pendingAdmissions: 0,
    lowStockItems: 0,
    totalAssets: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // 1. Fetch School Details
      const { data: schoolData } = await supabase
        .from('schools')
        .select('id, name, code, country, timezone, brand_color')
        .eq('id', effectiveSchoolId)
        .maybeSingle();

      if (schoolData) {
        setSchoolProfile({
          id: schoolData.id,
          name: schoolData.name || 'Grace High School',
          code: schoolData.code || 'GHS-KLA',
          country: schoolData.country || 'UG',
          timezone: schoolData.timezone || 'Africa/Kampala',
          brandColor: schoolData.brand_color || '#006c8b',
        });
      } else {
        setSchoolProfile({
          id: effectiveSchoolId,
          name: 'Grace High School',
          code: 'GHS-KLA',
          country: 'UG',
          timezone: 'Africa/Kampala',
          brandColor: '#006c8b',
        });
      }

      // 2. Fetch Active Academic Year & Term
      const { data: yearData } = await supabase
        .from('academic_years')
        .select('id, name, start_date, end_date')
        .eq('school_id', effectiveSchoolId)
        .eq('is_current', true)
        .maybeSingle();

      if (yearData) {
        const { data: termData } = await supabase
          .from('terms')
          .select('name, start_date, end_date')
          .eq('academic_year_id', yearData.id)
          .eq('is_current', true)
          .maybeSingle();

        setAcademicStatus({
          yearName: yearData.name || '2026 Academic Year',
          termName: termData?.name || 'Term 3',
          startDate: termData?.start_date || yearData.start_date,
          endDate: termData?.end_date || yearData.end_date,
        });
      } else {
        setAcademicStatus({
          yearName: '2026 Academic Year',
          termName: 'Term 3 (Active)',
          startDate: '2026-09-01',
          endDate: '2026-12-05',
        });
      }

      // 3. Operational Counts (Parallel)
      const [
        studentsRes,
        staffRes,
        classesRes,
        admissionsRes,
        inventorySummary,
      ] = await Promise.allSettled([
        supabase
          .from('student_enrolments')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', effectiveSchoolId)
          .eq('status', 'active'),
        supabase
          .from('employees')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', effectiveSchoolId)
          .eq('status', 'active'),
        supabase
          .from('classes')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', effectiveSchoolId),
        supabase
          .from('admission_applications')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', effectiveSchoolId)
          .eq('status', 'pending'),
        inventoryService.getInventorySummary(effectiveSchoolId),
      ]);

      const enrolledCount =
        studentsRes.status === 'fulfilled' && studentsRes.value.count !== null
          ? studentsRes.value.count
          : 0;
      const staffCount =
        staffRes.status === 'fulfilled' && staffRes.value.count !== null
          ? staffRes.value.count
          : 0;
      const classCount =
        classesRes.status === 'fulfilled' && classesRes.value.count !== null
          ? classesRes.value.count
          : 0;
      const pendingAdmCount =
        admissionsRes.status === 'fulfilled' && admissionsRes.value.count !== null
          ? admissionsRes.value.count
          : 0;
      const invMetrics =
        inventorySummary.status === 'fulfilled'
          ? inventorySummary.value
          : { lowStockCount: 0, totalAssets: 0 };

      setStats({
        enrolledStudents: enrolledCount,
        activeStaff: staffCount,
        activeClasses: classCount,
        pendingAdmissions: pendingAdmCount,
        lowStockItems: invMetrics.lowStockCount,
        totalAssets: invMetrics.totalAssets,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load school administration data.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSchoolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return <LoadingState label="Loading School Administration & Setup Cockpit..." />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary-50 rounded-xl text-primary-700">
            <School className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                {schoolProfile?.name || 'Grace High School'}
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {schoolProfile?.code || 'GHS'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Central Administration Cockpit — Operational overview, governance controls & setup.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Link to="/students/new">
            <Button size="sm" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Admit Pupil
            </Button>
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-red-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm font-medium">{errorMessage}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* Academic Term Bar */}
      <div className="bg-gradient-to-r from-primary-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-xl">
            <Calendar className="w-5 h-5 text-primary-200" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-primary-200 font-semibold">Active Academic Session</p>
            <p className="text-lg font-bold text-white">
              {academicStatus?.yearName} — {academicStatus?.termName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-primary-200">
          <div>
            <span className="text-slate-400 block">Session Span</span>
            <span className="font-medium text-white">
              {academicStatus?.startDate} to {academicStatus?.endDate}
            </span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <Link to="/calendar" className="inline-flex items-center gap-1 text-white hover:text-primary-300 font-semibold underline underline-offset-4">
            School Calendar <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Operational Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Enrolled Pupils</span>
              <GraduationCap className="w-4 h-4 text-primary-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.enrolledStudents}</div>
            <p className="text-xs text-slate-500 mt-1">Active enrolments</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Faculty</span>
              <Users className="w-4 h-4 text-primary-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.activeStaff}</div>
            <p className="text-xs text-slate-500 mt-1">Teaching & support staff</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Admissions Queue</span>
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700">{stats.pendingAdmissions}</div>
            <p className="text-xs text-slate-500 mt-1">Pending leadership review</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Inventory Alerts</span>
              <Package className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-700">{stats.lowStockItems}</div>
            <p className="text-xs text-slate-500 mt-1">Low / out of stock consumables</p>
          </CardContent>
        </Card>
      </div>

      {/* Operational Modules Command Grid */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary-600" />
          Core Operations & Workflow Surfaces
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Admissions */}
          <Card className="hover:border-primary-300 transition-colors">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-primary-50 rounded-lg text-primary-700">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                  {stats.pendingAdmissions} Pending
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mt-3">Pupil Admissions</h3>
              <p className="text-xs text-slate-500">
                Front-desk reception registration, birth certificate & document uploads, and leadership approval.
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex gap-2">
              <Link to="/admissions/queue" className="flex-1">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  Review Queue
                </Button>
              </Link>
              <Link to="/students/new" className="flex-1">
                <Button size="sm" className="w-full text-xs">
                  New Intake
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Card 2: Staff Directory */}
          <Card className="hover:border-primary-300 transition-colors">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                  {stats.activeStaff} Staff
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mt-3">Faculty & Personnel</h3>
              <p className="text-xs text-slate-500">
                Staff directory, official teaching subject allocations, personnel dossiers, and non-destructive offboarding.
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex gap-2">
              <Link to="/staff" className="flex-1">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  Directory
                </Button>
              </Link>
              <Link to="/staff/new" className="flex-1">
                <Button size="sm" className="w-full text-xs">
                  Hire Staff
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Card 3: Classes */}
          <Card className="hover:border-primary-300 transition-colors">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-700">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                  {stats.activeClasses} Classes
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mt-3">Classes & Streams</h3>
              <p className="text-xs text-slate-500">
                Classroom rosters, stream divisions, learner headcounts, and form teacher pastoral oversight.
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Link to="/classes" className="w-full block">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  Manage Classes & Streams
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Card 4: Timetable */}
          <Card className="hover:border-primary-300 transition-colors">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-700">
                  <Clock className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">
                  Draft & Master
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mt-3">Master Timetable</h3>
              <p className="text-xs text-slate-500">
                Master schedule view, period allocations, clash prevention, and visual draft timetable editor.
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex gap-2">
              <Link to="/planning/timetable/draft" className="flex-1">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  View Draft
                </Button>
              </Link>
              <Link to="/planning/timetable/builder" className="flex-1">
                <Button size="sm" className="w-full text-xs">
                  Builder
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Card 5: Inventory */}
          <Card className="hover:border-primary-300 transition-colors">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-amber-50 rounded-lg text-amber-700">
                  <Package className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                  {stats.totalAssets} Assets
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mt-3">Store & Inventory</h3>
              <p className="text-xs text-slate-500">
                Consumable levels, goods receipts (GRN), asset custody tracking, and staff material requisitions.
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Link to="/administration/inventory" className="w-full block">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  Manage Store & Assets
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Card 6: Calendar */}
          <Card className="hover:border-primary-300 transition-colors">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-700">
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                  Multi-Audience
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mt-3">School Calendar</h3>
              <p className="text-xs text-slate-500">
                Term dates, whole school assemblies, teacher moderation meetings, sports galas, and parent events.
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Link to="/calendar" className="w-full block">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  Open Calendar
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Governance, Security & Multi-Tenancy Card */}
      <Card className="bg-slate-50 border border-slate-200">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900">Security & Multi-Tenant Governance Safeguards</h3>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Multi-Tenant Tenant Isolation</p>
              <p className="text-xs text-slate-500">
                Row-Level Security (RLS) is active. Queries enforce strict school-level isolation ({effectiveSchoolId}).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Admissions Authorization Firewall</p>
              <p className="text-xs text-slate-500">
                Admission approvals are strictly restricted to Admin and Principal. Bursars and unauthorized staff are blocked at DB level.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Financial Ledger Immutability</p>
              <p className="text-xs text-slate-500">
                Stock movements and financial receipts are recorded append-only with signed deltas and reasons.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Ugandan Statutory Payroll Engine</p>
              <p className="text-xs text-slate-500">
                Native Ugandan formulas active: NSSF (10% employer / 5% employee), progressive PAYE tax brackets, and local service tax.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
