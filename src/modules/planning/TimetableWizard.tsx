import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { timetablePolicyService } from './timetablePolicyService';
import type { TeachingAllocation } from '../../types/domain';
import { timetableSolverService } from './timetableSolverService';
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
      for (const r of rows) {
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
        r.allocationId = (saved as any).id;
        r.status = (saved as any).status;
      }
      const ids = rows.map((r) => r.allocationId).filter(Boolean) as string[];
      if (ids.length > 0 && currentEmployeeId) {
        await timetablePolicyService.approveTeachingAllocationsAtomic(ids, currentEmployeeId);
      }
      await load();
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
      const approved = rows.filter((r) => r.status === 'approved' && r.allocationId);
      if (approved.length < rows.length) {
        setError('Some rows are not approved yet. Approve every row in Step 2 first.');
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
      const { data: ttRow, error: ttErr } = await supabase
        .from('timetables')
        .insert({
          school_id: schoolId,
          term_id: terms[0]?.id ?? null,
          name: `Term Master Schedule (Wizard ${new Date().toLocaleDateString()})`,
          status: 'reviewed',
          base_timetable_id: null,
        })
        .select()
        .single();
      if (ttErr) throw ttErr;
      const rowsToInsert = assignments.map((a: any) => ({
        timetable_id: (ttRow as any).id,
        school_id: schoolId,
        class_id: a.classId,
        subject_id: a.subjectId,
        teacher_id: a.teacherId,
        day_of_week: a.dayOfWeek,
        start_time: a.startTime,
        end_time: a.endTime,
      }));
      if (rowsToInsert.length > 0) {
        const { error: entErr } = await supabase.from('timetable_entries').insert(rowsToInsert);
        if (entErr) throw entErr;
      }
      setPublishState('Approving…');
      await timetablePolicyService.approveTimetableAtomic((ttRow as any).id, currentEmployeeId);
      setPublishState('Publishing…');
      await timetablePolicyService.publishTimetableAtomic((ttRow as any).id, currentEmployeeId);
      setPublishState('published');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publishing failed.');
      setPublishState('');
    }
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

