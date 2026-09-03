import React, { useState, useEffect } from 'react';
import { teacherService } from './teacherService';
import { TeacherTodayViewModel, ClassResponsibility } from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import {
  Clock,
  CheckCircle2,
  ArrowRight,
  BookOpen,
  MapPin,
  Calendar,
  Users,
  AlertCircle,
  ClipboardCheck,
  History,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { greetFirstName } from './scheduleUtils';

interface StudentRosterItem {
  id: string;
  name: string;
  admissionNumber: string;
  status: 'present' | 'absent' | 'late' | 'excused';
}

const DEFAULT_P5_STUDENTS: StudentRosterItem[] = [
  { id: '22222222-0000-0000-0000-000000000001', name: 'John Okello', admissionNumber: 'GCC-2024-001', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000002', name: 'Grace Achieng', admissionNumber: 'GCC-2024-002', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000003', name: 'Brian Kigozi', admissionNumber: 'GCC-2024-003', status: 'absent' },
  { id: '22222222-0000-0000-0000-000000000004', name: 'Doreen Nalubega', admissionNumber: 'GCC-2024-004', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000005', name: 'Emmanuel Sserwadda', admissionNumber: 'GCC-2024-005', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000006', name: 'Faith Nakato', admissionNumber: 'GCC-2024-006', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000007', name: 'George William Mukasa', admissionNumber: 'GCC-2024-007', status: 'present' },
  { id: '22222222-0000-0000-0000-000000000008', name: 'Harriet Namatovu', admissionNumber: 'GCC-2024-008', status: 'present' },
];

export const TeacherTodayPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<TeacherTodayViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClockingIn, setIsClockingIn] = useState(false);

  // Daily Class Attendance Modal State
  const [attendanceModalClass, setAttendanceModalClass] = useState<ClassResponsibility | null>(null);
  const [roster, setRoster] = useState<StudentRosterItem[]>(DEFAULT_P5_STUDENTS);
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionStudentId, setCorrectionStudentId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const result = await teacherService.getTeacherToday('teacher@somacampus.ug', '2026-09-03');
        setData(result);
      } catch (err) {
        console.error('Failed to load teacher today data', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleClockIn = async () => {
    if (!data) return;
    try {
      setIsClockingIn(true);
      const res = await teacherService.clockIn(data.teacherId);
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          clockInStatus: {
            isClockedIn: true,
            clockedInAt: res.clockedInAt,
            locationVerified: true,
            verificationMethod: res.verificationMethod,
          },
        };
      });
    } catch (err) {
      console.error('Failed to clock in', err);
    } finally {
      setIsClockingIn(false);
    }
  };

  const handleOpenAttendanceModal = async (cr: ClassResponsibility) => {
    setAttendanceModalClass(cr);
    setCorrectionReason('');
    setCorrectionStudentId(null);
    try {
      const students = await teacherService.getClassStudents(cr.classId, cr.streamId);
      if (students && students.length > 0) {
        setRoster(students);
      }
    } catch (e) {
      console.warn('Could not load dynamic roster, using defaults', e);
    }
  };

  const handleStatusChange = (studentId: string, newStatus: 'present' | 'absent' | 'late' | 'excused') => {
    const isAlreadyRecorded = !!attendanceModalClass?.todayDailyAttendance?.isRecorded;
    if (isAlreadyRecorded) {
      setCorrectionStudentId(studentId);
    }
    setRoster((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s))
    );
  };

  const handleSaveDailyAttendance = async () => {
    if (!attendanceModalClass || !data) return;
    try {
      setIsSubmittingAttendance(true);

      const isCorrection = !!attendanceModalClass.todayDailyAttendance?.isRecorded;
      if (isCorrection && correctionStudentId && !correctionReason) {
        alert('Please provide an audit reason for the attendance correction.');
        setIsSubmittingAttendance(false);
        return;
      }

      const res = await teacherService.recordDailyAttendance({
        schoolId: '22222222-2222-2222-2222-222222222222',
        classId: attendanceModalClass.classId,
        streamId: attendanceModalClass.streamId,
        date: data.date,
        classTeacherId: attendanceModalClass.classTeacherId,
        recordedByTeacherId: data.teacherId,
        records: roster.map((s) => ({
          studentId: s.id,
          status: s.status,
          remarks: s.id === correctionStudentId ? correctionReason : undefined,
        })),
      });

      // Update local state immediately
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          classResponsibilities: prev.classResponsibilities.map((c) =>
            c.classId === attendanceModalClass.classId
              ? {
                  ...c,
                  todayDailyAttendance: {
                    sessionId: res.id,
                    isRecorded: true,
                    recordedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    recordedByTeacherId: data.teacherId,
                    recordedByTeacherName: data.teacherName,
                    isRecordedByClassTeacher: data.teacherId === c.classTeacherId,
                    totalStudents: res.totalStudents,
                    presentCount: res.presentCount,
                    absentCount: res.absentCount,
                    lateCount: res.lateCount,
                    excusedCount: res.excusedCount,
                  },
                }
              : c
          ),
        };
      });

      setAttendanceModalClass(null);
    } catch (err: any) {
      console.error('Failed to save daily attendance', err);
      alert(`Error saving daily attendance: ${err?.message || err?.error_description || 'Please try again.'}`);
    } finally {
      setIsSubmittingAttendance(false);
    }
  };

  if (isLoading || !data) {
    return <LoadingState label="Loading today's teaching workspace..." />;
  }

  const { isClockedIn, clockedInAt } = data.clockInStatus;
  const activeEntry = data.activeTimetableEntry;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Greeting & Arrival Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Teacher Workspace
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Good morning, {greetFirstName(data.teacherName)}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>{data.dayLabel}</span>
            <span className="text-slate-300">•</span>
            <span className="font-medium text-slate-700">Grace's Cambridge Centre</span>
          </p>
        </div>

        {/* Arrival & Clock In */}
        <div className="flex items-center gap-3">
          {isClockedIn ? (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-900 shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-emerald-950">
                  Clocked In at {clockedInAt}
                </span>
                <span className="text-emerald-700/90 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  GPS Verified • School Compound
                </span>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="md"
              leftIcon={<Clock className="w-4 h-4" />}
              isLoading={isClockingIn}
              onClick={handleClockIn}
              className="shadow-sm"
            >
              Clock In For School Day
            </Button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: MY CLASS RESPONSIBILITIES (Form / Class Teacher Pastoral Role) */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 border border-teal-100">
              <Users className="w-5 h-5 text-brand-teal" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                MY CLASS RESPONSIBILITIES
              </h2>
              <p className="text-xs text-slate-500">
                Class Teacher guardianship, pastoral care, and mandatory daily morning attendance
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
            {data.classResponsibilities.length} Assigned Class
          </span>
        </div>

        {data.classResponsibilities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.classResponsibilities.map((cr) => {
              const att = cr.todayDailyAttendance;
              const isRecorded = att && att.isRecorded;

              return (
                <Card
                  key={cr.classId}
                  className="border-brand-teal/30 bg-gradient-to-br from-teal-50/40 via-white to-white shadow-sm hover:border-brand-teal/50 transition-all"
                >
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                            Form / Class Teacher
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-teal-100/70 text-teal-800">
                            Preferred Recorder
                          </span>
                        </div>
                        <CardTitle className="text-xl font-extrabold text-slate-900 mt-1">
                          {cr.className}
                        </CardTitle>
                      </div>
                      <StatusPill status="info" label={`${cr.studentCount} Students`} />
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4">
                    {/* Attendance State Box */}
                    {isRecorded ? (
                      <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs font-bold text-emerald-950">
                              Daily Attendance Recorded
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-800">
                            {att.recordedAt}
                          </span>
                        </div>

                        <p className="text-xs text-emerald-800">
                          {att.isRecordedByClassTeacher
                            ? 'Recorded by you (Class Teacher)'
                            : `Recorded by ${att.recordedByTeacherName ?? 'Teacher'} ${att.recordedByRole === 'class_teacher' ? '(Class Teacher)' : att.recordedByRole === 'subject_teacher' ? '(Subject Teacher)' : att.recordedByRole === 'substitute' ? '(Cover Teacher)' : '(Teacher)'}`}
                        </p>

                        <div className="flex items-center gap-3 text-xs font-semibold pt-1 border-t border-emerald-200/60">
                          <span className="text-emerald-700">{att.presentCount} Present</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-rose-700">{att.absentCount} Absent</span>
                          {att.lateCount > 0 && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-amber-700">{att.lateCount} Late</span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-bold text-amber-950">
                            Daily Morning Attendance Pending
                          </span>
                        </div>
                        <p className="text-xs text-amber-800">
                          Standard morning registration has not yet been submitted for {cr.className}.
                        </p>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        {isRecorded ? (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<History className="w-3.5 h-3.5" />}
                            onClick={() => handleOpenAttendanceModal(cr)}
                          >
                            Review / Correct Attendance
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<ClipboardCheck className="w-4 h-4" />}
                            onClick={() => handleOpenAttendanceModal(cr)}
                          >
                            Record Daily Class Attendance
                          </Button>
                        )}
                      </div>

                      <span className="text-xs text-slate-400 font-medium">
                        Effective since {cr.effectiveFrom}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
            <p className="text-sm font-semibold text-slate-700">
              No Primary Class Teacher Responsibility
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              You are currently assigned as a Subject Teacher. If a Class Teacher is absent, you can record daily class attendance when authorized.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: MY TEACHING TIMETABLE (Instructional Schedule & Lessons)       */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
              <BookOpen className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                MY TEACHING TIMETABLE
              </h2>
              <p className="text-xs text-slate-500">
                Instructional subject periods, lesson plans, and teaching records
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
            {data.schedule.length} Lessons Scheduled
          </span>
        </div>

        {/* Hero: Active / Current Scheduled Class */}
        {activeEntry && (
          <Card className="border-slate-200/80 bg-white shadow-sm">
            <CardHeader className="border-b-0 pb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-teal" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                  Current Scheduled Lesson
                </span>
              </div>
              <StatusPill status="info" label={`${activeEntry.startTime} - ${activeEntry.endTime}`} />
            </CardHeader>

            <CardContent className="pt-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                    {activeEntry.className} • {activeEntry.subjectName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">
                      Teacher: {activeEntry.teacherName}
                    </span>
                    <span className="text-slate-300">•</span>
                    {activeEntry.roomName && (
                      <span className="flex items-center gap-1.5 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {activeEntry.roomName}
                      </span>
                    )}
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {activeEntry.studentCount} enrolled
                    </span>
                  </div>

                  {activeEntry.curriculumPosition && (
                    <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                      <span className="font-semibold text-slate-800">
                        Curriculum Topic: {activeEntry.curriculumPosition.topicName}
                      </span>
                      <p className="text-slate-500 mt-0.5">
                        {activeEntry.curriculumPosition.objective}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="primary"
                    size="lg"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                    onClick={() =>
                      navigate(`/teaching/classes/${activeEntry.classId}/lessons/${activeEntry.id}`)
                    }
                  >
                    Open Scheduled Lesson
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full Timetable List & Events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-3">
            {data.schedule.map((entry) => {
              const isCurrent = activeEntry?.id === entry.id;

              return (
                <div
                  key={entry.id}
                  className={`p-4 rounded-2xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isCurrent
                      ? 'bg-white border-brand-teal/40 shadow-sm ring-1 ring-brand-teal/20'
                      : 'bg-white/80 border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 text-center">
                      <p className="text-sm font-bold text-slate-900">{entry.startTime}</p>
                      <p className="text-[11px] text-slate-400">{entry.endTime}</p>
                    </div>

                    <div className="border-l border-slate-200 pl-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {entry.className}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-sm font-semibold text-brand-teal">
                          {entry.subjectName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Instructor: <strong className="text-slate-700">{entry.teacherName}</strong> • {entry.roomName || 'Classroom'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusPill status={isCurrent ? 'warning' : 'neutral'} label={isCurrent ? 'Up Next' : 'Scheduled'} />

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(`/teaching/classes/${entry.classId}/lessons/${entry.id}`)
                      }
                    >
                      Open Lesson
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* School Events */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-teal" />
                  Today's School Events
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {data.dailyEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 text-xs space-y-1"
                  >
                    <p className="font-semibold text-slate-800">{evt.title}</p>
                    <p className="text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {evt.time} • {evt.location}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: DAILY CLASS ATTENDANCE (Single Daily Attendance Workflow)          */}
      {/* ========================================================================= */}
      {attendanceModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                  Daily Class Attendance
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {attendanceModalClass.className} Register
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Responsible Class Teacher: <strong>{attendanceModalClass.classTeacherName}</strong>
                </p>
              </div>
              <button
                onClick={() => setAttendanceModalClass(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content / Roster List */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-100 text-xs text-teal-900 flex items-center justify-between">
                <span>Total Class Enrollment: <strong>{roster.length} Students</strong></span>
                <span>
                  Present: <strong className="text-emerald-700">{roster.filter((r) => r.status === 'present').length}</strong> |
                  Absent: <strong className="text-rose-700">{roster.filter((r) => r.status === 'absent').length}</strong>
                </span>
              </div>

              {attendanceModalClass.todayDailyAttendance?.isRecorded && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                  <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-amber-700" />
                    Attendance Audit Mode
                  </p>
                  <p className="text-amber-800">
                    Attendance was previously recorded today. Modifying statuses will create an immutable audit record.
                  </p>
                  {correctionStudentId && (
                    <div className="pt-2">
                      <label className="block font-bold text-amber-950 mb-1">
                        Reason for Status Change:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Arrived late with clinic note / parent call"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {roster.map((student) => (
                  <div
                    key={student.id}
                    className="p-3.5 rounded-2xl border border-slate-200/80 bg-white flex items-center justify-between gap-4 hover:border-slate-300 transition-all"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-400">{student.admissionNumber}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      {(['present', 'absent', 'late', 'excused'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStatusChange(student.id, st)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition-all ${
                            student.status === st
                              ? st === 'present'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : st === 'absent'
                                ? 'bg-rose-600 text-white shadow-sm'
                                : st === 'late'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-blue-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={() => setAttendanceModalClass(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                isLoading={isSubmittingAttendance}
                onClick={handleSaveDailyAttendance}
              >
                Save Daily Class Attendance
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
