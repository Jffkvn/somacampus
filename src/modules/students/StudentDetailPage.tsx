import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  learningIntelligenceService,
} from '../intelligence/learningIntelligenceService';
import { InterventionModal } from '../intelligence/InterventionModal';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  ArrowLeft,
  GraduationCap,
  UserX,
  Sparkles,
  Clock,
  PlusCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  StudentLongitudinalProfile,
  InterventionOutcome,
} from '../../types/domain';

export const StudentDetailPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<StudentLongitudinalProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Intervention Modal state
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [prefilledReason, setPrefilledReason] = useState<string>('');
  const [expandedPatternIdx, setExpandedPatternIdx] = useState<number | null>(null);
  const [resolvingInterventionId, setResolvingInterventionId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<InterventionOutcome>('improved');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'formal' | 'diagnostic' | 'observation'>('all');

  const loadData = async () => {
    if (!studentId) {
      setError('No student selected.');
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const res = await learningIntelligenceService.getLongitudinalProfile(studentId);
      if (!res) {
        setError('not-found');
        setProfile(null);
      } else {
        setProfile(res);
      }
    } catch (err) {
      console.error('Failed to load longitudinal profile', err);
      setError('Failed to load this student profile. Please try again.');
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (isLoading) {
    return <LoadingState label="Compiling longitudinal student learning profile..." />;
  }

  if (error || !profile) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Link
          to="/students"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:text-brand-tealDark"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Student Directory</span>
        </Link>
        <EmptyState
          icon={UserX}
          title="Student profile not found"
          description={
            error === 'not-found'
              ? 'No student record matches this profile. It may have been withdrawn or the link is incorrect.'
              : (error ?? 'No student record matches this profile.')
          }
          actionLabel="Back to directory"
          onAction={() => navigate('/students')}
        />
      </div>
    );
  }

  const {
    fullName,
    admissionNumber,
    className,
    academicOverview,
    subjectTrajectories,
    emergingPatterns,
    activeInterventions,
    pastInterventions,
    evidenceTimeline,
  } = profile;

  // Prepare available evidence items for the intervention modal
  const availableEvidenceForModal = evidenceTimeline.map((item) => ({
    type: item.provenanceType,
    id: item.provenanceId,
    title: item.title,
    date: item.date,
  }));

  const handleResolveIntervention = async (interventionId: string) => {
    try {
      await learningIntelligenceService.recordInterventionOutcome(
        interventionId,
        selectedOutcome,
        outcomeNotes.trim() || 'Evaluated against subsequent classroom evidence.',
      );
      setResolvingInterventionId(null);
      setOutcomeNotes('');
      await loadData();
    } catch (err: any) {
      alert(`Could not record outcome: ${err?.message || 'Error'}`);
    }
  };

  const filteredTimeline = evidenceTimeline.filter((item) => {
    if (timelineFilter === 'formal') return item.type === 'formal_assessment';
    if (timelineFilter === 'diagnostic') return item.type === 'diagnostic_work';
    if (timelineFilter === 'observation') return item.type === 'teacher_observation';
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      <Link
        to="/students"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:text-brand-tealDark"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Student Directory</span>
      </Link>

      {/* Header Profile Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
            <GraduationCap className="w-7 h-7 text-brand-teal" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {fullName}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800">
                Phase 5 Profile
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Admission: <strong className="text-slate-700">{admissionNumber}</strong> &bull; Class: <strong className="text-slate-700">{className}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Attendance Habit
            </span>
            <span className="text-sm font-extrabold text-slate-800">
              {academicOverview.attendancePercentage}% Present
            </span>
          </div>
          <button
            onClick={() => {
              setPrefilledReason('');
              setIsInterventionModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-brand-teal hover:bg-brand-teal/90 shadow-sm transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Plan Intervention</span>
          </button>
        </div>
      </div>

      {/* 1. Academic Overview Strip (4 Pillars) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40">
          <span className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider block">
            Formal Assessment Avg
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-indigo-950">
              {academicOverview.formalAveragePct !== null
                ? `${academicOverview.formalAveragePct}%`
                : '—'}
            </span>
            <span className="text-[11px] text-indigo-600 font-medium">
              ({academicOverview.formalAssessmentsCount} assessments)
            </span>
          </div>
          <span className="text-[10px] text-indigo-500 mt-1 block">
            Authoritative summative scores
          </span>
        </div>

        <div className="p-4 rounded-xl border border-teal-100 bg-teal-50/40">
          <span className="text-[10px] uppercase font-bold text-teal-700 tracking-wider block">
            Diagnostic Engagement
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-teal-950">
              {academicOverview.diagnosticParticipationPct}%
            </span>
            <span className="text-[11px] text-teal-600 font-medium">
              ({academicOverview.diagnosticCount} activities)
            </span>
          </div>
          <span className="text-[10px] text-teal-500 mt-1 block">
            Practice submissions &amp; work
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider block">
            Teacher Observations
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-slate-900">
              {academicOverview.observationsCount}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              qualitative records
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Contextual lesson notes
          </span>
        </div>

        <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40">
          <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider block">
            Active Interventions
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-amber-950">
              {academicOverview.activeInterventionsCount}
            </span>
            <span className="text-[11px] text-amber-600 font-medium">
              {academicOverview.activeInterventionsCount === 1 ? 'plan active' : 'plans active'}
            </span>
          </div>
          <span className="text-[10px] text-amber-600 mt-1 block">
            Teacher-authorized support
          </span>
        </div>
      </div>

      {/* 2. Emerging Learning Patterns (Deterministic Intelligence) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-teal" />
                <CardTitle className="text-base font-bold text-slate-900">
                  Emerging Learning Patterns
                </CardTitle>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  Deterministic Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Synthesized patterns aggregated across lessons, assignments, and observations. Each pattern preserves direct links to its underlying evidence.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {emergingPatterns.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 italic">
              No learning patterns recorded yet. Continue recording lessons and observations.
            </p>
          ) : (
            <div className="space-y-3">
              {emergingPatterns.map((pattern, idx) => {
                const isExpanded = expandedPatternIdx === idx;
                const isInsufficient = pattern.classification === 'insufficient_evidence';
                const isPossible = pattern.classification === 'possible_pattern';
                const isStruggle = pattern.requiresAttention;

                const badgeBg = isInsufficient
                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : isPossible
                  ? 'bg-sky-100 text-sky-800 border-sky-200'
                  : isStruggle
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200';

                return (
                  <div
                    key={`${pattern.subjectId}-${pattern.learningArea}-${idx}`}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-sm space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeBg}`}
                        >
                          {pattern.classification.replace('_', ' ')}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">
                          {pattern.subjectName} &bull; {pattern.learningArea}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        {pattern.requiresAttention && (
                          <button
                            onClick={() => {
                              setPrefilledReason(pattern.summary);
                              setIsInterventionModalOpen(true);
                            }}
                            className="text-[11px] font-bold text-brand-teal hover:underline flex items-center gap-1"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Plan Intervention</span>
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedPatternIdx(isExpanded ? null : idx)}
                          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                        >
                          <span>{pattern.evidenceReferences.length} Evidence Links</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-normal">
                      {pattern.summary}
                    </p>

                    {/* Evidence Provenance Drill-Down Drawer */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-100 mt-2 space-y-2 animate-in fade-in duration-150">
                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                          Underlying Evidence Provenance
                        </span>
                        {pattern.evidenceReferences.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No direct links found.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {pattern.evidenceReferences.map((ev, eIdx) => (
                              <div
                                key={`${ev.id}-${eIdx}`}
                                className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-start gap-2"
                              >
                                <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-white text-slate-600 border border-slate-200 shrink-0">
                                  {ev.type}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-slate-800 truncate">
                                    {ev.titleOrSnippet}
                                  </p>
                                  <span className="text-[10px] text-slate-400">{ev.date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Targeted Interventions (Active & Completed) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Targeted Instructional Interventions
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Teacher-authorized support plans with strategy tracking and evaluated outcomes.
              </p>
            </div>
            <button
              onClick={() => {
                setPrefilledReason('');
                setIsInterventionModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-brand-teal bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Plan</span>
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {activeInterventions.length === 0 && pastInterventions.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 italic">
              No active or past interventions recorded for this student.
            </p>
          ) : (
            <div className="space-y-3">
              {activeInterventions.map((iv) => (
                <div
                  key={iv.id}
                  className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                        {iv.status}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">
                        {iv.subjectName} &bull; {iv.learningArea}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Target: {iv.targetDate}
                      </span>
                      <button
                        onClick={() => setResolvingInterventionId(iv.id)}
                        className="px-2.5 py-1 rounded-md text-xs font-bold text-white bg-brand-teal hover:bg-brand-teal/90 transition-colors shadow-xs"
                      >
                        Record Outcome
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 space-y-1">
                    <p>
                      <strong className="text-slate-900">Reason:</strong> {iv.reason}
                    </p>
                    <p>
                      <strong className="text-slate-900">Strategy:</strong> {iv.strategyAction}
                    </p>
                    <p>
                      <strong className="text-slate-900">Target Outcome:</strong> {iv.targetOutcome}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-amber-100">
                    <span>Authorized by: <strong>{iv.teacherName}</strong></span>
                    <span>Started: {iv.startDate} &bull; {iv.evidenceReferences.length} evidence links</span>
                  </div>

                  {/* Inline Outcome Resolution Form */}
                  {resolvingInterventionId === iv.id && (
                    <div className="p-3 mt-2 rounded-lg bg-white border border-slate-300 space-y-2.5 animate-in fade-in duration-150">
                      <span className="text-xs font-bold text-slate-800 block">
                        Record Intervention Outcome
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Evaluated Outcome
                          </label>
                          <select
                            value={selectedOutcome}
                            onChange={(e) => setSelectedOutcome(e.target.value as InterventionOutcome)}
                            className="w-full text-xs rounded border border-slate-300 p-1.5"
                          >
                            <option value="improved">Improved (Target Achieved)</option>
                            <option value="partially_improved">Partially Improved</option>
                            <option value="unchanged">Unchanged (Strategy Ineffective)</option>
                            <option value="declined">Declined</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Outcome Notes
                          </label>
                          <input
                            type="text"
                            value={outcomeNotes}
                            onChange={(e) => setOutcomeNotes(e.target.value)}
                            placeholder="e.g. Scored 8/10 on subsequent fractions quiz"
                            className="w-full text-xs rounded border border-slate-300 p-1.5"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setResolvingInterventionId(null)}
                          className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleResolveIntervention(iv.id)}
                          className="px-3 py-1 text-xs font-bold text-white bg-brand-teal rounded hover:bg-brand-teal/90"
                        >
                          Complete &amp; Archive
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Past Interventions */}
              {pastInterventions.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 opacity-90"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                        {p.status}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800">
                        {p.subjectName} &bull; {p.learningArea}
                      </h4>
                    </div>
                    {p.outcome && (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Outcome: {p.outcome.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {p.outcomeNotes && (
                    <p className="text-xs text-slate-600 italic">
                      &ldquo;{p.outcomeNotes}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Subject Trajectories Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">
            Subject Performance &amp; Mastery Trajectory
          </CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Overview of academic evidence density, formal marks, and diagnostic participation across subjects.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Formal Average</th>
                  <th className="py-2.5 px-3">Diagnostic Completion</th>
                  <th className="py-2.5 px-3">Evidence Items</th>
                  <th className="py-2.5 px-3">Mastery Trajectory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjectTrajectories.map((st) => (
                  <tr key={st.subjectId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-900">{st.subjectName}</td>
                    <td className="py-3 px-3 font-bold text-indigo-900">
                      {st.formalAveragePct !== null ? `${st.formalAveragePct}%` : '—'}
                    </td>
                    <td className="py-3 px-3 font-bold text-teal-800">
                      {st.diagnosticParticipationPct}%
                    </td>
                    <td className="py-3 px-3 text-slate-600">{st.evidenceCount} records</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          st.status === 'support_needed'
                            ? 'bg-amber-100 text-amber-800'
                            : st.status === 'insufficient_evidence'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {st.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Unified Evidence & Observation Timeline */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Unified Evidence &amp; Observation Timeline
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Chronological stream of all formal assessments, diagnostic submissions, and teacher observations.
              </p>
            </div>
            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setTimelineFilter('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  timelineFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTimelineFilter('formal')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  timelineFilter === 'formal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Formal
              </button>
              <button
                onClick={() => setTimelineFilter('diagnostic')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  timelineFilter === 'diagnostic' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Diagnostic
              </button>
              <button
                onClick={() => setTimelineFilter('observation')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  timelineFilter === 'observation' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Observations
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredTimeline.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 italic">No matching evidence found.</p>
          ) : (
            <div className="space-y-3">
              {filteredTimeline.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          item.badge.variant === 'success'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : item.badge.variant === 'critical'
                            ? 'bg-red-100 text-red-800 border-red-200'
                            : item.badge.variant === 'warning'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-teal-100 text-teal-800 border-teal-200'
                        }`}
                      >
                        {item.badge.label}
                      </span>
                      <h5 className="text-xs font-bold text-slate-900">
                        {item.subjectName} &bull; {item.title}
                      </h5>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">{item.date}</span>
                  </div>
                  <p className="text-xs text-slate-700">{item.details}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intervention Modal */}
      {studentId && (
        <InterventionModal
          isOpen={isInterventionModalOpen}
          onClose={() => setIsInterventionModalOpen(false)}
          onSuccess={loadData}
          schoolId="22222222-2222-2222-2222-222222222222"
          studentId={studentId}
          studentName={fullName}
          classId="55555555-5555-5555-5555-555555555551"
          streamId="66666666-6666-6666-6666-666666666661"
          teacherId="99999999-9999-9999-9999-999999999991"
          availableSubjects={[
            { id: '77777777-7777-7777-7777-777777777771', name: 'Mathematics' },
            { id: '77777777-7777-7777-7777-777777777772', name: 'English' },
            { id: '77777777-7777-7777-7777-777777777773', name: 'Science' },
          ]}
          availableEvidence={availableEvidenceForModal}
          prefilledMisconception={prefilledReason}
        />
      )}
    </div>
  );
};
