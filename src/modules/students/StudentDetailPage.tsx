import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { studentService, StudentProfile } from './studentService';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/StatusPill';
import { ArrowLeft, GraduationCap, UserX } from 'lucide-react';

const statusPillFor = (status: string): 'success' | 'critical' | 'warning' | 'info' | 'neutral' =>
  status === 'present'
    ? 'success'
    : status === 'absent'
      ? 'critical'
      : status === 'late'
        ? 'warning'
        : status === 'excused'
          ? 'info'
          : 'neutral';

export const StudentDetailPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<StudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!studentId) {
        setError('No student selected.');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        const res = await studentService.getStudentProfile(studentId);
        if (!res) {
          setError('not-found');
          setData(null);
        } else {
          setData(res);
        }
      } catch (err) {
        console.error('Failed to load student profile', err);
        setError('Failed to load this student profile. Please try again.');
        setData(null);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [studentId]);

  if (isLoading) {
    return <LoadingState label="Loading student profile..." />;
  }

  if (error || !data) {
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
          title="Student not found"
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

  const { profile, attendance, recentRecords, academicEvidence } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Link
        to="/students"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:text-brand-tealDark"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Student Directory</span>
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt={profile.fullName}
                className="w-14 h-14 rounded-2xl object-cover"
              />
            ) : (
              <GraduationCap className="w-7 h-7 text-brand-teal" />
            )}
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
              Student Profile
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
              {profile.fullName}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {profile.admissionNumber} &bull; {profile.className}
            </p>
          </div>
        </div>
        <StatusPill
          status={
            attendance.total > 0 && attendance.percentage >= 80
              ? 'success'
              : attendance.total > 0
              ? 'warning'
              : 'neutral'
          }
          label={
            attendance.total > 0 ? `${attendance.percentage}% attendance` : 'No attendance yet'
          }
        />
      </div>

      {/* Attendance summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-5 text-center">
            <p className="text-2xl font-extrabold text-emerald-700">{attendance.present}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">Present</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5 text-center">
            <p className="text-2xl font-extrabold text-rose-700">{attendance.absent}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">Absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5 text-center">
            <p className="text-2xl font-extrabold text-amber-600">{attendance.late}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">Late</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5 text-center">
            <p className="text-2xl font-extrabold text-sky-700">{attendance.excused}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">Excused</p>
          </CardContent>
        </Card>
      </div>

      {data.feeClearanceStatus && (
        <Card>
          <CardContent className="py-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Fee clearance</span>
            <StatusPill
              status={
                data.feeClearanceStatus === 'cleared'
                  ? 'success'
                  : data.feeClearanceStatus === 'partial'
                  ? 'warning'
                  : 'critical'
              }
              label={data.feeClearanceStatus}
            />
          </CardContent>
        </Card>
      )}

      {/* Recent history */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance History</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {recentRecords.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No attendance records yet for this student.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentRecords.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.date}</p>
                    {r.remarks && <p className="text-xs text-slate-400 mt-0.5">{r.remarks}</p>}
                  </div>
                  <StatusPill status={statusPillFor(r.status)} label={r.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 4: Formal Academic Standing */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
              Track A
            </span>
            <CardTitle className="text-base font-bold text-slate-900">
              Formal Academic Standing
            </CardTitle>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Authoritative scored tests and formal assessments entered by subject teachers.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {!academicEvidence?.formalAssessments ||
          academicEvidence.formalAssessments.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 italic">
              No formal graded assessments recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {academicEvidence.formalAssessments.map((a) => {
                const pct = Math.round((a.score / a.maxScore) * 100);
                return (
                  <div key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                        <span className="text-xs font-medium text-slate-500">&bull; {a.subjectName}</span>
                      </div>
                      {a.teacherFeedback && (
                        <p className="text-xs text-slate-600 mt-0.5 italic">
                          &ldquo;{a.teacherFeedback}&rdquo;
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">Assessed: {a.date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-base font-bold text-indigo-900">
                          {a.score} / {a.maxScore}
                        </span>
                        <span className="text-xs font-semibold text-indigo-600 ml-1.5">
                          ({pct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 4: Diagnostic Learning Evidence & Formative Context */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
              Track B
            </span>
            <CardTitle className="text-base font-bold text-slate-900">
              Learning Evidence &amp; Formative Context
            </CardTitle>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Diagnostic classwork, homework, worksheets, and practice activities.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {!academicEvidence?.diagnosticEvidence ||
          academicEvidence.diagnosticEvidence.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 italic">
              No diagnostic learning evidence submitted yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {academicEvidence.diagnosticEvidence.map((d) => (
                <div key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{d.title}</p>
                      <span className="text-xs font-medium text-slate-500">&bull; {d.subjectName}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        ({d.submissionType})
                      </span>
                    </div>
                    {d.teacherFeedback && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        Feedback: <span className="italic">&ldquo;{d.teacherFeedback}&rdquo;</span>
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Work: {d.workType} &bull; Date: {d.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      status={
                        d.submissionStatus === 'submitted'
                          ? 'success'
                          : d.submissionStatus === 'missing'
                          ? 'critical'
                          : d.participationStatus === 'excused'
                          ? 'warning'
                          : 'pending'
                      }
                      label={
                        d.participationStatus === 'excused'
                          ? 'Excused'
                          : d.submissionStatus === 'submitted'
                          ? 'Submitted'
                          : d.submissionStatus === 'missing'
                          ? 'Missing'
                          : 'Pending'
                      }
                      size="sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 4: Contextual Teacher Observations Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">
            Teacher Observations Timeline
          </CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Durable qualitative evidence recorded by teachers during lessons and reviews.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {!academicEvidence?.observations ||
          academicEvidence.observations.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 italic">
              No teacher observations recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {academicEvidence.observations.map((obs) => {
                const isMisconception = obs.type === 'misconception';
                const isStrength = obs.type === 'strength';
                const isSupport = obs.type === 'support_need';

                const badgeBg = isMisconception
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : isStrength
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : isSupport
                  ? 'bg-sky-100 text-sky-800 border-sky-200'
                  : 'bg-slate-100 text-slate-800 border-slate-200';

                return (
                  <div
                    key={obs.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeBg}`}
                        >
                          {obs.type.replace('_', ' ')}
                        </span>
                        {obs.subjectName && (
                          <span className="text-xs font-semibold text-slate-700">
                            {obs.subjectName}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">{obs.date}</span>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed font-normal">
                      {obs.text}
                    </p>
                    <p className="text-[10px] text-slate-500 pt-0.5">
                      Observed by: <span className="font-medium text-slate-700">{obs.teacherName}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
