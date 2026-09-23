/**
 * AI-1 payroll variance service — load last 3 runs + rule compare.
 * Deterministic flags only. AI brief (AI-2) is optional narrative later.
 */
import { supabase } from '../../lib/supabase';
import {
  comparePayrollRuns,
  summarizeVariance,
  type PayrollLine,
  type PayrollRunSnapshot,
  type VarianceReport,
} from './payrollVarianceDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

async function loadRunSnapshot(runId: string, label: string): Promise<PayrollRunSnapshot> {
  const { data: items, error } = await supabase
    .from('school_payroll_items')
    .select(
      'employee_id, gross_salary, overtime_hours, overtime_amount, allowances, other_deductions, net_pay, pct_month_worked, employee:employees!school_payroll_items_employee_id_fkey(people(first_name, last_name))',
    )
    .eq('payroll_run_id', runId);
  if (error) throw new Error(`payrollVariance.loadRun: ${error.message}`);
  const lines: PayrollLine[] = ((items ?? []) as any[]).map((r) => {
    const emp = Array.isArray(r.employee) ? r.employee[0] : r.employee;
    const person = emp?.people;
    const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ') || null;
    return {
      employeeId: String(r.employee_id),
      employeeName: name,
      grossSalary: Number(r.gross_salary),
      overtimeHours: Number(r.overtime_hours ?? 0),
      overtimeAmount: Number(r.overtime_amount ?? 0),
      allowances: Number(r.allowances ?? 0),
      otherDeductions: Number(r.other_deductions ?? 0),
      netPay: Number(r.net_pay),
      pctMonthWorked: Number(r.pct_month_worked ?? 100),
    };
  });
  return { runId, label, lines };
}

export const payrollVarianceService = {
  /** Compare current run vs last two months (bursar pre-approval scan). */
  async varianceForRun(schoolId: string, runId: string): Promise<VarianceReport | null> {
    if (isMockEnv()) return null;
    const { data: runs, error } = await supabase
      .from('school_payroll_runs')
      .select('id, run_number, status, period:payroll_periods!school_payroll_runs_period_id_fkey(label, start_date)')
      .eq('school_id', schoolId)
      .neq('status', 'trashed')
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) throw new Error(`payrollVariance.runs: ${error.message}`);
    const ordered = ((runs ?? []) as any[])
      .map((r) => {
        const period = Array.isArray(r.period) ? r.period[0] : r.period;
        return {
          id: String(r.id),
          label: (period?.label as string) ?? String(period?.start_date ?? r.id).slice(0, 7),
          created: r.created_at,
        };
      })
      .sort((a, b) => String(a.created).localeCompare(String(b.created)));

    const currentMeta = ordered.find((r) => r.id === runId);
    if (!currentMeta) return null;
    const idx = ordered.findIndex((r) => r.id === runId);
    const prevMeta = ordered[idx - 1] ?? null;
    const prev2Meta = ordered[idx - 2] ?? null;

    const current = await loadRunSnapshot(currentMeta.id, currentMeta.label);
    const prev = prevMeta ? await loadRunSnapshot(prevMeta.id, prevMeta.label) : null;
    const prev2 = prev2Meta ? await loadRunSnapshot(prev2Meta.id, prev2Meta.label) : null;
    return comparePayrollRuns(current, prev, prev2);
  },

  /** Rule brief (deterministic). AI-2 may paraphrase later. */
  brief(report: VarianceReport): string {
    return summarizeVariance(report);
  },
};
