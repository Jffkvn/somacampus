import React, { useState } from 'react';
import { studentService, StudentDossier } from './studentService';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { UserMinus, AlertCircle, AlertTriangle } from 'lucide-react';

interface StudentWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StudentDossier;
  role: string;
  onSuccess: () => void;
}

export const StudentWithdrawModal: React.FC<StudentWithdrawModalProps> = ({
  isOpen,
  onClose,
  dossier,
  role,
  onSuccess,
}) => {
  const [finalStatus, setFinalStatus] = useState<'withdrawn' | 'graduated'>('withdrawn');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('transferred_school');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);
      await studentService.withdrawStudent(dossier.studentId, role, {
        effectiveDate,
        reason,
        exitNotes: notes.trim() || undefined,
        finalStatus,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to withdraw student');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={finalStatus === 'graduated' ? 'Graduate Student' : 'Withdraw Student'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs space-y-1 text-amber-800">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Historical Preservation Invariant</span>
          </div>
          <p>
            Withdrawing or graduating <strong>{dossier.personal.fullName}</strong> closes their current active enrolment in <strong>{dossier.currentClass}</strong>. Their historical fee statements, attendance registers, and academic submissions will remain intact and auditable.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Action / Status *
          </label>
          <select
            value={finalStatus}
            onChange={(e) => setFinalStatus(e.target.value as any)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none bg-white"
          >
            <option value="withdrawn">Withdraw Student (Transferred / Left School)</option>
            <option value="graduated">Graduate Student (Completed Primary Cycle)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Effective Date *
            </label>
            <input
              type="date"
              required
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Exit Reason Category
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none bg-white"
            >
              <option value="transferred_school">Transferred to another school</option>
              <option value="family_relocated">Family relocated / moved abroad</option>
              <option value="completed_studies">Completed academic cycle</option>
              <option value="financial_reasons">Financial constraints</option>
              <option value="medical_reasons">Health / Medical withdrawal</option>
              <option value="other">Other reason</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Notes / Destination School (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Relocated to Entebbe, admitted to St. Mary's"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
          >
            <UserMinus className="w-4 h-4" />
            <span>{isSubmitting ? 'Processing...' : finalStatus === 'graduated' ? 'Confirm Graduation' : 'Confirm Withdrawal'}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};
