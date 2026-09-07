import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, FileText, Plus, Upload, Users, X } from 'lucide-react';
import {
  admissionService,
  type AdmissionDocType,
  type SubmitApplicationInput,
} from './admissionService';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

const STEPS = ['Pupil', 'Guardians', 'Documents', 'Review'] as const;
type Step = (typeof STEPS)[number];

const DOC_TYPES: Array<{ value: AdmissionDocType; label: string }> = [
  { value: 'birth_certificate', label: 'Birth certificate' },
  { value: 'report_card', label: 'Report card' },
  { value: 'transfer_letter', label: 'Transfer letter' },
  { value: 'photo', label: 'Passport photo' },
  { value: 'other', label: 'Other' },
];

interface GuardianDraft {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isEmergency: boolean;
  isPrimary: boolean;
}

interface FileDraft {
  id: string;
  file: File;
  docType: AdmissionDocType;
}

const inputClass =
  'w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5';

let draftSeq = 0;
const nextDraftId = () => `draft-${Date.now()}-${draftSeq++}`;

export const AdmitStudentPage: React.FC = () => {
  const { role, schoolId } = useAuth();
  const effectiveSchoolId = schoolId ?? PILOT_SCHOOL_ID;

  const [step, setStep] = useState<Step>('Pupil');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [availableClasses, setAvailableClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [availableStreams, setAvailableStreams] = useState<Array<{ id: string; class_id: string; name: string }>>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [guardians, setGuardians] = useState<GuardianDraft[]>([
    { id: nextDraftId(), name: '', relationship: '', phone: '', email: '', isEmergency: true, isPrimary: true },
  ]);
  const [files, setFiles] = useState<FileDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAcademicClasses() {
      try {
        setIsLoadingClasses(true);
        const { data: clsData } = await supabase
          .from('classes')
          .select('id, name')
          .eq('school_id', effectiveSchoolId)
          .order('name');
        setAvailableClasses(clsData || []);

        const { data: strmData } = await supabase
          .from('streams')
          .select('id, class_id, name')
          .order('name');
        setAvailableStreams(strmData || []);
      } catch (err) {
        console.error('Failed to load classes for admission wizard', err);
      } finally {
        setIsLoadingClasses(false);
      }
    }
    loadAcademicClasses();
  }, [effectiveSchoolId]);

  const filteredStreams = availableStreams.filter((s) => s.class_id === classId);

  const stepIndex = STEPS.indexOf(step);

  const pupilValid = firstName.trim() !== '' && lastName.trim() !== '';
  const guardiansValid =
    guardians.length > 0 &&
    guardians.every((g) => g.name.trim() !== '' && g.relationship.trim() !== '') &&
    guardians.some((g) => g.isEmergency);

  // Completeness meter (non-blocking): optional enrichment beyond the
  // required pupil + guardian + emergency core.
  const completeness = useMemo(() => {
    const checks = [
      dob !== '',
      gender !== '',
      classId.trim() !== '',
      guardians.some((g) => g.phone.trim() !== ''),
      guardians.some((g) => g.email.trim() !== ''),
      guardians.length >= 2,
      files.length > 0,
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
  }, [dob, gender, classId, guardians, files]);

  const goNext = () => {
    setFormError(null);
    if (step === 'Pupil' && !pupilValid) {
      setFormError('Pupil first name and last name are required.');
      return;
    }
    if (step === 'Guardians' && !guardiansValid) {
      setFormError('Add at least one guardian with a name and relationship, and designate an emergency contact.');
      return;
    }
    setStep(STEPS[stepIndex + 1]);
  };

  const updateGuardian = (id: string, patch: Partial<GuardianDraft>) => {
    setGuardians((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles((prev) => [
      ...prev,
      ...Array.from(fileList).map((file) => ({ id: nextDraftId(), file, docType: 'other' as AdmissionDocType })),
    ]);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload: SubmitApplicationInput = {
        schoolId: effectiveSchoolId,
        studentFirstName: firstName.trim(),
        studentLastName: lastName.trim(),
        dob: dob || null,
        gender: (gender as 'male' | 'female' | 'other' | null) || null,
        classId: classId.trim() || null,
        streamId: streamId.trim() || null,
        guardians: guardians.map((g) => ({
          name: g.name.trim(),
          relationship: g.relationship.trim(),
          phone: g.phone.trim() || undefined,
          email: g.email.trim() || undefined,
          isEmergency: g.isEmergency,
          isPrimary: g.isPrimary,
        })),
        files: files.map((f) => ({ file: f.file, docType: f.docType })),
      };
      const res = await admissionService.submitApplication(payload, role);
      setApplicationId(res.applicationId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (applicationId) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 max-w-2xl">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Application submitted</h1>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {firstName} {lastName} is now awaiting a leadership decision. Approval creates the
              student record atomically — nothing is enrolled yet.
            </p>
            <div className="flex items-center justify-center gap-3">
              <StatusPill status="pending" label="Pending review" />
              <span className="text-xs text-slate-400 font-mono">{applicationId.slice(0, 8)}</span>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link to="/admissions">
                <Button variant="primary">View admissions queue</Button>
              </Link>
              <Button variant="outline" onClick={() => window.location.reload()}>
                New application
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-3xl">
      <div className="pb-6 border-b border-slate-200/80">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Admissions</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
          Admit Student
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Reception wizard — pupil details, guardians, documents, then review.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border ${
                  i < stepIndex
                    ? 'bg-brand-teal text-white border-brand-teal'
                    : i === stepIndex
                      ? 'bg-teal-50 text-brand-teal border-brand-teal/40'
                      : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-xs font-semibold ${i === stepIndex ? 'text-slate-900' : 'text-slate-400'}`}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-slate-200 mx-1" />}
          </React.Fragment>
        ))}
      </div>

      {formError && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-6 space-y-5">
          {step === 'Pupil' && (
            <>
              <CardHeader className="px-0 py-0 border-0">
                <div>
                  <CardTitle>Pupil details</CardTitle>
                  <CardDescription>First and last name are required now; the rest can follow.</CardDescription>
                </div>
              </CardHeader>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="admit-first-name">First name *</label>
                  <input id="admit-first-name" className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Amina" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="admit-last-name">Last name *</label>
                  <input id="admit-last-name" className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Kato" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="admit-dob">Date of birth</label>
                  <input id="admit-dob" type="date" className={inputClass} value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="admit-gender">Gender</label>
                  <select id="admit-gender" className={inputClass} value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Not specified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="admit-class">Target Class (Optional at Admission)</label>
                  <select
                    id="admit-class"
                    className={inputClass}
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setStreamId('');
                    }}
                  >
                    <option value="">{isLoadingClasses ? 'Loading classes...' : 'Select target class...'}</option>
                    {availableClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="admit-stream">Stream / Section</label>
                  <select
                    id="admit-stream"
                    className={inputClass}
                    value={streamId}
                    onChange={(e) => setStreamId(e.target.value)}
                    disabled={!classId || filteredStreams.length === 0}
                  >
                    <option value="">
                      {!classId
                        ? 'Select class first'
                        : filteredStreams.length === 0
                        ? 'No streams (unstreamed)'
                        : 'Select stream (optional)...'}
                    </option>
                    {filteredStreams.map((strm) => (
                      <option key={strm.id} value={strm.id}>
                        {strm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {step === 'Guardians' && (
            <>
              <CardHeader className="px-0 py-0 border-0">
                <div>
                  <CardTitle>Guardians</CardTitle>
                  <CardDescription>At least one guardian; exactly who to call in an emergency must be designated.</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() =>
                    setGuardians((prev) => [
                      ...prev,
                      { id: nextDraftId(), name: '', relationship: '', phone: '', email: '', isEmergency: false, isPrimary: false },
                    ])
                  }
                >
                  Add guardian
                </Button>
              </CardHeader>
              <div className="space-y-4">
                {guardians.map((g) => (
                  <div key={g.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Full name *</label>
                        <input className={inputClass} value={g.name} onChange={(e) => updateGuardian(g.id, { name: e.target.value })} placeholder="Sarah Kato" />
                      </div>
                      <div>
                        <label className={labelClass}>Relationship *</label>
                        <input className={inputClass} value={g.relationship} onChange={(e) => updateGuardian(g.id, { relationship: e.target.value })} placeholder="mother / father / aunt…" />
                      </div>
                      <div>
                        <label className={labelClass}>Phone</label>
                        <input className={inputClass} value={g.phone} onChange={(e) => updateGuardian(g.id, { phone: e.target.value })} placeholder="0700…" />
                      </div>
                      <div>
                        <label className={labelClass}>Email</label>
                        <input className={inputClass} value={g.email} onChange={(e) => updateGuardian(g.id, { email: e.target.value })} placeholder="name@example.com" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <input type="checkbox" checked={g.isEmergency} onChange={(e) => updateGuardian(g.id, { isEmergency: e.target.checked })} className="w-4 h-4 accent-teal-700" />
                        Emergency contact
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <input type="checkbox" checked={g.isPrimary} onChange={(e) => updateGuardian(g.id, { isPrimary: e.target.checked })} className="w-4 h-4 accent-teal-700" />
                        Primary guardian
                      </label>
                      {guardians.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setGuardians((prev) => prev.filter((x) => x.id !== g.id))}
                          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          <X className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 'Documents' && (
            <>
              <CardHeader className="px-0 py-0 border-0">
                <div>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Optional at intake — uploads go to private student storage.</CardDescription>
                </div>
              </CardHeader>
              <label className="flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 cursor-pointer hover:bg-slate-50 transition-colors">
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Choose files to upload</span>
                <span className="text-xs text-slate-400">Birth certificate, report card, transfer letter, photo</span>
                <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </label>
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate flex-1">{f.file.name}</span>
                      <select
                        className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white"
                        value={f.docType}
                        onChange={(e) =>
                          setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, docType: e.target.value as AdmissionDocType } : x)))
                        }
                      >
                        {DOC_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${f.file.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'Review' && (
            <>
              <CardHeader className="px-0 py-0 border-0">
                <div>
                  <CardTitle>Review & submit</CardTitle>
                  <CardDescription>The meter below is advisory only — it never blocks submission.</CardDescription>
                </div>
                <StatusPill status="info" label={`${completeness}% complete`} />
              </CardHeader>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${completeness}%` }} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Pupil</p>
                  <p className="font-bold text-slate-900">{firstName} {lastName}</p>
                  <p className="text-slate-500 text-xs mt-1">
                    {[dob || 'DOB not set', gender || 'gender not set', classId || 'no class yet'].join(' • ')}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Guardians ({guardians.length})
                  </p>
                  {guardians.map((g) => (
                    <p key={g.id} className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">{g.name}</span> ({g.relationship})
                      {g.isEmergency && ' • emergency'}
                    </p>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {files.length} document{files.length === 1 ? '' : 's'} attached. Submitting creates a
                <span className="font-semibold"> pending </span> application — the student record is
                created only when leadership approves it.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          leftIcon={<ArrowLeft className="w-4 h-4" />}
          disabled={stepIndex === 0 || isSubmitting}
          onClick={() => { setFormError(null); setStep(STEPS[stepIndex - 1]); }}
        >
          Back
        </Button>
        {step !== 'Review' ? (
          <Button variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />} onClick={goNext}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmit}>
            Submit application
          </Button>
        )}
      </div>
    </div>
  );
};
