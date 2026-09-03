import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState } from '@/components/ui/LoadingState';
import { academicPlanningService } from './academicPlanningService';
import type { SchemeOfWork, MediumTermPlan, TeachingSequence, LearningObjective } from '@/types/domain';

export const SchemeDetailPage: React.FC = () => {
  const { schemeId } = useParams<{ schemeId: string }>();
  const [data, setData] = useState<{
    scheme: SchemeOfWork;
    units: Array<MediumTermPlan & { sequences: Array<TeachingSequence & { objectives: LearningObjective[] }> }>;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadScheme() {
      if (!schemeId) return;
      try {
        setIsLoading(true);
        const result = await academicPlanningService.getSchemeById(schemeId);
        if (!result) throw new Error('Scheme of work not found.');
        setData(result);
      } catch (err: any) {
        setLoadError(err?.message ?? 'Failed to load scheme details.');
      } finally {
        setIsLoading(false);
      }
    }

    loadScheme();
  }, [schemeId]);

  if (isLoading) {
    return <LoadingState label="Loading scheme roadmap..." />;
  }

  if (loadError || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-xs text-slate-500 space-y-3">
          <p>{loadError ?? 'Scheme of work unavailable.'}</p>
          <Link to="/planning/schemes" className="text-brand-teal font-bold hover:underline">
            &larr; Back to Schemes of Work
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { scheme, units } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Back Link */}
      <div>
        <Link
          to="/planning/schemes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-teal transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Schemes of Work</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
                Cambridge Primary
              </span>
              <StatusPill status="success" label={scheme.status} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
              {scheme.title}
            </h1>
            {scheme.overviewText && (
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
                {scheme.overviewText}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Units & Teaching Sequences Roadmap */}
      <div className="space-y-6">
        {units.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-xs text-slate-400">
              No medium-term units planned yet in this scheme of work.
            </CardContent>
          </Card>
        ) : (
          units.map((unit) => (
            <Card key={unit.id} className="overflow-hidden border-slate-200 shadow-sm">
              {/* Unit Header */}
              <div className="bg-slate-50/90 px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                      Unit {unit.unitNumber} &bull; Weeks {unit.weekStart}–{unit.weekEnd}
                    </span>
                    <span className="text-xs text-slate-400">
                      {unit.estimatedPeriods ? `${unit.estimatedPeriods} periods` : ''}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{unit.title}</h3>
                  {unit.learningFocus && (
                    <p className="text-xs text-slate-500 pt-0.5">{unit.learningFocus}</p>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-semibold self-start sm:self-auto">
                  {unit.sequences.length} {unit.sequences.length === 1 ? 'sequence' : 'sequences'}
                </div>
              </div>

              {/* Sequences List */}
              <CardContent className="p-0 divide-y divide-slate-100">
                {unit.sequences.map((seq, sIdx) => {
                  const primaryObj = seq.objectives[0];
                  return (
                    <div
                      key={seq.id}
                      className="p-4 sm:px-6 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                          {seq.sequenceNumber}
                        </div>
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                              {seq.title}
                            </h4>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                              <Clock className="w-3 h-3" /> {seq.recommendedDurationMins}m
                            </span>
                          </div>

                          {seq.suggestedActivities && (
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {seq.suggestedActivities}
                            </p>
                          )}

                          {/* Linked Cambridge Learning Objective */}
                          {primaryObj ? (
                            <div className="pt-2 flex items-start gap-2">
                              <span className="px-2 py-0.5 font-mono text-[11px] font-bold rounded-lg bg-teal-50 text-teal-800 border border-teal-200 shrink-0">
                                {primaryObj.code}
                              </span>
                              <div className="text-xs text-slate-700">
                                <span className="font-semibold">{primaryObj.title}</span> &bull;{' '}
                                <span className="text-slate-500">{primaryObj.description}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 italic">
                              No learning objective mapped yet.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 self-end sm:self-center">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                          {sIdx === 0 ? 'Current Planned' : 'Upcoming'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
