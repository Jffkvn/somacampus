import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { activityService } from './activityService';
import { feeSetupService, FeeTerm } from '../finance/feeSetupService';
import { studentService, StudentDirectoryRow } from '../students/studentService';
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
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../lib/authContext';
import {
  Trophy,
  Users,
  ShieldCheck,
  Calendar,
  X,
  Lock,
  PlusCircle,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

const ACTIVITY_CATEGORIES = [
  { value: 'sports', label: 'Sports' },
  { value: 'arts', label: 'Arts' },
  { value: 'academic_club', label: 'Academic Club' },
  { value: 'excursion', label: 'Excursion' },
  { value: 'special_service', label: 'Special Service' },
] as const;

export const ActivitiesPage: React.FC = () => {
  const { schoolId, role } = useAuth();
  // Enrolment + activity creation create money obligations: finance roles only.
  // Teachers keep the read-only firewall (RLS enforces the same server-side).
  const isFinance = role === 'admin' || role === 'principal' || role === 'bursar';

  const [terms, setTerms] = useState<FeeTerm[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [activities, setActivities] = useState<SchoolActivity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [roster, setRoster] = useState<ActivityParticipantProjection[]>([]);
  const [pupils, setPupils] = useState<StudentDirectoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New activity form
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<string>('sports');
  const [newIsPaid, setNewIsPaid] = useState(true);
  const [newFee, setNewFee] = useState('50000');
  const [newCapacity, setNewCapacity] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Bulk enrol dialog
  const [enrolTarget, setEnrolTarget] = useState<SchoolActivity | null>(null);
  const [enrolClassFilter, setEnrolClassFilter] = useState('all');
  const [enrolSearch, setEnrolSearch] = useState('');
  const [enrolSelected, setEnrolSelected] = useState<Set<string>>(new Set());
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Clearance Update Modal state
  const [editingStudent, setEditingStudent] = useState<ActivityParticipantProjection | null>(null);
  const [newStatus, setNewStatus] = useState<ClearanceStatus>('cleared');
  const [newBasis, setNewBasis] = useState<ClearanceBasis>('promise_to_pay');
  const [validUntil, setValidUntil] = useState('2026-10-31');
  const [operationalNote, setOperationalNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadRoster = useCallback(async (activityId: string) => {
    if (!activityId) {
      setRoster([]);
      return;
    }
    const rost = await activityService.getRosterForTeacher(activityId, schoolId ?? undefined);
    setRoster(rost);
  }, [schoolId]);

  const loadActivities = useCallback(async (termId: string, preferredActivityId?: string) => {
    if (!schoolId || !termId) return;
    const [acts, dir] = await Promise.all([
      activityService.getActivities(schoolId, termId),
      studentService.getStudentDirectory(schoolId),
    ]);
    setActivities(acts);
    setPupils(dir);
    const nextId = (
      preferredActivityId && acts.some((a) => a.id === preferredActivityId)
        ? preferredActivityId
        : acts[0]?.id
    ) ?? '';
    setSelectedActivityId(nextId);
    await loadRoster(nextId);
  }, [schoolId, loadRoster]);

  useEffect(() => {
    async function load() {
      if (!schoolId) {
        setPageError('No school selected. Sign in first.');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const list = await feeSetupService.getTerms(schoolId);
        setTerms(list);
        const initial = list.find((t) => t.isCurrent) ?? list[0];
        if (!initial) {
          setPageError('No academic terms exist yet. Ask the Admin to set up the academic year first.');
          setIsLoading(false);
          return;
        }
        setSelectedTermId(initial.id);
        await loadActivities(initial.id);
      } catch (err) {
        console.error(err);
        setPageError(err instanceof Error ? err.message : 'Could not load activities.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const onTermChange = async (termId: string) => {
    setSelectedTermId(termId);
    setNotice(null);
    setIsLoading(true);
    try {
      await loadActivities(termId);
    } catch (err) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'Could not load activities.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSelectActivity = async (activityId: string) => {
    setSelectedActivityId(activityId);
    setIsLoading(true);
    try {
      await loadRoster(activityId);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedActivity = activities.find((a) => a.id === selectedActivityId) ?? activities[0];

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !selectedTermId) return;
    const term = terms.find((t) => t.id === selectedTermId);
    if (!term) return;
    if (!newName.trim()) {
      setPageError('Give the activity a name first.');
      return;
    }
    if (newIsPaid && !(Number(newFee) > 0)) {
      setPageError('Paid activities need a fee amount.');
      return;
    }
    setIsCreating(true);
    setPageError(null);
    try {
      const created = await activityService.createActivity({
        schoolId,
        academicYearId: term.academicYearId,
        termId: selectedTermId,
        name: newName,
        category: newCategory as 'sports' | 'arts' | 'academic_club' | 'excursion' | 'special_service',
        isPaid: newIsPaid,
        feeAmount: newIsPaid ? Number(newFee) : 0,
        capacity: newCapacity ? Number(newCapacity) : null,
      });
      setActivities((prev) => [...prev, created]);
      setSelectedActivityId(created.id);
      setShowNewActivity(false);
      setNewName('');
      setNewCapacity('');
      setNotice(
        created.isPaid
          ? `${created.name} created. Enrol pupils below — each one is billed ${formatCurrency(created.feeAmount)} on their fee statement.`
          : `${created.name} created. It is a free club, so enrolling pupils never creates charges.`,
      );
    } catch (err) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'Could not create the activity.');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredPupils = useMemo(() => {
    const q = enrolSearch.trim().toLowerCase();
    return pupils.filter((p) => {
      if (enrolClassFilter !== 'all' && p.className !== enrolClassFilter) return false;
      if (q && !(`${p.fullName} ${p.admissionNumber}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [pupils, enrolClassFilter, enrolSearch]);

  const classOptions = useMemo(() => [...new Set(pupils.map((p) => p.className))].sort(), [pupils]);

  const toggleEnrolPupil = (studentId: string) => {
    setEnrolSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const selectFilteredAll = () => {
    setEnrolSelected((prev) => {
      const next = new Set(prev);
      filteredPupils.forEach((p) => next.add(p.studentId));
      return next;
    });
  };

  const handleEnrol = async () => {
    if (!enrolTarget || !schoolId || enrolSelected.size === 0) return;
    setIsEnrolling(true);
    setPageError(null);
    try {
      const res = await activityService.enrollStudents(schoolId, enrolTarget.id, [...enrolSelected]);
      await loadActivities(selectedTermId, enrolTarget.id);
      setEnrolTarget(null);
      setEnrolSelected(new Set());
      setNotice(
        `${res.enrolled} pupil${res.enrolled === 1 ? '' : 's'} enrolled.` +
          (res.billed > 0 && enrolTarget.isPaid
            ? ` ${res.billed} bill line${res.billed === 1 ? '' : 's'} of ${formatCurrency(enrolTarget.feeAmount)} added to their fee statements — parents see it immediately.`
            : ''),
      );
    } catch (err) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'Enrolment failed.');
    } finally {
      setIsEnrolling(false);
    }
  };

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

      const updated = await activityService.getRosterForTeacher(selectedActivity.id, schoolId ?? undefined);
      setRoster(updated);
      setEditingStudent(null);
    } catch (err) {
      console.error('Failed to save clearance', err);
      setPageError('Could not update clearance.');
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
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
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
            Enrol pupils into clubs. Paid clubs bill automatically through the fees platform — parents see the charge right away.
          </p>
        </div>
        {isFinance && (
          <Button variant="primary" onClick={() => setShowNewActivity((v) => !v)}>
            <span className="inline-flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4" /> New Activity
            </span>
          </Button>
        )}
      </div>

      {notice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {notice}
        </div>
      )}
      {pageError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {pageError}
        </div>
      )}

      {/* Term picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">Term:</span>
        {terms.map((t) => (
          <button
            key={t.id}
            onClick={() => onTermChange(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
              t.id === selectedTermId
                ? 'bg-brand-teal text-white border-brand-teal'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t.name}{t.isCurrent ? ' •' : ''}
          </button>
        ))}
      </div>

      {/* New Activity form */}
      {isFinance && showNewActivity && (
        <Card>
          <CardHeader>
            <CardTitle>New Activity</CardTitle>
            <CardDescription>
              Paid activities bill each enrolled pupil automatically through their fee statement. Free clubs never create charges.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateActivity} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Chess Club"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                >
                  {ACTIVITY_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Capacity (optional)</label>
                <input
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="unlimited"
                  inputMode="numeric"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input
                  id="is-paid"
                  type="checkbox"
                  checked={newIsPaid}
                  onChange={(e) => setNewIsPaid(e.target.checked)}
                  className="w-4 h-4 accent-[#1f7693]"
                />
                <label htmlFor="is-paid" className="text-sm text-slate-700">
                  Paid club — bill each enrolled pupil
                </label>
              </div>
              {newIsPaid && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fee per pupil (UGX)</label>
                  <input
                    value={newFee}
                    onChange={(e) => setNewFee(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="numeric"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                  />
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowNewActivity(false)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={isCreating}>
                  {isCreating ? 'Creating…' : 'Create Activity'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

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

      {/* Activity Selector Cards */}
      {activities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            No activities for this term yet.
            {isFinance ? ' Use "New Activity" to create the first club.' : ' Ask the school office to create clubs.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activities.map((act) => {
            const isSelected = act.id === selectedActivityId;
            return (
              <div
                key={act.id}
                onClick={() => void onSelectActivity(act.id)}
                className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                  isSelected
                    ? 'border-brand-teal bg-teal-50/50 shadow-sm ring-2 ring-brand-teal/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">{act.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">{act.category.replace('_', ' ')}</p>
                  </div>
                  <Trophy className={`w-5 h-5 ${isSelected ? 'text-brand-teal' : 'text-slate-400'}`} />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2.5">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    {act.enrolledCount ?? 0}{act.capacity ? ` / ${act.capacity}` : ''} Enrolled
                  </span>
                  <span className={`font-semibold ${act.isPaid ? 'text-brand-teal' : 'text-slate-400'}`}>
                    {act.isPaid ? `Paid • ${formatCurrency(act.feeAmount)}` : 'Free'}
                  </span>
                </div>

                {isFinance && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setEnrolTarget(act);
                      setEnrolSelected(new Set());
                      setEnrolSearch('');
                      setEnrolClassFilter('all');
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" /> Enrol Pupils
                    </span>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

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
                Lead Teacher: {selectedActivity.leadTeacherName || 'Staff Coach'} • Max Capacity: {selectedActivity.capacity ?? 'Unlimited'}
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
                        {isFinance && ' Use "Enrol Pupils" on the activity card above.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Enrol Dialog */}
      {enrolTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Enrol pupils — {enrolTarget.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {enrolTarget.isPaid
                    ? `Paid club: each selected pupil is billed ${formatCurrency(enrolTarget.feeAmount)} on their fee statement. Pupils already enrolled are skipped — nobody is billed twice.`
                    : 'Free club: enrolling never creates charges.'}
                </p>
              </div>
              <button onClick={() => setEnrolTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={enrolSearch}
                    onChange={(e) => setEnrolSearch(e.target.value)}
                    placeholder="Search pupil or admission number…"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
                  />
                </div>
                <select
                  value={enrolClassFilter}
                  onChange={(e) => setEnrolClassFilter(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg p-2"
                >
                  <option value="all">All classes</option>
                  {classOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={selectFilteredAll}>
                  Select all shown
                </Button>
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {filteredPupils.map((p) => (
                  <label
                    key={p.studentId}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={enrolSelected.has(p.studentId)}
                      onChange={() => toggleEnrolPupil(p.studentId)}
                      className="w-4 h-4 accent-[#1f7693]"
                    />
                    <span className="text-sm font-semibold text-slate-800">{p.fullName}</span>
                    <span className="text-xs text-slate-400 ml-auto">{p.admissionNumber} • {p.className}</span>
                  </label>
                ))}
                {filteredPupils.length === 0 && (
                  <p className="p-4 text-center text-sm text-slate-400">No pupils match.</p>
                )}
              </div>

              {enrolTarget.isPaid && enrolSelected.size > 0 && (
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-900">
                  <strong>{enrolSelected.size} pupil{enrolSelected.size === 1 ? '' : 's'}</strong> ×{' '}
                  {formatCurrency(enrolTarget.feeAmount)} ={' '}
                  <strong>{formatCurrency(enrolTarget.feeAmount * enrolSelected.size)}</strong> will be added to their
                  fee statements. Pupils already in this club are skipped.
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEnrolTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleEnrol}
                disabled={isEnrolling || enrolSelected.size === 0}
              >
                {isEnrolling
                  ? 'Enrolling…'
                  : `Enrol ${enrolSelected.size || ''} pupil${enrolSelected.size === 1 ? '' : 's'}${enrolTarget.isPaid ? ' & bill' : ''}`}
              </Button>
            </div>
          </div>
        </div>
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
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
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
