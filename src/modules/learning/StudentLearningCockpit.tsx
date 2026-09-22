import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import {
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  MessageSquareText,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import type { CockpitWorkItem, StudentLearningCockpit } from './learningCockpitDomain';

const STATE_PILL: Record<string, StatusVariant> = {
  reviewed: 'success',
  submitted: 'info',
  resubmitted: 'info',
  late: 'warning',
  revision_requested: 'pending',
  missing: 'critical',
  draft: 'neutral',
  assigned: 'pending',
};

function WorkRow({ item }: { item: CockpitWorkItem }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
        <p className="text-xs text-slate-400">
          {item.activityType ? `${item.activityType} · ` : ''}
          {item.subject ? `${item.subject} · ` : ''}
          {item.dueDate ? `Due ${item.dueDate}` : item.assignedDate ? `Assigned ${item.assignedDate}` : 'No due date'}
          {typeof item.score === 'number' ? ` · ${item.score}${item.maxScore != null ? `/${item.maxScore}` : ''}` : ''}
        </p>
      </div>
      <StatusPill status={STATE_PILL[item.state] ?? 'neutral'} label={item.state.replace(/_/g, ' ')} />
    </li>
  );
}

/**
 * M6 Student Today learning cockpit panels.
 * Today · Learning · Due · Overdue · Feedback · Progress · Next
 * Progress ≠ completion (charter LOCKED #12).
 */
export const StudentLearningCockpitPanels: React.FC<{ cockpit: StudentLearningCockpit }> = ({ cockpit }) => {
  const { progress, next } = cockpit;

  return (
    <div className="space-y-6">
      {/* Progress strip */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-teal" /> Progress
              </span>
            </CardTitle>
            <CardDescription>
              Reviewed work is progress. Submitted work is not finished until a teacher marks it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: progress.total },
              { label: 'Due', value: progress.due },
              { label: 'Overdue', value: progress.overdue },
              { label: 'Submitted', value: progress.submitted },
              { label: 'Reviewed', value: progress.reviewed },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{k.label}</p>
                <p className="text-lg font-bold text-slate-900">{k.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {progress.completionPct}% of your work has teacher feedback ({progress.withFeedback} pieces).
          </p>
        </CardContent>
      </Card>

      {/* Next */}
      {next && (
        <Card className="border-brand-teal/30 bg-teal-50/30">
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-brand-teal" /> Next up
                </span>
              </CardTitle>
              <CardDescription>Start here first.</CardDescription>
            </div>
            <StatusPill status={STATE_PILL[next.state] ?? 'pending'} label={next.state.replace(/_/g, ' ')} />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-slate-900">{next.title}</p>
            <p className="text-sm text-slate-500">
              {next.subject ? `${next.subject} · ` : ''}
              {next.dueDate ? `Due ${next.dueDate}` : next.assignedDate ? `Assigned ${next.assignedDate}` : 'No due date'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-brand-teal" /> Today
                </span>
              </CardTitle>
              <CardDescription>Work due or assigned today.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {cockpit.today.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing due today.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cockpit.today.map((i) => (
                  <WorkRow key={i.id} item={i} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Due */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <BookOpenCheck className="w-4 h-4 text-brand-teal" /> Due soon
                </span>
              </CardTitle>
              <CardDescription>Due in the next 7 days.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {cockpit.due.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing due soon.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cockpit.due.map((i) => (
                  <WorkRow key={i.id} item={i} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Overdue
                </span>
              </CardTitle>
              <CardDescription>Past the due date and not submitted.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {cockpit.overdue.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing overdue. Keep it up.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cockpit.overdue.map((i) => (
                  <WorkRow key={i.id} item={i} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Feedback */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-brand-teal" /> Feedback
                </span>
              </CardTitle>
              <CardDescription>Teacher marks and notes on your work.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {cockpit.feedback.length === 0 ? (
              <p className="text-sm text-slate-400">No teacher feedback yet.</p>
            ) : (
              <ul className="space-y-2">
                {cockpit.feedback.map((f) => (
                  <li key={f.workId} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {f.title}
                      {typeof f.score === 'number' && (
                        <span className="font-normal text-slate-500">
                          {' · '}
                          {f.score}
                          {f.maxScore != null ? `/${f.maxScore}` : ''} marks
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">{f.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full learning list */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand-teal" /> Learning
              </span>
            </CardTitle>
            <CardDescription>All your activities and assignments, soonest due first.</CardDescription>
          </div>
          <span className="text-xs text-slate-400">Progress ≠ completion</span>
        </CardHeader>
        <CardContent className="pt-0">
          {cockpit.learning.length === 0 ? (
            <p className="text-sm text-slate-400">No published learning work yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cockpit.learning.map((i) => (
                <WorkRow key={i.id} item={i} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
