import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import {
  classesService,
  type ClassSummary,
  type ClassDetailData,
  type EnrolledStudentRosterItem,
} from './classesService';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const ClassesPage: React.FC = () => {
  const { schoolId } = useAuth();
  const effectiveSchoolId = schoolId ?? PILOT_SCHOOL_ID;

  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classDetail, setClassDetail] = useState<ClassDetailData | null>(null);
  const [selectedStreamId, setSelectedStreamId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modals state
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showCreateStreamModal, setShowCreateStreamModal] = useState(false);
  const [showAssignTeacherModal, setShowAssignTeacherModal] = useState(false);
  const [transferTargetStudent, setTransferTargetStudent] = useState<EnrolledStudentRosterItem | null>(null);

  // Teachers for assign modal
  const [availableTeachers, setAvailableTeachers] = useState<Array<{ id: string; name: string; number: string }>>([]);

  const loadClasses = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await classesService.listClassesWithStreams(effectiveSchoolId);
      setClasses(data);
      if (data.length > 0 && !selectedClassId) {
        setSelectedClassId(data[0].id);
      }
    } catch (err: any) {
      setLoadError(err instanceof Error ? err.message : typeof err === 'object' && err?.message ? err.message : 'Failed to load classes.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSchoolId, selectedClassId]);

  const loadClassDetail = useCallback(async (clsId: string) => {
    try {
      setIsLoadingDetail(true);
      const data = await classesService.getClassDetails(clsId, effectiveSchoolId);
      setClassDetail(data);
    } catch (err) {
      console.error('Failed to load class details', err);
    } finally {
      setIsLoadingDetail(false);
    }
  }, [effectiveSchoolId]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (selectedClassId) {
      loadClassDetail(selectedClassId);
      setSelectedStreamId('all');
    }
  }, [selectedClassId, loadClassDetail]);

  // Load teachers for assign modal
  useEffect(() => {
    async function loadTeachers() {
      try {
        const { data } = await supabase
          .from('employees')
          .select('id, employee_number, person:people(first_name, last_name)')
          .eq('school_id', effectiveSchoolId)
          .eq('status', 'active');
        if (data) {
          setAvailableTeachers(
            data.map((e: any) => ({
              id: e.id,
              number: e.employee_number,
              name: `${e.person?.first_name || ''} ${e.person?.last_name || ''}`.trim() || 'Teacher',
            }))
          );
        }
      } catch {
        // Fallback for mock env
        setAvailableTeachers([
          { id: 'emp-teacher-1', number: 'EMP-001', name: 'Sarah Nabwire' },
          { id: 'emp-teacher-2', number: 'EMP-002', name: 'Peter Mukasa' },
        ]);
      }
    }
    loadTeachers();
  }, [effectiveSchoolId]);

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.stageLevel.toLowerCase().includes(q) ||
        c.streams.some((s) => s.name.toLowerCase().includes(q))
    );
  }, [classes, searchQuery]);

  const filteredRoster = useMemo(() => {
    if (!classDetail) return [];
    if (selectedStreamId === 'all') return classDetail.roster;
    return classDetail.roster.filter((r) => r.streamId === selectedStreamId);
  }, [classDetail, selectedStreamId]);

  if (isLoading) {
    return <LoadingState label="Loading classes & streams..." />;
  }

  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Academics</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Classes & Streams
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage academic stages, stream capacities, designated class teachers, and student rosters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateClassModal(true)}>
            Create Class
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* 2-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Pane: Classes List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search classes or streams..."
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
            />
          </div>

          <div className="space-y-2.5">
            {filteredClasses.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No classes found.</p>
            ) : (
              filteredClasses.map((cls) => {
                const isSelected = cls.id === selectedClassId;
                const percentFull = Math.min(100, Math.round((cls.enrolledCount / (cls.capacity || 40)) * 100));

                return (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedClassId(cls.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                      isSelected
                        ? 'border-brand-teal bg-teal-50/40 shadow-sm'
                        : 'border-slate-200/80 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{cls.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{cls.stageLevel}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {cls.enrolledCount} / {cls.capacity} pupils
                      </span>
                    </div>

                    {/* Capacity Progress Bar */}
                    <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${
                          percentFull >= 90 ? 'bg-amber-500' : 'bg-brand-teal'
                        }`}
                        style={{ width: `${percentFull}%` }}
                      />
                    </div>

                    {/* Streams & Teacher */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>{cls.streams.length} stream{cls.streams.length === 1 ? '' : 's'}</span>
                      <span className="truncate max-w-[140px] text-right text-slate-600 font-medium">
                        {cls.classTeacher?.teacherName || 'No Class Teacher'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Class Details & Student Roster */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedClass || !classDetail ? (
            <Card>
              <CardContent className="p-12 text-center text-slate-400 text-sm">
                Select a class to view its streams, assigned teacher, and enrolled student roster.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Class Header Banner */}
              <Card className="bg-gradient-to-br from-white to-slate-50/50">
                <CardContent className="p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-extrabold text-slate-900">{classDetail.name}</h2>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800">
                          {classDetail.stageLevel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Total Enrolment: {classDetail.attendanceSummary.totalEnrolled} / {classDetail.capacity} pupils
                        {' • '}
                        {classDetail.streams.length} stream{classDetail.streams.length === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link to={`/teaching/classes/${classDetail.id}/attendance`}>
                        <Button variant="primary" size="sm" leftIcon={<Clock className="w-4 h-4" />}>
                          Take Morning Register
                        </Button>
                      </Link>
                      <Button variant="secondary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateStreamModal(true)}>
                        Add Stream
                      </Button>
                    </div>
                  </div>

                  {/* Class Teacher Card */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Designated Class Teacher</p>
                        <p className="text-sm font-bold text-slate-900">
                          {classDetail.classTeacher?.teacherName || 'Not Assigned Yet'}
                        </p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setShowAssignTeacherModal(true)}>
                      {classDetail.classTeacher ? 'Change Teacher' : 'Assign Teacher'}
                    </Button>
                  </div>

                  {/* Attendance Statistics Bar for Today */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-400">Today Present</p>
                      <p className="text-lg font-extrabold text-emerald-600">{classDetail.attendanceSummary.presentCount}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-400">Today Absent</p>
                      <p className="text-lg font-extrabold text-red-600">{classDetail.attendanceSummary.absentCount}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-400">Late / Excused</p>
                      <p className="text-lg font-extrabold text-amber-600">
                        {classDetail.attendanceSummary.lateCount + classDetail.attendanceSummary.excusedCount}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-400">Attendance Rate</p>
                      <p className="text-lg font-extrabold text-slate-800">
                        {classDetail.attendanceSummary.attendanceRate}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Streams Filter & Roster Table */}
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                  <div>
                    <CardTitle>Enrolled Student Roster</CardTitle>
                    <CardDescription>
                      Showing {filteredRoster.length} active pupil{filteredRoster.length === 1 ? '' : 's'}
                    </CardDescription>
                  </div>

                  {/* Stream Filter Pills */}
                  {classDetail.streams.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setSelectedStreamId('all')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                          selectedStreamId === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        All Streams ({classDetail.roster.length})
                      </button>
                      {classDetail.streams.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedStreamId(s.id)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                            selectedStreamId === s.id
                              ? 'bg-brand-teal text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {s.name} ({s.enrolledCount}/{s.capacity})
                        </button>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingDetail ? (
                    <div className="p-8 text-center text-xs text-slate-400">Loading roster...</div>
                  ) : filteredRoster.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No students enrolled in this stream.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/80 border-b border-slate-100 text-xs text-slate-400 uppercase font-semibold">
                          <tr>
                            <th className="py-3 px-4">Adm #</th>
                            <th className="py-3 px-4">Pupil Name</th>
                            <th className="py-3 px-4">Stream</th>
                            <th className="py-3 px-4">Today's Attendance</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredRoster.map((pupil) => {
                            const attVariant: StatusVariant =
                              pupil.todayAttendanceStatus === 'present'
                                ? 'success'
                                : pupil.todayAttendanceStatus === 'absent'
                                ? 'critical'
                                : pupil.todayAttendanceStatus === 'late'
                                ? 'warning'
                                : pupil.todayAttendanceStatus === 'excused'
                                ? 'info'
                                : 'neutral';

                            return (
                              <tr key={pupil.enrolmentId} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-4 font-mono text-xs font-medium text-slate-600">
                                  {pupil.admissionNumber}
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  <Link
                                    to={`/students/${pupil.studentId}`}
                                    className="hover:text-brand-teal transition-colors"
                                  >
                                    {pupil.fullName}
                                  </Link>
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">
                                  {pupil.streamName || 'Unstreamed'}
                                </td>
                                <td className="py-3 px-4">
                                  <StatusPill
                                    status={attVariant}
                                    label={
                                      pupil.todayAttendanceStatus === 'not_taken'
                                        ? 'Not Taken'
                                        : pupil.todayAttendanceStatus
                                    }
                                  />
                                  {pupil.attendanceRemarks && (
                                    <span className="text-xs text-slate-400 block mt-0.5 italic">
                                      {pupil.attendanceRemarks}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right space-x-2">
                                  {classDetail.streams.length > 1 && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => setTransferTargetStudent(pupil)}
                                    >
                                      Move Stream
                                    </Button>
                                  )}
                                  <Link to={`/students/${pupil.studentId}`}>
                                    <Button variant="ghost" size="sm">
                                      Dossier <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                    </Button>
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Create Class Modal */}
      {showCreateClassModal && (
        <CreateClassModal
          schoolId={effectiveSchoolId}
          onClose={() => setShowCreateClassModal(false)}
          onCreated={async (newId) => {
            setShowCreateClassModal(false);
            await loadClasses();
            setSelectedClassId(newId);
          }}
        />
      )}

      {/* Create Stream Modal */}
      {showCreateStreamModal && selectedClass && (
        <CreateStreamModal
          classId={selectedClass.id}
          className={selectedClass.name}
          onClose={() => setShowCreateStreamModal(false)}
          onCreated={async () => {
            setShowCreateStreamModal(false);
            await loadClasses();
            if (selectedClassId) await loadClassDetail(selectedClassId);
          }}
        />
      )}

      {/* Assign Class Teacher Modal */}
      {showAssignTeacherModal && selectedClass && (
        <AssignClassTeacherModal
          schoolId={effectiveSchoolId}
          classId={selectedClass.id}
          className={selectedClass.name}
          teachers={availableTeachers}
          currentTeacherId={selectedClass.classTeacher?.teacherId}
          onClose={() => setShowAssignTeacherModal(false)}
          onAssigned={async () => {
            setShowAssignTeacherModal(false);
            await loadClasses();
            if (selectedClassId) await loadClassDetail(selectedClassId);
          }}
        />
      )}

      {/* Transfer Stream Modal */}
      {transferTargetStudent && selectedClass && (
        <TransferStreamModal
          student={transferTargetStudent}
          currentClassId={selectedClass.id}
          streams={selectedClass.streams}
          onClose={() => setTransferTargetStudent(null)}
          onTransferred={async () => {
            setTransferTargetStudent(null);
            await loadClasses();
            if (selectedClassId) await loadClassDetail(selectedClassId);
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Sub-Modals
// ============================================================================

interface CreateClassModalProps {
  schoolId: string;
  onClose: () => void;
  onCreated: (newId: string) => void;
}

const CreateClassModal: React.FC<CreateClassModalProps> = ({ schoolId, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [stageLevel, setStageLevel] = useState('Stage 1');
  const [capacity, setCapacity] = useState('40');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const newId = await classesService.createClass(schoolId, {
        name: name.trim(),
        stageLevel: stageLevel.trim(),
        capacity: Number(capacity) || 40,
      });
      onCreated(newId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create class.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">Create Academic Class</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="new-cls-name">Class Name</label>
            <input
              id="new-cls-name"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              placeholder="e.g. Primary 5 or Year 5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="new-cls-stage">Stage / Curriculum Level</label>
            <input
              id="new-cls-stage"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              placeholder="e.g. Stage 5 or Primary 5"
              value={stageLevel}
              onChange={(e) => setStageLevel(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="new-cls-cap">Class Capacity</label>
            <input
              id="new-cls-cap"
              type="number"
              min="1"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>Create Class</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface CreateStreamModalProps {
  classId: string;
  className: string;
  onClose: () => void;
  onCreated: () => void;
}

const CreateStreamModal: React.FC<CreateStreamModalProps> = ({ classId, className, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [defaultRoom, setDefaultRoom] = useState('');
  const [capacity, setCapacity] = useState('40');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await classesService.createStream(classId, {
        name: name.trim(),
        defaultRoom: defaultRoom.trim() || undefined,
        capacity: Number(capacity) || 40,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create stream.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Add Stream</h3>
            <p className="text-xs text-slate-500">For class: {className}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="new-strm-name">Stream Name</label>
            <input
              id="new-strm-name"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              placeholder="e.g. Blue, Red, Stream A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="new-strm-room">Default Classroom / Room</label>
            <input
              id="new-strm-room"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              placeholder="e.g. Room 5A"
              value={defaultRoom}
              onChange={(e) => setDefaultRoom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="new-strm-cap">Stream Capacity</label>
            <input
              id="new-strm-cap"
              type="number"
              min="1"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>Add Stream</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AssignClassTeacherModalProps {
  schoolId: string;
  classId: string;
  className: string;
  teachers: Array<{ id: string; name: string; number: string }>;
  currentTeacherId?: string;
  onClose: () => void;
  onAssigned: () => void;
}

const AssignClassTeacherModal: React.FC<AssignClassTeacherModalProps> = ({
  schoolId,
  classId,
  className,
  teachers,
  currentTeacherId,
  onClose,
  onAssigned,
}) => {
  const [teacherId, setTeacherId] = useState(currentTeacherId || '');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await classesService.assignClassTeacher(schoolId, classId, null, teacherId, effectiveDate);
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign class teacher.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Designate Class Teacher</h3>
            <p className="text-xs text-slate-500">For {className}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="assign-teacher-select">Select Teacher</label>
            <select
              id="assign-teacher-select"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              required
            >
              <option value="">Choose teacher...</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.number})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="assign-effective-date">Effective Date</label>
            <input
              id="assign-effective-date"
              type="date"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting} disabled={!teacherId}>
              Confirm Assignment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface TransferStreamModalProps {
  student: EnrolledStudentRosterItem;
  currentClassId: string;
  streams: Array<{ id: string; name: string }>;
  onClose: () => void;
  onTransferred: () => void;
}

const TransferStreamModal: React.FC<TransferStreamModalProps> = ({
  student,
  currentClassId,
  streams,
  onClose,
  onTransferred,
}) => {
  const [targetStreamId, setTargetStreamId] = useState('');
  const [reason, setReason] = useState('transferred_stream');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTargets = streams.filter((s) => s.id !== student.streamId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStreamId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await classesService.transferStudentStream(student.studentId, currentClassId, targetStreamId, reason);
      onTransferred();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream transfer failed.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Transfer Student Stream</h3>
            <p className="text-xs text-slate-500">{student.fullName} ({student.admissionNumber})</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="transfer-target-stream">New Target Stream</label>
            <select
              id="transfer-target-stream"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
              value={targetStreamId}
              onChange={(e) => setTargetStreamId(e.target.value)}
              required
            >
              <option value="">Select target stream...</option>
              {availableTargets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="transfer-stream-reason">Transfer Reason</label>
            <input
              id="transfer-stream-reason"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Balanced classroom numbers"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting} disabled={!targetStreamId}>
              Transfer Stream
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
