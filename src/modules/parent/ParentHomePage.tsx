/**
 * Parent Home Portal — SomaCampus Phase 8A Task 3.
 *
 * Read-only per-child overview for guardians: academic (visible lesson notes,
 * parent-visible observations, assignments w/ status), attendance, fee
 * statement, and activity participation. Multi-child households switch via
 * the child selector; only the selected child's projection is ever rendered
 * (no sibling leakage). Amounts appear ONLY inside the finance card; the
 * finance view is read-only (no Pay Now). No phone numbers anywhere.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { parentService } from './parentService';
import type { ParentChildSummary, ParentChildOverview } from '../../types/domain';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Users, BookOpen, CalendarCheck, Wallet, Trophy } from 'lucide-react';

function submissionPill(status: string): { status: StatusVariant; label: string } {
  switch (status) {
    case 'submitted':
      return { status: 'success', label: 'Submitted' };
    case 'late':
      return { status: 'warning', label: 'Late' };
    case 'missing':
      return { status: 'critical', label: 'Missing' };
    default:
      return { status: 'pending', label: status || 'Pending' };
  }
}

function clearancePill(status: string): { status: StatusVariant; label: string } {
  switch (status) {
    case 'cleared':
      return { status: 'success', label: 'Cleared' };
    case 'partial':
      return { status: 'warning', label: 'Partially paid' };
    case 'overdue':
      return { status: 'critical', label: 'Overdue' };
    default:
      return { status: 'pending', label: status || 'Pending' };
  }
}

function attendancePill(percentage: number): { status: StatusVariant; label: string } {
  const label = `${percentage}% attendance`;
  if (percentage >= 90) return { status: 'success', label };
  if (percentage >= 75) return { status: 'info', label };
  if (percentage >= 50) return { status: 'warning', label };
  return { status: 'critical', label };
}

function activityPill(status: string): { status: StatusVariant; label: string } {
  switch (status) {
    case 'cleared':
      return { status: 'success', label: 'Cleared' };
    case 'not_cleared':
      return { status: 'critical', label: 'Not cleared' };
    default:
      return { status: 'pending', label: 'Pending review' };
  }
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export const ParentHomePage: React.FC = () => {
  const { schoolId } = useAuth();
  const [children, setChildren] = useState<ParentChildSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<ParentChildOverview | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChildren = useCallback(async () => {
    if (!schoolId) {
      setChildren([]);
      setLoadingChildren(false);
      return;
    }
    try {
      setLoadingChildren(true);
      setError(null);
      const rows = await parentService.getParentChildren(schoolId);
      setChildren(rows);
      setSelectedId((prev) => (prev && rows.some((r) => r.studentId === prev) ? prev : rows[0]?.studentId ?? null));
    } catch (err) {
      console.error('Failed to load linked children', err);
      setError('Could not load your children. Please try again.');
      setChildren([]);
    } finally {
      setLoadingChildren(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    async function loadOverview() {
      if (!schoolId || !selectedId) {
        setOverview(null);
        return;
      }
      try {
        setLoadingOverview(true);
        setError(null);
        setOverview(await parentService.getChildOverview(schoolId, selectedId));
      } catch (err) {
        console.error('Failed to load child overview', err);
        setError('Could not load this child’s overview. Please try again.');
        setOverview(null);
      } finally {
        setLoadingOverview(false);
      }
    }
    loadOverview();
  }, [schoolId, selectedId]);

  if (loadingChildren) {
    return <LoadingState label="Loading your children..." />;
  }

  if (error && children.length === 0 && !overview) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={Users}
          title="Something went wrong"
          description={error}
          actionLabel="Retry"
          onAction={loadChildren}
        />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <div className="pb-6 border-b border-slate-200/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Family Portal</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">Home &amp; Overview</h1>
        </div>
        <EmptyState
          icon={Users}
          title="No linked children"
          description="No children are currently linked to your account at this school. Please contact the school office to link your family."
        />
      </div>
    );
  }

  const selected = children.find((c) => c.studentId === selectedId) ?? children[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="pb-6 border-b border-slate-200/80">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Family Portal</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">Home &amp; Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Learning progress, attendance, fees and activities for your {children.length > 1 ? 'children' : 'child'}.</p>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Select child">
          {children.map((c) => (
            <button
              key={c.studentId}
              role="tab"
              aria-selected={c.studentId === selected.studentId}
              onClick={() => setSelectedId(c.studentId)}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                c.studentId === selected.studentId
                  ? 'bg-brand-teal text-white border-brand-teal'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loadingOverview ? (
        <LoadingState label={`Loading ${selected.name}’s overview...`} />
      ) : !overview ? (
        <EmptyState
          icon={Users}
          title="No overview available"
          description={`${selected.name}’s overview could not be loaded right now. Please try again later.`}
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-brand-teal">{overview.child.name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">{overview.child.name}</p>
                <p className="text-xs text-slate-400">{overview.child.admission} • {overview.child.class}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  <span className="inline-flex items-center gap-2"><BookOpen className="w-4 h-4 text-brand-teal" /> Learning</span>
                </CardTitle>
                <CardDescription>Recent class notes, teacher observations and assignments.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Recent lesson notes</p>
                {overview.academic.recentLessonNotes.length === 0 ? (
                  <p className="text-sm text-slate-400">No lesson notes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {overview.academic.recentLessonNotes.map((n, i) => (
                      <li key={`${n.date}-${i}`} className="text-sm bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                        <p className="font-semibold text-slate-800">{n.subjectName} <span className="font-normal text-slate-400">• {n.date}</span></p>
                        <p className="text-slate-600 mt-0.5">{n.visibleNote}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Teacher observations</p>
                {overview.academic.observations.length === 0 ? (
                  <p className="text-sm text-slate-400">No observations shared yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {overview.academic.observations.map((o) => (
                      <li key={o.id} className="text-sm bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                        <p className="font-semibold text-slate-800">{o.subjectName} <span className="font-normal text-slate-400">• {o.teacherName} • {o.date}</span></p>
                        <p className="text-slate-600 mt-0.5">{o.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Assignments</p>
                {overview.academic.assignments.length === 0 ? (
                  <p className="text-sm text-slate-400">No assignments yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {overview.academic.assignments.map((a) => {
                      const pill = submissionPill(a.submissionStatus);
                      return (
                        <li key={a.assignmentId} className="flex items-center justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
                            <p className="text-xs text-slate-400">{a.subjectName}{a.dueDate ? ` • Due ${a.dueDate}` : ''}</p>
                            {a.teacherFeedback && <p className="text-xs text-slate-500 mt-0.5">Feedback: {a.teacherFeedback}</p>}
                          </div>
                          <StatusPill status={pill.status} label={pill.label} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  <span className="inline-flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-brand-teal" /> Attendance</span>
                </CardTitle>
                <CardDescription>Daily attendance record for this term.</CardDescription>
              </div>
              <StatusPill status={attendancePill(overview.attendance.percentage).status} label={attendancePill(overview.attendance.percentage).label} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-slate-600"><strong className="text-slate-900">{overview.attendance.present}</strong> present</span>
                <span className="text-slate-600"><strong className="text-slate-900">{overview.attendance.absent}</strong> absent</span>
                <span className="text-slate-600"><strong className="text-slate-900">{overview.attendance.late}</strong> late</span>
                <span className="text-slate-600"><strong className="text-slate-900">{overview.attendance.excused}</strong> excused</span>
              </div>
              {overview.attendance.recentRecords.length === 0 ? (
                <p className="text-sm text-slate-400">No attendance records yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {overview.attendance.recentRecords.map((r, i) => (
                    <li key={`${r.date}-${i}`} className="flex items-center justify-between gap-4 py-2">
                      <p className="text-sm text-slate-700">{r.date}{r.remarks ? <span className="text-slate-400"> • {r.remarks}</span> : null}</p>
                      <StatusPill
                        status={r.status === 'present' ? 'success' : r.status === 'late' || r.status === 'excused' ? 'warning' : 'critical'}
                        label={r.status}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  <span className="inline-flex items-center gap-2"><Wallet className="w-4 h-4 text-brand-teal" /> Fee Statement</span>
                </CardTitle>
                <CardDescription>Read-only statement. For payment options, please visit the school office.</CardDescription>
              </div>
              {overview.finance && (() => {
                const pill = clearancePill(overview.finance.clearanceStatus);
                return <StatusPill status={pill.status} label={pill.label} />;
              })()}
            </CardHeader>
            <CardContent className="space-y-4">
              {!overview.finance ? (
                <p className="text-sm text-slate-400">No fee statement available yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
                      <p className="text-xs text-slate-400">Assessed</p>
                      <p className="text-sm font-bold text-slate-900">{formatMoney(overview.finance.totalAssessed, 'UGX')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
                      <p className="text-xs text-slate-400">Paid</p>
                      <p className="text-sm font-bold text-emerald-700">{formatMoney(overview.finance.totalPaid, 'UGX')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
                      <p className="text-xs text-slate-400">Balance</p>
                      <p className="text-sm font-bold text-slate-900">{formatMoney(overview.finance.balance, 'UGX')}</p>
                    </div>
                  </div>
                  {overview.finance.charges.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Charges</p>
                      <ul className="divide-y divide-slate-100">
                        {overview.finance.charges.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-4 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{c.description}</p>
                              <p className="text-xs text-slate-400">Due {c.dueDate}</p>
                            </div>
                            <p className="text-sm font-bold text-slate-900 shrink-0">{formatMoney(c.balance, c.currency)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {overview.finance.payments.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Payments received</p>
                      <ul className="divide-y divide-slate-100">
                        {overview.finance.payments.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-4 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800">{formatMoney(p.amount, p.currency)}</p>
                              <p className="text-xs text-slate-400">{p.paymentDate}{p.receiptNumber ? ` • ${p.receiptNumber}` : ''}</p>
                            </div>
                            <StatusPill status="info" label={p.status.replace(/_/g, ' ')} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  <span className="inline-flex items-center gap-2"><Trophy className="w-4 h-4 text-brand-teal" /> Activities</span>
                </CardTitle>
                <CardDescription>Club participation and clearance status.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {overview.activities.length === 0 ? (
                <EmptyState
                  icon={Trophy}
                  title="No activities yet"
                  description={`${overview.child.name} is not enrolled in any clubs or activities this term.`}
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {overview.activities.map((a) => {
                    const pill = activityPill(a.clearanceStatus);
                    return (
                      <li key={a.activityId} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{a.activityName}</p>
                          <p className="text-xs text-slate-500">{a.clearanceLabel}{a.validUntil ? ` • Valid until ${a.validUntil}` : ''}</p>
                          {a.operationalNote && <p className="text-xs text-slate-400 mt-0.5">{a.operationalNote}</p>}
                        </div>
                        <StatusPill status={pill.status} label={pill.label} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
