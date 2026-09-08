import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Edit2,
  Plus,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import type { UserRole } from '../../config/permissions';
import { hrService } from './hrService';
import { LeaveRequest, StaffAdvance, LeaveType } from '../../types/domain';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const HRApprovalsPage: React.FC = () => {
  const { schoolId, user, role } = useAuth();
  const effectiveSchoolId = schoolId ?? PILOT_SCHOOL_ID;

  const [activeTab, setActiveTab] = useState<'leave' | 'advances' | 'policies' | 'profiles'>('leave');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [payrollProfiles, setPayrollProfiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reject modals
  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null);
  const [rejectingAdvanceId, setRejectingAdvanceId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Leave Type modal
  const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);

  // Payroll profile modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setIsLoading(true);
      setActionError(null);
      const [pending, types, profiles] = await Promise.all([
        hrService.getPendingApprovals(effectiveSchoolId),
        hrService.getLeaveTypes(effectiveSchoolId),
        hrService.getEmployeePayrollProfiles(effectiveSchoolId),
      ]);
      setLeaveRequests(pending.leaveRequests);
      setAdvances(pending.advances);
      setLeaveTypes(types);
      setPayrollProfiles(profiles);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load HR authorizations.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSchoolId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleApproveLeave = async (reqId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const ok = await hrService.decideLeaveRequest(reqId, 'approved', undefined, user?.id);
      if (!ok) {
        throw new Error('Leave approval failed — the request was not updated. Please retry.');
      }
      setActionSuccess('Leave request approved and balance deducted.');
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve leave request.');
    }
  };

  const handleConfirmRejectLeave = async () => {
    if (!rejectingLeaveId || !rejectReason.trim()) return;
    setIsRejecting(true);
    setActionError(null);
    try {
      const ok = await hrService.decideLeaveRequest(rejectingLeaveId, 'rejected', rejectReason.trim(), user?.id);
      if (!ok) {
        throw new Error('Leave rejection failed — the request was not updated. Please retry.');
      }
      setRejectingLeaveId(null);
      setRejectReason('');
      setActionSuccess('Leave request rejected.');
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject leave request.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleApproveAdvance = async (advId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const ok = await hrService.decideAdvanceRequest(advId, 'active', undefined, user?.id);
      if (!ok) {
        throw new Error('Advance approval failed — the request was not updated. Please retry.');
      }
      setActionSuccess('Salary advance approved and scheduled for payroll deductions.');
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve salary advance.');
    }
  };

  const handleConfirmRejectAdvance = async () => {
    if (!rejectingAdvanceId || !rejectReason.trim()) return;
    setIsRejecting(true);
    setActionError(null);
    try {
      const ok = await hrService.decideAdvanceRequest(rejectingAdvanceId, 'rejected', rejectReason.trim(), user?.id);
      if (!ok) {
        throw new Error('Advance rejection failed — the request was not updated. Please retry.');
      }
      setRejectingAdvanceId(null);
      setRejectReason('');
      setActionSuccess('Salary advance rejected.');
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject salary advance.');
    } finally {
      setIsRejecting(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading HR authorization queue..." />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Administration</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            HR Operations & Approvals
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review staff requests, maintain school leave quotas, and configure compensation profiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'policies' && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setEditingLeaveType(null);
                setShowLeaveTypeModal(true);
              }}
            >
              Add Leave Type
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('leave')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'leave'
              ? 'border-brand-teal text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Leave Requests</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {leaveRequests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('advances')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'advances'
              ? 'border-brand-teal text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Salary Advances</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {advances.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('policies')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'policies'
              ? 'border-brand-teal text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Leave Policies & Quotas</span>
        </button>

        <button
          onClick={() => setActiveTab('profiles')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'profiles'
              ? 'border-brand-teal text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Staff Payroll Profiles</span>
        </button>
      </div>

      {/* Tab 1: Leave Requests */}
      {activeTab === 'leave' && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Leave Requests ({leaveRequests.length})</CardTitle>
            <CardDescription>
              Review staff time-off requests. Approval atomically deducts from effective employee quotas.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {leaveRequests.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No pending leave requests awaiting approval.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {leaveRequests.map((req) => (
                  <div key={req.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{req.employeeName || 'Staff Member'}</span>
                        <StatusPill status="info" label={req.leaveTypeName || 'Leave'} />
                        <span className="text-xs text-slate-400">
                          {req.workingDays} working day{req.workingDays === 1 ? '' : 's'}
                          {req.dayPortion !== 'full' ? ` (${req.dayPortion} half-day)` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {req.startDate} to {req.endDate}
                      </p>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100 max-w-xl">
                        "{req.reason}"
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Check className="w-4 h-4" />}
                        onClick={() => handleApproveLeave(req.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        leftIcon={<XCircle className="w-4 h-4" />}
                        onClick={() => {
                          setRejectingLeaveId(req.id);
                          setRejectReason('');
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Salary Advances */}
      {activeTab === 'advances' && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Salary Advances ({advances.length})</CardTitle>
            <CardDescription>
              Review requested advances. Maximum permitted amount is strictly 50% of gross monthly salary.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {advances.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No pending salary advance requests awaiting approval.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {advances.map((adv) => (
                  <div key={adv.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{adv.employeeName || 'Staff Member'}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          UGX {adv.amount.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400">
                          {adv.numInstalments} instalments • UGX {adv.monthlyDeduction.toLocaleString()}/month
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100 max-w-xl">
                        "{adv.reason}"
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Pre-validated under 50% monthly salary cap</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Check className="w-4 h-4" />}
                        onClick={() => handleApproveAdvance(adv.id)}
                      >
                        Approve Advance
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        leftIcon={<XCircle className="w-4 h-4" />}
                        onClick={() => {
                          setRejectingAdvanceId(adv.id);
                          setRejectReason('');
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Leave Policies */}
      {activeTab === 'policies' && (
        <Card>
          <CardHeader>
            <CardTitle>School Leave Types & Annual Entitlements</CardTitle>
            <CardDescription>
              Configured leave categories, default statutory allocations, and evidence requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Leave Name</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Default Quota</th>
                    <th className="py-3 px-4">Compensation</th>
                    <th className="py-3 px-4">Evidence</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveTypes.map((type) => (
                    <tr key={type.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                        {type.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{type.code}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {type.defaultEntitlementDays} days / year
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            type.isPaid
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {type.isPaid ? 'Paid Leave' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {type.requiresEvidence ? 'Doctor note / evidence' : 'No documentation'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setEditingLeaveType(type);
                            setShowLeaveTypeModal(true);
                          }}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Staff Payroll Profiles */}
      {activeTab === 'profiles' && (
        <Card>
          <CardHeader>
            <CardTitle>Staff Statutory & Payroll Profiles</CardTitle>
            <CardDescription>
              Configured base salaries, banking details, and statutory NSSF compliance. Completing profiles removes fallback payroll calculations.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {payrollProfiles.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No active employee payroll profiles recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Staff Member</th>
                      <th className="py-3 px-4">Base Salary</th>
                      <th className="py-3 px-4">Payment Method</th>
                      <th className="py-3 px-4">Bank / Provider</th>
                      <th className="py-3 px-4">NSSF</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payrollProfiles.map((prof) => {
                      const emp = prof.employee;
                      const p = emp?.person;
                      const staffName = `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Employee';

                      return (
                        <tr key={prof.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-slate-900">{staffName}</p>
                            <p className="text-xs text-slate-400 font-mono">{emp?.employee_number || prof.employee_id}</p>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                            {prof.currency} {Number(prof.base_salary).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-semibold uppercase text-slate-600">
                            {prof.payment_method?.replace('_', ' ')}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-700">
                            {prof.bank_name ? (
                              <span>
                                {prof.bank_name} • {prof.bank_account_number}
                              </span>
                            ) : prof.mobile_money_number ? (
                              <span>
                                {prof.mobile_money_provider?.toUpperCase()} • {prof.mobile_money_number}
                              </span>
                            ) : (
                              <span className="text-slate-400">Not recorded</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                prof.nssf_applicable
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {prof.nssf_applicable ? 'Standard 15%' : 'Exempt'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                              onClick={() => {
                                setEditingProfile(prof);
                                setShowProfileModal(true);
                              }}
                            >
                              Configure
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reject Leave Modal */}
      {rejectingLeaveId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
            <h3 className="text-lg font-extrabold text-slate-900">Reject Leave Request</h3>
            <p className="text-xs text-slate-500">A clear rejection reason is mandatory and recorded in the audit log.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="leave-rej-reason">
                Reason for Rejection
              </label>
              <textarea
                id="leave-rej-reason"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                rows={3}
                placeholder="e.g. Critical examination period; coverage unavailable."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setRejectingLeaveId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmRejectLeave}
                isLoading={isRejecting}
                disabled={!rejectReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Advance Modal */}
      {rejectingAdvanceId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
            <h3 className="text-lg font-extrabold text-slate-900">Reject Salary Advance</h3>
            <p className="text-xs text-slate-500">Provide an explicit rationale for declining this advance request.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="adv-rej-reason">
                Reason for Rejection
              </label>
              <textarea
                id="adv-rej-reason"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                rows={3}
                placeholder="e.g. Prior advance repaid recently; monthly deduction exceeds limit."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setRejectingAdvanceId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmRejectAdvance}
                isLoading={isRejecting}
                disabled={!rejectReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Type Modal */}
      {showLeaveTypeModal && (
        <LeaveTypeEditModal
          schoolId={effectiveSchoolId}
          initialData={editingLeaveType}
          onClose={() => setShowLeaveTypeModal(false)}
          onSaved={async () => {
            setShowLeaveTypeModal(false);
            await loadAll();
          }}
        />
      )}

      {/* Profile Edit Modal */}
      {showProfileModal && editingProfile && (
        <PayrollProfileEditModal
          schoolId={effectiveSchoolId}
          profile={editingProfile}
          actorRole={role}
          onClose={() => setShowProfileModal(false)}
          onSaved={async () => {
            setShowProfileModal(false);
            await loadAll();
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Sub-Modals
// ============================================================================

interface LeaveTypeEditModalProps {
  schoolId: string;
  initialData: LeaveType | null;
  onClose: () => void;
  onSaved: () => void;
}

const LeaveTypeEditModal: React.FC<LeaveTypeEditModalProps> = ({ schoolId, initialData, onClose, onSaved }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [code, setCode] = useState(initialData?.code || '');
  const [days, setDays] = useState(String(initialData?.defaultEntitlementDays ?? 21));
  const [isPaid, setIsPaid] = useState(initialData?.isPaid ?? true);
  const [requiresEvidence, setRequiresEvidence] = useState(initialData?.requiresEvidence ?? false);
  const [color, setColor] = useState(initialData?.color || '#059669');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await hrService.saveLeaveType({
        id: initialData?.id,
        schoolId,
        name: name.trim(),
        code: code.trim().toLowerCase(),
        defaultEntitlementDays: Number(days) || 0,
        isPaid,
        requiresEvidence,
        color,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save leave type.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">
            {initialData ? 'Edit Leave Type' : 'Add Leave Type'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="lt-name">Leave Name</label>
            <input
              id="lt-name"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Study Leave"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="lt-code">Code</label>
            <input
              id="lt-code"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. study"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="lt-days">Annual Days</label>
              <input
                id="lt-days"
                type="number"
                min="0"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="lt-color">Color</label>
              <input
                id="lt-color"
                type="color"
                className="w-full h-9 p-1 rounded-xl border border-slate-200"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
              Paid Leave
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={requiresEvidence}
                onChange={(e) => setRequiresEvidence(e.target.checked)}
              />
              Requires Evidence
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>Save Leave Policy</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PayrollProfileEditModalProps {
  schoolId: string;
  profile: any;
  actorRole: UserRole;
  onClose: () => void;
  onSaved: () => void;
}

const PayrollProfileEditModal: React.FC<PayrollProfileEditModalProps> = ({
  schoolId,
  profile,
  actorRole,
  onClose,
  onSaved,
}) => {
  const [baseSalary, setBaseSalary] = useState(String(profile.base_salary || ''));
  const [currency, setCurrency] = useState(profile.currency || 'UGX');
  const [paymentMethod, setPaymentMethod] = useState(profile.payment_method || 'bank_transfer');
  const [bankName, setBankName] = useState(profile.bank_name || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(profile.bank_account_number || '');
  const [bankAccountName, setBankAccountName] = useState(profile.bank_account_name || '');
  const [nssfApplicable, setNssfApplicable] = useState(profile.nssf_applicable ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await hrService.upsertPayrollProfile({
        schoolId,
        employeeId: profile.employee_id,
        baseSalary: Number(baseSalary) || 0,
        currency,
        paymentMethod,
        bankName: bankName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        nssfApplicable,
        actorRole,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payroll profile.');
      setIsSubmitting(false);
    }
  };

  const emp = profile.employee;
  const p = emp?.person;
  const staffName = `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Employee';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Configure Payroll Profile</h3>
            <p className="text-xs text-slate-500">{staffName} ({emp?.employee_number})</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="prof-salary">Base Salary</label>
              <input
                id="prof-salary"
                type="number"
                min="0"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="prof-currency">Currency</label>
              <input
                id="prof-currency"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="prof-method">Payment Method</label>
            <select
              id="prof-method"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          {paymentMethod === 'bank_transfer' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="prof-bank-name">Bank Name</label>
                <input
                  id="prof-bank-name"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  placeholder="e.g. Stanbic Bank Uganda"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="prof-bank-acc">Account Number</label>
                <input
                  id="prof-bank-acc"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="prof-acc-name">Account Name</label>
                <input
                  id="prof-acc-name"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={nssfApplicable}
                onChange={(e) => setNssfApplicable(e.target.checked)}
              />
              NSSF Statutory Deductions (10% Employer + 5% Employee)
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>Save Profile</Button>
          </div>
        </form>
      </div>
    </div>
  );
};
