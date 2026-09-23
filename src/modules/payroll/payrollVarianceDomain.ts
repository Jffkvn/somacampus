/**
 * AI-1 payroll variance compare (pure, deterministic rules).
 * egypro pattern: scan + compare last two months vs current BEFORE approval.
 * AI (AI-2) only narrates these flags. Never posts payroll.
 */

export interface PayrollLine {
  employeeId: string;
  employeeName?: string | null;
  grossSalary: number;
  overtimeHours: number;
  overtimeAmount: number;
  allowances: number;
  otherDeductions: number;
  netPay: number;
  pctMonthWorked: number;
}

export interface PayrollRunSnapshot {
  runId: string;
  label: string; // e.g. 2026-08
  lines: PayrollLine[];
}

export type VarianceFlagCode =
  | 'new_joiner'
  | 'left_payroll'
  | 'gross_jump'
  | 'gross_drop'
  | 'overtime_spike'
  | 'allowance_add'
  | 'allowance_drop'
  | 'deduction_spike'
  | 'part_month';

export interface VarianceFlag {
  code: VarianceFlagCode;
  employeeId: string;
  employeeName: string | null;
  detail: string;
  current: number | null;
  baseline: number | null;
  pctChange: number | null;
}

export interface EmployeeVariance {
  employeeId: string;
  employeeName: string | null;
  flags: VarianceFlag[];
  gross: { current: number | null; prev: number | null; prev2: number | null };
  net: { current: number | null; prev: number | null; prev2: number | null };
}

export interface VarianceReport {
  currentLabel: string;
  baselineLabels: string[];
  rows: EmployeeVariance[];
  totals: { flaggedEmployees: number; flagCount: number };
}

export interface VarianceThresholds {
  /** |pct| change in gross vs baseline that flags (default 20). */
  grossPct: number;
  /** overtime amount increase that flags (default 100% or absolute). */
  overtimePct: number;
  overtimeAbs: number;
  allowanceAbs: number;
  deductionAbs: number;
}

export const DEFAULT_THRESHOLDS: VarianceThresholds = {
  grossPct: 20,
  overtimePct: 100,
  overtimeAbs: 50_000,
  allowanceAbs: 25_000,
  deductionAbs: 25_000,
};

function pctChange(current: number, baseline: number): number | null {
  if (baseline === 0) return current === 0 ? 0 : null;
  return ((current - baseline) / baseline) * 100;
}

function byEmployee(run: PayrollRunSnapshot | null | undefined): Map<string, PayrollLine> {
  const m = new Map<string, PayrollLine>();
  for (const l of run?.lines ?? []) m.set(l.employeeId, l);
  return m;
}

/**
 * Compare current run vs last two months (e.gypro-style pre-approval scan).
 * Deterministic — no LLM. Every flag names the employee and the numbers.
 */
