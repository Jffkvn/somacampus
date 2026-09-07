import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, FileText, Search, Users, XCircle } from 'lucide-react';
import { admissionService, type AdmissionApplicationRow } from './admissionService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

const statusVariant = (status: string): StatusVariant =>
  status === 'approved' ? 'success' : status === 'rejected' ? 'critical' : 'pending';

export const AdmissionsQueuePage: React.FC = () => {
  const { role, schoolId } = useAuth();
  const effectiveSchoolId = schoolId ?? PILOT_SCHOOL_ID;

  const [rows, setRows] = useState<AdmissionApplicationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approvedStudentId, setApprovedStudentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      setRows(await admissionService.listApplications(effectiveSchoolId));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load the admissions queue.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSchoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'pending' && r.status !== 'pending') return false;
      if (!q) return true;
      return (
        r.pupilName.toLowerCase().includes(q) ||
        r.guardians.some((g) => g.name.toLowerCase().includes(q))
      );
    });
  }, [rows, filter, search]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const handleApprove = async () => {
    if (!selected) return;
    setActionError(null);
    setIsActing(true);
    try {
      const res = await admissionService.approveApplication(selected.id, role);
      setApprovedStudentId(res.studentId);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setIsActing(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActionError(null);
    setIsActing(true);
    try {
      await admissionService.rejectApplication(selected.id, role, rejectReason);
      setRejectReason('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading admissions queue..." />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Admissions</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Admissions Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review applications — approval creates the student record atomically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status="pending" label={`${rows.filter((r) => r.status === 'pending').length} pending`} />
          <Link to="/students/new">
            <Button variant="primary" size="sm">Admit student</Button>
          </Link>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by pupil or guardian name..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50"
          />
        </div>
        <div className="flex gap-2">
          <Button variant={filter === 'pending' ? 'primary' : 'outline'} size="sm" onClick={() => setFilter('pending')}>
            Pending
          </Button>
          <Button variant={filter === 'all' ? 'primary' : 'outline'} size="sm" onClick={() => setFilter('all')}>
            All
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No applications found"
          description={
            rows.length === 0
              ? 'No admission applications are visible for this school right now.'
              : 'No applications match the current filter. Try “All” or a different search.'
          }
          actionLabel="Admit student"
          onAction={() => window.location.assign('/students/new')}
        />
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setSelectedId(r.id); setApprovedStudentId(null); setActionError(null); }}
                    className={`w-full flex items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-teal-50/40 ${
                      selectedId === r.id ? 'bg-teal-50/60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-brand-teal">
                          {r.pupilName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{r.pupilName}</p>
                        <p className="text-xs text-slate-400">
                          {r.guardians.length} guardian{r.guardians.length === 1 ? '' : 's'} • {r.documents.length} doc{r.documents.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill status={statusVariant(r.status)} label={r.status} />
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            {!selected ? (
              <CardContent className="p-8 text-center">
                <p className="text-sm text-slate-500">Select an application to review it.</p>
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <div>
                    <CardTitle>{selected.pupilName}</CardTitle>
                    <CardDescription>
                      Applied {selected.createdAt ? selected.createdAt.slice(0, 10) : 'recently'}
                      {selected.dob ? ` • born ${selected.dob}` : ''}
                      {selected.classId ? '' : ' • no class assigned yet'}
                    </CardDescription>
                  </div>
                  <StatusPill status={statusVariant(selected.status)} label={selected.status} />
                </CardHeader>
                <CardContent className="space-y-5">
                  {approvedStudentId && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                        <CheckCircle2 className="w-4 h-4" /> Approved — student record created
                      </p>
                      <Link
                        to={`/students/${approvedStudentId}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        Open student profile <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  )}

                  {selected.approvedStudentId && selected.status === 'approved' && !approvedStudentId && (
                    <Link
                      to={`/students/${selected.approvedStudentId}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-teal hover:text-teal-700"
                    >
                      Open student profile <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Guardians ({selected.guardians.length})
                    </p>
                    {selected.guardians.length === 0 ? (
                      <p className="text-xs text-slate-500">No guardians recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {selected.guardians.map((g, i) => (
                          <div key={g.id ?? i} className="flex items-center justify-between gap-3 text-sm p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{g.name}</p>
                              <p className="text-xs text-slate-500">
                                {g.relationship}{g.phone ? ` • ${g.phone}` : ''}{g.email ? ` • ${g.email}` : ''}
                              </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {g.isPrimary && <StatusPill status="info" label="primary" />}
                              {g.isEmergency && <StatusPill status="warning" label="emergency" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Documents ({selected.documents.length})
                    </p>
                    {selected.documents.length === 0 ? (
                      <p className="text-xs text-slate-500">No documents uploaded.</p>
                    ) : (
                      <div className="space-y-2">
                        {selected.documents.map((d, i) => (
                          <p key={d.id ?? i} className="flex items-center gap-2 text-xs text-slate-600 font-mono truncate">
                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{d.storagePath}</span>
                            <span className="text-slate-400 shrink-0">({d.docType})</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {selected.status === 'pending' && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      {actionError && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>{actionError}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="primary" size="sm" isLoading={isActing} onClick={handleApprove}>
                          Approve
                        </Button>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5" htmlFor="reject-reason">
                          Rejection reason (required)
                        </label>
                        <textarea
                          id="reject-reason"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50"
                          rows={2}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="e.g. Missing birth certificate, class full…"
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          isLoading={isActing}
                          disabled={rejectReason.trim() === ''}
                          leftIcon={<XCircle className="w-4 h-4" />}
                          onClick={handleReject}
                          className="mt-2"
                        >
                          Reject with reason
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
