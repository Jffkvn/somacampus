import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Eye,
  Sparkles,
  CheckCircle2,
  Plus,
  X,
  User,
  Printer,
} from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AcademicResource, SEED_ACADEMIC_RESOURCES } from './academicResources';
import { resourceLibraryService } from './resourceLibraryService';

export type { AcademicResource };

export const ResourceLibraryPage: React.FC = () => {
  const { schoolId } = useAuth();
  const effectiveSchoolId = schoolId || '22222222-2222-2222-2222-222222222222';

  const [resources, setResources] = useState<AcademicResource[]>(SEED_ACADEMIC_RESOURCES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedApproval, setSelectedApproval] = useState<string>('all');

  useEffect(() => {
    let isCancelled = false;
    resourceLibraryService
      .getResources(effectiveSchoolId)
      .then((dbList) => {
        if (!isCancelled && dbList.length > 0) {
          setResources(dbList);
        }
      })
      .catch((err) => {
        console.warn('Live school resources load fallback:', err);
      });
    return () => {
      isCancelled = true;
    };
  }, [effectiveSchoolId]);

  // Preview & Create Modals
  const [activePreview, setActivePreview] = useState<AcademicResource | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adaptSuccessMsg, setAdaptSuccessMsg] = useState<string | null>(null);

  // New Resource Form
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('Mathematics');
  const [newStage, setNewStage] = useState('Stage 5');
  const [newType, setNewType] = useState<'worksheet' | 'lesson_plan' | 'quiz' | 'lab_guide' | 'revision'>('worksheet');
  const [newTopic, setNewTopic] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [newContent, setNewContent] = useState('');

  const filteredResources = useMemo(() => {
    return resources.filter((res) => {
      if (selectedSubject !== 'all' && res.subject !== selectedSubject) return false;
      if (selectedStage !== 'all' && res.stageLevel !== selectedStage) return false;
      if (selectedType !== 'all' && res.type !== selectedType) return false;
      if (selectedApproval !== 'all' && res.approvalState !== selectedApproval) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = res.title.toLowerCase().includes(q);
        const matchTopic = res.topic.toLowerCase().includes(q);
        const matchObj = res.curriculumObjective.toLowerCase().includes(q);
        const matchTag = res.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchTitle && !matchTopic && !matchObj && !matchTag) return false;
      }
      return true;
    });
  }, [resources, selectedSubject, selectedStage, selectedType, selectedApproval, searchQuery]);

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const objCode = newObjective.trim().split(':')[0] || '5Nn.01';
    const objText = newObjective.trim().split(':')[1]?.trim() || newObjective.trim() || 'Cambridge Primary standard';

    try {
      const created = await resourceLibraryService.createResource({
        schoolId: effectiveSchoolId,
        title: newTitle.trim(),
        type: newType,
        subject: newSubject,
        stageLevel: newStage,
        topic: newTopic.trim() || 'General Curriculum',
        curriculumObjectiveCode: objCode,
        curriculumObjectiveText: objText,
        approvalState: 'teacher_approved',
        authorName: 'Current Teacher',
        previewText: newContent.trim() || 'Teacher-submitted pedagogical material ready for classroom instruction.',
        tags: ['newly-added', newSubject.toLowerCase(), newType],
      });
      setResources((prev) => [created, ...prev]);
    } catch {
      const fallback: AcademicResource = {
        id: `res-${Date.now()}`,
        title: newTitle.trim(),
        type: newType,
        subject: newSubject,
        stageLevel: newStage,
        topic: newTopic.trim() || 'General Curriculum',
        curriculumObjective: newObjective.trim() || 'Aligned to Cambridge Primary Learning Objectives',
        approvalState: 'teacher_approved',
        author: 'You (Current Teacher)',
        createdAt: new Date().toISOString().slice(0, 10),
        usageCount: 1,
        rating: 5.0,
        previewText: newContent.trim() || 'Teacher-submitted pedagogical material ready for classroom instruction.',
        tags: ['newly-added', newSubject.toLowerCase(), newType],
      };
      setResources((prev) => [fallback, ...prev]);
    }

    setShowCreateModal(false);
    setNewTitle('');
    setNewTopic('');
    setNewObjective('');
    setNewContent('');
  };

  const handleAdaptResource = (res: AcademicResource) => {
    const adapted: AcademicResource = {
      ...res,
      id: `res-${Date.now()}`,
      title: `${res.title} (Adapted Copy)`,
      author: 'You (Adapted)',
      approvalState: 'draft',
      createdAt: new Date().toISOString().slice(0, 10),
      usageCount: 0,
    };
    setResources([adapted, ...resources]);
    setActivePreview(null);
    setAdaptSuccessMsg(`Adapted copy created: "${adapted.title}". Ready in your draft teaching resources.`);
    setTimeout(() => setAdaptSuccessMsg(null), 5000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
              Curriculum & Teaching Asset Engine
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Cambridge Primary Aligned
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2.5">
            <BookOpen className="w-7 h-7 text-brand-teal" />
            Approved Resource Library
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Search before generation: discover, preview, adapt, and reuse validated curriculum materials across teaching teams.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Submit Resource
          </Button>
        </div>
      </div>

      {/* Success Banner */}
      {adaptSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{adaptSuccessMsg}</span>
          </div>
          <button onClick={() => setAdaptSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <Card className="shadow-xs border-slate-200">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search resources by title, topic, curriculum objective, or keyword..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Subject */}
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs focus:ring-2 focus:ring-brand-teal focus:outline-none"
              >
                <option value="all">All Subjects</option>
                <option value="Mathematics">Mathematics</option>
                <option value="English">English</option>
                <option value="Science">Science</option>
                <option value="Social Studies">Social Studies</option>
              </select>

              {/* Stage Level */}
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs focus:ring-2 focus:ring-brand-teal focus:outline-none"
              >
                <option value="all">All Stages</option>
                <option value="Stage 4">Stage 4</option>
                <option value="Stage 5">Stage 5</option>
                <option value="Stage 6">Stage 6</option>
                <option value="Stage 7">Stage 7</option>
              </select>

              {/* Resource Type */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs focus:ring-2 focus:ring-brand-teal focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="worksheet">Worksheets</option>
                <option value="lesson_plan">Lesson Plans</option>
                <option value="quiz">Diagnostic Quizzes</option>
                <option value="lab_guide">Lab Guides</option>
                <option value="revision">Revision Cards</option>
              </select>

              {/* Approval Filter */}
              <select
                value={selectedApproval}
                onChange={(e) => setSelectedApproval(e.target.value)}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs focus:ring-2 focus:ring-brand-teal focus:outline-none"
              >
                <option value="all">All States</option>
                <option value="school_approved">School Approved</option>
                <option value="teacher_approved">Teacher Approved</option>
                <option value="draft">Drafts</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>
              Showing <strong className="text-slate-800">{filteredResources.length}</strong> validated curriculum resources
            </span>
            {(searchQuery || selectedSubject !== 'all' || selectedStage !== 'all' || selectedType !== 'all' || selectedApproval !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSubject('all');
                  setSelectedStage('all');
                  setSelectedType('all');
                  setSelectedApproval('all');
                }}
                className="text-brand-teal font-bold hover:underline"
              >
                Reset Filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resources Grid */}
      {filteredResources.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No resources match your filters</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try broadening your search keywords or resetting the subject and stage filters above.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {filteredResources.map((res) => {
            const isSchoolApproved = res.approvalState === 'school_approved';
            const isTeacherApproved = res.approvalState === 'teacher_approved';

            return (
              <Card
                key={res.id}
                className="h-full flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition-all duration-200 group border-slate-200/80 bg-white"
              >
                <div className="p-5 pb-0 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700">
                      {res.type.replace('_', ' ')}
                    </span>
                    <StatusPill
                      status={isSchoolApproved ? 'success' : isTeacherApproved ? 'info' : 'neutral'}
                      label={
                        isSchoolApproved
                          ? 'School Approved'
                          : isTeacherApproved
                          ? 'Teacher Verified'
                          : 'Draft'
                      }
                    />
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900 group-hover:text-brand-teal transition-colors line-clamp-2 leading-snug">
                      {res.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-slate-500 font-medium">
                      <span className="font-bold text-slate-700">{res.subject}</span>
                      <span>•</span>
                      <span>{res.stageLevel}</span>
                      <span>•</span>
                      <span className="truncate max-w-[140px]">{res.topic}</span>
                    </div>
                  </div>
                </div>

                <CardContent className="space-y-3 p-5 pt-3 text-xs flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <p className="text-slate-600 line-clamp-3 leading-relaxed text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {res.previewText}
                    </p>

                    <div className="p-2.5 rounded-lg bg-sky-50/50 border border-sky-100/80 text-[10px] text-sky-900 font-medium space-y-1">
                      <span className="font-bold block text-sky-950 uppercase tracking-wider">Learning Objective:</span>
                      <p className="line-clamp-2 leading-normal">{res.curriculumObjective}</p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {res.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-[120px] font-medium text-slate-600">{res.author}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 font-semibold">
                        <span>{res.usageCount} uses</span>
                        <span>★ {res.rating.toFixed(1)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActivePreview(res)}
                        className="w-full text-xs font-bold"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAdaptResource(res)}
                        className="w-full text-xs font-bold text-brand-teal"
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                        Reuse & Adapt
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* RESOURCE PREVIEW MODAL                                                    */}
      {/* ========================================================================= */}
      {activePreview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                    {activePreview.type.replace('_', ' ')}
                  </span>
                  <StatusPill
                    status={
                      activePreview.approvalState === 'school_approved'
                        ? 'success'
                        : activePreview.approvalState === 'teacher_approved'
                        ? 'info'
                        : 'neutral'
                    }
                    label={
                      activePreview.approvalState === 'school_approved'
                        ? 'School Approved'
                        : activePreview.approvalState === 'teacher_approved'
                        ? 'Teacher Verified'
                        : 'Draft'
                    }
                  />
                </div>
                <h3 className="text-lg font-black text-slate-900">{activePreview.title}</h3>
                <p className="text-xs text-slate-500">
                  {activePreview.subject} • {activePreview.stageLevel} • {activePreview.topic}
                </p>
              </div>
              <button
                onClick={() => setActivePreview(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 space-y-1">
                <span className="font-extrabold text-[11px] text-sky-950 uppercase tracking-wider block">
                  Curriculum Framework Learning Objective
                </span>
                <p className="text-sky-900 leading-relaxed">{activePreview.curriculumObjective}</p>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-800 block text-xs">Asset Summary & Pedagogical Application</span>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 leading-relaxed font-mono text-[11px] whitespace-pre-line">
                  {activePreview.previewText}
                  {'\n\n'}
                  [Detailed instructional packet, worksheets, answer keys, and student differentiation activities included in master printable artifact.]
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Author</span>
                  <strong className="text-xs text-slate-800">{activePreview.author}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Usage in School</span>
                  <strong className="text-xs text-slate-800">{activePreview.usageCount} classroom lessons</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Teacher Rating</span>
                  <strong className="text-xs text-emerald-700">★ {activePreview.rating.toFixed(1)} / 5.0</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="text-xs font-bold"
              >
                <Printer className="w-3.5 h-3.5 mr-1" />
                Print / Save PDF
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setActivePreview(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleAdaptResource(activePreview)}
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Adapt for My Class
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREATE / SUBMIT RESOURCE MODAL                                            */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateResource}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-teal" />
                Submit Teaching Resource
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Resource Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Fractions & Decimal Conversion Master Worksheet"
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-brand-teal focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Subject</label>
                  <select
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-brand-teal focus:outline-none font-medium"
                  >
                    <option value="Mathematics">Mathematics</option>
                    <option value="English">English</option>
                    <option value="Science">Science</option>
                    <option value="Social Studies">Social Studies</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Stage Level</label>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-brand-teal focus:outline-none font-medium"
                  >
                    <option value="Stage 4">Stage 4</option>
                    <option value="Stage 5">Stage 5</option>
                    <option value="Stage 6">Stage 6</option>
                    <option value="Stage 7">Stage 7</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Resource Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-brand-teal focus:outline-none font-medium"
                  >
                    <option value="worksheet">Worksheet</option>
                    <option value="lesson_plan">Lesson Plan</option>
                    <option value="quiz">Diagnostic Quiz</option>
                    <option value="lab_guide">Lab Guide</option>
                    <option value="revision">Revision Cards</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Topic</label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="e.g. Fractions, Cell Biology"
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-brand-teal focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Curriculum Objective Code & Description</label>
                <input
                  type="text"
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  placeholder="e.g. 5Nn.03: Convert improper fractions to mixed numbers"
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-brand-teal focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Content Overview & Instructions</label>
                <textarea
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Describe the activity, question sequences, instructions for pupils, and teacher notes..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-brand-teal focus:outline-none font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!newTitle.trim()}>
                Save to Library
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
