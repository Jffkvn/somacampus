import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { hrService } from '../hr/hrService';
import { useAuth } from '../../lib/authContext';
import { AlertCircle, Calendar, CheckCircle2 } from 'lucide-react';
import type { StaffDossier, LeaveType } from '../../types/domain';

interface StaffLeaveEntitlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StaffDossier;
  onSuccess: () => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const StaffLeaveEntitlementModal: React.FC<StaffLeaveEntitlementModalProps> = ({
  isOpen,
  onClose,
  dossier,
  onSuccess,
}) => {
  const { role, schoolId } = useAuth();
  const activeSchoolId = schoolId || dossier.schoolId;

  const currentYear = new Date().getFullYear();

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [leaveYear, setLeaveYear] = useState<number>(currentYear);
  const [entitledDays, setEntitledDays] = useState<string>('21');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTypes() {
      try {
        setIsLoading(true);
        const types = await hrService.getLeaveTypes(activeSchoolId);
        setLeaveTypes(types);
        if (types.length > 0) {
          setSelectedTypeId(types[0].id);
          setEntitledDays(String(types[0].defaultEntitlementDays ?? 21));
        }
      } catch (err: any) {
        console.error('Failed to load leave types', err);
        setLeaveTypes([]);
      } finally {
        setIsLoading(false);
      }
    }
    if (isOpen) {
      loadTypes();
      setError(null);
      setIsSuccess(false);
      setLeaveYear(currentYear);
    }
  }, [isOpen, activeSchoolId, currentYear]);

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    // Find existing balance in dossier if already assigned
    const existing = dossier.leaveBalances.find((b) => b.leaveTypeId === typeId);
    if (existing) {
      setEntitledDays(String(existing.annualAllowance));
    } else {
      const matched = leaveTypes.find((t) => t.id === typeId);
      setEntitledDays(String(matched?.defaultEntitlementDays ?? 21));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseFloat(entitledDays);
    if (isNaN(days) || days < 0) {
      setError('Please enter a valid number of entitled days (0 or greater).');
      return;
    }
    if (!selectedTypeId) {
      setError('Please select a leave policy type.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await hrService.upsertLeaveEntitlement({
        schoolId: activeSchoolId,
        employeeId: dossier.id,
        leaveTypeId: selectedTypeId,
        leaveYear,
        entitledDays: days,
        actorRole: role,
      });

      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 600);
    } catch (err: any) {
      console.error('Failed to assign leave entitlement', err);
      setError(err.message || 'Failed to assign leave entitlement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Leave Entitlement Quota"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          Configure annual entitled days for <strong className="text-slate-800">{dossier.personal.fullName}</strong>.
          Custom allocations override standard school-wide defaults.
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
            <span>Leave entitlement updated successfully.</span>
          </div>
        )}

        {/* Leave Type Select */}
        <div>
          <label className={labelClass}>Leave Policy Type *</label>
          <select
            value={selectedTypeId}
            onChange={(e) => handleTypeChange(e.target.value)}
            disabled={isLoading || isSubmitting}
            className={inputClass}
          >
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code}) — Default: {t.defaultEntitlementDays} days {t.isPaid ? '(Paid)' : '(Unpaid)'}
              </option>
            ))}
          </select>
        </div>

        {/* Leave Year & Entitled Days */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Leave Year</label>
            <div className="relative">
              <input
                type="number"
                min="2020"
                max="2100"
                required
                value={leaveYear}
                onChange={(e) => setLeaveYear(parseInt(e.target.value, 10))}
                className={`${inputClass} pl-8 font-mono`}
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Entitled Days *</label>
            <input
              type="number"
              min="0"
              step="0.5"
              required
              value={entitledDays}
              onChange={(e) => setEntitledDays(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting || isLoading}>
            {isSubmitting ? 'Saving...' : 'Save Entitlement'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
