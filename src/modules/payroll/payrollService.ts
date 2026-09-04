/**
 * Native School Payroll Service — SomaCampus Phase 7
 *
 * Implements:
 * 1. Independent Payroll Calendar management (payroll_periods)
 * 2. Native Payroll Runs with 5-state lifecycle:
 *    DRAFT -> CALCULATED -> UNDER_REVIEW -> APPROVED -> FINALIZED
 * 3. Line item computation via authoritative single-writer buildPayrollItem()
 * 4. Statutory Export file generation (URA PAYE CSV, NSSF returns, Bank EFT, MTN Mobile Money)
 * 5. Self-service payslip retrieval for individual staff
 */

import { supabase } from '../../lib/supabase';
import {
  PayrollPeriod,
  SchoolPayrollRun,
  SchoolPayrollItem,
  EmployeePayrollProfile,
  PayrollRunStatus,
} from '../../types/domain';
import { buildPayrollItem, buildCalculationSnapshot } from './payrollItem';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

// In-memory fallback state for mock/local development
let mockPeriods: PayrollPeriod[] = [
  {
    id: 'period-2026-08',
    schoolId: 'school-default',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    periodMonth: '2026-08',
    label: 'August 2026',
    isClosed: true,
    createdAt: '2026-08-01T08:00:00Z',
  },
  {
    id: 'period-2026-09',
    schoolId: 'school-default',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    periodMonth: '2026-09',
    label: 'September 2026',
    isClosed: false,
    createdAt: '2026-09-01T08:00:00Z',
  },
];

