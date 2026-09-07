import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { AlertCircle } from 'lucide-react';
import type { StaffDossier } from '../../types/domain';

interface StaffEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: StaffDossier;
  onSuccess: () => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all';
const labelClass = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

export const StaffEditModal: React.FC<StaffEditModalProps> = ({
  isOpen,
  onClose,
  dossier,
  onSuccess,
}) => {
  const { role } = useAuth();

  const [firstName, setFirstName] = useState(dossier.personal.firstName);
  const [lastName, setLastName] = useState(dossier.personal.lastName);
  const [email, setEmail] = useState(dossier.personal.email || '');
  const [phone, setPhone] = useState(dossier.personal.phone || '');
  const [dateOfBirth, setDateOfBirth] = useState(dossier.personal.dateOfBirth || '');
  const [gender, setGender] = useState(dossier.personal.gender || '');
  const [nationalId, setNationalId] = useState(dossier.personal.nationalId || '');
  const [nationality, setNationality] = useState(dossier.personal.nationality || '');
  const [address, setAddress] = useState(dossier.personal.address || '');

  const [jobRole, setJobRole] = useState(dossier.employment.role);
  const [department, setDepartment] = useState(dossier.employment.department);
  const [contractType, setContractType] = useState(dossier.employment.contractType || 'permanent');
  const [qualification, setQualification] = useState(dossier.employment.qualification || '');
  const [isTeacher, setIsTeacher] = useState(dossier.employment.isTeacher);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await staffService.updateStaffPersonal(
        dossier.id,
        dossier.personId,
        {
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
          contractType,
          qualification: qualification.trim() || null,
        },
        role
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to update staff member', err);
      setError(err.message || 'Failed to update staff record.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Staff Record" maxWidth="max-w-2xl">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Personal Information
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First Name *</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
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
              className={inputClass}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>National ID (NIN)</label>
            <input
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Nationality</label>
            <input
              type="text"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Residential Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
          Employment & Contract
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Role / Title *</label>
            <input
              type="text"
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Contract Type</label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className={inputClass}
            >
              <option value="permanent">Permanent / Full-time</option>
              <option value="probation">Probationary Period</option>
              <option value="fixed_term">Fixed-Term Contract</option>
              <option value="casual">Casual / Part-time</option>
              <option value="volunteer">Volunteer / Intern</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Highest Qualification</label>
            <input
              type="text"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">Teaching Faculty Member</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isTeacher}
              onChange={(e) => setIsTeacher(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-teal"></div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving} className="bg-brand-teal hover:bg-brand-tealDark text-white">
            {isSaving ? 'Saving Changes...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
