import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { timetablePolicyService } from './timetablePolicyService';
import type { TeachingAllocation } from '../../types/domain';
import { timetableSolverService } from './timetableSolverService';
import { WeekGrid } from './WeekGrid';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Wand2 } from 'lucide-react';

type Step = 0 | 1 | 2 | 3;

interface RowState {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  periods: number;
  allocationId?: string;
  status?: string;
}

/**
 * Guided timetable setup: Foundation -> Staffing -> Generate -> Publish.
 * Reuses the authoritative services; no domain changes. Advanced users keep
 * the classic builder below.
 */
export const TimetableWizard: React.FC<{ schoolId: string }> = ({ schoolId }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Foundation
  const [yearId, setYearId] = useState('');
  const [yearName, setYearName] = useState('');
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Staffing
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>([]);
  const [officialSubs, setOfficialSubs] = useState<Array<{ teacherId: string; subjectId: string }>>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [currentEmployeeId, setCurrentEmployeeId] = useState('');

  // Generate + publish
  const [genSummary, setGenSummary] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<any[]>([]);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [previewClassId, setPreviewClassId] = useState('');
  const [slotTeacher, setSlotTeacher] = useState('');
  const [slotError, setSlotError] = useState<string | null>(null);
  const [genDetail, setGenDetail] = useState<string[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [publishState, setPublishState] = useState('');

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [yrRes, clsRes, subRes, empRes, offRes, allocRes] = await Promise.all([
        supabase.from('academic_years').select('id, name').eq('school_id', schoolId).order('is_current', { ascending: false }).limit(1),
        supabase.from('classes').select('id, name').eq('school_id', schoolId).order('name'),
        supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name'),
        supabase.from('employees').select('id, people(first_name, last_name)').eq('school_id', schoolId),
        timetablePolicyService.getOfficialTeachingSubjects(schoolId),
        timetablePolicyService.getTeachingAllocations(schoolId),
      ]);
      const yid = (yrRes.data?.[0] as any)?.id ?? '';
      setYearId(yid);
      setYearName((yrRes.data?.[0] as any)?.name ?? '');
      if (yid) {
        const { data: termRows } = await supabase
          .from('terms')
          .select('id, name')
          .eq('academic_year_id', yid)
          .order('term_number');
        setTerms((termRows ?? []) as any[]);
      } else {
        setTerms([]);
      }
      setClasses(clsRes.data ?? []);
      setSubjects(subRes.data ?? []);
      const tList = ((empRes.data ?? []) as any[]).map((e) => ({
        id: e.id,
        name: `${e.people?.first_name ?? 'Teacher'} ${e.people?.last_name ?? ''}`.trim(),
      }));
      setTeachers(tList);
      setOfficialSubs((offRes ?? []).map((o: any) => ({ teacherId: o.teacherId, subjectId: o.subjectId })));
      const me = ((empRes.data ?? []) as any[]).find((e) => e.people?.auth_user_id === user?.id);
      setCurrentEmployeeId(me?.id ?? tList[0]?.id ?? '');

      // Staffing rows: every class x subject
      const allocs = (allocRes ?? []) as TeachingAllocation[];
      const next: RowState[] = [];
      for (const c of (clsRes.data ?? []) as any[]) {
        for (const s of (subRes.data ?? []) as any[]) {
          const a = allocs.find((x: any) => x.classId === c.id && x.subjectId === s.id);
          next.push({
            classId: c.id,
            className: c.name,
            subjectId: s.id,
            subjectName: s.name,
            teacherId: (a as any)?.teacherId ?? '',
            periods: (a as any)?.periodsPerWeek ?? 4,
            allocationId: (a as any)?.id,
            status: (a as any)?.status,
          });
        }
      }
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load timetable setup.');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const foundationDone = yearId !== '' && terms.length > 0 && classes.length > 0 && subjects.length > 0;
  const staffingDone =
    rows.length > 0 && rows.every((r) => r.teacherId && r.status === 'approved');

  const qualifiedFor = (subjectId: string) => {
    const ids = new Set(officialSubs.filter((o) => o.subjectId === subjectId).map((o) => o.teacherId));
    return teachers.filter((t) => ids.has(t.id));
  };

  const autoFill = () => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.teacherId) return r;
        const q = officialSubs.filter((o) => o.subjectId === r.subjectId);
        return q.length > 0 ? { ...r, teacherId: q[0].teacherId } : r;
      })
    );
  };

  const saveAll = async () => {
    const missing = rows.filter((r) => !r.teacherId || !r.periods || r.periods <= 0);
    if (missing.length > 0) {
      setError(
        `${missing.length} row(s) still need a teacher and weekly periods. Pick a teacher for each highlighted row, or use Auto-fill.`
      );
      return;
    }
    if (!yearId) {
      setError('No academic year found for this school — complete Step 1 first.');
      return;
    }
    try {
      setIsSaving(true);
      setError(null);
      const savedRows = [...rows];
      for (const r of savedRows) {
        const saved = await timetablePolicyService.saveTeachingAllocation({
          schoolId,
          academicYearId: yearId,
          classId: r.classId,
          subjectId: r.subjectId,
          teacherId: r.teacherId,
          periodsPerWeek: r.periods,
          status: 'reviewed',
          allocationSource: 'human',
          proposalReason: 'Timetable wizard staffing step.',
        });
        r.allocationId = (saved as any).id ?? (saved as any)?.id;
        r.status = 'reviewed';
      }
      const ids = savedRows.map((r) => r.allocationId).filter(Boolean) as string[];
      if (ids.length > 0 && currentEmployeeId) {
        await timetablePolicyService.approveTeachingAllocationsAtomic(ids, currentEmployeeId);
      }
      // Reload authoritative state (ids + approved status come from the DB,
      // never from local mutation) and verify every row before advancing.
      await load();
      const verify = await timetablePolicyService.getTeachingAllocations(schoolId);
      const byKey = new Map(
        ((verify ?? []) as any[]).map((a) => [`${a.classId}|${a.subjectId}`, a])
      );
      const lacking = rows
        .filter((r) => {
          const m = byKey.get(`${r.classId}|${r.subjectId}`);
          return !(m && m.status === 'approved' && m.id);
        })
        .map((r) => `${r.className} — ${r.subjectName}`);
      if (lacking.length > 0) {
        setError(
          `Saved, but these rows did not come back approved — resolve before generating: ${lacking.join('; ')}.`
        );
        setIsSaving(false);
        return;
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save staffing.');
    } finally {
      setIsSaving(false);
    }
  };

  const runGenerate = async () => {
    try {
      setIsSolving(true);
      setError(null);
      setGenSummary(null);
      // Refresh authoritative state first: never generate from stale rows.
      const fresh = await timetablePolicyService.getTeachingAllocations(schoolId);
      const byKey = new Map(
        ((fresh ?? []) as any[]).map((a) => [`${a.classId}|${a.subjectId}`, a])
      );
      const synced = rows.map((r) => {
        const m = byKey.get(`${r.classId}|${r.subjectId}`);
        return m ? { ...r, allocationId: m.id, status: m.status } : r;
      });
      setRows(synced);
      const approved = synced.filter((r) => r.status === 'approved' && r.allocationId);
      if (approved.length < synced.length) {
        const lacking = synced
          .filter((r) => !(r.status === 'approved' && r.allocationId))
          .map((r) => `${r.className} — ${r.subjectName}`)
          .join('; ');
        setError(`Not ready to generate — these rows are not approved yet: ${lacking}. Fix them in Step 2 first.`);
        setIsSolving(false);
        return;
      }
      const result = timetableSolverService.solveTimetable({
        requirements: approved.map((r) => ({
          classId: r.classId,
          className: r.className,
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          teacherId: r.teacherId,
          teacherName: teachers.find((t) => t.id === r.teacherId)?.name ?? 'Teacher',
          periodsPerWeek: r.periods,
          isAllocated: true,
        })),
        preferences: [],
        policies: [],
      });
      const placed = (result.assignments ?? []).length;
      const total = approved.reduce((s, r) => s + r.periods, 0);
      const unplaced = total - placed;
      setGenSummary(
        unplaced <= 0
          ? `Done — all ${total} weekly periods placed with zero teacher clashes. Review below, then publish.`
          : `${placed} of ${total} periods placed. ${unplaced} could not be placed — adjust staffing or workload limits, then generate again.`
      );
      setGenDetail(((result.diagnostics as any)?.bottlenecks ?? []).map((b: any) => b.description ?? JSON.stringify(b)).slice(0, 8));
      setDraftPreview(result.assignments ?? []);
      (window as any).__wizardAssignments = result.assignments ?? [];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Schedule generation failed.');
    } finally {
      setIsSolving(false);
    }
  };

  const publishAll = async () => {
    try {
      setError(null);
      setPublishState('Saving the generated week…');
      const assignments = (window as any).__wizardAssignments ?? [];
      // Privileged writes go through the leadership-gated SECURITY DEFINER RPC:
      // RLS on timetables/timetable_entries is SELECT-only by design, and the
      // RPC creates the timetable plus all entries in one transaction so a
      // partial week can never be left behind.
      const entriesPayload = assignments.map((a: any) => ({
        class_id: a.classId,
        stream_id: a.streamId ?? null,
        subject_id: a.subjectId,
        teacher_id: a.teacherId,
        room_name: a.roomName ?? null,
        day_of_week: a.slot.dayOfWeek,
        start_time: a.slot.startTime,
        end_time: a.slot.endTime,
      }));
      const { data: timetableId, error: createErr } = await supabase.rpc(
        'create_timetable_with_entries',
        {
          p_school_id: schoolId,
          p_term_id: terms[0]?.id ?? null,
          p_name: `Term Master Schedule (Wizard ${new Date().toLocaleDateString()})`,
          p_entries: entriesPayload,
        }
      );
      if (createErr) throw createErr;
      if (!timetableId) throw new Error('Timetable creation returned no id.');
      setPublishState('Approving…');
      await timetablePolicyService.approveTimetableAtomic(timetableId as string, currentEmployeeId);
      setPublishState('Publishing…');
      await timetablePolicyService.publishTimetableAtomic(timetableId as string, currentEmployeeId);
      setPublishState('published');
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Publishing failed.';
      setError(`Publishing failed: ${detail}`);
      setPublishState('');
    }
  };

  const applySlotTeacher = (idx: number) => {
    const slot = draftPreview[idx];
    if (!slot || !slotTeacher) {
      setSlotError('Choose a replacement teacher first.');
      return;
    }
    const clash = draftPreview.some(
      (s: any, i: number) =>
        i !== idx &&
        s.teacherId === slotTeacher &&
        s.slot.dayOfWeek === slot.slot.dayOfWeek &&
        s.slot.startTime === slot.slot.startTime
    );
    if (clash) {
      const name = teachers.find((t) => t.id === slotTeacher)?.name ?? 'That teacher';
      setSlotError(`${name} is already teaching at this hour — pick someone free.`);
      return;
    }
    const name = teachers.find((t) => t.id === slotTeacher)?.name ?? slot.teacherName;
    const next = draftPreview.map((s: any, i: number) =>
      i === idx ? { ...s, teacherId: slotTeacher, teacherName: name } : s
    );
    setDraftPreview(next);
    (window as any).__wizardAssignments = next;
    setEditingSlot(null);
    setSlotError(null);
  };

  const removeSlot = (idx: number) => {
    const next = draftPreview.filter((_: any, i: number) => i !== idx);
    setDraftPreview(next);
    (window as any).__wizardAssignments = next;
    setEditingSlot(null);
    setSlotError(null);
    setGenSummary(
      `Updated — ${next.length} periods kept. Removed slots stay unplaced until you regenerate or re-add staffing.`
    );
  };

  const steps = ['Foundation', 'Staffing', 'Generate', 'Publish'];

  const addClass = async () => {
    if (!newClassName.trim()) return;
    try {
      setIsAdding(true);
      const { error } = await supabase
        .from('classes')
        .insert({ school_id: schoolId, name: newClassName.trim(), stage_level: newClassName.trim() });
      if (error) throw error;
      setNewClassName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add class.');
    } finally {
      setIsAdding(false);
    }
  };

  const addSubject = async () => {
    if (!newSubjectName.trim()) return;
    try {
      setIsAdding(true);
      const { error } = await supabase
        .from('subjects')
        .insert({ school_id: schoolId, name: newSubjectName.trim() });
      if (error) throw error;
      setNewSubjectName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add subject.');
    } finally {
      setIsAdding(false);
    }
  };

  const missingRows = useMemo(() => rows.filter((r) => !r.teacherId), [rows]);

  const bellPeriods = useMemo(() => {
    const seen = new Set<number>();
    const out: Array<{ periodNumber: number; startTime: string; endTime: string }> = [];
    for (const s of timetableSolverService.generateStandardPeriods()) {
      if (s.dayOfWeek === 1 && !seen.has(s.periodNumber)) {
        seen.add(s.periodNumber);
        out.push({ periodNumber: s.periodNumber, startTime: s.startTime, endTime: s.endTime });
      }
    }
    return out;
  }, []);

  if (isLoading) return <LoadingState label="Loading timetable setup..." />;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            <button
              type="button"
              onClick={() => {
                if (i === 0 || (i === 1 && foundationDone) || (i === 2 && staffingDone) || i === 3) setStep(i as Step);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                step === i ? 'bg-[#002b36] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              {i + 1}. {label}
            </button>
            {i < steps.length - 1 && <span className="text-slate-300">→</span>}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
          {error}
        </div>
      )}

      {/* STEP 1 — FOUNDATION */}
      {step === 0 && (
        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-bold text-slate-900">Step 1 — School setup for timetabling</h3>
            <p className="text-xs text-slate-500">
              The timetable needs these four things to exist. Green means ready; add anything missing right here.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 border rounded-xl flex items-center justify-between">
                <span>Academic year: <b>{yearName || 'missing'}</b></span>
                {yearId ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
              </div>
              <div className="p-3 border rounded-xl flex items-center justify-between">
                <span>Terms: <b>{terms.length > 0 ? terms.map((t) => t.name).join(', ') : 'missing'}</b></span>
                {terms.length > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
              </div>
              <div className="p-3 border rounded-xl">
                <div className="flex items-center justify-between">
                  <span>Classes: <b>{classes.length}</b></span>
                  {classes.length > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="New class name" className="flex-1 text-xs border rounded-lg px-2 py-1.5" />
                  <Button variant="outline" size="sm" disabled={isAdding} onClick={addClass}>Add</Button>
                </div>
              </div>
              <div className="p-3 border rounded-xl">
                <div className="flex items-center justify-between">
                  <span>Subjects: <b>{subjects.length}</b></span>
                  {subjects.length > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="New subject name" className="flex-1 text-xs border rounded-lg px-2 py-1.5" />
                  <Button variant="outline" size="sm" disabled={isAdding} onClick={addSubject}>Add</Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" disabled={!foundationDone} onClick={() => setStep(1)}>
                Continue to staffing <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            {!foundationDone && (
              <p className="text-xs text-amber-700">Add the missing items above to continue.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — STAFFING */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">Step 2 — Who teaches what</h3>
                <p className="text-xs text-slate-500">
                  Pick a qualified teacher and weekly periods for every class + subject row.
                  Only officially appointed teachers appear in each dropdown.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={autoFill}>
                <Wand2 className="w-4 h-4 mr-1" /> Auto-fill from qualified staff
              </Button>
            </div>
            {missingRows.length > 0 && (
              <p className="text-xs font-semibold text-amber-700">
                {missingRows.length} row(s) still need a teacher — highlighted below.
              </p>
            )}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {rows.map((r) => {
                const qualified = qualifiedFor(r.subjectId);
                const missing = !r.teacherId;
                return (
                  <div key={`${r.classId}-${r.subjectId}`} className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${missing ? 'bg-amber-50/60' : 'bg-white'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{r.className} — {r.subjectName}</p>
                      {r.status === 'approved' && <p className="text-[11px] text-emerald-700 font-semibold">Approved</p>}
                    </div>
                    {qualified.length === 0 ? (
                      <p className="text-[11px] text-amber-800">
                        No appointed teacher for {r.subjectName}.{' '}
                        <Link to="/planning/policies" className="underline font-semibold">Appoint one</Link>
                      </p>
                    ) : (
                      <select
                        value={r.teacherId}
                        onChange={(e) =>
                          setRows((prev) => prev.map((x) => (x === r ? { ...x, teacherId: e.target.value, status: undefined } : x)))
                        }
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                        aria-label={`Teacher for ${r.className} ${r.subjectName}`}
                      >
                        <option value="">Select teacher…</option>
                        {qualified.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={r.periods}
                      onChange={(e) =>
                        setRows((prev) => prev.map((x) => (x === r ? { ...x, periods: Number(e.target.value) } : x)))
                      }
                      className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                      aria-label={`Periods per week for ${r.className} ${r.subjectName}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(0)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button variant="primary" disabled={isSaving} onClick={saveAll}>
                {isSaving ? 'Saving…' : 'Save & approve all'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — GENERATE */}
      {step === 2 && (
        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-bold text-slate-900">Step 3 — Build the week</h3>
            <p className="text-xs text-slate-500">
              The scheduler places every approved pair into Monday–Friday periods. No teacher is double-booked.
            </p>
            <Button variant="primary" disabled={isSolving} onClick={runGenerate}>
              {isSolving ? 'Building…' : 'Generate school schedule'}
            </Button>
            {genSummary && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium">
                {genSummary}
              </div>
            )}
            {draftPreview.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Draft preview — {draftPreview.length} placed periods (not live until published)
                  </p>
                  <label className="ml-auto text-xs font-semibold text-slate-600 flex items-center gap-2">
                    Class:
                    <select
                      value={previewClassId || classes[0]?.id || ''}
                      onChange={(e) => setPreviewClassId(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <WeekGrid
                  assignments={draftPreview.filter(
                    (a: any) => a.classId === (previewClassId || classes[0]?.id)
                  )}
                  periods={bellPeriods}
                  renderActions={(a, idx) => (
                    <div className="pt-0.5">
                      {editingSlot === idx ? (
                        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={slotTeacher}
                            onChange={(e) => setSlotTeacher(e.target.value)}
                            className="w-full text-[11px] border border-slate-300 rounded px-1 py-0.5 bg-white"
                            aria-label="Replacement teacher"
                          >
                            <option value="">Choose teacher…</option>
                            {qualifiedFor(a.subjectId).map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          {slotError && <p className="text-rose-700 font-semibold">{slotError}</p>}
                          <div className="flex gap-1">
                            <button type="button" className="px-1.5 py-0.5 rounded bg-[#002b36] text-white font-bold" onClick={() => applySlotTeacher(idx)}>
                              Apply
                            </button>
                            <button type="button" className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-bold" onClick={() => removeSlot(idx)}>
                              Remove
                            </button>
                            <button type="button" className="px-1.5 py-0.5 rounded font-bold text-slate-500" onClick={() => { setEditingSlot(null); setSlotError(null); }}>
                              ×
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="text-[10px] font-bold text-brand-teal hover:underline" onClick={() => { setEditingSlot(idx); setSlotTeacher(a.teacherId); setSlotError(null); }}>
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                />
              </div>
            )}
            {genDetail.length > 0 && (
              <ul className="text-xs text-slate-600 list-disc ml-5 space-y-1">
                {genDetail.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to staffing
              </Button>
              <Button variant="primary" disabled={!genSummary || genSummary.startsWith('Done') === false} onClick={() => setStep(3)}>
                Continue to publish <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 — PUBLISH */}
      {step === 3 && (
        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-bold text-slate-900">Step 4 — Make it official</h3>
            <p className="text-xs text-slate-500">
              Publishing freezes this week as the Master Timetable every teacher and class follows.
              {publishState !== 'published' && ' Nothing is final until you publish.'}
            </p>
            {publishState === 'published' ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Published. Teachers and classes now follow the Master Timetable.
              </div>
            ) : (
              <Button variant="primary" onClick={publishAll} disabled={publishState !== ''}>
                {publishState || 'Publish timetable'}
              </Button>
            )}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              {publishState === 'published' && (
                <Link to="/timetable">
                  <Button variant="secondary" size="sm">
                    Open Master Timetable <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

