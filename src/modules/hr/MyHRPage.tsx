import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { hrService } from './hrService';
import { payrollService } from '../payroll/payrollService';
import { useAuth } from '../../lib/authContext';
import { resolveMyEmployeeId } from '../auth/identity';
import {
  EffectiveLeaveBalanceItem,
  LeaveRequest,
  StaffAdvance,
  SchoolPayrollItem,
  DayPortion,
} from '../../types/domain';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { StatusPill } from '../../components/ui/StatusPill';
import { PayslipDocument } from '../payroll/PayslipDocument';
import { formatUGX } from '../payroll/calculations';
import {
  DollarSign,
  PlusCircle,
  X,
  Eye,
  Info,
} from 'lucide-react';

export interface MyHRPageProps {
  section?: 'leave' | 'advances' | 'payslips';
}

// DEMO ONLY: mock env has no authenticated employee row, so previews and the
// mock test suite pin the demo teacher explicitly. NEVER used on the live
// path — live resolution below fails closed instead of falling back.
const DEMO_EMPLOYEE_ID = 'emp-teacher-1';
const DEMO_EMPLOYEE_NAME = 'Sarah Nabwire';
const DEMO_SCHOOL_ID = 'school-default';

function isMockEnv(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    !import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
    import.meta.env.VITE_SUPABASE_URL.includes('mock')
  );
}

