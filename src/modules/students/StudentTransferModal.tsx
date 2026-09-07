import React, { useState, useEffect } from 'react';
import { studentService, StudentDossier } from './studentService';
import { supabase } from '../../lib/supabase';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ArrowRightLeft, AlertCircle } from 'lucide-react';

interface StudentTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StudentDossier;
  role: string;
  schoolId: string;
  onSuccess: () => void;
}

interface ClassOption {
  id: string;
  name: string;
}

interface StreamOption {
  id: string;
  class_id: string;
  name: string;
}

export const StudentTransferModal: React.FC<StudentTransferModalProps> = ({
  isOpen,
  onClose,
  dossier,
  role,
  schoolId,
  onSuccess,
}) => {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [streams, setStreams] = useState<StreamOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStreamId, setSelectedStreamId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<'transferred_class' | 'transferred_stream' | 'promoted' | 'other'>('transferred_class');

  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function loadAcademicStructure() {
      try {
        setIsLoadingClasses(true);
        const { data: classData } = await supabase
          .from('classes')
          .select('id, name')
          .eq('school_id', schoolId)
          .order('name');
        setClasses(classData || []);

        const { data: streamData } = await supabase
          .from('streams')
          .select('id, class_id, name')
          .order('name');
        setStreams(streamData || []);
      } catch (err) {
        console.error('Failed to load classes for transfer modal', err);
      } finally {
        setIsLoadingClasses(false);
      }
    }
    loadAcademicStructure();
  }, [isOpen, schoolId]);

  if (!isOpen) return null;

  const filteredStreams = streams.filter((s) => s.class_id === selectedClassId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      setError('Please select a target class.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await studentService.transferStudent(dossier.studentId, role, {
        targetClassId: selectedClassId,
        targetStreamId: selectedStreamId || undefined,
        effectiveDate,
        reason,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to transfer student');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Student to Class/Stream">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
          <p className="font-bold text-slate-800">
            Current Enrolment: <span className="text-brand-teal">{dossier.currentClass}</span>
          </p>
          <p className="text-slate-500">
            Transferring will close the active enrolment and open a new enrolment period while preserving full historical attendance and grade records.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Target Class *
          </label>
          <select
            required
            disabled={isLoadingClasses}
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSelectedStreamId('');
            }}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none bg-white"
          >
            <option value="">-- Select Class --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {filteredStreams.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Target Stream
            </label>
            <select
              value={selectedStreamId}
              onChange={(e) => setSelectedStreamId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none bg-white"
            >
              <option value="">-- No specific stream / All --</option>
              {filteredStreams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
              Transfer Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-teal/40 focus:outline-none bg-white"
            >
              <option value="transferred_class">Transferred Class</option>
              <option value="transferred_stream">Transferred Stream</option>
              <option value="promoted">Academic Promotion</option>
              <option value="other">Other Administrative Reason</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting || !selectedClassId} className="flex items-center gap-1.5">
            <ArrowRightLeft className="w-4 h-4" />
            <span>{isSubmitting ? 'Transferring...' : 'Confirm Transfer'}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};
