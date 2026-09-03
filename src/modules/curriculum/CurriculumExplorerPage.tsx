import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  ChevronRight,
  ChevronDown,
  GraduationCap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { curriculumService } from './curriculumService';
import type {
  CurriculumSubject,
  CurriculumStage,
  CurriculumStrand,
  CurriculumSubStrand,
  LearningObjective,
  CurriculumVersion,
} from '@/types/domain';

export const CurriculumExplorerPage: React.FC = () => {
  const [activeVersion, setActiveVersion] = useState<CurriculumVersion | null>(null);
  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<CurriculumSubject | null>(null);

  const [stages, setStages] = useState<CurriculumStage[]>([]);
  const [selectedStage, setSelectedStage] = useState<CurriculumStage | null>(null);

  const [strands, setStrands] = useState<Array<CurriculumStrand & { subStrands: CurriculumSubStrand[] }>>([]);
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStrands, setExpandedStrands] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 1. Initial Load: Frameworks & Default Cambridge Primary Version
  useEffect(() => {
    async function initCatalog() {
      try {
        setIsLoading(true);
        const fws = await curriculumService.getFrameworks();

        const cambridge = fws.find((f) => f.code === 'CAMBRIDGE_PRIMARY') ?? fws[0];
        if (cambridge) {
          const vers = await curriculumService.getVersions(cambridge.id);
          const currentVer = vers.find((v) => v.isCurrent) ?? vers[0];
          if (currentVer) {
            setActiveVersion(currentVer);

            const [subjs, stgs] = await Promise.all([
              curriculumService.getSubjects(currentVer.id),
              curriculumService.getStages(currentVer.id),
            ]);

            setSubjects(subjs);
            setStages(stgs);

            const math = subjs.find((s) => s.code === 'MATH') ?? subjs[0];
            setSelectedSubject(math ?? null);

            const stage5 = stgs.find((s) => s.stageNumber === 5) ?? stgs[0];
            setSelectedStage(stage5 ?? null);
          }
        }
      } catch (err: any) {
        setLoadError(err?.message ?? 'Failed to load curriculum catalog.');
      } finally {
        setIsLoading(false);
      }
    }

    initCatalog();
  }, []);

  // 2. When Subject or Stage Changes, Load Strands and Objectives
  useEffect(() => {
    if (!activeVersion || !selectedSubject) return;

    async function loadHierarchy() {
      try {
        const [strndData, objData] = await Promise.all([
          curriculumService.getStrands(activeVersion!.id, selectedSubject!.id),
          curriculumService.getObjectives({
            versionId: activeVersion!.id,
            subjectId: selectedSubject!.id,
            stageId: selectedStage?.id,
            search: searchQuery.trim() || undefined,
          }),
        ]);

        setStrands(strndData);
        setObjectives(objData);

        // Auto-expand all strands initially
        const expanded: Record<string, boolean> = {};
        strndData.forEach((s) => {
          expanded[s.id] = true;
        });
        setExpandedStrands(expanded);
      } catch (err: any) {
        console.warn('Failed to load strands/objectives:', err);
      }
    }

    loadHierarchy();
  }, [activeVersion, selectedSubject, selectedStage, searchQuery]);

  const toggleStrand = (strandId: string) => {
    setExpandedStrands((prev) => ({
      ...prev,
      [strandId]: !prev[strandId],
    }));
  };

  if (isLoading) {
    return <LoadingState label="Loading Curriculum Explorer..." />;
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-xs text-red-600">
          {loadError}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
              Institutional Standards
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
              {activeVersion?.versionCode ?? '2026.1'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
              Demonstration Fixture
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Curriculum Explorer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Official learning objectives, progression strands, and prerequisites for Cambridge Primary.
          </p>
        </div>
      </div>

      {/* 1. Subject Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar border-b border-slate-200">
        {subjects.map((sub) => {
          const isSelected = selectedSubject?.id === sub.id;
          return (
            <button
              key={sub.id}
              onClick={() => setSelectedSubject(sub)}
              className={`px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all whitespace-nowrap flex items-center gap-2 border-b-2 ${
                isSelected
                  ? 'border-brand-teal text-brand-teal bg-teal-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{sub.name}</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-200 text-slate-700">
                {sub.code}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. Stage Selector & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
          <span className="text-xs font-semibold text-slate-400 pr-1 flex items-center gap-1">
            <GraduationCap className="w-3.5 h-3.5" /> Stage:
          </span>
          <button
            onClick={() => setSelectedStage(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedStage === null
                ? 'bg-brand-teal text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Stages
          </button>
          {stages.map((st) => {
            const isSelected = selectedStage?.id === st.id;
            return (
              <button
                key={st.id}
                onClick={() => setSelectedStage(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-brand-teal text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st.name}
              </button>
            );
          })}
        </div>

        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search objectives, codes..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-slate-50/50"
          />
        </div>
      </div>

      {/* 3. Strands & Objectives Accordion */}
      <div className="space-y-4">
        {strands.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-xs text-slate-400">
              No strands found for the selected filters.
            </CardContent>
          </Card>
        ) : (
          strands.map((strand) => {
            const isExpanded = expandedStrands[strand.id] ?? false;
            const strandObjectives = objectives.filter((o) => o.strandId === strand.id);
            const hasSubStrands = (strand.subStrands?.length ?? 0) > 0;

            return (
              <Card key={strand.id} className="overflow-hidden border-slate-200/80">
                {/* Strand Header */}
                <div
                  onClick={() => toggleStrand(strand.id)}
                  className="px-5 py-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between transition-colors border-b border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1 rounded-lg bg-white border border-slate-200 text-slate-600">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 font-mono text-xs font-bold rounded-md bg-teal-100 text-teal-800 border border-teal-200">
                          {strand.code}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{strand.name}</h3>
                      </div>
                      {strand.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{strand.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-full border border-slate-200">
                      {strandObjectives.length} {strandObjectives.length === 1 ? 'objective' : 'objectives'}
                    </span>
                  </div>
                </div>

                {/* Strand Content (Supports both 3-level and 2-level depth per Guardrail H) */}
                {isExpanded && (
                  <div className="p-4 space-y-4 bg-white">
                    {hasSubStrands ? (
                      // 3-Level Depth (Mathematics, English, Science)
                      <div className="space-y-4">
                        {strand.subStrands.map((subStrand) => {
                          const subObjectives = strandObjectives.filter((o) => o.subStrandId === subStrand.id);
                          if (subObjectives.length === 0 && searchQuery) return null;

                          return (
                            <div key={subStrand.id} className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5 space-y-2.5">
                              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200/60">
                                <span className="px-1.5 py-0.2 font-mono text-[10px] font-bold rounded bg-slate-200 text-slate-700">
                                  {subStrand.code}
                                </span>
                                <h4 className="text-xs font-bold text-slate-800">{subStrand.name}</h4>
                              </div>

                              <div className="space-y-2">
                                {subObjectives.map((obj) => (
                                  <ObjectiveCard key={obj.id} objective={obj} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // 2-Level Depth (Global Perspectives, Computing) — No synthetic sub-strands!
                      <div className="space-y-2">
                        {strandObjectives.map((obj) => (
                          <ObjectiveCard key={obj.id} objective={obj} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

interface ObjectiveCardProps {
  objective: LearningObjective;
}

const ObjectiveCard: React.FC<ObjectiveCardProps> = ({ objective }) => {
  return (
    <div className="p-3 bg-white rounded-xl border border-slate-200/70 hover:border-teal-200 hover:shadow-xs transition-all space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 font-mono text-xs font-bold rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
            {objective.code}
          </span>
          <h5 className="text-xs font-bold text-slate-900">{objective.title}</h5>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {objective.isAuthoritative ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
              Authoritative
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
              Demo Fixture
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">{objective.description}</p>
    </div>
  );
};
