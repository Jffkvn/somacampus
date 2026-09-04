import React, { useState, useEffect } from 'react';
import { payrollService } from './payrollService';
import {
  PayrollPeriod,
  SchoolPayrollRun,
  SchoolPayrollItem,
  PayrollRunStatus,
} from '../../types/domain';
import { formatUGX } from './calculations';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { PayslipDocument } from './PayslipDocument';
import {
  DollarSign,
  Calendar,
  CheckCircle2,
  Lock,
  Download,
  PlusCircle,
  ArrowRight,
  ShieldCheck,
  Eye,
  Building2,
  Smartphone,
} from 'lucide-react';

export const PayrollDashboardPage: React.FC = () => {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('period-2026-09');
  const [activeRun, setActiveRun] = useState<SchoolPayrollRun | null>(null);
  const [items, setItems] = useState<SchoolPayrollItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPayslipItem, setSelectedPayslipItem] = useState<SchoolPayrollItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      const prds = await payrollService.getPayrollPeriods('school-default');
      setPeriods(prds);

      const periodId = selectedPeriodId || prds[0]?.id;
      const allRuns = await payrollService.getPayrollRuns('school-default', periodId);

      if (allRuns.length > 0) {
        const details = await payrollService.getPayrollRunDetails(allRuns[0].id);
        if (details) {
          setActiveRun(details.run);
          setItems(details.items);
        }
      } else {
        setActiveRun(null);
        setItems([]);
      }
    } catch (err) {
      console.error('Failed to load payroll data', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedPeriodId]);

  const handleCreateDraftRun = async () => {
    try {
      setIsProcessing(true);
      await payrollService.createAndCalculateDraftRun('school-default', selectedPeriodId);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to create run');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdvanceStatus = async (nextStatus: PayrollRunStatus) => {
    if (!activeRun) return;
    try {
      setIsProcessing(true);
      const ok = await payrollService.updateRunStatus(activeRun.id, nextStatus);
      if (ok) {
        await loadData();
      } else {
        alert(`Payroll status update to '${nextStatus}' was rejected by the server. The run status was not changed.`);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update run status');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (filename: string, content: string, type = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportURA = () => {
    if (!activeRun) return;
    const csv = payrollService.generateURAPAYECSV(activeRun, items);
    downloadFile(`URA_PAYE_Return_${activeRun.periodMonth}.csv`, csv);
  };

  const handleExportNSSF = () => {
    if (!activeRun) return;
    const csv = payrollService.generateNSSFCSV(activeRun, items);
    downloadFile(`NSSF_Cap222_Schedule_${activeRun.periodMonth}.csv`, csv);
  };

  const handleExportBankEFT = () => {
    if (!activeRun) return;
    const csv = payrollService.generateBankEFTCSV(activeRun, items);
    downloadFile(`Stanbic_Bank_EFT_Transfers_${activeRun.periodMonth}.csv`, csv);
  };

  const handleExportMoMo = () => {
    if (!activeRun) return;
    const csv = payrollService.generateMobileMoneyCSV(activeRun, items);
    downloadFile(`MTN_Mobile_Money_BulkPay_${activeRun.periodMonth}.csv`, csv);
  };

  if (isLoading && !activeRun) {
    return <LoadingState label="Loading Native School Payroll Engine..." />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Native Payroll Engine
            </span>
            <span className="text-xs text-slate-500 font-medium">Independent Employment Calendar</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Staff Payroll & Statutory Remittances
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Uganda Income Tax (Amendment) Act 2026, NSSF Act Cap 222 & Deterministic Single-Writer Composition
          </p>
        </div>

        {/* Period Selector & New Run */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="pl-9 pr-8 py-2 text-sm font-semibold border border-slate-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.periodMonth})
                </option>
              ))}
            </select>
          </div>

          {!activeRun && (
            <Button
              variant="primary"
              leftIcon={<PlusCircle className="w-4 h-4" />}
              onClick={handleCreateDraftRun}
              isLoading={isProcessing}
            >
              Create Payroll Run
            </Button>
          )}
        </div>
      </div>

      {activeRun ? (
        <>
          {/* Active Run Lifecycle Status Banner */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeRun.periodLabel} Regular Run #{activeRun.runNumber}
                  </h2>
                  <span
                    className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
                      activeRun.status === 'finalized'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : activeRun.status === 'approved'
                        ? 'bg-blue-50 text-blue-800 border-blue-300'
                        : activeRun.status === 'under_review'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-slate-100 text-slate-800 border-slate-200'
                    }`}
                  >
                    {activeRun.status.toUpperCase()}
                  </span>
                  {activeRun.status === 'finalized' && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <Lock className="w-3.5 h-3.5 text-slate-400" /> Database Locked (Immutable)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Calculation snapshot frozen under Statutory Rules 2026.1 • {items.length} staff members included
                </p>
              </div>

              {/* State Machine Action Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {activeRun.status === 'calculated' && (
                  <Button
                    variant="secondary"
                    onClick={() => handleAdvanceStatus('under_review')}
                    isLoading={isProcessing}
                  >
                    Submit for Review <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
                {activeRun.status === 'under_review' && (
                  <Button
                    variant="primary"
                    onClick={() => handleAdvanceStatus('approved')}
                    isLoading={isProcessing}
                  >
                    Approve Payroll Run
                  </Button>
                )}
                {activeRun.status === 'approved' && (
                  <Button
                    variant="primary"
                    leftIcon={<Lock className="w-4 h-4" />}
                    onClick={() => handleAdvanceStatus('finalized')}
                    isLoading={isProcessing}
                    className="bg-emerald-700 hover:bg-emerald-800"
                  >
                    Finalize & Lock Run
                  </Button>
                )}
              </div>
            </div>

            {/* 5-State Progress Bar */}
            <div className="grid grid-cols-5 gap-2 pt-2 text-center text-xs font-semibold">
              {['draft', 'calculated', 'under_review', 'approved', 'finalized'].map((st, idx) => {
                const order = ['draft', 'calculated', 'under_review', 'approved', 'finalized'];
                const currentIdx = order.indexOf(activeRun.status);
                const isPassed = currentIdx >= idx;
                const isCurrent = currentIdx === idx;
                return (
                  <div key={st} className="space-y-1.5">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isPassed
                          ? isCurrent
                            ? 'bg-emerald-600'
                            : 'bg-emerald-400'
                          : 'bg-slate-200'
                      }`}
                    />
                    <span
                      className={`capitalize block ${
                        isCurrent
                          ? 'text-emerald-800 font-bold'
                          : isPassed
                          ? 'text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

            {/* 4 Headline Metrics for Active Run */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard
              label="Total Gross Earnings"
              value={formatUGX(activeRun.totalGross)}
              subValue="Base salaries + overtime + allowances"
              icon={DollarSign}
            />
            <StatCard
              label="PAYE Withholding"
              value={formatUGX(activeRun.totalPaye)}
              subValue="Income Tax Act 2026 brackets"
              icon={ShieldCheck}
              iconColor="text-blue-600"
            />
            <StatCard
              label="NSSF 15% Total"
              value={formatUGX(activeRun.totalNssfEmployee + activeRun.totalNssfEmployer)}
              subValue={`Employee: ${formatUGX(activeRun.totalNssfEmployee)} • Employer: ${formatUGX(activeRun.totalNssfEmployer)}`}
              icon={Building2}
              iconColor="text-indigo-600"
            />
            <StatCard
              label="Net Pay Disbursable"
              value={formatUGX(activeRun.totalNet)}
              subValue="Net take-home to employees"
              icon={CheckCircle2}
              iconColor="text-emerald-600"
            />
          </div>

          {/* Statutory Exports & Line Items Table */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Authoritative Payroll Items ({items.length})</CardTitle>
                <CardDescription>
                  Single-writer composer (buildPayrollItem): gross minus statutory and advance deductions equals net pay
                </CardDescription>
              </div>

              {/* Export Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleExportURA}
                >
                  URA PAYE CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleExportNSSF}
                >
                  NSSF Schedule
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Building2 className="w-3.5 h-3.5" />}
                  onClick={handleExportBankEFT}
                >
                  Bank EFT
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Smartphone className="w-3.5 h-3.5" />}
                  onClick={handleExportMoMo}
                >
                  MTN MoMo Bulk
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Worker Class</th>
                      <th className="py-3 px-4 text-right">Gross Salary</th>
                      <th className="py-3 px-4 text-right">PAYE</th>
                      <th className="py-3 px-4 text-right">NSSF (5%)</th>
                      <th className="py-3 px-4 text-right">Advance Recovery</th>
                      <th className="py-3 px-4 text-right">Net Pay</th>
                      <th className="py-3 px-4 text-center">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-900 block">
                            {item.employeeName}
                          </span>
                          <span className="text-xs text-slate-500">
                            {item.jobTitle || 'Staff'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-slate-100 text-slate-700">
                            {item.employeeType}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                          {formatUGX(item.grossSalary)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-rose-700">
                          {formatUGX(item.paye)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-rose-700">
                          {formatUGX(item.nssfEmployee)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-rose-700">
                          {item.advanceDeduction > 0 ? formatUGX(item.advanceDeduction) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-800">
                          {formatUGX(item.netPay)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setSelectedPayslipItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">No Payroll Run for this Period</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Create a draft payroll run to pull active staff salary profiles, pending advance deductions, and calculate statutory PAYE and NSSF.
              </p>
            </div>
            <Button
              variant="primary"
              leftIcon={<PlusCircle className="w-4 h-4" />}
              onClick={handleCreateDraftRun}
              isLoading={isProcessing}
            >
              Generate Draft Run
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Payslip Modal View */}
      {selectedPayslipItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-3xl my-8">
            <PayslipDocument
              item={selectedPayslipItem}
              periodLabel={activeRun?.periodLabel}
              onClose={() => setSelectedPayslipItem(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
