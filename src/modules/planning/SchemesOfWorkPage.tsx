import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Plus,
  Layers,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadingState } from '@/components/ui/LoadingState';
import { academicPlanningService } from './academicPlanningService';
import { supabase } from '@/lib/supabase';
import type { SchemeOfWork } from '@/types/domain';

export const SchemesOfWorkPage: React.FC = () => {
  const [schemes, setSchemes] = useState<SchemeOfWork[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string>('');

  // Form states for modal
  const [newTitle, setNewTitle] = useState('');
  const [newClassId, setNewClassId] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newOverview, setNewOverview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        // 1. Resolve school ID from current school
        const { data: schools } = await supabase.from('schools').select('id').limit(1);
        const sId = schools?.[0]?.id ?? '';
        setSchoolId(sId);

        if (sId) {
          const [schList, clsList, subList] = await Promise.all([
            academicPlanningService.getSchemesOfWork(sId),
            supabase.from('classes').select('id, name').eq('school_id', sId).order('name'),
            supabase.from('subjects').select('id, name, code').eq('school_id', sId).order('name'),
          ]);

          setSchemes(schList);
          setClasses(clsList.data ?? []);
          setSubjects(subList.data ?? []);

          if (clsList.data?.[0]) setNewClassId(clsList.data[0].id);
          if (subList.data?.[0]) setNewSubjectId(subList.data[0].id);
        }
      } catch (err: any) {
        console.warn('Failed to load schemes of work:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const handleCreateScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newClassId || !newSubjectId) {
      setSubmitError('Title, class, and subject are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // Resolve academic year, term, and stage
      const [yearRes, termRes, stageRes, empRes] = await Promise.all([
        supabase.from('academic_years').select('id').eq('school_id', schoolId).limit(1).single(),
        supabase.from('terms').select('id').limit(1).single(),
        supabase.from('curriculum_stages').select('id').eq('stage_number', 5).limit(1).maybeSingle(),
        supabase.from('employees').select('id').limit(1).maybeSingle(),
      ]);

      const stageId = stageRes.data?.id;
      if (!stageId) throw new Error('Stage 5 curriculum standard not found.');

      const newScheme = await academicPlanningService.createSchemeOfWork({
        schoolId,
        academicYearId: yearRes.data!.id,
        termId: termRes.data!.id,
        classId: newClassId,
        subjectId: newSubjectId,
        stageId,
        createdByEmployeeId: empRes.data?.id ?? '00000000-0000-0000-0000-000000000000',
        title: newTitle,
        overviewText: newOverview.trim() || undefined,
      });

      // Also create a starter Medium-Term Unit 1 & Teaching Sequence
      const unit = await academicPlanningService.createMediumTermPlan({
        schemeId: newScheme.id,
        unitNumber: 1,
        title: 'Unit 1: Number & Calculating Foundations',
        weekStart: 1,
        weekEnd: 3,
        learningFocus: 'Developing conceptual understanding of fraction equivalence and place value.',
        estimatedPeriods: 12,
      });

      // Resolve objective 5Nn.01 to link to sequence
      const { data: obj } = await supabase
        .from('learning_objectives')
        .select('id')
        .eq('code', '5Nn.01')
        .maybeSingle();

      await academicPlanningService.createTeachingSequence({
        mediumTermPlanId: unit.id,
        sequenceNumber: 1,
        title: 'Lesson 1: Visualizing Equivalent Fractions with Bar Models',
        suggestedActivities: 'Use fraction strips and bar models to demonstrate 1/2 = 2/4 = 4/8.',
        recommendedDurationMins: 45,
        objectiveIds: obj?.id ? [obj.id] : [],
      });

      setSchemes((prev) => [newScheme, ...prev]);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewOverview('');
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to create scheme of work.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSchemes = schemes.filter((s) => {
    if (selectedClassId !== 'all' && s.classId !== selectedClassId) return false;
    if (selectedSubjectId !== 'all' && s.subjectId !== selectedSubjectId) return false;
    return true;
  });

  if (isLoading) {
    return <LoadingState label="Loading schemes of work..." />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
              Academic Planning
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
              Term Planning
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Schemes of Work
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Term-long curriculum roadmaps, medium-term units, and teaching sequences.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-brand-teal hover:bg-teal-800 text-white self-start sm:self-auto flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Scheme of Work</span>
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-600">Filter by:</span>
        </div>

        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          <option value="all">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedSubjectId}
          onChange={(e) => setSelectedSubjectId(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          <option value="all">All Subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>

        <div className="ml-auto text-slate-400 font-medium">
          Showing {filteredSchemes.length} {filteredSchemes.length === 1 ? 'scheme' : 'schemes'}
        </div>
      </div>

      {/* Schemes Grid */}
      {filteredSchemes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-xs text-slate-400 space-y-3">
            <p>No schemes of work found for the selected criteria.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="border-teal-200 text-teal-800"
            >
              + Create First Scheme of Work
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSchemes.map((scheme) => {
            const cls = classes.find((c) => c.id === scheme.classId);
            const subj = subjects.find((s) => s.id === scheme.subjectId);

            return (
              <Card key={scheme.id} className="hover:border-teal-300 transition-all hover:shadow-xs">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
                        {subj?.code ?? 'SUBJECT'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-slate-100 text-slate-700">
                        {cls?.name ?? 'Class'}
                      </span>
                    </div>
                    <CardTitle className="text-base font-bold text-slate-900 mt-1">
                      {scheme.title}
                    </CardTitle>
                  </div>
                  <StatusPill status="success" label={scheme.status} />
                </CardHeader>

                <CardContent className="space-y-3 pt-1">
                  {scheme.overviewText && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {scheme.overviewText}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium">
                      <Layers className="w-3.5 h-3.5 text-slate-400" /> Cambridge Stage 5
                    </span>
                    <Link
                      to={`/planning/schemes/${scheme.id}`}
                      className="text-brand-teal font-bold hover:underline flex items-center gap-1"
                    >
                      <span>View Units &amp; Lessons</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Scheme Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-teal" />
                <h3 className="text-sm font-bold text-slate-900">New Scheme of Work</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateScheme} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Scheme Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Stage 5 Mathematics — Term 1 Curriculum Plan"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Class / Stage</label>
                  <select
                    value={newClassId}
                    onChange={(e) => setNewClassId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500/20 outline-none"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Subject</label>
                  <select
                    value={newSubjectId}
                    onChange={(e) => setNewSubjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500/20 outline-none"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Overview &amp; Rationale</label>
                <textarea
                  value={newOverview}
                  onChange={(e) => setNewOverview(e.target.value)}
                  placeholder="Describe key learning intentions, major units, and progression targets..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 outline-none"
                />
              </div>

              {submitError && (
                <p className="text-red-600 font-semibold">{submitError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                  className="bg-brand-teal text-white"
                >
                  Create Scheme
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
