import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  User,
  BookOpen,
  DollarSign,
} from 'lucide-react';
import type { HireStaffPayload } from '../../types/domain';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

const STEPS = ['Personal', 'Employment', 'Subjects', 'Review'] as const;
type Step = (typeof STEPS)[number];

const inputClass =
  'w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5';

export const HireStaffWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { role, schoolId } = useAuth();
  const activeSchoolId = schoolId || PILOT_SCHOOL_ID;

  const [step, setStep] = useState<Step>('Personal');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Personal Details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [nationality, setNationality] = useState('Ugandan');
  const [address, setAddress] = useState('');

  // Step 2: Employment Details
  const [jobRole, setJobRole] = useState('Primary Teacher');
  const [department, setDepartment] = useState('Academics');
  const [isTeacher, setIsTeacher] = useState(true);
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [contractType, setContractType] = useState<HireStaffPayload['contractType']>('permanent');
  const [qualification, setQualification] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');

  // Step 2 (cont): Compensation
  const [baseSalary, setBaseSalary] = useState('');
  const [currency, setCurrency] = useState('UGX');
  const [paymentMethod, setPaymentMethod] = useState<HireStaffPayload['paymentMethod']>('bank_transfer');

  // Step 3: Teaching Subjects
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  useEffect(() => {
    async function loadSubjects() {
      try {
        setIsLoadingSubjects(true);
        const subs = await staffService.getSchoolSubjects(activeSchoolId);
        setAvailableSubjects(subs);
      } catch (err) {
        console.error('Failed to load school subjects', err);
        setAvailableSubjects([]);
      } finally {
        setIsLoadingSubjects(false);
      }
    }
    loadSubjects();
  }, [activeSchoolId]);

  const stepIndex = STEPS.indexOf(step);

  const personalValid = firstName.trim() !== '' && lastName.trim() !== '';
  const employmentValid = jobRole.trim() !== '' && department.trim() !== '';

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const goNext = () => {
    setFormError(null);
    if (step === 'Personal') {
      if (!personalValid) {
        setFormError('First name and last name are required.');
        return;
      }
      setStep('Employment');
    } else if (step === 'Employment') {
      if (!employmentValid) {
        setFormError('Role and department are required.');
        return;
      }
      if (isTeacher) {
        setStep('Subjects');
      } else {
        setStep('Review');
      }
    } else if (step === 'Subjects') {
      setStep('Review');
    }
  };

  const goBack = () => {
    setFormError(null);
    if (step === 'Employment') setStep('Personal');
    else if (step === 'Subjects') setStep('Employment');
    else if (step === 'Review') {
      if (isTeacher) setStep('Subjects');
      else setStep('Employment');
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload: HireStaffPayload = {
        schoolId: activeSchoolId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        nationalId: nationalId.trim() || null,
        nationality: nationality.trim() || null,
        address: address.trim() || null,
        role: jobRole.trim(),
        department: department.trim(),
        isTeacher,
        hireDate: hireDate || new Date().toISOString().split('T')[0],
        contractType,
        qualification: qualification.trim() || null,
        employeeNumber: employeeNumber.trim() || null,
        subjectIds: isTeacher ? selectedSubjectIds : undefined,
        baseSalary: baseSalary.trim() ? Number(baseSalary.replace(/,/g, '')) : null,
        currency: currency.trim() || 'UGX',
        paymentMethod: paymentMethod || 'bank_transfer',
      };

      const newEmpId = await staffService.hireStaff(payload, role);
      navigate(`/staff/${newEmpId}`);
    } catch (err: any) {
      console.error('Failed to hire staff member', err);
      setFormError(err.message || 'Failed to hire staff member.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <Link
            to="/staff"
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Hire New Staff Member
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Faculty appointment, contract details, and official subject assignments
            </p>
          </div>
        </div>
        <StatusPill status="info" label={`Step ${stepIndex + 1} of ${STEPS.length}`} />
      </div>

      {/* Stepper Indicator */}
      <div className="flex items-center justify-between px-2">
        {STEPS.map((s, idx) => {
          const isActive = s === step;
          const isDone = idx < stepIndex;
          return (
            <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-brand-teal text-white shadow-sm ring-2 ring-brand-teal/20'
                    : isDone
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
              </div>
              <span
                className={`text-xs font-semibold hidden sm:inline ${
                  isActive ? 'text-slate-900' : isDone ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {s}
              </span>
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 rounded ${
                    idx < stepIndex ? 'bg-emerald-400' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* STEP 1: Personal Details */}
      {step === 'Personal' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5 text-brand-teal" />
              <span>Personal & Contact Information</span>
            </CardTitle>
            <CardDescription>Legal name and contact details for the employee's dossier</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First Name *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. David"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Mukasa"
                  className={inputClass}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. david.mukasa@school.ug"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +256 701 234 567"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Date of Birth</label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select gender...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Nationality</label>
                <input
                  type="text"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>National ID (NIN)</label>
                <input
                  type="text"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="e.g. CM90012345678"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Residential Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Plot 12 Bukoto, Kampala"
                  className={inputClass}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Employment Details */}
      {step === 'Employment' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-brand-teal" />
              <span>Employment & Compensation</span>
            </CardTitle>
            <CardDescription>Designation, department, contract terms, and agreed remuneration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Job Title / Role *</label>
                <input
                  type="text"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                  placeholder="e.g. Senior Mathematics Teacher"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Department *</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className={inputClass}
                >
                  <option value="Academics">Academics</option>
                  <option value="Administration">Administration</option>
                  <option value="Finance">Finance</option>
                  <option value="Operations">Operations</option>
                  <option value="Facilities">Facilities & Security</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">Teaching Faculty Member</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Designates whether this staff member teaches classes and appears in timetables
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTeacher}
                  onChange={(e) => setIsTeacher(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-teal"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Hire Date *</label>
                <input
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Contract Type *</label>
                <select
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value as any)}
                  className={inputClass}
                >
                  <option value="permanent">Permanent / Full-time</option>
                  <option value="probation">Probationary Period</option>
                  <option value="fixed_term">Fixed-Term Contract</option>
                  <option value="casual">Casual / Part-time</option>
                  <option value="volunteer">Volunteer / Intern</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Highest Qualification</label>
                <input
                  type="text"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="e.g. Bachelor of Science in Education (Honours)"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Custom Employee Number (Optional)</label>
                <input
                  type="text"
                  value={employeeNumber}
                  onChange={(e) => setEmployeeNumber(e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Compensation & Remuneration */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-brand-teal" />
                <span className="text-sm font-bold text-slate-900">Agreed Remuneration & Pay Terms</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className={labelClass}>Base Monthly Salary</label>
                  <input
                    type="text"
                    value={baseSalary}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setBaseSalary(raw ? Number(raw).toLocaleString() : '');
                    }}
                    placeholder="e.g. 2,800,000"
                    className={inputClass}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Optional. Leave blank for volunteers or pending approval.</p>
                </div>
                <div>
                  <label className={labelClass}>Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={inputClass}
                  >
                    <option value="UGX">UGX (Ugandan Shilling)</option>
                    <option value="KES">KES (Kenyan Shilling)</option>
                    <option value="USD">USD (US Dollar)</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className={inputClass}
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Official Subjects (if Teaching Staff) */}
      {step === 'Subjects' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-teal" />
              <span>Official Subject Appointments</span>
            </CardTitle>
            <CardDescription>
              Select the curriculum subjects this teacher is officially trained, qualified, and appointed to teach
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingSubjects ? (
              <p className="text-sm text-slate-500">Loading curriculum subjects...</p>
            ) : availableSubjects.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                No active subjects found for this school. Official subjects can also be appointed later from the staff dossier.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableSubjects.map((sub) => {
                  const isChecked = selectedSubjectIds.includes(sub.id);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => toggleSubject(sub.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isChecked
                          ? 'bg-brand-teal/5 border-brand-teal ring-1 ring-brand-teal/30'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-colors ${
                            isChecked
                              ? 'bg-brand-teal text-white'
                              : 'border border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        <div>
                          <span className="text-sm font-bold text-slate-900">{sub.name}</span>
                          {sub.code && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600">
                              {sub.code}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-slate-400">
              Selected: {selectedSubjectIds.length} official subject(s)
            </p>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Review & Onboarding Summary */}
      {step === 'Review' && (
        <Card className="space-y-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand-teal" />
              <span>Review & Onboarding Checklist</span>
            </CardTitle>
            <CardDescription>Confirm staff information before recording employment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Personal Summary */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Staff Member
              </span>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {firstName} {lastName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {email || 'No email'} • {phone || 'No phone'}
                  </p>
                </div>
                <StatusPill status="info" label={gender || 'Unspecified'} />
              </div>
            </div>

            {/* Employment Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 font-medium">Role</span>
                <p className="font-bold text-slate-900 mt-1">{jobRole}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 font-medium">Department</span>
                <p className="font-bold text-slate-900 mt-1">{department}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 font-medium">Contract</span>
                <p className="font-bold text-slate-900 mt-1 capitalize">{contractType.replace('_', ' ')}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 font-medium">Hire Date</span>
                <p className="font-bold text-slate-900 mt-1">{hireDate}</p>
              </div>
            </div>

            {/* Subjects appointed */}
            {isTeacher && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Appointed Subjects ({selectedSubjectIds.length})
                </span>
                {selectedSubjectIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedSubjectIds.map((id) => {
                      const sub = availableSubjects.find((s) => s.id === id);
                      return (
                        <span
                          key={id}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200"
                        >
                          {sub?.name || id}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No initial subjects selected.</p>
                )}
              </div>
            )}

            {/* Remuneration & Payroll Summary */}
            {baseSalary.trim() && Number(baseSalary.replace(/,/g, '')) > 0 ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-700" />
                    <span className="font-bold text-xs uppercase tracking-wide">
                      Agreed Remuneration & Payroll Profile
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-emerald-800">
                    {currency} {Number(baseSalary.replace(/,/g, '')).toLocaleString()} / month
                  </span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  An active payroll profile will be created effective {hireDate}. Payment method: <span className="font-semibold capitalize">{paymentMethod?.replace('_', ' ')}</span>. Statutory PAYE and NSSF will be calculated automatically by the Payroll Engine during payroll runs.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-700" />
                  <span className="font-bold text-xs uppercase tracking-wide">
                    Compensation: Pending Setup
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  No starting salary was entered (e.g. volunteer, intern, or pending approval). The employee will be hired in active status, and remuneration can be configured later in their staff dossier prior to payroll runs.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200/80">
        <Button
          type="button"
          variant="outline"
          onClick={step === 'Personal' ? () => navigate('/staff') : goBack}
          disabled={isSubmitting}
        >
          {step === 'Personal' ? 'Cancel' : 'Back'}
        </Button>

        {step !== 'Review' ? (
          <Button type="button" onClick={goNext}>
            <span>Continue</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-brand-teal hover:bg-brand-tealDark text-white font-bold"
          >
            {isSubmitting ? 'Creating Staff Member...' : 'Confirm & Hire Staff Member'}
          </Button>
        )}
      </div>
    </div>
  );
};