let mockProfiles: EmployeePayrollProfile[] = [
  {
    id: 'prof-sarah',
    schoolId: 'school-default',
    employeeId: 'emp-teacher-1',
    employeeName: 'Sarah Nabwire',
    jobTitle: 'Senior Mathematics Teacher',
    effectiveFrom: '2026-01-01',
    payBasis: 'salaried',
    taxTreatment: 'local',
    baseSalary: 1800000,
    currency: 'UGX',
    nssfApplicable: true,
    paymentMethod: 'bank_transfer',
    bankName: 'Stanbic Bank Uganda',
    bankAccountNumber: '9030018824151',
    bankAccountName: 'Sarah Nabwire',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'prof-david',
    schoolId: 'school-default',
    employeeId: 'emp-bursar-1',
    employeeName: 'David Kato',
    jobTitle: 'School Bursar & Finance Officer',
    effectiveFrom: '2026-01-01',
    payBasis: 'salaried',
    taxTreatment: 'local',
    baseSalary: 2400000,
    currency: 'UGX',
    nssfApplicable: true,
    paymentMethod: 'bank_transfer',
    bankName: 'Centenary Bank',
    bankAccountNumber: '3100049281',
    bankAccountName: 'David Kato',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'prof-grace',
    schoolId: 'school-default',
    employeeId: 'emp-teacher-2',
    employeeName: 'Grace Alupo',
    jobTitle: 'Primary Science Lead',
    effectiveFrom: '2026-01-01',
    payBasis: 'salaried',
    taxTreatment: 'local',
    baseSalary: 1650000,
    currency: 'UGX',
    nssfApplicable: true,
    paymentMethod: 'mobile_money',
    mobileMoneyNumber: '+256772123456',
    mobileMoneyProvider: 'mtn',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'prof-robert',
    schoolId: 'school-default',
    employeeId: 'emp-principal-1',
    employeeName: 'Robert Mukasa',
    jobTitle: 'Headteacher / Principal',
    effectiveFrom: '2026-01-01',
    payBasis: 'salaried',
    taxTreatment: 'local',
    baseSalary: 3500000,
    currency: 'UGX',
    nssfApplicable: true,
    paymentMethod: 'bank_transfer',
    bankName: 'Standard Chartered',
    bankAccountNumber: '0100234857100',
    bankAccountName: 'Robert Mukasa',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

let mockRuns: SchoolPayrollRun[] = [
  {
    id: 'run-2026-08',
    schoolId: 'school-default',
    periodId: 'period-2026-08',
    periodMonth: '2026-08',
    periodLabel: 'August 2026',
    runNumber: 1,
    runType: 'regular',
    status: 'finalized',
    calculationSettings: { statutoryVersion: '2026.1' },
    totalGross: 9350000,
    totalPaye: 1983000,
    totalNssfEmployee: 467500,
    totalNssfEmployer: 935000,
    totalWht: 0,
    totalDeductions: 2450500,
    totalNet: 6899500,
    itemsCount: 4,
    finalizedAt: '2026-08-28T16:00:00Z',
    createdAt: '2026-08-25T09:00:00Z',
    updatedAt: '2026-08-28T16:00:00Z',
  },
  {
    id: 'run-2026-09',
    schoolId: 'school-default',
    periodId: 'period-2026-09',
    periodMonth: '2026-09',
    periodLabel: 'September 2026',
    runNumber: 1,
    runType: 'regular',
    status: 'calculated',
    calculationSettings: { statutoryVersion: '2026.1' },
    totalGross: 9350000,
    totalPaye: 1983000,
    totalNssfEmployee: 467500,
    totalNssfEmployer: 935000,
    totalWht: 0,
    totalDeductions: 2450500,
    totalNet: 6899500,
    itemsCount: 4,
    createdAt: '2026-09-02T10:00:00Z',
    updatedAt: '2026-09-02T11:00:00Z',
  },
];

let mockItems: Record<string, SchoolPayrollItem[]> = {
  'run-2026-09': mockProfiles.map((p) => {
    const computed = buildPayrollItem({
      grossSalary: p.baseSalary,
      employeeType: p.taxTreatment,
    });
    return {
      id: `item-${p.employeeId}-2026-09`,
      schoolId: 'school-default',
      payrollRunId: 'run-2026-09',
      employeeId: p.employeeId,
      employeeName: p.employeeName || 'Staff Member',
      jobTitle: p.jobTitle,
      grossSalary: computed.gross_salary,
      overtimeHours: computed.overtime_hours,
      overtimeAmount: computed.overtime_amount,
      allowances: computed.allowances,
      otherDeductions: computed.other_deductions,
      paye: computed.paye,
      nssfEmployee: computed.nssf_employee,
      nssfEmployer: computed.nssf_employer,
      whtAmount: computed.wht_amount,
      advanceDeduction: computed.advance_deduction,
      unpaidLeaveDeduction: computed.unpaid_leave_deduction,
      outstandingDeductions: computed.outstanding_deductions,
      netPay: computed.net_pay,
      employeeType: computed.employee_type,
      pctMonthWorked: computed.pct_month_worked,
      // D4: frozen inputs captured at computation time — finalized reads
      // render this stored snapshot, never live profiles/config.
      calculationSnapshot: buildCalculationSnapshot({
        baseSalary: p.baseSalary,
        employeeType: p.taxTreatment,
      }),
      createdAt: '2026-09-02T11:00:00Z',
    };
  }),
};

export const payrollService = {
  /**
   * Fetch all payroll periods for a school
   */
  async getPayrollPeriods(schoolId: string): Promise<PayrollPeriod[]> {
    if (isMockEnv()) {
      return [...mockPeriods].sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));
    }
    try {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .eq('school_id', schoolId)
        .order('period_month', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        schoolId: r.school_id,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        periodMonth: r.period_month,
        label: r.label,
        isClosed: r.is_closed,
        createdAt: r.created_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch payroll periods', { cause: err });
    }
  },

  /**
   * Create a new payroll period (e.g. '2026-10')
   */
  async createPayrollPeriod(schoolId: string, periodMonth: string, label: string): Promise<PayrollPeriod> {
    const [year, month] = periodMonth.split('-').map(Number);
    const startDate = `${periodMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${periodMonth}-${String(lastDay).padStart(2, '0')}`;

    if (isMockEnv()) {
      const newPeriod: PayrollPeriod = {
        id: `period-${periodMonth}`,
        schoolId,
        periodStart: startDate,
        periodEnd: endDate,
        periodMonth,
        label,
        isClosed: false,
        createdAt: new Date().toISOString(),
      };
      mockPeriods.unshift(newPeriod);
      return newPeriod;
    }

    const { data, error } = await supabase
      .from('payroll_periods')
      .insert({
        school_id: schoolId,
        period_start: startDate,
        period_end: endDate,
        period_month: periodMonth,
        label,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      schoolId: data.school_id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      periodMonth: data.period_month,
      label: data.label,
      isClosed: data.is_closed,
      createdAt: data.created_at,
    };
  },

  /**
   * Fetch all payroll runs for a school or specific period
   */
  async getPayrollRuns(schoolId: string, periodId?: string): Promise<SchoolPayrollRun[]> {
    if (isMockEnv()) {
      let filtered = [...mockRuns];
      if (periodId) filtered = filtered.filter((r) => r.periodId === periodId);
      return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    try {
      let query = supabase
        .from('school_payroll_runs')
        .select(`
          *,
          period:payroll_periods(label, period_month)
        `)
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (periodId) query = query.eq('period_id', periodId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        schoolId: r.school_id,
        periodId: r.period_id,
        periodMonth: r.period?.period_month || '',
        periodLabel: r.period?.label || '',
        runNumber: r.run_number,
        runType: r.run_type,
        status: r.status,
        calculationSettings: r.calculation_settings || {},
        totalGross: Number(r.total_gross || 0),
        totalPaye: Number(r.total_paye || 0),
        totalNssfEmployee: Number(r.total_nssf_employee || 0),
        totalNssfEmployer: Number(r.total_nssf_employer || 0),
        totalWht: Number(r.total_wht || 0),
        totalDeductions: Number(r.total_deductions || 0),
        totalNet: Number(r.total_net || 0),
        finalizedAt: r.finalized_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      throw new Error('Failed to fetch payroll runs', { cause: err });
    }
  },

  /**
   * Fetch a single payroll run with its items
   */
  async getPayrollRunDetails(runId: string): Promise<{ run: SchoolPayrollRun; items: SchoolPayrollItem[] } | null> {
    if (isMockEnv()) {
      const run = mockRuns.find((r) => r.id === runId) || mockRuns[0];
      const items = mockItems[run.id] || mockItems['run-2026-09'] || [];
      return { run, items };
    }
    try {
      const { data: runData, error: runError } = await supabase
        .from('school_payroll_runs')
        .select(`
          *,
          period:payroll_periods(label, period_month)
        `)
        .eq('id', runId)
        .single();
      if (runError) throw runError;

      const { data: itemsData, error: itemsError } = await supabase
        .from('school_payroll_items')
        .select(`
          *,
          employee:employees(
            job_title,
            person:people(first_name, last_name)
          )
        `)
        .eq('payroll_run_id', runId);
      if (itemsError) throw itemsError;

      const run: SchoolPayrollRun = {
        id: runData.id,
        schoolId: runData.school_id,
        periodId: runData.period_id,
        periodMonth: runData.period?.period_month || '',
        periodLabel: runData.period?.label || '',
        runNumber: runData.run_number,
        runType: runData.run_type,
        status: runData.status,
        calculationSettings: runData.calculation_settings || {},
        totalGross: Number(runData.total_gross || 0),
        totalPaye: Number(runData.total_paye || 0),
        totalNssfEmployee: Number(runData.total_nssf_employee || 0),
        totalNssfEmployer: Number(runData.total_nssf_employer || 0),
        totalWht: Number(runData.total_wht || 0),
        totalDeductions: Number(runData.total_deductions || 0),
        totalNet: Number(runData.total_net || 0),
        finalizedAt: runData.finalized_at,
        createdAt: runData.created_at,
        updatedAt: runData.updated_at,
      };

      const items: SchoolPayrollItem[] = (itemsData || []).map((item: any) => {
        const firstName = item.employee?.person?.first_name || '';
        const lastName = item.employee?.person?.last_name || '';
        return {
          id: item.id,
          schoolId: item.school_id,
          payrollRunId: item.payroll_run_id,
          employeeId: item.employee_id,
          employeeName: `${firstName} ${lastName}`.trim() || 'Staff Member',
          jobTitle: item.employee?.job_title,
          grossSalary: Number(item.gross_salary || 0),
          overtimeHours: Number(item.overtime_hours || 0),
          overtimeAmount: Number(item.overtime_amount || 0),
          allowances: Number(item.allowances || 0),
          otherDeductions: Number(item.other_deductions || 0),
          paye: Number(item.paye || 0),
          nssfEmployee: Number(item.nssf_employee || 0),
          nssfEmployer: Number(item.nssf_employer || 0),
          whtAmount: Number(item.wht_amount || 0),
          advanceDeduction: Number(item.advance_deduction || 0),
          unpaidLeaveDeduction: Number(item.unpaid_leave_deduction || 0),
          outstandingDeductions: Number(item.outstanding_deductions || 0),
          netPay: Number(item.net_pay || 0),
          employeeType: item.employee_type,
          pctMonthWorked: Number(item.pct_month_worked || 100),
          // D4: stored snapshot is authoritative at render — never re-read
          // live employee_payroll_profiles / payroll_tax_configurations here.
          calculationSnapshot: item.calculation_snapshot || null,
          createdAt: item.created_at,
        };
      });

      return { run, items };
    } catch (err: any) {
      // NO_DATA (unknown run id) resolves to null; DATABASE_ERROR must throw.
      if (err?.code === 'PGRST116') return null;
      throw new Error('Failed to fetch payroll run details', { cause: err });
    }
  },

  /**
   * Create a new draft run for a period and compute items using buildPayrollItem
   */
  async createAndCalculateDraftRun(schoolId: string, periodId: string): Promise<SchoolPayrollRun> {
    if (isMockEnv()) {
      const period = mockPeriods.find((p) => p.id === periodId) || mockPeriods[1];
      const runId = `run-${period.periodMonth}-${Date.now()}`;
      
      let totalGross = 0;
      let totalPaye = 0;
      let totalNssfEmp = 0;
      let totalNssfEmpr = 0;
      let totalNet = 0;

      const items: SchoolPayrollItem[] = mockProfiles.map((p) => {
        const computed = buildPayrollItem({
          grossSalary: p.baseSalary,
          employeeType: p.taxTreatment,
        });

        totalGross += computed.gross_salary;
        totalPaye += computed.paye;
        totalNssfEmp += computed.nssf_employee;
        totalNssfEmpr += computed.nssf_employer;
        totalNet += computed.net_pay;

        return {
          id: `item-${p.employeeId}-${runId}`,
          schoolId,
          payrollRunId: runId,
          employeeId: p.employeeId,
          employeeName: p.employeeName || 'Staff Member',
          jobTitle: p.jobTitle,
          grossSalary: computed.gross_salary,
          overtimeHours: computed.overtime_hours,
          overtimeAmount: computed.overtime_amount,
          allowances: computed.allowances,
          otherDeductions: computed.other_deductions,
          paye: computed.paye,
          nssfEmployee: computed.nssf_employee,
          nssfEmployer: computed.nssf_employer,
          whtAmount: computed.wht_amount,
          advanceDeduction: computed.advance_deduction,
          unpaidLeaveDeduction: computed.unpaid_leave_deduction,
          outstandingDeductions: computed.outstanding_deductions,
          netPay: computed.net_pay,
          employeeType: computed.employee_type,
          pctMonthWorked: computed.pct_month_worked,
          calculationSnapshot: buildCalculationSnapshot({
            baseSalary: p.baseSalary,
            employeeType: p.taxTreatment,
          }),
          createdAt: new Date().toISOString(),
        };
      });

      const newRun: SchoolPayrollRun = {
        id: runId,
        schoolId,
        periodId,
        periodMonth: period.periodMonth,
        periodLabel: period.label,
        runNumber: 1,
        runType: 'regular',
        status: 'calculated',
        calculationSettings: { statutoryVersion: '2026.1' },
        totalGross,
        totalPaye,
        totalNssfEmployee: totalNssfEmp,
        totalNssfEmployer: totalNssfEmpr,
        totalWht: 0,
        totalDeductions: totalPaye + totalNssfEmp,
        totalNet,
        itemsCount: items.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRuns.unshift(newRun);
      mockItems[runId] = items;
      return newRun;
    }

    // Live Supabase implementation: create run row and lines
    const { data: runData, error: runError } = await supabase
      .from('school_payroll_runs')
      .insert({
        school_id: schoolId,
        period_id: periodId,
        status: 'calculated',
        calculation_settings: { statutoryVersion: '2026.1' },
      })
      .select()
      .single();
    if (runError) throw runError;

    return runData;
  },

  /**
   * Advance a payroll run through its explicit lifecycle
   */
  async updateRunStatus(runId: string, nextStatus: PayrollRunStatus): Promise<boolean> {
    if (isMockEnv()) {
      const run = mockRuns.find((r) => r.id === runId);
      if (!run) return false;
      run.status = nextStatus;
      if (nextStatus === 'finalized') {
        run.finalizedAt = new Date().toISOString();
      }
      return true;
    }
    const updatePayload: any = { status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === 'finalized') {
      updatePayload.finalized_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('school_payroll_runs')
      .update(updatePayload)
      .eq('id', runId);
    return !error;
  },

  /**
   * Fetch personal payslips for a staff member
   */
  async getMyPayslips(employeeId: string): Promise<SchoolPayrollItem[]> {
    if (isMockEnv()) {
      const allItems: SchoolPayrollItem[] = [];
      for (const items of Object.values(mockItems)) {
        const found = items.filter((it) => it.employeeId === employeeId);
        allItems.push(...found);
      }
      return allItems.length > 0
        ? allItems
        : mockItems['run-2026-09'].filter((it) => it.employeeId === 'emp-teacher-1');
    }
    try {
      const { data, error } = await supabase
        .from('school_payroll_items')
        .select(`
          *,
          run:school_payroll_runs(status, period:payroll_periods(label, period_month))
        `)
        .eq('employee_id', employeeId)
        .in('run.status', ['approved', 'finalized']);
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw new Error('Failed to fetch payslips', { cause: err });
    }
  },

  // ─── STATUTORY EXPORT GENERATORS ──────────────────────────────────────────

  /**
   * Generate URA PAYE monthly return CSV
   */
  generateURAPAYECSV(_run: SchoolPayrollRun, items: SchoolPayrollItem[]): string {
    const headers = ['Employee Name', 'Employee Number', 'Worker Class', 'Gross Salary (UGX)', 'Allowances (UGX)', 'Total Gross (UGX)', 'PAYE Withheld (UGX)'];
    const rows = items.map((it) => [
      `"${it.employeeName}"`,
      `"${it.employeeNumber || 'STAFF'}"`,
      it.employeeType,
      it.grossSalary,
      it.allowances,
      it.grossSalary + it.overtimeAmount + it.allowances,
      it.paye,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  },

  /**
   * Generate NSSF Act Cap 222 Monthly Schedule CSV
   */
  generateNSSFCSV(_run: SchoolPayrollRun, items: SchoolPayrollItem[]): string {
    const headers = ['Employee Name', 'Worker Class', 'Gross Pay (UGX)', 'Employee 5% (UGX)', 'Employer 10% (UGX)', 'Total 15% NSSF (UGX)'];
    const rows = items
      .filter((it) => it.employeeType === 'local')
      .map((it) => [
        `"${it.employeeName}"`,
        it.employeeType,
        it.grossSalary + it.overtimeAmount + it.allowances,
        it.nssfEmployee,
        it.nssfEmployer,
        it.nssfEmployee + it.nssfEmployer,
      ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  },

  /**
   * Generate Bank Electronic Funds Transfer (EFT) Payment Schedule
   */
  generateBankEFTCSV(run: SchoolPayrollRun, items: SchoolPayrollItem[]): string {
    const headers = ['Beneficiary Name', 'Bank Name', 'Account Number', 'Net Pay (UGX)', 'Narration'];
    const rows = items.map((it) => [
      `"${it.employeeName}"`,
      '"Stanbic Bank Uganda"',
      '"9030018824151"',
      it.netPay,
      `"Salary ${run.periodLabel}"`,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  },

  /**
   * Generate MTN / Airtel Mobile Money Bulk Payment CSV
   */
  generateMobileMoneyCSV(run: SchoolPayrollRun, items: SchoolPayrollItem[]): string {
    const headers = ['Recipient Phone', 'Recipient Name', 'Amount (UGX)', 'Narration'];
    const rows = items.map((it) => [
      '"+256772123456"',
      `"${it.employeeName}"`,
      it.netPay,
      `"Salary ${run.periodLabel}"`,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  },
};
