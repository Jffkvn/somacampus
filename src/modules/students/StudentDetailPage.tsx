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

  const { profile, attendance, recentRecords } = data;

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
            <GraduationCap className="w-7 h-7 text-brand-teal" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
              Student Profile
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
              {profile.fullName}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {profile.admissionNumber} • {profile.className}
            </p>
          </div>
        </div>
        <StatusPill
          status={attendance.total > 0 && attendance.percentage >= 80 ? 'success' : attendance.total > 0 ? 'warning' : 'neutral'}
          label={attendance.total > 0 ? `${attendance.percentage}% attendance` : 'No attendance yet'}
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
              status={data.feeClearanceStatus === 'cleared' ? 'success' : data.feeClearanceStatus === 'partial' ? 'warning' : 'critical'}
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

      {/* Phase 4 placeholders — honest, no fake data */}
      <Card>
        <CardContent className="py-5">
          <p className="text-xs text-slate-500">
            Strengths, interventions, and learning evidence are coming in Phase 4.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
