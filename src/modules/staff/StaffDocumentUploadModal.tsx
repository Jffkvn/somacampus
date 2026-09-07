import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { Upload, AlertCircle } from 'lucide-react';
import type { StaffDossier, StaffDocumentItem } from '../../types/domain';

interface StaffDocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StaffDossier;
  onSuccess: () => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const StaffDocumentUploadModal: React.FC<StaffDocumentUploadModalProps> = ({
  isOpen,
  onClose,
  dossier,
  onSuccess,
}) => {
  const { role, schoolId } = useAuth();
  const activeSchoolId = schoolId || dossier.schoolId;

  const [docType, setDocType] = useState<StaffDocumentItem['docType']>('cv');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose a file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      await staffService.uploadStaffDocument(
        activeSchoolId,
        dossier.id,
        selectedFile,
        docType,
        role
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to upload document', err);
      setError(err.message || 'Failed to upload staff document.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Staff Document" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          Documents uploaded are securely stored in the private staff records bucket for {dossier.personal.fullName}.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className={labelClass}>Document Category *</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as any)}
            className={inputClass}
            required
          >
            <option value="cv">Curriculum Vitae (CV / Resume)</option>
            <option value="qualification_certificate">Academic Certificate / Diploma</option>
            <option value="contract">Signed Employment Contract</option>
            <option value="national_id">National ID / Passport Copy</option>
            <option value="photo">Official Passport Photo</option>
            <option value="other">Other Official Record</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Select File (PDF, DOCX, PNG, JPG) *</label>
          <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center hover:border-brand-teal/50 transition-colors">
            <input
              type="file"
              id="staff-file-input"
              onChange={handleFileChange}
              className="sr-only"
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
            />
            <label htmlFor="staff-file-input" className="cursor-pointer block space-y-2">
              <Upload className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="text-xs text-slate-600 font-medium">
                {selectedFile ? (
                  <span className="text-brand-teal font-bold">{selectedFile.name}</span>
                ) : (
                  <span>Click to choose file or drag and drop</span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 block">Up to 10MB</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isUploading || !selectedFile}
            className="bg-brand-teal hover:bg-brand-tealDark text-white font-bold"
          >
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
