import React, { useState, useEffect } from 'react';
import { Search, X, Check, BookOpen, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { curriculumService } from '../curriculum/curriculumService';
import type { LearningObjective } from '@/types/domain';

interface ObjectiveQuickChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectObjective: (obj: LearningObjective) => void;
  currentObjectiveId?: string;
  subjectCode?: string;
  stageNumber?: number;
}

export const ObjectiveQuickChangeModal: React.FC<ObjectiveQuickChangeModalProps> = ({
  isOpen,
  onClose,
  onSelectObjective,
  currentObjectiveId,
  stageNumber = 5,
}) => {
  const [search, setSearch] = useState('');
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [selectedStrand, setSelectedStrand] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadObjectives = async () => {
      setIsLoading(true);
      try {
        const all = await curriculumService.getObjectives({ search: search.trim() || undefined });
        if (isMounted) {
          setObjectives(all);
        }
      } catch (err) {
        console.warn('Failed to load objectives for picker:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadObjectives();
    return () => {
      isMounted = false;
    };
  }, [isOpen, search]);

  if (!isOpen) return null;

  const filtered = objectives.filter((o) => {
    if (selectedStrand !== 'all' && o.strandId !== selectedStrand) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] sm:max-h-[80vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-800 border border-teal-200">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Change Learning Objective</h3>
              <p className="text-xs text-slate-500">2-tap quick selector for Cambridge Primary</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filter bar */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code (e.g. 5Nn.01) or keyword..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
              autoFocus
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-[11px]">
            <span className="text-slate-400 flex items-center gap-1 pr-1 font-medium">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            <button
              onClick={() => setSelectedStrand('all')}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                selectedStrand === 'all'
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Objectives
            </button>
            <button
              onClick={() => setSelectedStrand(`Stage ${stageNumber}`)}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                selectedStrand === `Stage ${stageNumber}`
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Stage {stageNumber} Only
            </button>
          </div>
        </div>

        {/* Objectives list */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100 custom-scrollbar">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading curriculum objectives...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching objectives found. Try searching for "fraction" or "5Nn".
            </div>
          ) : (
            filtered.map((obj) => {
              const isSelected = obj.id === currentObjectiveId;
              return (
                <div
                  key={obj.id}
                  onClick={() => {
                    onSelectObjective(obj);
                    onClose();
                  }}
                  className={`py-3 px-3 rounded-xl cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-teal-50/80 border border-teal-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 font-mono text-[11px] font-bold rounded-md bg-teal-100 text-teal-800 border border-teal-200">
                        {obj.code}
                      </span>
                      {obj.isAuthoritative && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Authoritative
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">{obj.title}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {obj.description}
                    </p>
                  </div>

                  {isSelected && (
                    <div className="p-1 rounded-full bg-teal-600 text-white">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Tap any objective to select it for this lesson.</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
