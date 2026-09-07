import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { hrService } from '../hr/hrService';
import { useAuth } from '../../lib/authContext';
import { AlertCircle, DollarSign, CheckCircle2 } from 'lucide-react';
import type { StaffDossier } from '../../types/domain';

interface StaffPayrollEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StaffDossier;
  onSuccess: () => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const StaffPayrollEditModal: React.FC<StaffPayrollEditModalProps> = ({
  isOpen,
  onClose,
  dossier,
  onSuccess,
}) => {
  const { schoolId } = useAuth();
  const activeSchoolId = schoolId || dossier.schoolId;

  const currentPay = dossier.payrollSummary;

  const [baseSalary, setBaseSalary] = useState<string>('');
  const [currency, setCurrency] = useState<string>('UGX');
  const [payBasis, setPayBasis] = useState<string>('salaried');
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [bankName, setBankName] = useState<string>('');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>('');
  const [bankAccountName, setBankAccountName] = useState<string>('');
  const [nssfApplicable, setNssfApplicable] = useState<boolean>(true);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && currentPay) {
      setBaseSalary(currentPay.baseSalary ? String(currentPay.baseSalary) : '');
      setCurrency(currentPay.currency || 'UGX');
      setPayBasis(currentPay.payBasis || 'salaried');
      setPaymentMethod(currentPay.paymentMethod || 'bank_transfer');
      setBankName(currentPay.bankName || '');
      setBankAccountNumber(currentPay.accountNumber || '');
      setBankAccountName(currentPay.bankAccountName || dossier.personal.fullName || '');
      setNssfApplicable(currentPay.nssfApplicable ?? true);
      setEffectiveFrom(new Date().toISOString().slice(0, 10));
      setError(null);
      setIsSuccess(false);
    }
  }, [isOpen, currentPay, dossier.personal.fullName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const salaryNum = parseFloat(baseSalary);
    if (isNaN(salaryNum) || salaryNum < 0) {
      setError('Please enter a valid base salary amount (greater than or equal to 0).');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await hrService.upsertPayrollProfile({
        schoolId: activeSchoolId,
        employeeId: dossier.id,
        baseSalary: salaryNum,
        currency,
        payBasis,
        paymentMethod,
        bankName: bankName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        nssfApplicable,
        effectiveFrom,
      });

      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 600);
    } catch (err: any) {
      console.error('Failed to update payroll profile', err);
      setError(err.message || 'Failed to update payroll profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={currentPay?.profileConfigured ? 'Edit Payroll & Compensation Profile' : 'Configure Payroll Profile'}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          Set up official remuneration, statutory deductions, and banking payout details for{' '}
          <strong className="text-slate-800">{dossier.personal.fullName}</strong>.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Payroll profile updated successfully.</span>
          </div>
        )}

        {/* Base Salary & Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Base Salary *</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="100"
                required
                placeholder="e.g. 2500000"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                className={`${inputClass} pl-8 font-mono`}
              />
              <DollarSign className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              <option value="UGX">UGX</option>
              <option value="USD">USD</option>
              <option value="KES">KES</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        {/* Pay Basis & Payment Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Pay Basis</label>
            <select
              value={payBasis}
              onChange={(e) => setPayBasis(e.target.value)}
              className={inputClass}
            >
              <option value="salaried">Monthly Salary</option>
              <option value="hourly">Hourly Rate</option>
              <option value="per_lesson">Per Lesson Rate</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Disbursement Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={inputClass}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="cash">Cash / Petty Cash</option>
            </select>
          </div>
        </div>

        {/* Banking / Payout Details */}
        <div className="space-y-3 pt-1 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Banking / Disbursement Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Bank / Provider Name</label>
              <input
                type="text"
                placeholder="e.g. Stanbic Bank Uganda, MTN MoMo"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Account / Phone Number</label>
              <input
                type="text"
                placeholder="e.g. 9030012345678"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Account Holder Name</label>
            <input
              type="text"
              placeholder="e.g. Sarah Namukasa"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Statutory & Effective Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
          <div>
            <label className={labelClass}>Effective From Date</label>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={nssfApplicable}
                onChange={(e) => setNssfApplicable(e.target.checked)}
                className="rounded border-slate-300 text-brand-teal focus:ring-brand-teal h-4 w-4"
              />
              <span className="text-xs font-medium text-slate-700">
                Subject to 10% Employer & 5% Employee NSSF
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving Profile...' : 'Save Payroll Profile'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
