import React, { useState, useEffect } from 'react';
import { activityService } from './activityService';
import {
  SchoolActivity,
  ActivityParticipantProjection,
  ClearanceStatus,
  ClearanceBasis,
} from '../../types/domain';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import {
  Trophy,
  Users,
  ShieldCheck,
  Calendar,
  X,
  Lock,
} from 'lucide-react';

export const ActivitiesPage: React.FC = () => {
  const [activities, setActivities] = useState<SchoolActivity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('act-swimming');
  const [roster, setRoster] = useState<ActivityParticipantProjection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Clearance Update Modal state (for Bursar/Leadership)
  const [editingStudent, setEditingStudent] = useState<ActivityParticipantProjection | null>(null);
  const [newStatus, setNewStatus] = useState<ClearanceStatus>('cleared');
  const [newBasis, setNewBasis] = useState<ClearanceBasis>('promise_to_pay');
  const [validUntil, setValidUntil] = useState('2026-10-31');
  const [operationalNote, setOperationalNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      const acts = await activityService.getActivities('school-default', 'term-1');
      setActivities(acts);
      if (acts.length > 0) {
        const activeId = selectedActivityId || acts[0].id;
        const rost = await activityService.getRosterForTeacher(activeId);
        setRoster(rost);
      }
    } catch (err) {
      console.error('Failed to load activities', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedActivityId]);

  const selectedActivity = activities.find((a) => a.id === selectedActivityId) || activities[0];

  const handleUpdateClearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !selectedActivity) return;

    try {
      setIsSaving(true);
      await activityService.setOperationalClearance({
        schoolId: selectedActivity.schoolId,
        activityId: selectedActivity.id,
        studentId: editingStudent.studentId,
        status: newStatus,
        basis: newBasis,
        validUntil,
        operationalNote,
      });

      // Reload roster
      const updated = await activityService.getRosterForTeacher(selectedActivity.id);
      setRoster(updated);
      setEditingStudent(null);
    } catch (err) {
      console.error('Failed to save clearance', err);
      alert('Could not update clearance');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusVariant = (status: ClearanceStatus): 'success' | 'warning' | 'critical' | 'pending' => {
    if (status === 'cleared') return 'success';
    if (status === 'pending_review') return 'pending';
    return 'critical';
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingState label="Loading school activities and roster..." />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-sky-100 text-sky-800">
              Co-Curricular & Sports
            </span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Teacher Financial Firewall
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            School Activities & Co-Curricular Roster
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Decoupled operational clearances: coaches and teachers see participation authorization with zero fee balances.
          </p>
        </div>
      </div>

      {/* Teacher Financial Privacy Firewall Notice */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 leading-relaxed">
          <strong className="font-semibold block text-sky-950 mb-0.5">
            Teacher & Coach Financial Privacy Firewall Active
          </strong>
          Participation authorization is strictly decoupled from ledger debts. Teachers and coaches view operational status
          (e.g., <span className="font-mono font-medium text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded">✓ Cleared • Promise to Pay</span> or <span className="font-mono font-medium text-sky-800 bg-sky-50 px-1 py-0.5 rounded">✓ Cleared • Sponsored</span>). Student fee balances, arrears, and parent payment histories are strictly concealed.
        </div>
      </div>

      {/* Activity Selector Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activities.map((act) => {
          const isSelected = act.id === selectedActivityId;
          return (
            <div
              key={act.id}
              onClick={() => setSelectedActivityId(act.id)}
              className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                isSelected
                  ? 'border-brand-teal bg-teal-50/50 shadow-sm ring-2 ring-brand-teal/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">{act.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Lead: {act.leadTeacherName || 'Staff Coach'}
                  </p>
                </div>
                <Trophy className={`w-5 h-5 ${isSelected ? 'text-brand-teal' : 'text-slate-400'}`} />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2.5">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {act.enrolledCount} / {act.capacity} Enrolled
                </span>
                <span className="capitalize font-medium text-slate-700">
                  {act.category.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Activity Roster Card */}
      {selectedActivity && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CardTitle>{selectedActivity.name}</CardTitle>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full font-medium">
                  {roster.length} participants
                </span>
              </div>
              <CardDescription>
                Lead Teacher: {selectedActivity.leadTeacherName || 'Staff Coach'} • Max Capacity: {selectedActivity.capacity}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Click any student to adjust operational clearance (Admin/Bursar)
              </span>
            </div>
          </CardHeader>

          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Participant</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Operational Status</th>
                    <th className="py-3 px-4">Clearance Basis</th>
                    <th className="py-3 px-4">Valid Until</th>
                    <th className="py-3 px-4">Operational Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {roster.map((p) => (
                    <tr key={p.studentId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {p.studentName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {p.className}
                      </td>
                      <td className="py-3 px-4">
                        <StatusPill
                          status={getStatusVariant(p.clearanceStatus)}
                          label={p.clearanceStatus === 'cleared' ? 'Cleared' : p.clearanceStatus.replace('_', ' ').toUpperCase()}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                          {p.clearanceLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {p.validUntil ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {p.validUntil}
                          </span>
                        ) : (
                          'Full Term'
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {p.operationalNote || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingStudent(p);
                            setNewStatus(p.clearanceStatus);
                            setOperationalNote(p.operationalNote || '');
                            setValidUntil(p.validUntil || '2026-10-31');
                          }}
                        >
                          Clearance
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {roster.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                        No students enrolled in this activity.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clearance Update Modal */}
      {editingStudent && selectedActivity && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Update Operational Clearance
                </h3>
                <p className="text-xs text-slate-500">
                  {editingStudent.studentName} • {selectedActivity.name}
                </p>
              </div>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateClearance} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Authorization Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as ClearanceStatus)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value="cleared">Cleared (Authorized to Participate)</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="not_cleared">Not Cleared (Restricted from event)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Clearance Basis
                </label>
                <select
                  value={newBasis}
                  onChange={(e) => setNewBasis(e.target.value as ClearanceBasis)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value="paid">Paid in Full</option>
                  <option value="promise_to_pay">Promise to Pay (Parent Commitment)</option>
                  <option value="waived">Fee Waived (Principal Discretion)</option>
                  <option value="sponsored">Sponsored (Scholarship / External)</option>
                  <option value="included">Included in Universal Tuition</option>
                  <option value="admin_override">Administrative Override</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Valid Until Date
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Operational Note for Coach/Teacher
                </label>
                <textarea
                  value={operationalNote}
                  onChange={(e) => setOperationalNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Cleared to travel for gala; parent promised to complete fee installment next Monday."
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                <span className="font-semibold">Teacher Privacy Firewall:</span> This note will be visible to the activity lead/coach, but NO financial figures or debt calculations are transmitted.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setEditingStudent(null)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSaving}>
                  Save Clearance
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
