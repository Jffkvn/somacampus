import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import { studentService, StudentDossier } from './studentService';
import { learningIntelligenceService } from '../intelligence/learningIntelligenceService';
import { InterventionModal } from '../intelligence/InterventionModal';
import { StudentEditModal } from './StudentEditModal';
import { StudentTransferModal } from './StudentTransferModal';
import { StudentWithdrawModal } from './StudentWithdrawModal';
import { StudentMedicalEditModal } from './StudentMedicalEditModal';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  ArrowLeft,
  GraduationCap,
  UserX,
  Sparkles,
  Clock,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  HeartPulse,
  Users,
  Calendar,
  FileText,
  DollarSign,
  Edit,
  ArrowRightLeft,
  UserMinus,
  Printer,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import type {
  StudentLongitudinalProfile,
  InterventionOutcome,
} from '../../types/domain';

type DossierTab =
  | 'personal'
  | 'enrolment'
  | 'guardians'
  | 'health'
  | 'documents'
  | 'academics'
  | 'finance';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const StudentDetailPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { role, schoolId } = useAuth();
  const activeSchoolId = schoolId || PILOT_SCHOOL_ID;

  const [activeTab, setActiveTab] = useState<DossierTab>('personal');
  const [dossier, setDossier] = useState<StudentDossier | null>(null);
  const [profile, setProfile] = useState<StudentLongitudinalProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isMedicalModalOpen, setIsMedicalModalOpen] = useState(false);

  // Intervention Modal state
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [prefilledReason, setPrefilledReason] = useState<string>('');
  const [expandedPatternIdx, setExpandedPatternIdx] = useState<number | null>(null);
  const [resolvingInterventionId, setResolvingInterventionId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<InterventionOutcome>('improved');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'formal' | 'diagnostic' | 'observation'>('all');

  const canManage = role === 'admin' || role === 'principal';
  const canViewFinance = role === 'admin' || role === 'principal' || role === 'bursar';
  // Batch A Task 2 — office + emergency-only: guardian tel:/wa.me/mail/address
  // render only for office roles (admin/principal, derived from useAuth role).
  // Emergency contacts below always render tel: for every role.
  const canViewGuardianContact = canManage;

  const loadData = async () => {
    if (!studentId) {
      setError('No student selected.');
      setIsLoading(false);
      return;
    }
    const effectiveStudentId = studentId === 's1' ? '22222222-0000-0000-0000-000000000001' : studentId;
    try {
      setIsLoading(true);
      setError(null);

      // Load both Dossier and Academic Learning Intelligence in parallel
      const [dossierRes, profileRes] = await Promise.all([
        studentService.getStudentDossier(effectiveStudentId, activeSchoolId, role),
        learningIntelligenceService.getLongitudinalProfile(effectiveStudentId).catch(() => null),
      ]);

      if (!dossierRes && !profileRes) {
        setError('not-found');
        setDossier(null);
        setProfile(null);
      } else {
        setDossier(dossierRes);
        setProfile(profileRes);
      }
    } catch (err) {
      console.error('Failed to load student dossier', err);
      setError('Failed to load this student profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, role, activeSchoolId]);

  if (isLoading) {
    return <LoadingState label="Loading comprehensive student dossier..." />;
  }

  if (error || (!dossier && !profile)) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Link
          to="/students"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:text-brand-tealDark"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Student Directory</span>
        </Link>
        <EmptyState
          icon={UserX}
          title="Student profile not found"
          description={
            error === 'not-found'
              ? 'No student record matches this profile. It may have been withdrawn or the link is incorrect.'
              : (error ?? 'No student record matches this profile.')
          }
          actionLabel="Back to directory"
          onAction={() => navigate('/students')}
        />
      </div>
    );
  }

  // Fallback defaults if one object failed
  const studentFullName = dossier?.personal.fullName || profile?.fullName || 'Student';
  const admissionNum = dossier?.admissionNumber || profile?.admissionNumber || '—';
  const currentClassLabel = dossier?.currentClass || profile?.className || '—';
  const studentStatus = dossier?.status || 'active';
  const medicalAlertAllergies = dossier?.medical.allergies;

  // Academics helpers
  const availableEvidenceForModal = (profile?.evidenceTimeline || []).map((item) => ({
    type: item.provenanceType,
    id: item.provenanceId,
    title: item.title,
    date: item.date,
  }));

  const handleResolveIntervention = async (interventionId: string) => {
    try {
      await learningIntelligenceService.recordInterventionOutcome(
        interventionId,
        selectedOutcome,
        outcomeNotes.trim() || 'Evaluated against subsequent classroom evidence.'
      );
      setResolvingInterventionId(null);
      setOutcomeNotes('');
      await loadData();
    } catch (err: any) {
      alert(`Could not record outcome: ${err?.message || 'Error'}`);
    }
  };

  const filteredTimeline = (profile?.evidenceTimeline || []).filter((item) => {
    if (timelineFilter === 'formal') return item.type === 'formal_assessment';
    if (timelineFilter === 'diagnostic') return item.type === 'diagnostic_work';
    if (timelineFilter === 'observation') return item.type === 'teacher_observation';
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Print-Only Header */}
      <div className="hidden print:block mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">
              SomaCampus — Official Student Dossier
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Academic Record &bull; Student Dossier &bull; Confidential
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Printed: {new Date().toLocaleDateString()}</p>
            <p>Status: <strong className="uppercase text-slate-800">{studentStatus}</strong></p>
          </div>
        </div>
      </div>

      {/* Screen Navigation */}
      <div className="print:hidden">
        <Link
          to="/students"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:text-brand-tealDark"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Student Directory</span>
        </Link>
      </div>

      {/* Header Profile Identity & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
            <GraduationCap className="w-8 h-8 text-brand-teal" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {studentFullName}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  studentStatus === 'active'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : studentStatus === 'graduated'
                    ? 'bg-sky-100 text-sky-800 border border-sky-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}
              >
                {studentStatus}
              </span>

              {/* High-visibility Medical Alert Pill */}
              {medicalAlertAllergies && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold shadow-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>Medical Alert: {medicalAlertAllergies}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
              <span>
                Admission No: <strong className="text-slate-800 font-mono">{admissionNum}</strong>
              </span>
              <span>&bull;</span>
              <span>
                Class / Stream: <strong className="text-slate-800">{currentClassLabel}</strong>
              </span>
              {dossier?.personal.gender && (
                <>
                  <span>&bull;</span>
                  <span>Gender: <strong className="text-slate-800 capitalize">{dossier.personal.gender}</strong></span>
                </>
              )}
              {dossier?.personal.dateOfBirth && (
                <>
                  <span>&bull;</span>
                  <span>DOB: <strong className="text-slate-800">{dossier.personal.dateOfBirth}</strong></span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons (Screen Only) */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {canManage && dossier && (
            <>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
              >
                <Edit className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit Profile</span>
              </button>
              <button
                onClick={() => setIsTransferModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-brand-teal" />
                <span>Transfer Class</span>
              </button>
              <button
                onClick={() => setIsWithdrawModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-rose-700 hover:bg-rose-50 shadow-2xs transition-all"
              >
                <UserMinus className="w-3.5 h-3.5 text-rose-500" />
                <span>Withdraw / Exit</span>
              </button>
            </>
          )}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Dossier</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation (Screen Only) */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto print:hidden">
        <button
          onClick={() => setActiveTab('personal')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === 'personal'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Personal &amp; Contact</span>
        </button>
        <button
          onClick={() => setActiveTab('enrolment')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === 'enrolment'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Enrolment History ({dossier?.enrolmentHistory.length || 1})</span>
        </button>
        <button
          onClick={() => setActiveTab('guardians')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === 'guardians'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Guardians &amp; Emergency ({dossier?.guardians.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === 'health'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HeartPulse className="w-3.5 h-3.5" />
          <span>Health &amp; Care</span>
          {medicalAlertAllergies && (
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === 'documents'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Documents ({dossier?.documents.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('academics')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeTab === 'academics'
              ? 'border-brand-teal text-brand-teal'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Learning Evidence</span>
        </button>
        {canViewFinance && (
          <button
            onClick={() => setActiveTab('finance')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'finance'
                ? 'border-brand-teal text-brand-teal'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Finance &amp; Fees</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PERSONAL & CONTACT */}
      {/* ========================================================================= */}
      {(activeTab === 'personal' || typeof window !== 'undefined') && (
        <div
          data-testid="student-tab-panel-personal"
          className={activeTab === 'personal' ? 'space-y-6' : 'hidden print:block space-y-6'}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900">
                  Learner Identification &amp; Demographics
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Legal Name</span>
                  <span className="font-bold text-slate-900">{studentFullName} (Pupil)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Admission Number</span>
                  <span className="font-mono font-bold text-slate-900">{admissionNum}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Date of Birth</span>
                  <span className="font-semibold text-slate-900">{dossier?.personal.dateOfBirth || '—'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Gender</span>
                  <span className="font-semibold text-slate-900 capitalize">{dossier?.personal.gender || '—'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Nationality</span>
                  <span className="font-semibold text-slate-900">{dossier?.personal.nationality || 'Ugandan'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">National ID / LIN</span>
                  <span className="font-mono text-slate-900">{dossier?.personal.nationalId || '—'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5">
                  <span className="text-slate-500">Residential Address</span>
                  <span className="font-semibold text-slate-900">{dossier?.personal.address || '—'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900">
                  Academic Placement Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Current Class &amp; Stream</span>
                  <span className="font-bold text-brand-teal">{currentClassLabel}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Enrolment Status</span>
                  <span className="font-bold uppercase text-slate-800">{studentStatus}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Record Created</span>
                  <span className="text-slate-700">
                    {dossier?.createdAt ? new Date(dossier.createdAt).toLocaleDateString() : '—'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs py-1.5">
                  <span className="text-slate-500">Attendance Aggregate</span>
                  <span className="font-bold text-slate-900">
                    {profile ? `${profile.academicOverview.attendancePercentage}% Present` : 'Recorded daily'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ENROLMENT HISTORY (INTERVAL TIMELINE) */}
      {/* ========================================================================= */}
      {(activeTab === 'enrolment' || typeof window !== 'undefined') && (
        <div
          data-testid="student-tab-panel-enrolment"
          className={activeTab === 'enrolment' ? 'space-y-6' : 'hidden print:block space-y-6'}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Enrolment &amp; Academic Timeline
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable historical intervals of all classes and streams attended at this school.
                  </p>
                </div>
                {canManage && dossier && (
                  <button
                    onClick={() => setIsTransferModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-teal bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Transfer Class</span>
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Class &amp; Stream</th>
                      <th className="py-2.5 px-3">Academic Year</th>
                      <th className="py-2.5 px-3">Start Date</th>
                      <th className="py-2.5 px-3">End Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Exit / Transfer Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(dossier?.enrolmentHistory || []).map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {e.streamName ? `${e.className} ${e.streamName}` : e.className}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{e.academicYearName}</td>
                        <td className="py-3 px-3 font-mono">{e.startDate}</td>
                        <td className="py-3 px-3 font-mono">{e.endDate || 'Active (Current)'}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              e.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : e.status === 'completed'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 capitalize">
                          {e.exitReason ? e.exitReason.replace('_', ' ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GUARDIANS & EMERGENCY CONTACTS */}
      {/* ========================================================================= */}
      {(activeTab === 'guardians' || typeof window !== 'undefined') && (
        <div
          data-testid="student-tab-panel-guardians"
          className={activeTab === 'guardians' ? 'space-y-6' : 'hidden print:block space-y-6'}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Guardians List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900">
                  Primary Parents &amp; Legal Guardians
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authorized fee payers and legal representatives.
                </p>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {(dossier?.guardians || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 italic">
                    No primary guardian linked to this record yet.
                  </p>
                ) : (
                  (dossier?.guardians || []).map((g) => {
                    const cleanPhone = (g.phone || '').replace(/\D/g, '');
                    return (
                      <div
                        key={g.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900">{g.name}</h4>
                              {g.isPrimary && (
                                <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-teal-100 text-teal-800">
                                  Primary
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 capitalize">{g.relationship}</p>
                          </div>
                        </div>

                        {canViewGuardianContact ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                              {g.phone && (
                                <>
                                  <a
                                    href={`tel:${g.phone}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
                                  >
                                    <Phone className="w-3 h-3 text-slate-500" />
                                    <span>{g.phone}</span>
                                  </a>
                                  <a
                                    href={`https://wa.me/${cleanPhone}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                                  >
                                    <MessageSquare className="w-3 h-3 text-emerald-600" />
                                    <span>WhatsApp</span>
                                  </a>
                                </>
                              )}
                              {g.email && (
                                <a
                                  href={`mailto:${g.email}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
                                >
                                  <Mail className="w-3 h-3 text-slate-500" />
                                  <span>Email</span>
                                </a>
                              )}
                            </div>
                            {g.address && (
                              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{g.address}</span>
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-100">
                            Contact details restricted to office staff. Use emergency contacts for urgent reach.
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Emergency Contacts List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900">
                  Emergency Contacts &amp; Authorized Pickup
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  First contacts dialed during critical illness, accidents, or school gate pickup.
                </p>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {(dossier?.emergencyContacts || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 italic">
                    No emergency contacts registered yet.
                  </p>
                ) : (
                  (dossier?.emergencyContacts || []).map((ec) => (
                    <div
                      key={ec.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                            {ec.priority}
                          </span>
                          <span className="text-sm font-bold text-slate-900">{ec.name}</span>
                          <span className="text-xs text-slate-500">({ec.relationship})</span>
                        </div>
                        <a
                          href={`tel:${ec.phone}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-brand-teal hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{ec.phone}</span>
                        </a>
                      </div>
                      {ec.address && (
                        <p className="text-[11px] text-slate-500 pl-7">{ec.address}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: HEALTH & CARE */}
      {/* ========================================================================= */}
      {(activeTab === 'health' || typeof window !== 'undefined') && (
        <div
          data-testid="student-tab-panel-health"
          className={activeTab === 'health' ? 'space-y-6' : 'hidden print:block space-y-6'}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Medical &amp; Physical Health Profile
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Critical allergies are exposed to class teachers on attendance rolls. Full clinical history is restricted to school leadership, nurses, and guardians.
                  </p>
                </div>
                {canManage && dossier && (
                  <button
                    onClick={() => setIsMedicalModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-teal bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Health Info</span>
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Prominent Alert Banner */}
              {medicalAlertAllergies ? (
                <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Active Critical Alert: {medicalAlertAllergies}</span>
                  </div>
                  <p className="text-xs text-rose-700">
                    Teachers taking morning attendance and supervising sports are alerted to this allergy automatically.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>No critical allergies recorded on file.</span>
                </div>
              )}

              {/* Clinical Details (Full for Leadership, Alert-only for teachers) */}
              {dossier?.medical.alertOnly ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                  <p className="font-bold text-slate-800">Staff Medical Summary</p>
                  <p>
                    Allergies: <strong>{dossier.medical.allergies || 'None recorded'}</strong>
                  </p>
                  <p className="text-[11px] text-slate-400 italic">
                    Full medical records (conditions, medications, doctor contacts) are protected by school health privacy policy. Contact the school nurse or principal for clinical care plans.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Blood Group</span>
                    <p className="text-sm font-bold text-slate-900">{dossier?.medical.bloodGroup || 'Not recorded'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Chronic Conditions</span>
                    <p className="text-sm font-bold text-slate-900">{dossier?.medical.conditions || 'None'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Current Medication</span>
                    <p className="text-sm font-bold text-slate-900">{dossier?.medical.medication || 'None'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Physical &amp; Dietary Restrictions</span>
                    <p className="text-sm font-bold text-slate-900">{dossier?.medical.restrictions || 'None'}</p>
                  </div>
                  <div className="sm:col-span-2 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Emergency Doctor &amp; Hospital Instructions</span>
                    <p className="text-xs text-slate-800">{dossier?.medical.notes || 'No doctor or hospital notes recorded.'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: DOCUMENTS */}
      {/* ========================================================================= */}
      {(activeTab === 'documents' || typeof window !== 'undefined') && (
        <div
          data-testid="student-tab-panel-documents"
          className={activeTab === 'documents' ? 'space-y-6' : 'hidden print:block space-y-6'}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">
                Official Student Documents &amp; Uploads
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Birth certificates, previous school reports, immunization records, and transfer letters.
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {(dossier?.documents || []).length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700">No documents uploaded yet</p>
                  <p className="text-[11px] text-slate-400">
                    Documents uploaded during admission or profile updates will be securely stored here.
                  </p>
                </div>
              ) : (
                (dossier?.documents || []).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-brand-teal" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 capitalize">
                          {doc.docType.replace('_', ' ')}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">{doc.storagePath}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: ACADEMICS & LEARNING INTELLIGENCE (PRESERVED) */}
      {/* ========================================================================= */}
      {(activeTab === 'academics' || typeof window !== 'undefined') && profile && (
        <div
          data-testid="student-tab-panel-academics"
          className={activeTab === 'academics' ? 'space-y-6' : 'hidden print:block space-y-6'}
        >
          {/* 1. Academic Overview Strip (4 Pillars) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40">
              <span className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider block">
                Formal Assessment Avg
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-indigo-950">
                  {profile.academicOverview.formalAveragePct !== null
                    ? `${profile.academicOverview.formalAveragePct}%`
                    : '—'}
                </span>
                <span className="text-[11px] text-indigo-600 font-medium">
                  ({profile.academicOverview.formalAssessmentsCount} assessments)
                </span>
              </div>
              <span className="text-[10px] text-indigo-500 mt-1 block">
                Authoritative summative scores
              </span>
            </div>

            <div className="p-4 rounded-xl border border-teal-100 bg-teal-50/40">
              <span className="text-[10px] uppercase font-bold text-teal-700 tracking-wider block">
                Diagnostic Engagement
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-teal-950">
                  {profile.academicOverview.diagnosticParticipationPct}%
                </span>
                <span className="text-[11px] text-teal-600 font-medium">
                  ({profile.academicOverview.diagnosticCount} activities)
                </span>
              </div>
              <span className="text-[10px] text-teal-500 mt-1 block">
                Practice submissions &amp; work
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
              <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider block">
                Teacher Observations
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-900">
                  {profile.academicOverview.observationsCount}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  qualitative records
                </span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Contextual lesson notes
              </span>
            </div>

            <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40">
              <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider block">
                Active Interventions
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-amber-950">
                  {profile.academicOverview.activeInterventionsCount}
                </span>
                <span className="text-[11px] text-amber-600 font-medium">
                  {profile.academicOverview.activeInterventionsCount === 1 ? 'plan active' : 'plans active'}
                </span>
              </div>
              <span className="text-[10px] text-amber-600 mt-1 block">
                Teacher-authorized support
              </span>
            </div>
          </div>

          {/* 2. Emerging Learning Patterns (Deterministic Intelligence) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-teal" />
                    <CardTitle className="text-base font-bold text-slate-900">
                      Emerging Learning Patterns
                    </CardTitle>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      Deterministic Engine
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Synthesized patterns aggregated across lessons, assignments, and observations.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {profile.emergingPatterns.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 italic">
                  No learning patterns recorded yet. Continue recording lessons and observations.
                </p>
              ) : (
                <div className="space-y-3">
                  {profile.emergingPatterns.map((pattern, idx) => {
                    const isExpanded = expandedPatternIdx === idx;
                    const isInsufficient = pattern.classification === 'insufficient_evidence';
                    const isPossible = pattern.classification === 'possible_pattern';
                    const isStruggle = pattern.requiresAttention;

                    const badgeBg = isInsufficient
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : isPossible
                      ? 'bg-sky-100 text-sky-800 border-sky-200'
                      : isStruggle
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200';

                    return (
                      <div
                        key={`${pattern.subjectId}-${pattern.learningArea}-${idx}`}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-sm space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeBg}`}
                            >
                              {pattern.classification.replace('_', ' ')}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900">
                              {pattern.subjectName} &bull; {pattern.learningArea}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            {pattern.requiresAttention && (
                              <button
                                onClick={() => {
                                  setPrefilledReason(pattern.summary);
                                  setIsInterventionModalOpen(true);
                                }}
                                className="text-[11px] font-bold text-brand-teal hover:underline flex items-center gap-1"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span>Plan Intervention</span>
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedPatternIdx(isExpanded ? null : idx)}
                              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                            >
                              <span>{pattern.evidenceReferences.length} Evidence Links</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed font-normal">
                          {pattern.summary}
                        </p>

                        {/* Evidence Provenance Drill-Down Drawer */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-slate-100 mt-2 space-y-2 animate-in fade-in duration-150">
                            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                              Underlying Evidence Provenance
                            </span>
                            {pattern.evidenceReferences.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No direct links found.</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {pattern.evidenceReferences.map((ev, eIdx) => (
                                  <div
                                    key={`${ev.id}-${eIdx}`}
                                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-start gap-2"
                                  >
                                    <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-white text-slate-600 border border-slate-200 shrink-0">
                                      {ev.type}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-semibold text-slate-800 truncate">
                                        {ev.titleOrSnippet}
                                      </p>
                                      <span className="text-[10px] text-slate-400">{ev.date}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Targeted Interventions (Active & Completed) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Targeted Instructional Interventions
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Teacher-authorized support plans with strategy tracking and evaluated outcomes.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPrefilledReason('');
                    setIsInterventionModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-brand-teal bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>New Plan</span>
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {profile.activeInterventions.length === 0 && profile.pastInterventions.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 italic">
                  No active or past interventions recorded for this student.
                </p>
              ) : (
                <div className="space-y-3">
                  {profile.activeInterventions.map((iv) => (
                    <div
                      key={iv.id}
                      className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                            {iv.status}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900">
                            {iv.subjectName} &bull; {iv.learningArea}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Target: {iv.targetDate}
                          </span>
                          <button
                            onClick={() => setResolvingInterventionId(iv.id)}
                            className="px-2.5 py-1 rounded-md text-xs font-bold text-white bg-brand-teal hover:bg-brand-teal/90 transition-colors shadow-xs"
                          >
                            Record Outcome
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 space-y-1">
                        <p>
                          <strong className="text-slate-900">Reason:</strong> {iv.reason}
                        </p>
                        <p>
                          <strong className="text-slate-900">Strategy:</strong> {iv.strategyAction}
                        </p>
                        <p>
                          <strong className="text-slate-900">Target Outcome:</strong> {iv.targetOutcome}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-amber-100">
                        <span>Authorized by: <strong>{iv.teacherName}</strong></span>
                        <span>Started: {iv.startDate} &bull; {iv.evidenceReferences.length} evidence links</span>
                      </div>

                      {resolvingInterventionId === iv.id && (
                        <div className="p-3 mt-2 rounded-lg bg-white border border-slate-300 space-y-2.5 animate-in fade-in duration-150">
                          <span className="text-xs font-bold text-slate-800 block">
                            Record Intervention Outcome
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                                Evaluated Outcome
                              </label>
                              <select
                                value={selectedOutcome}
                                onChange={(e) => setSelectedOutcome(e.target.value as InterventionOutcome)}
                                className="w-full text-xs rounded border border-slate-300 p-1.5"
                              >
                                <option value="improved">Improved (Target Achieved)</option>
                                <option value="partially_improved">Partially Improved</option>
                                <option value="unchanged">Unchanged (Strategy Ineffective)</option>
                                <option value="declined">Declined</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                                Outcome Notes
                              </label>
                              <input
                                type="text"
                                value={outcomeNotes}
                                onChange={(e) => setOutcomeNotes(e.target.value)}
                                placeholder="e.g. Scored 8/10 on subsequent fractions quiz"
                                className="w-full text-xs rounded border border-slate-300 p-1.5"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              onClick={() => setResolvingInterventionId(null)}
                              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleResolveIntervention(iv.id)}
                              className="px-3 py-1 text-xs font-bold text-white bg-brand-teal rounded hover:bg-brand-teal/90"
                            >
                              Complete &amp; Archive
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {profile.pastInterventions.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 opacity-90"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                            {p.status}
                          </span>
                          <h4 className="text-xs font-bold text-slate-800">
                            {p.subjectName} &bull; {p.learningArea}
                          </h4>
                        </div>
                        {p.outcome && (
                          <span className="text-[11px] font-semibold text-emerald-700">
                            Outcome: {p.outcome.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      {p.outcomeNotes && (
                        <p className="text-xs text-slate-600 italic">
                          &ldquo;{p.outcomeNotes}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 4. Subject Trajectories Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">
                Subject Performance &amp; Evidence Trajectory
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3">Formal Average</th>
                      <th className="py-2.5 px-3">Diagnostic Completion</th>
                      <th className="py-2.5 px-3">Evidence Items</th>
                      <th className="py-2.5 px-3">Evidence Trajectory</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profile.subjectTrajectories.map((st) => (
                      <tr key={st.subjectId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-900">{st.subjectName}</td>
                        <td className="py-3 px-3 font-bold text-indigo-900">
                          {st.formalAveragePct !== null ? `${st.formalAveragePct}%` : '—'}
                        </td>
                        <td className="py-3 px-3 font-bold text-teal-800">
                          {st.diagnosticParticipationPct}%
                        </td>
                        <td className="py-3 px-3 text-slate-600">{st.evidenceCount} records</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              st.status === 'support_needed'
                                ? 'bg-amber-100 text-amber-800'
                                : st.status === 'insufficient_evidence'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {st.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 5. Unified Evidence & Observation Timeline */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Unified Evidence &amp; Observation Timeline
                  </CardTitle>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setTimelineFilter('all')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                      timelineFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setTimelineFilter('formal')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                      timelineFilter === 'formal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Formal
                  </button>
                  <button
                    onClick={() => setTimelineFilter('diagnostic')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                      timelineFilter === 'diagnostic' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Diagnostic
                  </button>
                  <button
                    onClick={() => setTimelineFilter('observation')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                      timelineFilter === 'observation' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Observations
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {filteredTimeline.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 italic">No matching evidence found.</p>
              ) : (
                <div className="space-y-3">
                  {filteredTimeline.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                              item.badge.variant === 'success'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : item.badge.variant === 'critical'
                                ? 'bg-red-100 text-red-800 border-red-200'
                                : item.badge.variant === 'warning'
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-teal-100 text-teal-800 border-teal-200'
                            }`}
                          >
                            {item.badge.label}
                          </span>
                          <h5 className="text-xs font-bold text-slate-900">
                            {item.subjectName} &bull; {item.title}
                          </h5>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">{item.date}</span>
                      </div>
                      <p className="text-xs text-slate-700">{item.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: FINANCE & FEES (ROLE-SCOPED: LEADERSHIP/BURSAR ONLY) */}
      {/* ========================================================================= */}
      {(activeTab === 'finance' || typeof window !== 'undefined') && canViewFinance && (
        <div
          data-testid="student-tab-panel-finance"
          className={activeTab === 'finance' ? 'space-y-6' : 'hidden print:block space-y-6'}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">
                Student Fee Account &amp; Financial Ledger
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative fee billing, payments, and account statement summary. Firewalled from teachers.
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Total Billed Fees</span>
                  <p className="text-xl font-extrabold text-slate-900">
                    UGX {dossier?.finance ? dossier.finance.totalBilled.toLocaleString() : '0'}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-700">Total Paid</span>
                  <p className="text-xl font-extrabold text-emerald-950">
                    UGX {dossier?.finance ? dossier.finance.totalPaid.toLocaleString() : '0'}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-amber-700">Current Balance / Arrears</span>
                  <p className="text-xl font-extrabold text-amber-950">
                    UGX {dossier?.finance ? dossier.finance.balance.toLocaleString() : '0'}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">Fee Statement &amp; Receipts</p>
                  <p className="text-[11px] text-slate-500">
                    Detailed line items and bank reconciliation receipts are managed in School Finance.
                  </p>
                </div>
                <Link
                  to="/fees"
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-brand-teal bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors"
                >
                  View Accounts Ledger
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action Modals */}
      {dossier && (
        <>
          <StudentEditModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            dossier={dossier}
            role={role}
            onSuccess={loadData}
          />
          <StudentTransferModal
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            dossier={dossier}
            role={role}
            schoolId={activeSchoolId}
            onSuccess={loadData}
          />
          <StudentWithdrawModal
            isOpen={isWithdrawModalOpen}
            onClose={() => setIsWithdrawModalOpen(false)}
            dossier={dossier}
            role={role}
            onSuccess={loadData}
          />
          <StudentMedicalEditModal
            isOpen={isMedicalModalOpen}
            onClose={() => setIsMedicalModalOpen(false)}
            dossier={dossier}
            role={role}
            onSuccess={loadData}
          />
        </>
      )}

      {/* Intervention Modal */}
      {studentId && (
        <InterventionModal
          isOpen={isInterventionModalOpen}
          onClose={() => setIsInterventionModalOpen(false)}
          onSuccess={loadData}
          schoolId={activeSchoolId}
          studentId={studentId}
          studentName={studentFullName}
          classId="55555555-5555-5555-5555-555555555551"
          streamId="66666666-6666-6666-6666-666666666661"
          teacherId="99999999-9999-9999-9999-999999999991"
          availableSubjects={[
            { id: '77777777-7777-7777-7777-777777777771', name: 'Mathematics' },
            { id: '77777777-7777-7777-7777-777777777772', name: 'English' },
            { id: '77777777-7777-7777-7777-777777777773', name: 'Science' },
          ]}
          availableEvidence={availableEvidenceForModal}
          prefilledMisconception={prefilledReason}
        />
      )}
    </div>
  );
};