export function comparePayrollRuns(
  current: PayrollRunSnapshot,
  prev: PayrollRunSnapshot | null,
  prev2: PayrollRunSnapshot | null,
  thresholds: VarianceThresholds = DEFAULT_THRESHOLDS,
): VarianceReport {
  const base = byEmployee(prev);
  const older = byEmployee(prev2);
  const rows: EmployeeVariance[] = [];
  let flagCount = 0;

  const push = (line: PayrollLine, flag: VarianceFlag) => {
    let row = rows.find((r) => r.employeeId === line.employeeId);
    if (!row) {
      const p = base.get(line.employeeId);
      const p2 = older.get(line.employeeId);
      row = {
        employeeId: line.employeeId,
        employeeName: line.employeeName ?? p?.employeeName ?? null,
        flags: [],
        gross: { current: line.grossSalary, prev: p?.grossSalary ?? null, prev2: p2?.grossSalary ?? null },
        net: { current: line.netPay, prev: p?.netPay ?? null, prev2: p2?.netPay ?? null },
      };
      rows.push(row);
    }
    row.flags.push(flag);
    flagCount += 1;
  };

  for (const line of current.lines) {
    const p = base.get(line.employeeId);
    const p2 = older.get(line.employeeId);

    if (!p && !p2) {
      push(line, {
        code: 'new_joiner',
        employeeId: line.employeeId,
        employeeName: line.employeeName ?? null,
        detail: 'New on payroll vs last 2 months',
        current: line.grossSalary,
        baseline: null,
        pctChange: null,
      });
      continue;
    }

    const baseGross = p?.grossSalary ?? p2?.grossSalary ?? 0;
    const gPct = pctChange(line.grossSalary, baseGross);
    if (gPct != null && Math.abs(gPct) >= thresholds.grossPct) {
      push(line, {
        code: gPct > 0 ? 'gross_jump' : 'gross_drop',
        employeeId: line.employeeId,
        employeeName: line.employeeName ?? null,
        detail: `Gross ${gPct > 0 ? '+' : ''}${gPct.toFixed(1)}% vs ${prev ? prev.label : 'baseline'}`,
        current: line.grossSalary,
        baseline: baseGross,
        pctChange: gPct,
      });
    }

    const baseOt = p?.overtimeAmount ?? p2?.overtimeAmount ?? 0;
    const otDelta = line.overtimeAmount - baseOt;
    const otPct = pctChange(line.overtimeAmount, baseOt);
    if (otDelta >= thresholds.overtimeAbs || (otPct != null && otPct >= thresholds.overtimePct && otDelta > 0)) {
      push(line, {
        code: 'overtime_spike',
        employeeId: line.employeeId,
        employeeName: line.employeeName ?? null,
        detail: `Overtime ${baseOt} → ${line.overtimeAmount}`,
        current: line.overtimeAmount,
        baseline: baseOt,
        pctChange: otPct,
      });
    }

    const alDelta = line.allowances - (p?.allowances ?? 0);
    if (Math.abs(alDelta) >= thresholds.allowanceAbs) {
      push(line, {
        code: alDelta > 0 ? 'allowance_add' : 'allowance_drop',
        employeeId: line.employeeId,
        employeeName: line.employeeName ?? null,
        detail: `Allowances ${p?.allowances ?? 0} → ${line.allowances}`,
        current: line.allowances,
        baseline: p?.allowances ?? null,
        pctChange: pctChange(line.allowances, p?.allowances ?? 0),
      });
    }

    const dDelta = line.otherDeductions - (p?.otherDeductions ?? 0);
    if (dDelta >= thresholds.deductionAbs) {
      push(line, {
        code: 'deduction_spike',
        employeeId: line.employeeId,
        employeeName: line.employeeName ?? null,
        detail: `Other deductions ${p?.otherDeductions ?? 0} → ${line.otherDeductions}`,
        current: line.otherDeductions,
        baseline: p?.otherDeductions ?? null,
        pctChange: pctChange(line.otherDeductions, p?.otherDeductions ?? 0),
      });
    }

    if (line.pctMonthWorked < 100) {
      push(line, {
        code: 'part_month',
        employeeId: line.employeeId,
        employeeName: line.employeeName ?? null,
        detail: `Only ${line.pctMonthWorked}% of month worked`,
        current: line.pctMonthWorked,
        baseline: 100,
        pctChange: null,
      });
    }
  }

  // Staff on last month but missing this run
  for (const [id, p] of base) {
    if (!current.lines.some((l) => l.employeeId === id)) {
      push(
        { ...p, grossSalary: 0 },
        {
          code: 'left_payroll',
          employeeId: id,
          employeeName: p.employeeName ?? null,
          detail: 'On last month’s run, missing this month',
          current: 0,
          baseline: p.grossSalary,
          pctChange: -100,
        },
      );
    }
  }

  rows.sort((a, b) => b.flags.length - a.flags.length);
  return {
    currentLabel: current.label,
    baselineLabels: [prev?.label, prev2?.label].filter(Boolean) as string[],
    rows,
    totals: {
      flaggedEmployees: rows.filter((r) => r.flags.length > 0).length,
      flagCount,
    },
  };
}

/** Short rule-generated brief (AI-2 may paraphrase later — never invent numbers). */
export function summarizeVariance(report: VarianceReport): string {
  const counts = new Map<VarianceFlagCode, number>();
  for (const row of report.rows) {
    for (const f of row.flags) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([k, n]) => `${n}× ${k.replace(/_/g, ' ')}`);
  return `${report.totals.flaggedEmployees} payslip(s) flagged vs ${report.baselineLabels.join(' + ') || '—'}: ${
    parts.join(', ') || 'none'
  }.`;
}
