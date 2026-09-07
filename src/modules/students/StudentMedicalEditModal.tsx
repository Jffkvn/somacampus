import React, { useState } from 'react';
import { studentService, StudentDossier } from './studentService';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { HeartPulse, AlertCircle, Save } from 'lucide-react';

interface StudentMedicalEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StudentDossier;
  role: string;
  onSuccess: () => void;
}

export const StudentMedicalEditModal: React.FC<StudentMedicalEditModalProps> = ({
  isOpen,
  onClose,
  dossier,
  role,
  onSuccess,
}) => {
  const [allergies, setAllergies] = useState(dossier.medical.allergies || '');
  const [conditions, setConditions] = useState(dossier.medical.conditions || '');
  const [medication, setMedication] = useState(dossier.medical.medication || '');
  const [bloodGroup, setBloodGroup] = useState(dossier.medical.bloodGroup || 'O+');
  const [restrictions, setRestrictions] = useState(dossier.medical.restrictions || '');
  const [notes, setNotes] = useState(dossier.medical.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);
      await studentService.updateStudentMedical(dossier.studentId, role, {
        allergies: allergies.trim() || undefined,
        conditions: conditions.trim() || undefined,
        medication: medication.trim() || undefined,
        bloodGroup: bloodGroup.trim() || undefined,
        restrictions: restrictions.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update medical details');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Medical & Health Record">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-teal-50 border border-teal-200/80 rounded-xl text-xs space-y-1 text-teal-800">
          <p className="font-bold flex items-center gap-1.5">
            <HeartPulse className="w-4 h-4 text-brand-teal shrink-0" />
            <span>Privacy Boundary</span>
          </p>
          <p>
            Allergies recorded here populate the teacher's instant <strong>Medical Alert Pill</strong> on the morning attendance roll. Full clinical history and medication remain restricted to school leadership, nurses, and guardians.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Known Allergies (e.g. Peanuts, Penicillin)
            </label>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. Severe Peanut Allergy"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Blood Group
            </label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none bg-white"
            >
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Medical Conditions (e.g. Asthma, Epilepsy)
            </label>
            <input
              type="text"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="e.g. Mild Asthma"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Current Medication & Dosage
            </label>
            <input
              type="text"
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              placeholder="e.g. Salbutamol inhaler as needed"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Physical / Dietary Restrictions
          </label>
          <input
            type="text"
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            placeholder="e.g. Avoid cross-country running in wet weather; Halal meals only"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Doctor / Hospital / Emergency Instructions
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. In emergency, take to IHK Namuwongo or Case Hospital. Contact Dr. Kato at 0772..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} className="flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving...' : 'Save Medical Record'}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};
