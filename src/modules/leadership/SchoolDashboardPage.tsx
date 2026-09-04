import React, { useState, useEffect } from 'react';
import { leadershipService, LeadershipDashboardViewModel } from './leadershipService';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { Users, GraduationCap, CheckCircle2, AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { toLocalYYYYMMDD } from '../teacher/scheduleUtils';
import { moneyMovementService } from '../finance/moneyMovementService';
import { InstitutionalMoneyPicture } from '../../types/domain';
import { formatUGX } from '../payroll/calculations';
import { DollarSign, TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';

export const SchoolDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<LeadershipDashboardViewModel | null>(null);
  const [moneyPicture, setMoneyPicture] = useState<InstitutionalMoneyPicture | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [res, money] = await Promise.all([
          leadershipService.getSchoolLeadershipDashboard('22222222-2222-2222-2222-222222222222', toLocalYYYYMMDD(new Date())),
          moneyMovementService.getInstitutionalMoneyPicture('school-default', 'term-1'),
        ]);
        setData(res);
        setMoneyPicture(money);
      } catch (err) {
        console.error('Failed to load leadership dashboard data', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading || !data) {
    return <LoadingState label="Loading school leadership cockpit..." />;
  }

  const latestTrend = data.attendanceTrend[data.attendanceTrend.length - 1];
  const staffSubValue = latestTrend ? `${latestTrend.staffRate}% staff present` : 'No attendance yet';
  const completionSubValue =
    data.stats.lessonsExpected > 0
      ? `${Math.round((data.stats.lessonsCompleted / data.stats.lessonsExpected) * 100)}% completion rate`
      : '—';
  const attendanceDelta =
    data.attendanceTrend.length >= 2
      ? data.attendanceTrend[data.attendanceTrend.length - 1].studentRate - data.attendanceTrend[0].studentRate
      : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Leadership Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Executive Leadership Cockpit
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            {data.schoolName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {data.academicTerm} • Operational & Academic Monitor
          </p>
        </div>
      </div>

      {/* 4 Focused Headline Stat Cards (Meaningful hierarchy, NOT 12 small cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Enrolled Students"
          value={data.stats.enrolledStudents.toLocaleString()}
          subValue="Primary Stages 1 - 7"
          icon={Users}
          href="/students"
        />
        <StatCard
          label="Active Teaching Staff"
          value={data.stats.activeTeachers}
          subValue={staffSubValue}
          icon={GraduationCap}
          href="/administration/hr"
        />
        <StatCard
          label="Student Attendance"
          value={`${data.stats.attendanceRate}%`}
          trend={
            attendanceDelta !== null
              ? {
                  value: `${attendanceDelta >= 0 ? '+' : ''}${attendanceDelta.toFixed(1)}% this week`,
                  direction: attendanceDelta > 0 ? 'up' : attendanceDelta < 0 ? 'down' : 'neutral',
                  isPositive: attendanceDelta >= 0,
                }
              : undefined
          }
          icon={CheckCircle2}
          href="/students/attendance"
        />
        <StatCard
          label="Lessons Completed"
          value={`${data.stats.lessonsCompleted} / ${data.stats.lessonsExpected}`}
          subValue={completionSubValue}
          icon={CheckCircle2}
          href="/teaching/lessons"
        />
      </div>

      {/* Main Grid: Visual Charts & Live Teaching Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Attendance Trend Chart (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Attendance Trends (Current Week)</CardTitle>
                <CardDescription>
                  Comparison between student attendance and teaching staff presence
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.attendanceTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis domain={[80, 100]} tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      }}
                    />
                    <Bar dataKey="studentRate" name="Student Rate %" fill="#006c8b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="staffRate" name="Staff Presence %" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Live Teaching Activity & Operational Lesson Notes Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Live Teaching Activity & Operational Notes</CardTitle>
                <CardDescription>
                  Teacher lesson records submitted today (Operational notes only)
                </CardDescription>
              </div>
              <button
                onClick={() => navigate('/teaching/lessons')}
                className="text-xs font-semibold text-brand-teal hover:text-brand-tealDark flex items-center gap-1"
              >
                <span>View all lessons</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </CardHeader>
            <CardContent className="pt-0">
              {data.activeLessons.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No lessons submitted today yet.</p>
              ) : (
              <div className="divide-y divide-slate-100">
                {data.activeLessons.map((lesson) => (
                  <div key={lesson.lessonId} className="py-4 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-900">{lesson.teacherName}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs font-medium text-slate-600">
                          {lesson.className} ({lesson.subjectName})
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-slate-400">{lesson.scheduledTime}</span>
                      </div>
                      <StatusPill
                        status={lesson.status === 'completed' ? 'success' : 'warning'}
                        label={lesson.status === 'completed' ? 'Completed as planned' : 'Pending submission'}
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 text-xs text-slate-700 leading-relaxed border border-slate-100">
                      <span className="font-semibold text-slate-900">
                        Topic: {lesson.curriculumTopic} —{' '}
                      </span>
                      {lesson.visibleLessonNote}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar: Institutional Money Picture & Operational Alerts (1 Col) */}
        <div className="space-y-6">
          {/* Institutional Cash Movement Card */}
          {moneyPicture && (
            <Card className="border-teal-100 bg-gradient-to-b from-teal-50/30 to-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Institutional Cash Flow
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-800 rounded font-medium">
                    {moneyPicture.termName}
                  </span>
                </div>
                <CardTitle className="text-base font-bold text-slate-900 mt-1">
                  Money In vs. Money Out
                </CardTitle>
                <CardDescription>Operational cash balance for the term</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {/* Net Operational Movement */}
                <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Net Cash Movement</span>
                    <span className={`text-lg font-bold ${moneyPicture.netOperationalMovement >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {moneyPicture.netOperationalMovement >= 0 ? '+' : ''}{formatUGX(moneyPicture.netOperationalMovement)}
                    </span>
                  </div>
                  <div className={`p-2 rounded-lg ${moneyPicture.netOperationalMovement >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {moneyPicture.netOperationalMovement >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  </div>
                </div>

                {/* In / Out Breakdown */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-100">
                    <span className="text-emerald-800 font-semibold block">Money In</span>
                    <span className="font-bold text-slate-900 text-sm block mt-0.5">
                      {formatUGX(moneyPicture.moneyIn.totalCollected)}
                    </span>
                    <span className="text-slate-500 text-[11px] block mt-0.5">
                      {moneyPicture.collectionRatePercentage}% collection rate
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-100">
                    <span className="text-rose-800 font-semibold block">Money Out</span>
                    <span className="font-bold text-slate-900 text-sm block mt-0.5">
                      {formatUGX(moneyPicture.moneyOut.totalExpenditure)}
                    </span>
                    <span className="text-slate-500 text-[11px] block mt-0.5">
                      Payroll & operations
                    </span>
                  </div>
                </div>

                {/* Sub-breakdown rows */}
                <div className="text-xs text-slate-600 space-y-1.5 pt-1 border-t border-slate-100 font-sans">
                  <div className="flex justify-between">
                    <span>Staff Payroll Disbursed</span>
                    <span className="font-medium text-slate-900">{formatUGX(moneyPicture.moneyOut.staffPayroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Operating Expenses (Lunch/Bills)</span>
                    <span className="font-medium text-slate-900">{formatUGX(moneyPicture.moneyOut.schoolOperations)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Outstanding Student Arrears</span>
                    <span className="font-medium text-rose-600">{formatUGX(moneyPicture.outstandingStudentCharges)}</span>
                  </div>
                </div>

                {/* Quick Navigation Links */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                  <button
                    onClick={() => navigate('/fees')}
                    className="text-brand-teal font-semibold hover:underline flex items-center gap-0.5"
                  >
                    <span>Fees Ledger</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => navigate('/expenses')}
                    className="text-brand-teal font-semibold hover:underline flex items-center gap-0.5"
                  >
                    <span>Expenses</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => navigate('/payroll')}
                    className="text-brand-teal font-semibold hover:underline flex items-center gap-0.5"
                  >
                    <span>Payroll</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Operational Alerts</span>
              </CardTitle>
              <CardDescription>Exceptions requiring administrative action</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {data.alerts.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">No alerts. All clear.</p>
              ) : (
              data.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 transition-colors text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{alert.title}</span>
                    <StatusPill
                      status={alert.type}
                      label={alert.type}
                      size="sm"
                    />
                  </div>
                  <p className="text-slate-500 leading-normal">{alert.description}</p>
                  {alert.actionRoute && (
                    <button
                      onClick={() => navigate(alert.actionRoute!)}
                      className="text-brand-teal font-semibold flex items-center gap-1 hover:underline pt-1"
                    >
                      <span>Resolve in module</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
