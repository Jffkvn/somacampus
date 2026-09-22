import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { Inbox, AlertTriangle, Camera, Users } from 'lucide-react';
import type { TeacherLearningCockpit } from './learningCockpitDomain';

const STATE_PILL: Record<string, StatusVariant> = {
  submitted: 'info',
  late: 'warning',
  resubmitted: 'info',
  revision_requested: 'pending',
};

/**
 * M6 Teacher learning cockpit panels: marking queue + deterministic at-risk.
 * OnlineDay / SessionCockpit remain the live-session surfaces (charter P0 #8).
 */
export const TeacherMarkingCockpitPanels: React.FC<{ cockpit: TeacherLearningCockpit }> = ({ cockpit }) => {
  const { markingQueue, atRisk, stats } = cockpit;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'To mark', value: stats.toMark, icon: Inbox },
          { label: 'Overdue / missing', value: stats.overdueMissing, icon: AlertTriangle },
          { label: 'At-risk students', value: stats.atRiskStudents, icon: Users },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 flex items-center gap-3">
            <k.icon className="w-4 h-4 text-brand-teal shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{k.label}</p>
              <p className="text-lg font-bold text-slate-900">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Marking queue */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Inbox className="w-4 h-4 text-brand-teal" /> Marking queue
              </span>
            </CardTitle>
            <CardDescription>
              Photo submissions waiting for a human mark. Scores are never written by AI.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {markingQueue.length === 0 ? (
            <p className="text-sm text-slate-400">Queue is clear. OnlineDay and SessionCockpit stay open for live sessions.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {markingQueue.map((m) => (
                <li key={m.submissionId} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {m.studentName ?? m.studentId} · {m.title}
                    </p>
                    <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5" />
                        {m.photoCount} photo{m.photoCount === 1 ? '' : 's'}
                      </span>
                      <span>Attempt {m.attempt}</span>
                      {m.submittedAt && <span>Submitted {String(m.submittedAt).slice(0, 10)}</span>}
                      <span>Waiting {m.waitedDays}d</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={STATE_PILL[m.state] ?? 'info'} label={m.state.replace(/_/g, ' ')} />
                    {m.assignmentId && (
                      <Link
                        to={`/teaching/assignments/${m.assignmentId}`}
                        className="text-xs font-semibold text-brand-teal hover:underline"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* At-risk foundation (deterministic) */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> At-risk foundation
              </span>
            </CardTitle>
            <CardDescription>
              Deterministic counts only — overdue, missing, and late work. No predictive scoring.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {atRisk.length === 0 ? (
            <p className="text-sm text-slate-400">No students meet the at-risk thresholds right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {atRisk.map((s) => (
                <li key={s.studentId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{s.studentName ?? s.studentId}</p>
                      <p className="text-xs text-slate-500">{s.riskReasons.join(' · ')}</p>
                    </div>
                    <p className="text-xs text-slate-400 shrink-0">
                      {s.overdueCount} overdue · {s.missingCount} missing · {s.lateCount} late · {s.unmarkedCount} unmarked
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
