import React, { useState } from 'react';
import { X, ShieldAlert, Sparkles, CheckCircle2, Link2, BookOpen } from 'lucide-react';
import { learningIntelligenceService } from './learningIntelligenceService';
import { aiIntelligenceAssistant } from './aiIntelligenceAssistant';
import type {
  InterventionStatus,
  InterventionEvidenceType,
  EvidenceReference,
} from '../../types/domain';

interface AvailableEvidenceOption {
  type: InterventionEvidenceType;
  id: string;
  title: string;
  date: string;
}

interface InterventionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  schoolId: string;
  studentId: string;
  studentName: string;
  classId: string;
  streamId?: string | null;
  teacherId: string;
  defaultSubjectId?: string;
  availableSubjects?: Array<{ id: string; name: string }>;
  availableEvidence?: AvailableEvidenceOption[];
  prefilledMisconception?: string;
}

export const InterventionModal: React.FC<InterventionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  schoolId,
  studentId,
  studentName,
  classId,
  streamId,
  teacherId,
  defaultSubjectId = '',
  availableSubjects = [],
  availableEvidence = [],
  prefilledMisconception = '',
}) => {
  const [subjectId, setSubjectId] = useState(defaultSubjectId);
  const [learningArea, setLearningArea] = useState(prefilledMisconception ? 'Targeted Support' : '');
  const [reason, setReason] = useState(prefilledMisconception || '');
  const [strategyAction, setStrategyAction] = useState('');
  const [targetOutcome, setTargetOutcome] = useState('');
  const [targetDate, setTargetDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  );
  const [status, setStatus] = useState<InterventionStatus>('active');
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleEvidence = (id: string) => {
    setSelectedEvidenceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleAiDraftSuggestion = () => {
    const selectedEvList: EvidenceReference[] = availableEvidence
      .filter((e) => selectedEvidenceIds.includes(e.id))
      .map((e) => ({
        type: e.type,
        id: e.id,
        titleOrSnippet: e.title,
        date: e.date,
      }));

    const draft = aiIntelligenceAssistant.draftInterventionSuggestion({
      studentId,
      studentName,
      learningArea: learningArea || 'Selected Subject Topic',
      recentEvidence: selectedEvList,
      misconceptionSnippet: reason,
    });

    setStrategyAction(draft.suggestedStrategy);
    setTargetOutcome(draft.targetOutcome);
    if (!reason) setReason(draft.reason);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) {
      setErrorMessage('Please select an academic subject.');
      return;
    }
    if (!learningArea.trim()) {
      setErrorMessage('Please provide a learning area or topic.');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('Please explain the reason for the intervention.');
      return;
    }
    if (!strategyAction.trim()) {
      setErrorMessage('Please define the instructional strategy or action.');
      return;
    }
    if (!targetOutcome.trim()) {
      setErrorMessage('Please specify the target outcome.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const evidenceToLink = availableEvidence
        .filter((e) => selectedEvidenceIds.includes(e.id))
        .map((e) => ({ type: e.type, id: e.id }));

      await learningIntelligenceService.createIntervention(
        {
          schoolId,
          studentId,
          teacherId,
          classId,
          streamId,
          subjectId,
          learningArea,
          reason,
          strategyAction,
          targetOutcome,
          targetDate,
          status,
        },
        evidenceToLink,
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Failed to save intervention. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
                Learning Intelligence
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 text-teal-800">
                Phase 5 Action Loop
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              Plan Targeted Learning Intervention
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Student: <strong className="text-slate-800">{studentName}</strong> • Requires teacher authorization
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-800">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Subject & Learning Area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              {availableSubjects.length > 0 ? (
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  required
                >
                  <option value="">Select subject...</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={subjectId ? 'Mathematics' : ''}
                  disabled
                  placeholder="Primary Academic Subject"
                  className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 text-slate-600"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Learning Area / Topic <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={learningArea}
                onChange={(e) => setLearningArea(e.target.value)}
                placeholder="e.g. Fractions: Equivalent Fractions"
                className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                required
              />
            </div>
          </div>

          {/* Reason for Intervention */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
              Observed Friction / Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the specific misconception or pattern observed in class..."
              className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              required
            />
          </div>

          {/* AI Strategy Suggestion Helper */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/70 border border-teal-200/60">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-teal" />
              <span className="text-xs text-teal-900 font-medium">
                Draft strategy with AI Assistant (optional)
              </span>
            </div>
            <button
              type="button"
              onClick={handleAiDraftSuggestion}
              className="text-xs font-semibold px-2.5 py-1 bg-white hover:bg-teal-100 text-teal-800 rounded-md border border-teal-200 transition-colors shadow-sm"
            >
              Draft Suggestion
            </button>
          </div>

          {/* Strategy / Action Plan */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
              Targeted Instructional Strategy <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={strategyAction}
              onChange={(e) => setStrategyAction(e.target.value)}
              placeholder="e.g. 15-minute small-group retrieval practice twice weekly using visual fraction bars..."
              className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              required
            />
          </div>

          {/* Target Outcome & Target Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Target Outcome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={targetOutcome}
                onChange={(e) => setTargetOutcome(e.target.value)}
                placeholder="e.g. Independent conversion with 80%+ accuracy"
                className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Target Review Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                required
              />
            </div>
          </div>

          {/* Relational Evidence Linker */}
          {availableEvidence.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-brand-teal" />
                  Attach Authoritative Evidence References
                </label>
                <span className="text-[11px] text-slate-500">
                  {selectedEvidenceIds.length} attached
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-slate-50/50 p-1">
                {availableEvidence.map((ev) => {
                  const isChecked = selectedEvidenceIds.includes(ev.id);
                  return (
                    <label
                      key={ev.id}
                      className="flex items-start gap-2.5 p-2 rounded hover:bg-white cursor-pointer transition-colors text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEvidence(ev.id)}
                        className="mt-0.5 rounded text-brand-teal focus:ring-brand-teal"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800 truncate">
                            {ev.title}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-slate-200 text-slate-700">
                            {ev.type}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">{ev.date}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lifecycle Status & Teacher Authorization */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-600" />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  Intervention Lifecycle Status
                </span>
                <span className="text-[11px] text-slate-500">
                  Active interventions appear on the teacher's lesson cockpit briefing.
                </span>
              </div>
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InterventionStatus)}
              className="text-xs font-semibold rounded-md border border-slate-300 px-2.5 py-1.5 bg-white text-slate-800"
            >
              <option value="active">Active (Authorized)</option>
              <option value="draft">Save as Draft</option>
            </select>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-brand-teal hover:bg-brand-teal/90 shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : status === 'active' ? 'Authorize & Activate' : 'Save Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
