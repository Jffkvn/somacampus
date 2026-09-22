/**
 * P2D-4 moderation queue — mandatory before free peer is trusted.
 * Teachers hide replies and action reports (safeguarding).
 */
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { moderationService } from './moderationService';
import type { ModerationReport } from './moderationDomain';

export interface ModerationQueuePanelProps {
  schoolId: string;
  decidedByPersonId?: string | null;
}

export const ModerationQueuePanel: React.FC<ModerationQueuePanelProps> = ({
  schoolId,
  decidedByPersonId,
}) => {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setReports(await moderationService.listOpenReports(schoolId));
    } catch (err: any) {
      setError(err?.message ?? 'Could not load moderation queue');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const action = async (report: ModerationReport) => {
    if (!report.replyId || !decidedByPersonId) return;
    setBusyId(report.id);
    try {
      await moderationService.hideReplyAndActionReport({
        replyId: report.replyId,
        reportId: report.id,
        hiddenReason: `Actioned from report: ${report.reason}`,
        decidedBy: decidedByPersonId,
      });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not action report');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" /> Moderation queue
            </span>
          </CardTitle>
          <CardDescription>
            Safeguarding first — free peer is only trusted with an open moderation queue.
          </CardDescription>
        </div>
        <StatusPill status={reports.length ? 'warning' : 'success'} label={`${reports.length} open`} />
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {reports.length === 0 ? (
          <p className="text-sm text-slate-400">No open reports.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reports.map((r) => (
              <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {r.replyId ? 'Reply report' : 'Post report'}
                  </p>
                  <p className="text-xs text-slate-500">{r.reason}</p>
                </div>
                {r.replyId && decidedByPersonId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={() => void action(r)}
                  >
                    Hide reply
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400">Needs moderator</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
