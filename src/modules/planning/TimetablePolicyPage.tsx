import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  BookOpen,
  Calendar,
  History,
  Sliders,
  CheckCircle2,
  UserCheck,
  Sparkles,
  Award,
  Trash2,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState } from '@/components/ui/LoadingState';
import { supabase } from '@/lib/supabase';
import { timetablePolicyService } from './timetablePolicyService';
import { timetableSolverService } from './timetableSolverService';
import type {
  TimetablePolicyRules,
  TimetableSubjectPreference,
  TeacherWorkloadSummary,
  TeacherOfficialSubject,
} from '@/types/domain';

export const TimetablePolicyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'official_subjects' | 'workload' | 'subjects' | 'quotas' | 'history' | 'dashboard'
  >('official_subjects');
  const [isLoading, setIsLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string>('');

  // Policy state
  const [_policies, setPolicies] = useState<any[]>([]);
  const [workloadRules, setWorkloadRules] = useState<TimetablePolicyRules>({
    maxPeriodsPerDay: 6,
    maxPeriodsPerWeek: 28,
    maxConsecutivePeriods: 3,
    minBreakMinutes: 30,
    maxOnlineSessionsPerDay: 2,
    maxOnlineSessionsPerWeek: 8,
    maxCombinedTeachingHoursPerDay: 7.0,
  });

  // Official Teaching Subjects state
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>([]);
  const [officialSubjects, setOfficialSubjects] = useState<TeacherOfficialSubject[]>([]);
  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState<{ [teacherId: string]: string }>({});
  const [officialSubjectsError, setOfficialSubjectsError] = useState<string | null>(null);
  const [isUpdatingSubject, setIsUpdatingSubject] = useState(false);

  // Subjects & Preferences
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [preferences, setPreferences] = useState<TimetableSubjectPreference[]>([]);

  // Workload Dashboard
  const [workloadSummaries, setWorkloadSummaries] = useState<TeacherWorkloadSummary[]>([]);

  // Historical Patterns
  const [detectedPatterns, setDetectedPatterns] = useState<
    ReturnType<typeof timetableSolverService.analyzeHistoricalPatterns>
  >([]);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const loadAll = useCallback(async () => {
      try {
        setIsLoading(true);
        const { data: schools } = await supabase.from('schools').select('id').limit(1);
        const sId = schools?.[0]?.id ?? '';
        setSchoolId(sId);

        if (sId) {
          const [polList, subList, prefList, empList, ttEntries, onlineSessions, officialSubs] =
            await Promise.all([
              timetablePolicyService.getPolicies(sId),
              supabase.from('subjects').select('id, name, code').eq('school_id', sId).order('name'),
              timetablePolicyService.getSubjectPreferences(sId),
              supabase
                .from('employees')
                .select('id, people(first_name, last_name)')
                .eq('school_id', sId),
              supabase.from('timetable_entries').select('teacher_id, day_of_week, start_time, subject_id'),
              supabase
                .from('online_sessions')
                .select('teacher_id, scheduled_start, status')
                .eq('school_id', sId),
              timetablePolicyService.getOfficialTeachingSubjects(sId),
            ]);

          setPolicies(polList);
          if (polList.length > 0) {
            setWorkloadRules(polList[0].rules);
          }

          const rawSubs = subList.data ?? [];
          setSubjects(rawSubs);
          setPreferences(prefList);
          setOfficialSubjects(officialSubs);

          // Workload summaries & teachers
          const teacherList = (empList.data ?? []).map((e: any) => ({
            id: e.id,
            name: `${e.people?.first_name ?? 'Teacher'} ${e.people?.last_name ?? ''}`.trim(),
          }));
          setTeachers(teacherList);

          const summaries = timetablePolicyService.computeTeacherWorkloads({
            teachers: teacherList,
            physicalTimetableEntries: (ttEntries.data ?? []).map((e: any) => ({
              teacherId: e.teacher_id,
              dayOfWeek: e.day_of_week,
            })),
            onlineSessions: (onlineSessions.data ?? []).map((s: any) => ({
              teacherId: s.teacher_id,
              scheduledStart: s.scheduled_start,
              status: s.status,
            })),
            policies: polList,
          });
          setWorkloadSummaries(summaries);

          // Detect historical patterns from timetable entries
          const historicalData = (ttEntries.data ?? []).map((e: any) => {
            const sub = rawSubs.find((s) => s.id === e.subject_id);
            return {
              subjectId: e.subject_id,
              subjectName: sub?.name ?? 'Subject',
              startTime: e.start_time,
              dayOfWeek: e.day_of_week,
            };
          });
          const patterns = timetableSolverService.analyzeHistoricalPatterns(historicalData);
          setDetectedPatterns(patterns);
        }
      } catch (err) {
        console.error('Failed to load timetable policies:', err);
      } finally {
        setIsLoading(false);
      }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAddOfficialSubject = async (teacherId: string) => {
    const subjectId = selectedSubjectToAdd[teacherId];
    if (!subjectId || !schoolId) return;
    try {
      setIsUpdatingSubject(true);
      setOfficialSubjectsError(null);
      await timetablePolicyService.assignOfficialTeachingSubject(schoolId, teacherId, subjectId);
      const updated = await timetablePolicyService.getOfficialTeachingSubjects(schoolId);
      setOfficialSubjects(updated);
      setSelectedSubjectToAdd((prev) => ({ ...prev, [teacherId]: '' }));
    } catch (err: any) {
      console.error('Failed to assign official subject:', err);
      setOfficialSubjectsError(err.message || 'Failed to assign official subject');
    } finally {
      setIsUpdatingSubject(false);
    }
  };

  const handleRemoveOfficialSubject = async (teacherId: string, subjectId: string) => {
    if (!schoolId) return;
    try {
      setIsUpdatingSubject(true);
      setOfficialSubjectsError(null);
      await timetablePolicyService.removeOfficialTeachingSubject(schoolId, teacherId, subjectId);
      const updated = await timetablePolicyService.getOfficialTeachingSubjects(schoolId);
      setOfficialSubjects(updated);
    } catch (err: any) {
      console.error('Failed to remove official subject:', err);
      setOfficialSubjectsError(err.message || 'Failed to remove official subject');
    } finally {
      setIsUpdatingSubject(false);
    }
  };

  const handleSavePolicies = async () => {
    try {
      setSavedSuccess(false);
      // Upsert school-default policy
      await supabase.from('school_timetable_policies').upsert(
        {
          school_id: schoolId,
          scope_type: 'school_default',
          rules: workloadRules,
          is_active: true,
        },
        { onConflict: 'school_id, scope_type' },
      );
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      // Recompute the dashboard from the just-saved rules so limits update immediately.
      await loadAll();
    } catch (err) {
      console.error('Failed to save policy rules:', err);
    }
  };

  const handleAdoptPattern = (pattern: (typeof detectedPatterns)[0]) => {
    setPreferences((prev) => {
      const exists = prev.find((p) => p.subjectId === pattern.subjectId);
      const newPref: TimetableSubjectPreference = {
        id: exists?.id ?? `temp-${pattern.subjectId}`,
        schoolId,
        subjectId: pattern.subjectId,
        subjectName: pattern.subjectName,
        preferredTimeWindow: pattern.empiricalPreference === 'MORNING' ? 'MORNING' : pattern.empiricalPreference === 'AFTERNOON' ? 'AFTERNOON' : 'ANY',
        priorityWeight: pattern.recommendedWeight,
        allowDoublePeriods: false,
        sourceType: 'HISTORICAL_ADOPTED',
      };
      if (exists) {
        return prev.map((p) => (p.subjectId === pattern.subjectId ? newPref : p));
      }
      return [...prev, newPref];
    });
  };

  if (isLoading) {
    return <LoadingState label="Loading Timetable & Teaching Policies..." />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Sliders className="w-7 h-7 text-brand-teal" />
            Timetable & Teaching Policies
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure institutional teaching hours, workload caps, subject preferences, and monitor staff capacity.
          </p>
        </div>
        {savedSuccess && (
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-4 h-4" /> Policies Saved
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        {[
          { id: 'official_subjects', label: 'Official Teaching Subjects', icon: Award },
          { id: 'workload', label: 'Workload & Hours', icon: Clock },
          { id: 'subjects', label: 'Subject Scheduling', icon: BookOpen },
          { id: 'quotas', label: 'Class Requirements', icon: Calendar },
          { id: 'history', label: 'Historical Patterns', icon: History },
          { id: 'dashboard', label: 'Teacher Workload Dashboard', icon: UserCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-brand-teal text-brand-teal'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Official Teaching Subjects */}
      {activeTab === 'official_subjects' && (
        <div className="space-y-6">
          {/* Institutional Governance Notice */}
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-bold text-sm text-amber-950">
                Authoritative Staff Qualifications & Appointments Record
              </p>
              <p>
                Official Teaching Subjects are the school's authoritative staff record of the subjects a teacher
                is trained, qualified, and appointed to teach (e.g. Mrs. Florence → Mathematics).
              </p>
              <p className="font-semibold text-amber-950">
                This is NOT an AI capability assessment. Management allocates teaching and generates timetables strictly from these approved staff qualifications.
              </p>
            </div>
          </div>

          {officialSubjectsError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              {officialSubjectsError}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Award className="w-5 h-5 text-brand-teal" />
                Staff Teaching Qualifications & Appointed Subjects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-3">Teacher</th>
                      <th className="p-3">Official Appointed Subjects</th>
                      <th className="p-3 text-right">Appoint New Subject</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {teachers.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-slate-400 italic">
                          No teachers found for this school.
                        </td>
                      </tr>
                    ) : (
                      teachers.map((teacher) => {
                        const assigned = officialSubjects.filter(
                          (os) => os.teacherId === teacher.id,
                        );
                        const assignedIds = new Set(assigned.map((a) => a.subjectId));
                        const availableToAdd = subjects.filter((s) => !assignedIds.has(s.id));

                        return (
                          <tr key={teacher.id} className="hover:bg-slate-50/50">
                            <td className="p-3 font-bold text-slate-900 align-top">
                              {teacher.name}
                            </td>
                            <td className="p-3 align-top">
                              {assigned.length === 0 ? (
                                <span className="text-slate-400 italic text-[11px]">
                                  No official subjects appointed yet
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {assigned.map((a) => (
                                    <span
                                      key={a.id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-brand-teal/10 text-brand-teal border border-brand-teal/20"
                                    >
                                      {a.subjectName ?? 'Subject'}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveOfficialSubject(teacher.id, a.subjectId)}
                                        disabled={isUpdatingSubject}
                                        className="text-brand-teal/60 hover:text-red-600 transition-colors"
                                        title="Remove subject qualification"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-right align-top">
                              <div className="flex items-center justify-end gap-2">
                                <select
                                  value={selectedSubjectToAdd[teacher.id] || ''}
                                  onChange={(e) =>
                                    setSelectedSubjectToAdd((prev) => ({
                                      ...prev,
                                      [teacher.id]: e.target.value,
                                    }))
                                  }
                                  disabled={isUpdatingSubject || availableToAdd.length === 0}
                                  className="text-xs p-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brand-teal"
                                >
                                  <option value="">
                                    {availableToAdd.length === 0
                                      ? 'All subjects appointed'
                                      : 'Select subject...'}
                                  </option>
                                  {availableToAdd.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} ({s.code})
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleAddOfficialSubject(teacher.id)}
                                  disabled={
                                    isUpdatingSubject || !selectedSubjectToAdd[teacher.id]
                                  }
                                >
                                  <Plus className="w-3.5 h-3.5 mr-1" />
                                  Appoint
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 1: Workload & Hours */}
      {activeTab === 'workload' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-teal" />
                Institutional Workload Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Max Periods Per Day</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={workloadRules.maxPeriodsPerDay}
                    onChange={(e) =>
                      setWorkloadRules((r) => ({ ...r, maxPeriodsPerDay: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal"
                  />
                  <p className="text-[11px] text-slate-400">Standard daily physical teaching cap.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Max Periods Per Week</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={workloadRules.maxPeriodsPerWeek}
                    onChange={(e) =>
                      setWorkloadRules((r) => ({ ...r, maxPeriodsPerWeek: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal"
                  />
                  <p className="text-[11px] text-slate-400">Cumulative physical teaching periods limit.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Max Consecutive Periods</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={workloadRules.maxConsecutivePeriods}
                    onChange={(e) =>
                      setWorkloadRules((r) => ({
                        ...r,
                        maxConsecutivePeriods: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal"
                  />
                  <p className="text-[11px] text-slate-400">Triggers break requirement in solver.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Max Online Sessions / Day</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={workloadRules.maxOnlineSessionsPerDay}
                    onChange={(e) =>
                      setWorkloadRules((r) => ({
                        ...r,
                        maxOnlineSessionsPerDay: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal"
                  />
                  <p className="text-[11px] text-slate-400">Online Learning Centre evening capacity.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Max Combined Hours / Day</label>
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    max={14}
                    value={workloadRules.maxCombinedTeachingHoursPerDay}
                    onChange={(e) =>
                      setWorkloadRules((r) => ({
                        ...r,
                        maxCombinedTeachingHoursPerDay: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal"
                  />
                  <p className="text-[11px] text-slate-400">Physical + Online total daily ceiling.</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button variant="primary" onClick={handleSavePolicies}>
                  Save Policy Rules
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Subject Scheduling Preferences */}
      {activeTab === 'subjects' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-teal" />
              Subject Time Window Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 space-y-1">
              <p className="font-bold">How scheduling preferences work</p>
              <p>
                <span className="font-semibold">Time window</span> tells the solver when a subject
                may be placed (morning, afternoon, or any time).{' '}
                <span className="font-semibold">Weight (1–10, default 5)</span> tells the solver
                how hard to fight for that window: a weight-9 subject gets its preferred window
                before a weight-3 subject when both compete for the same period.
              </p>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {subjects.map((sub) => {
                const pref = preferences.find((p) => p.subjectId === sub.id);
                return (
                  <div key={sub.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white hover:bg-slate-50/50">
                    <div>
                      <span className="text-sm font-bold text-slate-900">{sub.name}</span>
                      <span className="ml-2 text-xs font-mono text-slate-400">{sub.code}</span>
                      {pref?.sourceType === 'HISTORICAL_ADOPTED' && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                          <Sparkles className="w-3 h-3" /> Historical Preference
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={pref?.preferredTimeWindow ?? 'ANY'}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setPreferences((prev) => {
                            const filtered = prev.filter((p) => p.subjectId !== sub.id);
                            return [
                              ...filtered,
                              {
                                id: pref?.id ?? `p-${sub.id}`,
                                schoolId,
                                subjectId: sub.id,
                                subjectName: sub.name,
                                preferredTimeWindow: val,
                                priorityWeight: pref?.priorityWeight ?? 5,
                                allowDoublePeriods: pref?.allowDoublePeriods ?? false,
                                sourceType: 'MANUAL',
                              },
                            ];
                          });
                        }}
                        className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-teal bg-white"
                      >
                        <option value="ANY">Any Time</option>
                        <option value="MORNING">Morning (08:00–11:30)</option>
                        <option value="AFTERNOON">Afternoon (11:30–15:15)</option>
                      </select>

                      <div className="flex items-center gap-1" title="Higher number = solver prioritises this subject's time window first (1–10, default 5)">
                        <span className="text-[11px] text-slate-400">Weight:</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={pref?.priorityWeight ?? 5}
                          onChange={(e) => {
                            const weight = Number(e.target.value);
                            setPreferences((prev) =>
                              prev.map((p) => (p.subjectId === sub.id ? { ...p, priorityWeight: weight } : p)),
                            );
                          }}
                          className="w-14 text-xs px-2 py-1 border border-slate-200 rounded-lg focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Class Requirements */}
      {activeTab === 'quotas' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-teal" />
              Class Subject Period Quotas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Required weekly periods derived automatically from Phase 6 Schemes of Work & Medium-Term Plans.
            </p>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <p className="text-xs text-slate-600 font-medium">
                Standard baseline: 5 Mathematics periods, 5 English periods, 3 Science periods, 2 PE periods weekly per class.
              </p>
              <p className="text-[11px] text-slate-400">
                Connected to Scheme of Work: <span className="font-semibold text-slate-700">Stage 5 Cambridge Primary Curriculum</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Historical Patterns */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-brand-teal" />
              Historical Timetable Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Patterns detected from previous timetables. Adopt patterns to teach SomaCampus institutional habits.
            </p>

            {detectedPatterns.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No Historical Patterns Yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Upload or publish previous term timetables to enable empirical analysis.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {detectedPatterns.map((pat) => (
                  <div
                    key={pat.subjectId}
                    className="p-4 bg-white border border-slate-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-sm font-bold text-slate-900">{pat.subjectName}</span>
                      <p className="text-xs text-slate-600 mt-0.5">{pat.observationSummary}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleAdoptPattern(pat)}>
                      Adopt as Preference
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Teacher Workload Dashboard */}
      {activeTab === 'dashboard' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand-teal" />
              Teacher Workload & Combined Capacity Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <p className="text-xs text-slate-500">
              Live monitoring across physical periods and Online Centre sessions, measured against the
              limits saved under Workload &amp; Hours. Saving new limits refreshes this dashboard immediately.
              Status OK means within limits; APPROACHING_CAP means near a limit; OVER_CAP means a limit is breached.
            </p>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="p-3">Teacher</th>
                    <th className="p-3 text-right">Physical Periods</th>
                    <th className="p-3 text-right">Online Sessions</th>
                    <th className="p-3 text-right">Combined Hours</th>
                    <th className="p-3 text-right">Peak Day / Max</th>
                    <th className="p-3 text-right">Weekly Total / Max</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {workloadSummaries.map((w) => (
                    <tr key={w.employeeId} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">{w.teacherName}</td>
                      <td className="p-3 text-right">{w.physicalPeriods}</td>
                      <td className="p-3 text-right">{w.onlineSessions}</td>
                      <td className="p-3 text-right font-medium">{w.totalTeachingHours}h</td>
                      <td className="p-3 text-right">
                        {w.peakDailyPeriods} / {w.dailyLimit}
                      </td>
                      <td className="p-3 text-right font-bold">
                        {w.physicalPeriods} / {w.weeklyLimit}
                      </td>
                      <td className="p-3 text-center">
                        <StatusPill
                          status={
                            w.status === 'OK'
                              ? 'success'
                              : w.status === 'APPROACHING_CAP'
                              ? 'warning'
                              : 'critical'
                          }
                          label={w.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
