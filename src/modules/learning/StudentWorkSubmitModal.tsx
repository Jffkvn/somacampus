/**
 * Photo-first student hand-in (M4 UI).
 *
 * Multi-image capture (camera preferred), client-side compress, optional
 * short note. Resubmit/revision keeps attempt history via submissionService.
 * Interrupted upload fails closed — never a fake "submitted" row.
 */
import React, { useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Camera, ImagePlus, X, AlertCircle, Loader2 } from 'lucide-react';
import { submissionService } from './submissionService';
import {
  assertPhotoAcceptable,
  compressPhotoForUpload,
  formatBytes,
  toQueuedPhoto,
  MAX_PHOTOS_PER_SUBMISSION,
  type QueuedPhoto,
} from './photoUpload';

export interface StudentWorkSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: string;
  studentId: string;
  assignmentId: string;
  assignmentTitle: string;
  /** True when the learner is resubmitting after revision_requested / late. */
  isResubmit?: boolean;
  onSubmitted?: (submissionId: string) => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const StudentWorkSubmitModal: React.FC<StudentWorkSubmitModalProps> = ({
  isOpen,
  onClose,
  schoolId,
  studentId,
  assignmentId,
  assignmentTitle,
  isResubmit = false,
  onSubmitted,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearQueue = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    clearQueue();
    setNote('');
    setError(null);
    onClose();
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    setIsBusy(true);
    try {
      const next: QueuedPhoto[] = [];
      for (const file of Array.from(fileList)) {
        try {
          assertPhotoAcceptable(file, photos.length + next.length);
        } catch (e: any) {
          setError(e?.message ?? 'Could not add that photo.');
          continue;
        }
        const compressed = await compressPhotoForUpload(file);
        next.push(toQueuedPhoto(file, compressed));
      }
      if (next.length) {
        setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS_PER_SUBMISSION));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const canSubmit = !isSubmitting && !isBusy && (photos.length > 0 || note.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Upload first (photo-first). If an upload dies mid-way we do not
      // call submit_work — no half-handed-in row.
      const photoStoragePaths: string[] = [];
      for (const p of photos) {
        const path = await submissionService.uploadWorkPhoto(
          schoolId,
          studentId,
          assignmentId,
          p.compressed.blob,
          p.compressed.mime,
        );
        photoStoragePaths.push(path);
      }

      const submission = await submissionService.submitWork({
        schoolId,
        assignmentId,
        studentId,
        textBody: note.trim() || null,
        photoStoragePaths,
      });

      onSubmitted?.(submission.id);
      handleClose();
    } catch (err: any) {
      console.error('StudentWorkSubmitModal submit failed:', err);
      const raw = String(err?.message ?? '');
      const technical =
        /PGRST\d+|row-level security|permission denied|violates|duplicate key/i.test(raw);
      setError(
        technical
          ? 'We could not hand in your work right now. Please try again, or ask your teacher for help.'
          : raw || 'Could not hand in your work. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isResubmit ? 'Resubmit your work' : 'Hand in your work'}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{assignmentTitle}</span>
          {' — photograph your handwritten work. Photo-first, not photo-only.'}
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className={labelClass}>
            Photos ({photos.length}/{MAX_PHOTOS_PER_SUBMISSION})
          </label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
              >
                <img src={p.previewUrl} alt={p.filename} className="w-full h-28 object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-slate-900/55 text-[10px] text-white px-2 py-1 flex items-center justify-between">
                  <span className="truncate">{p.filename}</span>
                  <span>{formatBytes(p.compressed.compressedBytes)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-slate-700 hover:bg-white"
                  aria-label={`Remove ${p.filename}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Camera className="w-4 h-4" />}
              disabled={isBusy || isSubmitting || photos.length >= MAX_PHOTOS_PER_SUBMISSION}
              onClick={() => cameraInputRef.current?.click()}
            >
              Take photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<ImagePlus className="w-4 h-4" />}
              disabled={isBusy || isSubmitting || photos.length >= MAX_PHOTOS_PER_SUBMISSION}
              onClick={() => galleryInputRef.current?.click()}
            >
              Choose photos
            </Button>
          </div>

          {/* capture=environment opens the rear camera on mobile. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Photos are compressed on your phone before upload (max {MAX_PHOTOS_PER_SUBMISSION}).
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="student-work-note">
            Note for your teacher (optional)
          </label>
          <textarea
            id="student-work-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anything your teacher should know…"
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            leftIcon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            className="bg-brand-teal hover:bg-brand-tealDark text-white font-bold"
          >
            {isSubmitting ? 'Handing in…' : isResubmit ? 'Resubmit work' : 'Hand in work'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
