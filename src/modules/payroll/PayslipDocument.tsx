import React from 'react';
import { SchoolPayrollItem } from '../../types/domain';
import { formatUGX } from './calculations';
import { Printer, CheckCircle2, ShieldCheck } from 'lucide-react';

interface PayslipDocumentProps {
  item: SchoolPayrollItem;
  periodLabel?: string;
  onClose?: () => void;
}

export const PayslipDocument: React.FC<PayslipDocumentProps> = ({
  item,
  periodLabel = 'September 2026',
  onClose,
}) => {
  const totalEarnings = item.grossSalary + item.overtimeAmount + item.allowances;
  const totalDeductions =
    item.paye +
    item.nssfEmployee +
    item.whtAmount +
    item.otherDeductions +
    item.advanceDeduction +
    item.unpaidLeaveDeduction;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white text-slate-900 rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-w-3xl mx-auto my-4">
      {/* Top action bar (hidden on print) */}
      <div className="print:hidden bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Statutory Verified Payslip • {periodLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Payslip Document Body */}
      <div className="p-8 space-y-6 print:p-0">
        {/* Header */}
        <div className="border-b border-slate-200 pb-6 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white font-bold flex items-center justify-center text-sm">
                SC
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                SOMACAMPUS INTERNATIONAL SCHOOL
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Plot 42 Academic Ridge, Kampala, Uganda • TIN: 1002948271
            </p>
            <p className="text-xs font-semibold text-emerald-800 tracking-wide uppercase mt-1">
              Official Staff Salary Payslip
            </p>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Finalized
            </div>
            <p className="text-xs text-slate-500 mt-2">Pay Period: <span className="font-semibold text-slate-800">{periodLabel}</span></p>
          </div>
        </div>

        {/* Employee Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Employee Name</span>
            <span className="font-bold text-slate-900">{item.employeeName}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Job Designation</span>
            <span className="font-semibold text-slate-800">{item.jobTitle || 'Academic Staff'}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Tax Treatment</span>
            <span className="font-semibold uppercase text-slate-800">{item.employeeType}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Currency</span>
            <span className="font-semibold text-slate-800">UGX (Uganda Shillings)</span>
          </div>
        </div>

        {/* Earnings and Deductions Two-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Earnings */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-800 border-b border-slate-100 pb-2">
              Gross Earnings (Money In)
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Basic Monthly Salary</span>
                <span className="font-semibold">{formatUGX(item.grossSalary)}</span>
              </div>
              {item.overtimeAmount > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">
                    Overtime ({item.overtimeHours} hrs)
                  </span>
                  <span className="font-semibold text-emerald-700">
                    +{formatUGX(item.overtimeAmount)}
                  </span>
                </div>
              )}
              {item.allowances > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Allowances & Additions</span>
                  <span className="font-semibold text-emerald-700">
                    +{formatUGX(item.allowances)}
                  </span>
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 pt-3 flex justify-between text-xs font-bold text-slate-900">
              <span>Total Gross Earnings</span>
              <span>{formatUGX(totalEarnings)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-800 border-b border-slate-100 pb-2">
              Statutory & Post-Tax Deductions
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-slate-600">PAYE (Uganda Income Tax)</span>
                <span className="font-semibold text-rose-700">
                  {formatUGX(item.paye)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">NSSF Employee 5% (Cap 222)</span>
                <span className="font-semibold text-rose-700">
                  {formatUGX(item.nssfEmployee)}
                </span>
              </div>
              {item.whtAmount > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Withholding Tax (WHT)</span>
                  <span className="font-semibold text-rose-700">
                    {formatUGX(item.whtAmount)}
                  </span>
                </div>
              )}
              {item.advanceDeduction > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Salary Advance Recovery</span>
                  <span className="font-semibold text-rose-700">
                    {formatUGX(item.advanceDeduction)}
                  </span>
                </div>
              )}
              {item.unpaidLeaveDeduction > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Unpaid Leave Deduction</span>
                  <span className="font-semibold text-rose-700">
                    {formatUGX(item.unpaidLeaveDeduction)}
                  </span>
                </div>
              )}
              {item.otherDeductions > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Other Deductions</span>
                  <span className="font-semibold text-rose-700">
                    {formatUGX(item.otherDeductions)}
                  </span>
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 pt-3 flex justify-between text-xs font-bold text-slate-900">
              <span>Total Deductions</span>
              <span className="text-rose-800">-{formatUGX(totalDeductions)}</span>
            </div>
          </div>
        </div>

        {/* Net Salary Highlight Box */}
        <div className="bg-emerald-900 text-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs text-emerald-200 uppercase tracking-wider font-semibold block">
              Net Take-Home Salary
            </span>
            <span className="text-2xl sm:text-3xl font-black tracking-tight">
              {formatUGX(item.netPay)}
            </span>
          </div>
          <div className="sm:text-right text-xs text-emerald-100/90 border-t sm:border-t-0 sm:border-l border-emerald-700/50 pt-2 sm:pt-0 sm:pl-6">
            <span className="block font-medium">Employer Contributions:</span>
            <span>NSSF Employer 10%: {formatUGX(item.nssfEmployer)}</span>
            <span className="block text-[10px] text-emerald-300/80 mt-1">
              (Statutory remit by school, not deducted from employee)
            </span>
          </div>
        </div>

        {/* Legal Footer */}
        <div className="border-t border-slate-100 pt-4 text-[11px] text-slate-400 flex flex-col sm:flex-row justify-between gap-2">
          <span>This is a computer-generated payslip under SomaCampus Phase 7 Native Payroll Engine.</span>
          <span>Verified compliant with Uganda Income Tax Act & NSSF Act Cap 222.</span>
        </div>
      </div>
    </div>
  );
};
