import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Save,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { classesService, type ClassDetailData, type EnrolledStudentRosterItem } from '../classes/classesService';
import { teacherService } from '../teacher/teacherService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

interface AttendanceDraftEntry {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  streamId: string | null;
  streamName: string | null;
  status: 'present' | 'absent' | 'late' | 'excused';
  remarks: string;
}

export const BulkAttendanceRegisterPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const { schoolId, user } = useAuth();
  const effectiveSchoolId = schoolId ?? PILOT_SCHOOL_ID;

  const [classDetail, setClassDetail] = useState<ClassDetailData | null>(null);
  const [selectedStreamId, setSelectedStreamId] = useState<string>('all');
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [draftEntries, setDraftEntries] = useState<AttendanceDraftEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!classId) return;
    try {
      setIsLoading(true);
      setLoadError(null);
      const detail = await classesService.getClassDetails(classId, effectiveSchoolId);
      setClassDetail(detail);

      // Initialize draft entries from roster
      const entries: AttendanceDraftEntry[] = detail.roster.map((r: EnrolledStudentRosterItem) => ({
        studentId: r.studentId,
        admissionNumber: r.admissionNumber,
        fullName: r.fullName,
        streamId: r.streamId,
        streamName: r.streamName,
        status: r.todayAttendanceStatus !== 'not_taken' ? r.todayAttendanceStatus : 'present',
        remarks: r.attendanceRemarks || '',
      }));
      setDraftEntries(entries);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load class roster for attendance.');
    } finally {
      setIsLoading(false);
    }
  }, [classId, effectiveSchoolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeRoster = useMemo(() => {
    if (selectedStreamId === 'all') return draftEntries;
    return draftEntries.filter((e) => e.streamId === selectedStreamId);
  }, [draftEntries, selectedStreamId]);

  const stats = useMemo(() => {
    const total = activeRoster.length;
    const present = activeRoster.filter((e) => e.status === 'present').length;
    const absent = activeRoster.filter((e) => e.status === 'absent').length;
    const late = activeRoster.filter((e) => e.status === 'late').length;
    const excused = activeRoster.filter((e) => e.status === 'excused').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, excused, rate };
  }, [activeRoster]);

  const handleMarkAllPresent = () => {
    setDraftEntries((prev) =>
      prev.map((e) => {
        if (selectedStreamId !== 'all' && e.streamId !== selectedStreamId) return e;
        return { ...e, status: 'present', remarks: '' };
      })
    );
  };

  const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
    setDraftEntries((prev) =>
      prev.map((e) => (e.studentId === studentId ? { ...e, status } : e))
    );
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    setDraftEntries((prev) =>
      prev.map((e) => (e.studentId === studentId ? { ...e, remarks } : e))
    );
  };

  const handleSubmit = async () => {
    if (!classId || !classDetail) return;
    setIsSubmitting(true);
    setSaveSuccess(null);
    try {
      const recordsToSubmit = activeRoster.map((e) => ({
        studentId: e.studentId,
        status: e.status,
        remarks: e.remarks.trim() || undefined,
      }));

      const teacherId = classDetail.classTeacher?.teacherId || user?.id || '99999999-9999-9999-9999-999999999991';

      await teacherService.recordDailyAttendance({
        schoolId: effectiveSchoolId,
        classId,
        streamId: selectedStreamId !== 'all' ? selectedStreamId : undefined,
        date: attendanceDate,
        classTeacherId: teacherId,
        recordedByTeacherId: user?.id || teacherId,
        records: recordsToSubmit,
      });

      setSaveSuccess(`Daily register successfully recorded for ${recordsToSubmit.length} students.`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to record daily attendance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading morning attendance roster..." />;
  }

  if (!classDetail) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-slate-500">Class not found.</p>
        <Link to="/classes">
          <Button variant="secondary" size="sm">Back to Classes</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Back link & Top bar */}
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/classes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Classes & Streams
        </Link>
        <div className="flex items-center gap-2">
          <label htmlFor="register-date" className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Date:
          </label>
          <input
            id="register-date"
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className="px-3 py-1 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
          />
        </div>
      </div>

      {/* Main Header Card */}
      <Card className="bg-gradient-to-br from-white to-slate-50/50">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Morning Register</span>
              <h1 className="text-2xl font-extrabold text-slate-900 mt-0.5">
                {classDetail.name} Daily Attendance
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                One register taken each morning at class/stream level. Longitudinal pupil records update immediately.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMarkAllPresent}
                leftIcon={<Zap className="w-4 h-4 text-amber-500" />}
              >
                Mark All Present
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Save Register
              </Button>
            </div>
          </div>

          {/* Stream Selector (if streamed) */}
          {classDetail.streams.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 overflow-x-auto pb-1">
              <span className="text-xs font-semibold text-slate-400 shrink-0">Stream:</span>
              <button
                onClick={() => setSelectedStreamId('all')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                  selectedStreamId === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Streams ({draftEntries.length})
              </button>
              {classDetail.streams.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStreamId(s.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                    selectedStreamId === s.id
                      ? 'bg-brand-teal text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s.name} ({draftEntries.filter((e) => e.streamId === s.id).length})
                </button>
              ))}
            </div>
          )}

          {/* Live Attendance Stats Counter */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-400">Total Enrolled</p>
              <p className="text-lg font-extrabold text-slate-800">{stats.total}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
              <p className="text-xs text-emerald-700 font-semibold">Present</p>
              <p className="text-lg font-extrabold text-emerald-700">{stats.present}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-red-50/70 border border-red-100">
              <p className="text-xs text-red-700 font-semibold">Absent</p>
              <p className="text-lg font-extrabold text-red-700">{stats.absent}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
              <p className="text-xs text-amber-700 font-semibold">Late / Excused</p>
              <p className="text-lg font-extrabold text-amber-700">{stats.late + stats.excused}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-100 col-span-2 sm:col-span-1">
              <p className="text-xs text-teal-800 font-semibold">Rate</p>
              <p className="text-lg font-extrabold text-teal-800">{stats.rate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {saveSuccess && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Student Attendance Roster List */}
      <Card>
        <CardHeader>
          <CardTitle>Pupil Register</CardTitle>
          <CardDescription>
            Tapping a status chip marks the student. Add remarks for absences or late arrivals.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {activeRoster.map((pupil, index) => (
              <div
                key={pupil.studentId}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
              >
                {/* Pupil Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono font-semibold text-slate-400 w-6 text-right shrink-0">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{pupil.fullName}</p>
                    <p className="text-xs text-slate-400">
                      {pupil.admissionNumber} {pupil.streamName ? `• ${pupil.streamName}` : ''}
                    </p>
                  </div>
                </div>

                {/* Status Toggle Buttons & Remarks */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <div className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(pupil.studentId, 'present')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        pupil.status === 'present'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(pupil.studentId, 'absent')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        pupil.status === 'absent'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Absent
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(pupil.studentId, 'late')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        pupil.status === 'late'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Late
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(pupil.studentId, 'excused')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        pupil.status === 'excused'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Excused
                    </button>
                  </div>

                  {pupil.status !== 'present' && (
                    <input
                      type="text"
                      placeholder="Reason / remarks..."
                      value={pupil.remarks}
                      onChange={(e) => handleRemarksChange(pupil.studentId, e.target.value)}
                      className="px-3 py-1 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 w-full sm:w-44 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-b-2xl">
            <span className="text-xs text-slate-500">
              {stats.present} present out of {stats.total} total pupils
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Submit Morning Register
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
