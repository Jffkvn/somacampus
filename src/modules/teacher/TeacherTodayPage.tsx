import React, { useState, useEffect } from 'react';
import { teacherService } from './teacherService';
import { TeacherTodayViewModel } from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { Clock, CheckCircle2, ArrowRight, BookOpen, MapPin, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TeacherTodayPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<TeacherTodayViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClockingIn, setIsClockingIn] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const result = await teacherService.getTeacherToday('teacher-sarah-01', '2026-09-03');
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

  if (isLoading || !data) {
    return <LoadingState label="Loading today's teaching context..." />;
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
            Good morning, {data.teacherName.split(' ')[1] || 'Teacher'}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>{data.dayLabel}</span>
          </p>
        </div>

        {/* Morning Arrival / Clock-In Card */}
        <div className="flex items-center gap-3">
          {isClockedIn ? (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="leading-tight">
                <p className="text-xs font-bold text-emerald-900">Clocked In at {clockedInAt}</p>
                <p className="text-[11px] text-emerald-700">GPS Verified • School Compound</p>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={handleClockIn}
              isLoading={isClockingIn}
              leftIcon={<Clock className="w-5 h-5" />}
              className="shadow-md"
            >
              Clock In For School Day
            </Button>
          )}
        </div>
      </div>

      {/* Hero: Active / Next Class Spotlight */}
      {activeEntry && (
        <Card className="border-brand-teal/30 bg-gradient-to-r from-teal-50/70 via-white to-white shadow-sm">
          <CardHeader className="border-b-0 pb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-teal" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                Current Scheduled Class
              </span>
            </div>
            <StatusPill status="info" label={`${activeEntry.startTime} - ${activeEntry.endTime}`} />
          </CardHeader>

          <CardContent className="pt-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {activeEntry.className} • {activeEntry.subjectName}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                  {activeEntry.roomName && (
                    <span className="flex items-center gap-1.5 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {activeEntry.roomName}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 font-medium">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    {activeEntry.studentCount} enrolled students
                  </span>
                </div>

                {activeEntry.curriculumPosition && (
                  <div className="mt-3 p-3.5 rounded-xl bg-white/90 border border-slate-200/80 text-xs">
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
                  Open Lesson & Take Attendance
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grid: Full Day's Timetable & Daily School Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Day's Timetable (2 cols on desktop) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Today's Timetable Schedule
            </h3>
            <span className="text-xs font-medium text-slate-500">
              {data.schedule.length} teaching periods scheduled
            </span>
          </div>

          <div className="space-y-3">
            {data.schedule.map((entry) => {
              const isCompleted = data.completedLessonIds.includes(entry.id);
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
                        {entry.roomName || 'Regular Classroom'} • {entry.studentCount} students
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isCompleted ? (
                      <StatusPill status="success" label="Lesson Completed" />
                    ) : isCurrent ? (
                      <StatusPill status="warning" label="Up Next" />
                    ) : (
                      <StatusPill status="neutral" label="Scheduled" />
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(`/teaching/classes/${entry.classId}/lessons/${entry.id}`)
                      }
                    >
                      Open Class
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily School Events & Shortcuts (1 col on desktop) */}
        <div className="space-y-6">
          {/* Daily School Calendar Events */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-teal" />
                <span>Today's School Events</span>
              </CardTitle>
              <CardDescription>From School Calendar</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {data.dailyEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1"
                >
                  <p className="font-semibold text-slate-900">{event.title}</p>
                  <div className="flex items-center justify-between text-slate-500 text-[11px]">
                    {event.time && <span>{event.time}</span>}
                    {event.location && <span>{event.location}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Direct Teaching Shortcuts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-semibold text-slate-700"
                onClick={() => navigate('/students')}
              >
                Inspect Student Profiles
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-semibold text-slate-700"
                onClick={() => navigate('/teaching/resources')}
              >
                Search Resource Library
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-semibold text-slate-700"
                onClick={() => navigate('/timetable')}
              >
                View Full Weekly Timetable
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
