import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import type { StaffDossier, StaffExitPayload } from '../../types/domain';

interface StaffExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StaffDossier;
  onSuccess: () => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const StaffExitModal: React.FC<StaffExitModalProps> = ({
  isOpen,
  onClose,
  dossier,
  onSuccess,
}) => {
  const { role } = useAuth();

  const [exitDate, setExitDate] = useState(new Date().toISOString().split('T')[0]);
  const [exitReason, setExitReason] = useState<StaffExitPayload['exitReason']>('resigned');
  const [status, setStatus] = useState<'terminated' | 'on_leave'>('terminated');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitDate) {
      setError('Exit date is required.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      await staffService.exitStaffMember(
        dossier.id,
        {
          exitDate,
          exitReason,
          status,
          notes: notes.trim() || undefined,
        },
        role
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to record staff exit', err);
      setError(err.message || 'Failed to record staff offboarding.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Staff Exit & Offboarding" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning Banner */}
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">Non-Destructive Staff Offboarding</span>
            <p className="text-amber-800 leading-relaxed">
              Recording this exit will mark {dossier.personal.fullName} as {status === 'terminated' ? 'Exited/Terminated' : 'On Leave'}. All past payroll runs, teaching lessons, and attendance history remain permanently preserved and auditable.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Effective Exit Date *</label>
            <input
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Exit Reason *</label>
            <select
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value as any)}
              className={inputClass}
              required
            >
              <option value="resigned">Voluntary Resignation</option>
              <option value="contract_ended">Contract Expired / Ended</option>
              <option value="retired">Retirement</option>
              <option value="terminated">Employment Terminated</option>
              <option value="dismissed">Disciplinary Dismissal</option>
              <option value="other">Other Reason</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Final Employment Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className={inputClass}
          >
            <option value="terminated">Terminated / Inactive</option>
            <option value="on_leave">Extended Leave of Absence</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Exit Handover Notes / Rationale</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document handover details, reason for departure, or forward contact..."
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isProcessing}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
          >
            {isProcessing ? 'Processing Exit...' : 'Confirm Staff Exit'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
