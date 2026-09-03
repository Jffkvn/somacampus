import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLessonContext, submitLesson } from './lessonService';
import { getDailyAttendanceCoverage, type DailyAttendanceCoverage } from '../teacher/attendanceCoverage';
import { resolveCockpitAttendanceStrip, formatCockpitStripMessage } from './cockpitAttendance';
import { toHHMM, toLocalYYYYMMDD } from '../teacher/scheduleUtils';
import { learningIntelligenceService } from '../intelligence/learningIntelligenceService';
import type { LessonContext, LessonSubmission, PreLessonBriefing } from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { AlertCircle, CheckCircle2, ArrowLeft, Sparkles, AlertTriangle, Lightbulb } from 'lucide-react';

type LessonStatus = LessonSubmission['status'];

const STATUS_OPTIONS: Array<{ value: LessonStatus; label: string }> = [
  { value: 'completed', label: 'Completed' },
  { value: 'partial', label: 'Partial' },
  { value: 'not_completed', label: 'Not completed' },
  { value: 'struggled', label: 'Struggled' },
  { value: 'advanced', label: 'Advanced' },
];

export const LessonCockpitPage: React.FC = () => {
  const { classId, lessonId } = useParams<{ classId: string; lessonId: string }>();
  const entryId = lessonId ?? '';
  const today = toLocalYYYYMMDD();

  const [context, setContext] = useState<LessonContext | null>(null);
  const [coverage, setCoverage] = useState<DailyAttendanceCoverage | null>(null);
  const [briefing, setBriefing] = useState<PreLessonBriefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [status, setStatus] = useState<LessonStatus>('completed');
  const [whatWasTaught, setWhatWasTaught] = useState('');
  const [visibleLessonNote, setVisibleLessonNote] = useState('');
  const [privateReflection, setPrivateReflection] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedLessonId, setSubmittedLessonId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!classId || !entryId) {
        setLoadError('Missing class or lesson reference in the URL.');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setLoadError(null);
        const ctx = await getLessonContext(entryId, today);
        setContext(ctx);
        // Single source of truth: class-date coverage (never the viewer's
        // Today responsibilities — empty for subject teachers). Never throws.
        const cov = await getDailyAttendanceCoverage(
          ctx.schoolId,
          ctx.classId,
          ctx.streamId ?? null,
          today,
        );
        setCoverage(cov);

        // Phase 5: Load Pre-Lesson Learning Intelligence Briefing
        const b = await learningIntelligenceService.getPreLessonBriefing(
          ctx.classId,
          ctx.subjectId,
          ctx.curriculum.topic,
        );
        setBriefing(b);
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load lesson context. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, entryId]);

  if (isLoading || (!context && !loadError)) {
    return <LoadingState label="Loading lesson cockpit..." />;
  }

  if (loadError || !context) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lesson cockpit unavailable</CardTitle>
          <StatusPill status="critical" label="Error" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            {loadError ?? 'Could not load lesson context.'}
          </p>
          <Link to="/teacher/today" className="text-sm font-semibold text-brand-teal hover:underline">
            Back to Today view
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (submittedLessonId) {
    const createAssignmentUrl = `/teaching/assignments/new?lessonId=${submittedLessonId}&classId=${context.classId}&streamId=${context.streamId ?? ''}&subjectId=${context.subjectId}&topic=${encodeURIComponent(context.curriculum?.topic || '')}`;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Lesson submitted</CardTitle>
          <StatusPill status="success" label={status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {context.subjectName} for {context.className} was recorded.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link to={createAssignmentUrl}>
              <Button variant="primary" size="sm" className="bg-teal-700 hover:bg-teal-800 text-white">
                + Create Assignment / Homework
              </Button>
            </Link>
            <Link to="/teacher/today">
              <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back to Today view
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const strip = resolveCockpitAttendanceStrip(
    context.teacherId,
    coverage?.session?.recordedByName,
    coverage ?? { covered: false },
  );
  const attendanceSessionId = strip.state === 'recorded' ? strip.sessionId : undefined;
  const recordedHHMM =
    strip.state === 'recorded' ? (toHHMM(strip.recordedAt) ?? strip.recordedAt.slice(0, 5)) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visibleLessonNote.trim()) {
      setSubmitError('Visible lesson note is required.');
      return;
    }
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      // stream_id is nullable in the lessons contract; it comes from the
      // timetable entry via LessonContext (no schedule lookup needed).
      const streamId = context.streamId ?? undefined;
      const sub: LessonSubmission = {
        lessonId: `lesson-${entryId}-${Date.now()}`,
        timetableEntryId: entryId,
        status,
        whatWasTaught,
        visibleLessonNote,
        privateReflection: privateReflection.trim() ? privateReflection : undefined,
        attendanceSessionId,
        submittedAt: new Date().toISOString(),
        submittedBy: context.teacherId,
      };
      const { lessonId: savedId } = await submitLesson(sub, {
        schoolId: context.schoolId,
        classId: context.classId,
        subjectId: context.subjectId,
        teacherId: context.teacherId,
        ...(streamId ? { streamId } : {}),
        curriculumTopic: context.curriculum.topic,
        curriculumObjective: context.curriculum.objective,
      });
      setSubmittedLessonId(savedId);
    } catch (err: any) {
      // Form state is preserved on failure — only the error message is set.
      setSubmitError(err?.message ?? 'Could not submit lesson. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
          Lesson Cockpit
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
          {context.className} • {context.subjectName}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {context.startTime} – {context.endTime}
          {context.roomName ? ` • ${context.roomName}` : ''} • {context.teacherName}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily class attendance</CardTitle>
          {strip.state === 'recorded' ? (
            <StatusPill
              status="success"
              label={recordedHHMM ? `Recorded ${recordedHHMM}` : 'Recorded'}
            />
          ) : (
            <StatusPill status="pending" label="Not recorded yet" />
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {strip.state === 'recorded' ? (
            <p className="text-xs text-slate-600">{formatCockpitStripMessage(strip)}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-800">Daily morning attendance has not been recorded yet.</p>
              <Link to="/teacher/today" className="text-sm font-semibold text-brand-teal hover:underline">
                Record in Today view
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curriculum focus</CardTitle>
          <StatusPill status="info" label={context.curriculum.framework} />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-semibold text-slate-800">{context.curriculum.topic}</p>
          {context.curriculum.objective ? (
            <p className="text-xs text-slate-500">{context.curriculum.objective}</p>
          ) : null}
          {context.previousLessonSummary ? (
            <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              Previous lesson: {context.previousLessonSummary}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Phase 5: Before You Teach — Learning Intelligence Briefing */}
      <Card className="border-teal-200/80 bg-teal-50/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-teal" />
              <CardTitle className="text-base font-bold text-slate-900">
                Before You Teach &bull; Learning Intelligence Briefing
              </CardTitle>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
              Grounded Evidence
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Class-wide evidence context, learners needing targeted attention, and retrieval focus prompts.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 text-xs">
          {/* Class Evidence Trend */}
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-1">
              Class Evidence Context ({context.subjectName})
            </span>
            <p className="text-slate-800 leading-relaxed">
              {briefing?.recentClassEvidence.summaryText ||
                'No recent evidence aggregated for this subject yet.'}
            </p>
          </div>

          {/* Students Needing Attention */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
              Learners Needing Targeted Attention ({briefing?.studentsNeedingAttention.length ?? 0})
            </span>
            {!briefing?.studentsNeedingAttention || briefing.studentsNeedingAttention.length === 0 ? (
              <p className="text-slate-500 italic p-2.5 rounded-lg bg-white border border-slate-200">
                All learners in this class currently on track with no open misconception alerts.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {briefing.studentsNeedingAttention.map((student) => (
                  <div
                    key={student.studentId}
                    className="p-3 rounded-lg bg-amber-50/50 border border-amber-200 flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <Link
                          to={`/students/${student.studentId}`}
                          className="font-bold text-slate-900 hover:text-brand-teal hover:underline truncate"
                        >
                          {student.studentName}
                        </Link>
                        {student.activeInterventionId && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-200 text-amber-900 shrink-0">
                            Intervention
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-700 mt-0.5 leading-snug">
                        {student.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suggested 5-Minute Retrieval Warm-up */}
          {briefing?.suggestedRetrievalFocus && briefing.suggestedRetrievalFocus.length > 0 && (
            <div className="p-3 rounded-xl bg-white border border-teal-200 space-y-2">
              <div className="flex items-center gap-1.5 text-brand-teal font-bold text-xs">
                <Lightbulb className="w-4 h-4 text-brand-teal" />
                <span>Suggested 5-Minute Retrieval Warm-Up</span>
              </div>
              <div className="space-y-2">
                {briefing.suggestedRetrievalFocus.map((retrieval, rIdx) => (
                  <div key={rIdx} className="space-y-0.5">
                    <p className="font-semibold text-slate-800">{retrieval.prompt}</p>
                    <p className="text-[10px] text-slate-400 italic">{retrieval.evidenceBasis}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit lesson</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <fieldset>
              <legend className="text-xs font-bold text-slate-800 mb-2">Lesson status</legend>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer transition-all ${
                      status === opt.value
                        ? 'bg-brand-teal text-white border-brand-teal'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="lesson-status"
                      value={opt.value}
                      checked={status === opt.value}
                      onChange={() => setStatus(opt.value)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="cockpit-what-taught" className="block text-xs font-bold text-slate-800 mb-1">
                What was taught
              </label>
              <textarea
                id="cockpit-what-taught"
                value={whatWasTaught}
                onChange={(e) => setWhatWasTaught(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                placeholder="e.g. Fractions intro — halves and quarters"
              />
            </div>

            <div>
              <label htmlFor="cockpit-visible-note" className="block text-xs font-bold text-slate-800 mb-1">
                Visible lesson note (required)
              </label>
              <textarea
                id="cockpit-visible-note"
                value={visibleLessonNote}
                onChange={(e) => setVisibleLessonNote(e.target.value)}
                rows={3}
                required
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                placeholder="Shared with school leadership and parents"
              />
            </div>

            <div>
              <label htmlFor="cockpit-private-reflection" className="block text-xs font-bold text-slate-800 mb-1">
                Private reflection (private — only you)
              </label>
              <textarea
                id="cockpit-private-reflection"
                value={privateReflection}
                onChange={(e) => setPrivateReflection(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                placeholder="Only visible to you, never shared with leadership"
              />
            </div>

            {submitError ? (
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {submitError}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
              Submit lesson
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
