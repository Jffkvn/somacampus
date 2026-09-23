/**
 * Bursar pre-approval variance panel (AI-1, rules only).
 * Flags vs last two months BEFORE approve. AI never posts payroll.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { payrollVarianceService } from './payrollVarianceService';
import { summarizeVariance, type VarianceReport } from './payrollVarianceDomain';

export interface PayrollVariancePanelProps {
  schoolId: string;
  runId: string;
}

export const PayrollVariancePanel: React.FC<PayrollVariancePanelProps> = ({ schoolId, runId }) => {
  const [report, setReport] = useState<VarianceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        setReport(await payrollVarianceService.varianceForRun(schoolId, runId));
      } catch (err: any) {
        setError(err?.message ?? 'Could not run payroll variance compare');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [schoolId, runId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-slate-400">Scanning last two months…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" /> Variance vs last two months
            </span>
          </CardTitle>
          <CardDescription>
            Deterministic compare before approval (rules, not AI). Bursar still signs off.
          </CardDescription>
        </div>
        <StatusPill
          status={report && report.totals.flagCount > 0 ? 'warning' : 'success'}
          label={report ? `${report.totals.flagCount} flags` : 'n/a'}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {report && (
          <>
            <p className="text-sm text-slate-600">{summarizeVariance(report)}</p>
            {report.rows.filter((r) => r.flags.length > 0).length === 0 ? (
              <p className="text-sm text-slate-400">No anomalies vs the previous two runs.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {report.rows
                  .filter((r) => r.flags.length > 0)
                  .map((row) => (
                    <li key={row.employeeId} className="py-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {row.employeeName ?? row.employeeId}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {row.flags.map((f, i) => (
                          <li key={`${f.code}-${i}`} className="text-xs text-slate-500">
                            <span className="font-semibold text-amber-700">{f.code.replace(/_/g, ' ')}</span>
                            {' — '}
                            {f.detail}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