export const MyHRPage: React.FC<MyHRPageProps> = ({ section: propSection }) => {
  const location = useLocation();
  const { schoolId: authSchoolId, fullName } = useAuth();
  const schoolId = authSchoolId ?? DEMO_SCHOOL_ID;

  const activeTab: 'leave' | 'advances' | 'payslips' = propSection || (
    location.pathname.includes('/advances')
      ? 'advances'
      : location.pathname.includes('/payslips')
      ? 'payslips'
      : 'leave'
  );
  const [balances, setBalances] = useState<EffectiveLeaveBalanceItem[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [payslips, setPayslips] = useState<SchoolPayrollItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Leave Modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('lt-annual');
  const [startDate, setStartDate] = useState('2026-09-18');
  const [endDate, setEndDate] = useState('2026-09-18');
  const [dayPortion, setDayPortion] = useState<DayPortion>('full');
  const [leaveReason, setLeaveReason] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // Advance Modal
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('400000');
  const [instalments, setInstalments] = useState(2);
  const [advanceReason, setAdvanceReason] = useState('');
  const [isSubmittingAdvance, setIsSubmittingAdvance] = useState(false);

  // Payslip Modal
  const [selectedPayslip, setSelectedPayslip] = useState<SchoolPayrollItem | null>(null);

  // Viewer identity (Issue 1): resolved per session via the school-scoped
  // helper — never hardcoded, never another employee's id.
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(true);

  // Live UI shows the viewer's own name from auth; the mock demo keeps its
  // pinned demo label so previews render without a session.
  const currentEmployeeName = isMockEnv() ? DEMO_EMPLOYEE_NAME : (fullName ?? DEMO_EMPLOYEE_NAME);
  // M2: advance-cap base salary. Resolved per viewer from their payroll
  // profile below; FALLBACK_BASE_SALARY applies ONLY when the profile is
  // missing or unreadable (documented fallback, never a silent default).
  const FALLBACK_BASE_SALARY = 1800000;
  const [baseSalary, setBaseSalary] = useState(FALLBACK_BASE_SALARY);

  useEffect(() => {
    let cancelled = false;
    async function resolveViewer() {
      setIsResolving(true);
      setResolveError(null);
      try {
        if (isMockEnv()) {
          if (!cancelled) setEmployeeId(DEMO_EMPLOYEE_ID);
          return;
        }
        const id = await resolveMyEmployeeId(schoolId);
        if (cancelled) return;
        if (!id) {
          // Fail closed: surface an error, NEVER fall back to another id.
          setEmployeeId(null);
          setResolveError('Could not resolve your employee record');
        } else {
          setEmployeeId(id);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to resolve employee identity', err);
          setEmployeeId(null);
          setResolveError('Could not resolve your employee record');
        }
      } finally {
        if (!cancelled) setIsResolving(false);
      }
    }
    resolveViewer();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  async function loadData(empId: string) {
    try {
      setIsLoading(true);
      const [effBalances, myReqs, myAdvs, mySlips] = await Promise.all([
        hrService.getEffectiveBalances(schoolId, empId),
        hrService.getMyLeaveRequests(empId),
        hrService.getMyAdvances(empId),
        payrollService.getMyPayslips(empId, schoolId),
      ]);
      setBalances(effBalances);
      setRequests(myReqs);
      setAdvances(myAdvs);
      setPayslips(mySlips);
      // M2: resolve the viewer's actual basic salary for the 50% advance
      // cap; keep the documented fallback when the profile is unreadable.
      try {
        const profile = await payrollService.getPayrollProfile(empId, schoolId);
        setBaseSalary(profile?.baseSalary || FALLBACK_BASE_SALARY);
      } catch {
        setBaseSalary(FALLBACK_BASE_SALARY);
      }
    } catch (err) {
      console.error('Failed to load HR self-service data', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (employeeId) {
      loadData(employeeId);
    }
  }, [employeeId]);

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    try {
      setIsSubmittingLeave(true);
      await hrService.submitLeaveRequest({
        schoolId,
        employeeId,
        employeeName: currentEmployeeName,
        leaveTypeId: selectedLeaveTypeId,
        startDate,
        endDate: dayPortion !== 'full' ? startDate : endDate,
        dayPortion,
        reason: leaveReason,
      });
      setShowLeaveModal(false);
      setLeaveReason('');
      if (employeeId) await loadData(employeeId);
    } catch (err: any) {
      alert(err?.message || 'Failed to submit leave request');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleApplyAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    try {
      setIsSubmittingAdvance(true);
      await hrService.submitAdvanceRequest({
        schoolId,
        employeeId,
        employeeName: currentEmployeeName,
        amount: parseFloat(advanceAmount) || 0,
        numInstalments: instalments,
        reason: advanceReason,
        baseSalary,
      });
      setShowAdvanceModal(false);
      setAdvanceReason('');
      if (employeeId) await loadData(employeeId);
    } catch (err: any) {
      alert(err?.message || 'Failed to submit advance request');
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  const hasOpenAdvance = advances.some((a) =>
    ['pending', 'active', 'flagged'].includes(a.status)
  );

  const calculatedWorkingDays = hrService.calculateWorkingDays(
    startDate,
    dayPortion !== 'full' ? startDate : endDate,
    dayPortion
  );

  if (isResolving || (isLoading && balances.length === 0 && !resolveError)) {
    return <LoadingState label="Loading staff HR self-service..." />;
  }

  // Fail closed: an unresolvable viewer sees an error, NEVER another
  // employee's leave, advances, or payslips.
  if (resolveError || !employeeId) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-3">
        <h1 className="text-lg font-bold text-slate-900">HR self-service unavailable</h1>
        <p className="text-sm text-slate-600">
          {resolveError ?? 'Could not resolve your employee record'}
        </p>
        <p className="text-xs text-slate-400">
          Please contact your school administrator to link your sign-in to a staff record.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              Staff HR Portal
            </span>
            <span className="text-xs text-slate-500 font-medium">{currentEmployeeName} (Senior Teacher)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            {activeTab === 'leave' && 'Leave & Balances'}
            {activeTab === 'advances' && 'Salary Advances'}
            {activeTab === 'payslips' && 'My Payslips'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeTab === 'leave' && 'Track statutory leave quotas, view effective balances, and submit requests for absence'}
            {activeTab === 'advances' && 'Request short-term salary advances within statutory policy limits and view active repayment schedules'}
            {activeTab === 'payslips' && 'View verified monthly payslips, statutory deductions, and net take-home pay records'}
          </p>
        </div>

        {/* Action button based on active section */}
        <div className="flex items-center gap-3">
          {activeTab === 'leave' && (
            <Button
              variant="primary"
              leftIcon={<PlusCircle className="w-4 h-4" />}
              onClick={() => setShowLeaveModal(true)}
            >
              Apply for Leave
            </Button>
          )}
          {activeTab === 'advances' && (
            <Button
              variant="primary"
              leftIcon={<DollarSign className="w-4 h-4" />}
              onClick={() => setShowAdvanceModal(true)}
              disabled={hasOpenAdvance}
            >
              {hasOpenAdvance ? 'Active Advance Open' : 'Request Advance'}
            </Button>
          )}
        </div>
      </div>

      {/* TAB 1: LEAVE & BALANCES */}
      {activeTab === 'leave' && (
        <div className="space-y-6">
          {/* Effective Leave Balances Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {balances.slice(0, 4).map((b) => (
              <div
                key={b.leaveTypeId}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {b.name}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                </div>
                <div>
                  <span className="text-2xl font-black text-slate-900 block">
                    {b.availableDays} <span className="text-xs font-normal text-slate-500">days left</span>
                  </span>
                  <span className="text-xs text-slate-400 block mt-0.5">
                    Entitled: {b.entitledDays}d • Used: {b.usedDays}d
                    {b.pendingDays > 0 && ` • In-Flight: ${b.pendingDays}d`}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Leave Requests Table */}
          <Card>
            <CardHeader>
              <CardTitle>My Leave History</CardTitle>
              <CardDescription>
                Track submitted leave requests, morning/afternoon half-days, and approval statuses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Leave Type</th>
                      <th className="py-3 px-4">Dates</th>
                      <th className="py-3 px-4">Portion</th>
                      <th className="py-3 px-4 text-right">Working Days</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {r.leaveTypeName || 'Leave'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {r.startDate === r.endDate
                            ? r.startDate
                            : `${r.startDate} → ${r.endDate}`}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium capitalize">
                            {r.dayPortion}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">
                          {r.workingDays}d
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {r.reason}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusPill
                            status={
                              r.status === 'approved'
                                ? 'success'
                                : r.status === 'pending'
                                ? 'pending'
                                : 'critical'
                            }
                            label={r.status.toUpperCase()}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: SALARY ADVANCES */}
      {activeTab === 'advances' && (
        <div className="space-y-6">
          {/* Policy Information Card */}
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-5 flex items-start gap-4">
            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-900">
              <span className="font-bold block text-sm">Salary Advance Policy Guidelines</span>
              <p>
                Staff may request salary advances up to <strong>50% of basic monthly salary</strong> ({formatUGX(baseSalary * 0.5)} maximum).
                Repayments are deducted post-tax in equal installments over 1 to 3 months.
              </p>
              <p className="font-semibold text-amber-950 mt-1">
                Database Rule: Staff may hold at most ONE open (pending or active) salary advance at any given time.
              </p>
            </div>
          </div>

          {/* Advances Table */}
          <Card>
            <CardHeader>
              <CardTitle>Salary Advance History & Repayments</CardTitle>
              <CardDescription>
                Outstanding principal balances and monthly payroll deduction amortization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Date Issued</th>
                      <th className="py-3 px-4 text-right">Principal Amount</th>
                      <th className="py-3 px-4 text-right">Balance Remaining</th>
                      <th className="py-3 px-4 text-right">Monthly Deduction</th>
                      <th className="py-3 px-4 text-center">Instalments</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 text-slate-600">
                          {adv.createdAt.split('T')[0]}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900">
                          {formatUGX(adv.amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-rose-700">
                          {formatUGX(adv.balanceRemaining)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">
                          {formatUGX(adv.monthlyDeduction)}/mo
                        </td>
                        <td className="py-3 px-4 text-center font-medium">
                          {adv.numInstalments} mo
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {adv.reason}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusPill
                            status={
                              adv.status === 'active' || adv.status === 'paid_off'
                                ? 'success'
                                : adv.status === 'pending'
                                ? 'pending'
                                : 'critical'
                            }
                            label={adv.status.toUpperCase()}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: MY PAYSLIPS */}
      {activeTab === 'payslips' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>My Official Salary Payslips</CardTitle>
              <CardDescription>
                Statutory payslips generated under Uganda Income Tax Act & NSSF Act Cap 222
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Pay Period</th>
                      <th className="py-3 px-4 text-right">Gross Salary</th>
                      <th className="py-3 px-4 text-right">PAYE Withheld</th>
                      <th className="py-3 px-4 text-right">NSSF (5%)</th>
                      <th className="py-3 px-4 text-right">Advance Recovery</th>
                      <th className="py-3 px-4 text-right">Net Take-Home</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payslips.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          September 2026
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">
                          {formatUGX(p.grossSalary)}
                        </td>
                        <td className="py-3 px-4 text-right text-rose-700 font-medium">
                          {formatUGX(p.paye)}
                        </td>
                        <td className="py-3 px-4 text-right text-rose-700 font-medium">
                          {formatUGX(p.nssfEmployee)}
                        </td>
                        <td className="py-3 px-4 text-right text-rose-700 font-medium">
                          {p.advanceDeduction > 0 ? formatUGX(p.advanceDeduction) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-emerald-800">
                          {formatUGX(p.netPay)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedPayslip(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Payslip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Apply Leave Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Apply for Leave</h3>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Leave Type</label>
                <select
                  value={selectedLeaveTypeId}
                  onChange={(e) => setSelectedLeaveTypeId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white"
                >
                  {balances.map((b) => (
                    <option key={b.leaveTypeId} value={b.leaveTypeId}>
                      {b.name} ({b.availableDays} days remaining)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Day Portion</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['full', 'morning', 'afternoon'] as DayPortion[]).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setDayPortion(p)}
                      className={`py-2 text-xs font-bold rounded-lg border capitalize ${
                        dayPortion === p
                          ? 'bg-brand-teal text-white border-brand-teal'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p === 'full' ? 'Full Day' : `${p} (0.5d)`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (dayPortion !== 'full') setEndDate(e.target.value);
                    }}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    disabled={dayPortion !== 'full'}
                    value={dayPortion !== 'full' ? startDate : endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg flex items-center justify-between text-xs text-brand-teal font-semibold">
                <span>Calculated Working Days:</span>
                <span className="text-sm font-bold">{calculatedWorkingDays} days</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Reason for Request</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain purpose of leave..."
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setShowLeaveModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSubmittingLeave}>
                  Submit Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apply Salary Advance Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Request Salary Advance</h3>
              <button onClick={() => setShowAdvanceModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyAdvance} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Requested Amount (UGX)
                </label>
                <input
                  type="number"
                  step="50000"
                  max={baseSalary * 0.5}
                  required
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  className="w-full text-sm font-semibold border border-slate-200 rounded-lg p-2.5"
                />
                <span className="text-[11px] text-slate-400 block mt-1">
                  Policy cap: max {formatUGX(baseSalary * 0.5)} (50% of basic salary)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Repayment Period (Monthly Deductions)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      type="button"
                      key={num}
                      onClick={() => setInstalments(num)}
                      className={`py-2 text-xs font-bold rounded-lg border ${
                        instalments === num
                          ? 'bg-brand-teal text-white border-brand-teal'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {num} {num === 1 ? 'Month' : 'Months'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between text-xs text-emerald-800 font-semibold">
                <span>Monthly Payroll Recovery:</span>
                <span className="text-sm font-bold">
                  {formatUGX(Math.round((parseFloat(advanceAmount) || 0) / instalments))}/mo
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Reason for Advance
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="State reason for advance request..."
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setShowAdvanceModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSubmittingAdvance}>
                  Submit Advance Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payslip Document Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-3xl my-8">
            <PayslipDocument
              item={selectedPayslip}
              periodLabel="September 2026"
              onClose={() => setSelectedPayslip(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
