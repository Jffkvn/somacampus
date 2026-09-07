import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { AlertCircle } from 'lucide-react';
import type { StaffDossier } from '../../types/domain';

interface StaffSubjectAppointModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StaffDossier;
  onSuccess: () => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const StaffSubjectAppointModal: React.FC<StaffSubjectAppointModalProps> = ({
  isOpen,
  onClose,
  dossier,
  onSuccess,
}) => {
  const { role, schoolId } = useAuth();
  const activeSchoolId = schoolId || dossier.schoolId;

  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const subs = await staffService.getSchoolSubjects(activeSchoolId);
        // Exclude already appointed subjects
        const appointedIds = new Set(dossier.officialSubjects.map((s) => s.subjectId));
        const unappointed = subs.filter((s) => !appointedIds.has(s.id));
        setAvailableSubjects(unappointed);
        if (unappointed.length > 0) {
          setSelectedSubjectId(unappointed[0].id);
        }
      } catch (err) {
        console.error('Failed to load subjects', err);
        setAvailableSubjects([]);
      } finally {
        setIsLoading(false);
      }
    }
    if (isOpen) {
      load();
    }
  }, [isOpen, activeSchoolId, dossier.officialSubjects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      setError('Please select a subject to appoint.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await staffService.appointTeacherSubject(
        activeSchoolId,
        dossier.id,
        selectedSubjectId,
        notes.trim() || undefined,
        role
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to appoint subject', err);
      setError(err.message || 'Failed to appoint official teaching subject.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Appoint Official Teaching Subject" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          Official subjects record authoritative qualifications and appointments for {dossier.personal.fullName}.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-slate-400">Loading school subjects...</p>
        ) : availableSubjects.length === 0 ? (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
            All active school curriculum subjects are already appointed to this teacher.
          </div>
        ) : (
          <div>
            <label className={labelClass}>Curriculum Subject *</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className={inputClass}
              required
            >
              {availableSubjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} {sub.code ? `(${sub.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>Appointment Notes / Specialization</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Upper Primary Lead, Cambridge Stage 5-6"
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || availableSubjects.length === 0}
            className="bg-brand-teal hover:bg-brand-tealDark text-white font-bold"
          >
            {isSubmitting ? 'Appointing...' : 'Appoint Subject'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
