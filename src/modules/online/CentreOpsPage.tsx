import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/authContext';
import { centreOpsService } from './centreOpsService';
import type {
  CentreDayResult,
  CentreProgramme,
  CentreOffering,
  ProgrammeEconomics,
} from './centreOpsService';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  CalendarDays,
  Users,
  UserCheck,
  Clock,
  Wallet,
  Coins,
  Scale,
  Layers,
  Video,
} from 'lucide-react';

/**
 * Phase 9G Task 1 — centre operations dashboard.
 *
 * ROUTE/ROLE DECISION (documented): this is the full page for money roles
 * only (admin = director-level, principal, bursar — see the RequireAccess
 * gate on /online/centre in App.tsx + ROUTE_ROLE_ALLOWLIST). Teachers keep
 * their existing operational day view at /teaching/online and are
 * redirected here by the route gate, so no role-conditional money sections
 * are needed inside this page: every viewer may see amounts. The SERVICE
 * still redacts money keys for teachers (defence in depth, pinned by
 * centre-ops.test.ts) in case it is ever reused on a teacher surface.
 */

const SESSION_PILL: Record<string, StatusVariant> = {
  SCHEDULED: 'info',
  CONFIRMED: 'pending',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'critical',
};

function todayYYYYMMDD(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatUGX(amount: number): string {
  return `UGX ${Math.round(amount).toLocaleString('en-UG')}`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export const CentreOpsPage: React.FC = () => {
  const { role, schoolId } = useAuth();
  const viewer = { role };

  const [date, setDate] = useState(todayYYYYMMDD());
  const [day, setDay] = useState<CentreDayResult | null>(null);
  const [isDayLoading, setIsDayLoading] = useState(true);
  const [dayError, setDayError] = useState<string | null>(null);

  const [programmes, setProgrammes] = useState<CentreProgramme[]>([]);
  const [offerings, setOfferings] = useState<CentreOffering[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>('');
  const [periodFrom, setPeriodFrom] = useState(todayYYYYMMDD().slice(0, 8) + '01');
  const [periodTo, setPeriodTo] = useState(todayYYYYMMDD());
  const [economics, setEconomics] = useState<ProgrammeEconomics | null>(null);
  const [isEconLoading, setIsEconLoading] = useState(false);
  const [econError, setEconError] = useState<string | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  const [newProgrammeName, setNewProgrammeName] = useState('');
  const [newOfferingTitle, setNewOfferingTitle] = useState('');
  const [newOfferingFormat, setNewOfferingFormat] = useState('small_group');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadDay = useCallback(async () => {
    if (!schoolId) return;
    try {
      setIsDayLoading(true);
      setDayError(null);
      setDay(await centreOpsService.getCentreDay(schoolId, date, viewer));
    } catch (err: any) {
      setDayError(err?.message ?? 'Could not load centre day. Please try again.');
    } finally {
      setIsDayLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, date]);

  const loadCatalogue = useCallback(async () => {
    if (!schoolId) return;
    try {
      setCatalogueError(null);
      // Management view loads the FULL catalogue (active + inactive) so
      // retired rows stay listed with re-activate actions; dropdowns below
      // derive their active-only options from the same lists.
      const progs = await centreOpsService.listProgrammes(schoolId, viewer, { includeInactive: true });
      setProgrammes(progs);
      setSelectedProgrammeId((prev) => prev || progs.find((p) => p.active)?.id || progs[0]?.id || '');
      const offs = await centreOpsService.listOfferings(schoolId, viewer, undefined, { includeInactive: true });
      setOfferings(offs);
    } catch (err: any) {
      setCatalogueError(err?.message ?? 'Could not load programmes. Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const loadEconomics = useCallback(async () => {
    if (!schoolId || !selectedProgrammeId) {
      setEconomics(null);
      return;
    }
    try {
      setIsEconLoading(true);
      setEconError(null);
      setEconomics(
        await centreOpsService.getProgrammeEconomics(
          schoolId,
          selectedProgrammeId,
          { from: periodFrom, to: periodTo },
          viewer,
        ),
      );
    } catch (err: any) {
      setEconError(err?.message ?? 'Could not load programme economics. Please try again.');
    } finally {
      setIsEconLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, selectedProgrammeId, periodFrom, periodTo]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  useEffect(() => {
    loadEconomics();
  }, [loadEconomics]);

  async function handleCreateProgramme() {
    if (!schoolId) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      await centreOpsService.createProgramme(schoolId, { name: newProgrammeName }, viewer);
      setNewProgrammeName('');
      await loadCatalogue();
    } catch (err: any) {
      setSaveError(err?.message ?? 'Could not create programme.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateOffering() {
    if (!schoolId || !selectedProgrammeId) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      await centreOpsService.createOffering(
        schoolId,
        { programmeId: selectedProgrammeId, title: newOfferingTitle, deliveryFormat: newOfferingFormat },
        viewer,
      );
      setNewOfferingTitle('');
      const offs = await centreOpsService.listOfferings(schoolId, viewer, undefined, { includeInactive: true });
      setOfferings(offs);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Could not create offering.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleOffering(offering: CentreOffering) {
    if (!schoolId) return;
    try {
      setSaveError(null);
      await centreOpsService.updateOffering(schoolId, offering.id, { active: !offering.active }, viewer);
      const offs = await centreOpsService.listOfferings(schoolId, viewer, undefined, { includeInactive: true });
      setOfferings(offs);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Could not update offering.');
    }
  }

  async function handleToggleProgramme(programme: CentreProgramme) {
    if (!schoolId) return;
    try {
      setSaveError(null);
      await centreOpsService.updateProgramme(schoolId, programme.id, { active: !programme.active }, viewer);
      const progs = await centreOpsService.listProgrammes(schoolId, viewer, { includeInactive: true });
      setProgrammes(progs);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Could not update programme.');
    }
  }

  if (!schoolId) {
    return (
      <EmptyState
        icon={Layers}
        title="No school context"
        description="Centre operations needs an active school. Please sign in again."
      />
    );
  }

  const programmeOfferings = offerings.filter((o) =>
    selectedProgrammeId ? o.programmeId === selectedProgrammeId : true,
  );
  // Dropdowns stay active-only; the manager below lists the full catalogue
  // (including inactive rows with re-activate actions).
  const activeProgrammes = programmes.filter((p) => p.active);
  const managerProgrammes = selectedProgrammeId
    ? programmes.filter((p) => p.id === selectedProgrammeId)
    : programmes;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Online Centre
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Centre Operations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Today's sessions, teaching load and contribution margin — signed in as {role}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
            aria-label="Centre day date"
          />
          <Button variant="outline" size="sm" onClick={() => { loadDay(); loadEconomics(); }}>
            Refresh
          </Button>
        </div>
      </div>

      {isDayLoading ? (
        <LoadingState label="Loading centre day..." />
      ) : dayError ? (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="py-4 text-sm text-red-800">{dayError}</CardContent>
        </Card>
      ) : day ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Scheduled" value={day.stats.scheduled} subValue={`${day.stats.total} sessions total`} icon={CalendarDays} />
            <StatCard label="Completed" value={day.stats.completed} subValue="Approved terminal state" icon={Video} iconColor="text-emerald-600" />
            <StatCard label="Cancelled" value={day.stats.cancelled} subValue="Never costed" icon={CalendarDays} iconColor="text-slate-400" />
            <StatCard label="Pending" value={day.stats.pending} subValue="In flight / unresolved" icon={Clock} iconColor="text-amber-600" />
            <StatCard label="Active learners" value={day.stats.activeLearners} subValue="Participants today" icon={Users} />
            <StatCard label="Active teachers" value={day.stats.activeTeachers} subValue="Teaching today" icon={UserCheck} />
            <StatCard label="Teaching hours" value={day.stats.teachingHours} subValue="Completed durations" icon={Clock} iconColor="text-sky-600" />
          </div>

          {(day.revenue !== undefined || day.cost !== undefined || day.margin !== undefined) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="Invoiced Charges" value={formatUGX(day.revenue ?? 0)} subValue="Charges from online enrolments" icon={Wallet} iconColor="text-emerald-600" />
              <StatCard label="Teacher Sessional Cost" value={formatUGX(day.cost ?? 0)} subValue="Completed sessions × compensation rates" icon={Coins} iconColor="text-orange-600" />
              <StatCard label="Gross Contribution" value={formatUGX(day.margin ?? 0)} subValue="Invoiced charges minus teacher cost" icon={Scale} iconColor="text-brand-teal" />
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Video className="w-4 h-4 text-brand-teal" />
                Sessions on {day.date} ({day.sessions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {day.sessions.length === 0 ? (
                <EmptyState
                  icon={Video}
                  title="No sessions this day"
                  description="No online sessions are scheduled for this date."
                />
              ) : (
                <div className="space-y-2">
                  {day.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl border bg-white border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-center">
                          <p className="text-sm font-bold text-slate-900">{hhmm(s.scheduledStart)}</p>
                          <p className="text-[11px] text-slate-400">{hhmm(s.scheduledEnd)} • {s.durationHours}h</p>
                        </div>
                        <div className="border-l border-slate-200 pl-3">
                          <p className="text-sm font-bold text-slate-900">{s.offeringId ?? 'Online session'}</p>
                          <p className="text-xs text-slate-500">Teacher {s.teacherId}</p>
                        </div>
                      </div>
                      <StatusPill status={SESSION_PILL[s.status] ?? 'neutral'} label={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Scale className="w-4 h-4 text-brand-teal" />
            Programme economics
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
              Programme
              <select
                value={selectedProgrammeId}
                onChange={(e) => setSelectedProgrammeId(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white min-w-52"
                aria-label="Programme"
              >
                <option value="">Select programme</option>
                {activeProgrammes.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
              From
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                aria-label="Period from"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
              To
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                aria-label="Period to"
              />
            </label>
          </div>

          {catalogueError && <p className="text-sm text-red-700">{catalogueError}</p>}
          {isEconLoading ? (
            <LoadingState label="Loading programme economics..." />
          ) : econError ? (
            <p className="text-sm text-red-700">{econError}</p>
          ) : !economics ? (
            <EmptyState
              icon={Scale}
              title="No programme selected"
              description="Select a programme and period to see revenue, cost and margin per offering."
            />
          ) : economics.offerings.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No offerings"
              description="This programme has no offerings yet. Create one below."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2">Offering</th>
                    <th className="px-4 py-2 text-right">Completed</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {economics.offerings.map((o) => (
                    <tr key={o.offeringId} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-semibold text-slate-900">{o.title}</td>
                      <td className="px-4 py-2 text-right">{o.sessionsCompleted}</td>
                      <td className="px-4 py-2 text-right">{formatUGX(o.revenue)}</td>
                      <td className="px-4 py-2 text-right">{formatUGX(o.cost)}</td>
                      <td className="px-4 py-2 text-right font-bold">{formatUGX(o.margin)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right">
                      {economics.offerings.reduce((n, o) => n + o.sessionsCompleted, 0)}
                    </td>
                    <td className="px-4 py-2 text-right">{formatUGX(economics.totals.revenue)}</td>
                    <td className="px-4 py-2 text-right">{formatUGX(economics.totals.cost)}</td>
                    <td className="px-4 py-2 text-right">{formatUGX(economics.totals.margin)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-teal" />
            Programme &amp; offering management
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {saveError && <p className="text-sm text-red-700">{saveError}</p>}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1 flex-1">
              New programme name
              <input
                type="text"
                value={newProgrammeName}
                onChange={(e) => setNewProgrammeName(e.target.value)}
                placeholder="e.g. Weekend Robotics"
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                aria-label="New programme name"
              />
            </label>
            <Button size="sm" onClick={handleCreateProgramme} disabled={isSaving || newProgrammeName.trim().length < 2}>
              Add programme
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1 flex-1">
              New offering title (for selected programme)
              <input
                type="text"
                value={newOfferingTitle}
                onChange={(e) => setNewOfferingTitle(e.target.value)}
                placeholder="e.g. Python Basics"
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                aria-label="New offering title"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
              Format
              <select
                value={newOfferingFormat}
                onChange={(e) => setNewOfferingFormat(e.target.value)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                aria-label="New offering format"
              >
                <option value="one_to_one">One to one</option>
                <option value="small_group">Small group</option>
                <option value="group">Group</option>
              </select>
            </label>
            <Button
              size="sm"
              onClick={handleCreateOffering}
              disabled={isSaving || !selectedProgrammeId || newOfferingTitle.trim().length < 2}
            >
              Add offering
            </Button>
          </div>

          {managerProgrammes.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No programmes"
              description="Create the first programme above to start managing the centre catalogue."
            />
          ) : (
            <div className="space-y-2">
              {managerProgrammes.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl border bg-white border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{p.name}</p>
                    {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={p.active ? 'success' : 'neutral'} label={p.active ? 'Active' : 'Inactive'} />
                    <Button variant="outline" size="sm" onClick={() => handleToggleProgramme(p)}>
                      {p.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {programmeOfferings.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No offerings"
              description="Offerings for the selected programme will appear here with activate/deactivate controls."
            />
          ) : (
            <div className="space-y-2">
              {programmeOfferings.map((o) => (
                <div
                  key={o.id}
                  className="p-3 rounded-xl border bg-white border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{o.title}</p>
                    <p className="text-xs text-slate-500">{o.deliveryFormat}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={o.active ? 'success' : 'neutral'} label={o.active ? 'Active' : 'Inactive'} />
                    <Button variant="outline" size="sm" onClick={() => handleToggleOffering(o)}>
                      {o.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
