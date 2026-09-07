import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { StatusPill } from '../../components/ui/StatusPill';
import { StaffEditModal } from './StaffEditModal';
import { StaffExitModal } from './StaffExitModal';
import { StaffSubjectAppointModal } from './StaffSubjectAppointModal';
import { StaffDocumentUploadModal } from './StaffDocumentUploadModal';
import {
  ArrowLeft,
  Printer,
  Edit,
  UserX,
  User,
  Briefcase,
  BookOpen,
  Calendar,
  DollarSign,
  FileText,
  Mail,
  Phone,
  GraduationCap,
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import type { StaffDossier } from '../../types/domain';

type Tab = 'personal' | 'employment' | 'subjects' | 'leave' | 'payroll' | 'documents';

export const StaffDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { role, user } = useAuth();

  const [dossier, setDossier] = useState<StaffDossier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('personal');

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showAppointModal, setShowAppointModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const loadDossier = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await staffService.getStaffDossier(id, role, user?.id);
      setDossier(data);
    } catch (err: any) {
      console.error('Failed to load staff dossier', err);
      setError(err.message || 'Failed to load staff dossier.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDossier();
  }, [id, role, user?.id]);

  const canManage = role === 'admin' || role === 'principal';

  const handleRemoveSubject = async (subjectApptId: string) => {
    if (!window.confirm('Are you sure you want to remove this official subject appointment?')) {
      return;
    }
    try {
      await staffService.removeTeacherSubject(subjectApptId, role);
      await loadDossier();
    } catch (err: any) {
      alert(err.message || 'Failed to remove subject.');
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading staff personnel dossier..." />;
  }

  if (error || !dossier) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 mx-auto flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Staff Record Not Found</h2>
        <p className="text-sm text-slate-500">{error || 'Unable to locate this employee record.'}</p>
        <Link
          to="/staff"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-teal rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Staff Directory</span>
        </Link>
      </div>
    );
  }

  const initials = dossier.personal.fullName
    ? dossier.personal.fullName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'ST';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12 print:p-0 print:space-y-4">
      {/* Top Bar: Back Link + Actions (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 print:hidden">
        <Link
          to="/staff"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Staff Directory</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowEditModal(true)}
              className="gap-1.5"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit Details</span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Dossier</span>
          </Button>

          {canManage && dossier.employment.status === 'active' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowExitModal(true)}
              className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Staff Exit</span>
            </Button>
          )}
        </div>
      </div>

      {/* Header Profile Card */}
      <Card className="print:border-none print:shadow-none">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-teal/10 text-brand-teal flex items-center justify-center font-extrabold text-xl tracking-wider flex-shrink-0">
                {initials}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    {dossier.personal.fullName}
                  </h1>
                  <StatusPill
                    status={
                      dossier.employment.status === 'active'
                        ? 'success'
                        : dossier.employment.status === 'on_leave'
                        ? 'warning'
                        : 'neutral'
                    }
                    label={
                      dossier.employment.status === 'active'
                        ? 'Active Employee'
                        : dossier.employment.status === 'on_leave'
                        ? 'On Leave'
                        : `Exited (${dossier.employment.exitReason || 'Terminated'})`
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                    {dossier.employeeNumber}
                  </span>
                  <span>•</span>
                  <span className="font-semibold text-slate-800">{dossier.employment.role}</span>
                  <span>•</span>
                  <span>{dossier.employment.department}</span>
                  {dossier.employment.hireDate && (
                    <>
                      <span>•</span>
                      <span>Hired {dossier.employment.hireDate}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Contact & Qualification Badges */}
            <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 text-xs">
              {dossier.personal.phone && (
                <a
                  href={`tel:${dossier.personal.phone}`}
                  className="inline-flex items-center gap-1.5 text-slate-600 hover:text-brand-teal transition-colors font-medium"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{dossier.personal.phone}</span>
                </a>
              )}
              {dossier.personal.email && (
                <a
                  href={`mailto:${dossier.personal.email}`}
                  className="inline-flex items-center gap-1.5 text-slate-600 hover:text-brand-teal transition-colors font-medium"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{dossier.personal.email}</span>
                </a>
              )}
              {dossier.employment.qualification && (
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-medium flex items-center gap-1 text-[11px] mt-1">
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>{dossier.employment.qualification}</span>
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Tabs (Hidden on Print) */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('personal')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'personal'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Personal & Contact</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('employment')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'employment'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Employment & Contract</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('subjects')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'subjects'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Teaching Appointments ({dossier.officialSubjects.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leave')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'leave'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>HR & Leave Balances</span>
        </button>

        {dossier.payrollSummary && (
          <button
            type="button"
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'payroll'
                ? 'border-brand-teal text-brand-teal'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Payroll Summary</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'documents'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Official Documents ({dossier.documents.length})</span>
        </button>
      </div>

      {/* TAB 1: Personal Details */}
      {(activeTab === 'personal' || typeof window !== 'undefined') && (
        <div className={activeTab === 'personal' ? 'space-y-4' : 'hidden print:block space-y-4'}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-brand-teal" />
                <span>Demographic & Contact Records</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Legal Full Name</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">{dossier.personal.fullName}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Date of Birth</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">
                    {dossier.personal.dateOfBirth || '—'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Gender</span>
                  <p className="font-bold text-slate-900 text-sm mt-1 capitalize">
                    {dossier.personal.gender || '—'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">National ID (NIN)</span>
                  <p className="font-bold text-slate-900 text-sm mt-1 font-mono">
                    {dossier.personal.nationalId || '—'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Nationality</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">
                    {dossier.personal.nationality || '—'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Residential Address</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">
                    {dossier.personal.address || '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: Employment & Contract */}
      {(activeTab === 'employment' || typeof window !== 'undefined') && (
        <div className={activeTab === 'employment' ? 'space-y-4' : 'hidden print:block space-y-4'}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-brand-teal" />
                <span>Employment Terms & Qualification History</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Designation / Role</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">{dossier.employment.role}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Department</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">{dossier.employment.department}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Contract Type</span>
                  <p className="font-bold text-slate-900 text-sm mt-1 capitalize">
                    {dossier.employment.contractType
                      ? dossier.employment.contractType.replace('_', ' ')
                      : '—'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Hire Date</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">
                    {dossier.employment.hireDate || '—'}
                  </p>
                </div>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-5 h-5 text-brand-teal" />
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Highest Qualification</span>
                    <p className="font-bold text-slate-900 text-sm">
                      {dossier.employment.qualification || 'No qualification recorded'}
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                  {dossier.employment.isTeacher ? 'Faculty Member' : 'Support / Administrative'}
                </span>
              </div>

              {/* Exit Info if applicable */}
              {dossier.employment.status !== 'active' && (
                <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                    Offboarding Record
                  </span>
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <span>Exit Date: {dossier.employment.exitDate || 'Recorded'}</span>
                    <span>•</span>
                    <span className="capitalize">Reason: {dossier.employment.exitReason || 'Other'}</span>
                  </div>
                  {dossier.employment.notes && (
                    <p className="text-xs text-rose-800 italic mt-1">{dossier.employment.notes}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: Teaching Appointments */}
      {activeTab === 'subjects' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-teal" />
                  <span>Official Curriculum Subject Appointments</span>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authoritative school appointments reflecting teaching qualifications
                </p>
              </div>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setShowAppointModal(true)}
                  className="gap-1.5 bg-brand-teal text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Appoint Subject</span>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {dossier.officialSubjects.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs italic">
                  No official teaching subjects appointed yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {dossier.officialSubjects.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-teal/40 transition-all flex items-center justify-between"
                    >
                      <div className="space-y-1 min-w-0">
                        <span className="font-bold text-sm text-slate-900 block truncate">
                          {sub.subjectName}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Appointed {sub.appointedAt || 'Active'}
                        </span>
                        {sub.notes && (
                          <span className="text-[11px] text-emerald-700 font-medium block truncate">
                            {sub.notes}
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSubject(sub.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Remove subject appointment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Class Allocations */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-teal" />
                <span>Active Timetable Allocations</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dossier.activeAllocations.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  No active classroom teaching allocations configured for this term.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {dossier.activeAllocations.map((alloc) => (
                    <div key={alloc.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 text-sm">
                          {alloc.className} {alloc.streamName ? `(${alloc.streamName})` : ''}
                        </span>
                        <p className="text-slate-500 font-medium">{alloc.subjectName}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {alloc.periodsPerWeek} periods/wk
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: HR & Leave Balances */}
      {activeTab === 'leave' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-teal" />
              <span>Leave Entitlements & Balances</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dossier.leaveBalances.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 text-center text-xs text-slate-400 italic">
                Standard institutional leave policies apply. No custom entitlements recorded.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {dossier.leaveBalances.map((leave) => (
                  <div
                    key={leave.leaveTypeId}
                    className="p-4 rounded-xl border border-slate-200 bg-white space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{leave.leaveTypeName}</span>
                      <span className="font-mono text-[10px] text-slate-400">{leave.code}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-brand-teal">{leave.remainingDays}</span>
                      <span className="text-xs text-slate-400">/ {leave.annualAllowance} days</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-brand-teal h-full rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (leave.usedDays / Math.max(1, leave.annualAllowance)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 block">{leave.usedDays} days taken</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 5: Payroll Summary (Strictly Role-Scoped) */}
      {activeTab === 'payroll' && dossier.payrollSummary && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-brand-teal" />
              <span>Payroll Profile & Statutory Setup</span>
            </CardTitle>
            <Link
              to="/payroll"
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-teal hover:underline"
            >
              <span>Open Payroll Engine</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {!dossier.payrollSummary.profileConfigured ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-xs uppercase tracking-wider">
                    Payroll Profile Not Yet Configured
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  This employee does not have a salary structure or banking profile set up. Configure their compensation in the Payroll Engine before running the monthly payroll batch.
                </p>
                <Link
                  to="/payroll"
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 underline"
                >
                  Configure Profile in Payroll Engine →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Base Salary</span>
                  <p className="font-black text-slate-900 text-lg mt-1">
                    {dossier.payrollSummary.currency}{' '}
                    {dossier.payrollSummary.baseSalary?.toLocaleString() || '0'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Bank Institution</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">
                    {dossier.payrollSummary.bankName || 'Not configured'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Account Number</span>
                  <p className="font-mono font-bold text-slate-900 text-sm mt-1">
                    {dossier.payrollSummary.accountNumber || '—'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 6: Official Documents */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-teal" />
                <span>Personnel Records & Verification Documents</span>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Stored in private, encrypted school documents storage
              </p>
            </div>
            {canManage && (
              <Button
                type="button"
                size="sm"
                onClick={() => setShowUploadModal(true)}
                className="gap-1.5 bg-brand-teal text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Upload Document</span>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {dossier.documents.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic">
                No official documents uploaded for this staff member.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {dossier.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-teal/40 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-900 block capitalize truncate">
                          {doc.docType.replace('_', ' ')}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODALS */}
      {showEditModal && (
        <StaffEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          dossier={dossier}
          onSuccess={loadDossier}
        />
      )}

      {showExitModal && (
        <StaffExitModal
          isOpen={showExitModal}
          onClose={() => setShowExitModal(false)}
          dossier={dossier}
          onSuccess={loadDossier}
        />
      )}

      {showAppointModal && (
        <StaffSubjectAppointModal
          isOpen={showAppointModal}
          onClose={() => setShowAppointModal(false)}
          dossier={dossier}
          onSuccess={loadDossier}
        />
      )}

      {showUploadModal && (
        <StaffDocumentUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          dossier={dossier}
          onSuccess={loadDossier}
        />
      )}
    </div>
  );
};
