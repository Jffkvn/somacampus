import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { StatusPill } from '../../components/ui/StatusPill';
import {
  Users,
  Search,
  ArrowRight,
  UserPlus,
  BookOpen,
  Mail,
  Phone,
  GraduationCap,
  AlertCircle,
} from 'lucide-react';
import type { StaffMemberSummary } from '../../types/domain';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const StaffDirectoryPage: React.FC = () => {
  const { role, schoolId } = useAuth();
  const activeSchoolId = schoolId || PILOT_SCHOOL_ID;

  const [staff, setStaff] = useState<StaffMemberSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'teaching' | 'support'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'on_leave' | 'terminated'>('all');

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await staffService.listStaff(activeSchoolId, {
          type: typeFilter,
          status: statusFilter,
        });
        setStaff(data);
      } catch (err: any) {
        console.error('Failed to load staff directory', err);
        setError(err.message || 'Failed to load staff directory.');
        setStaff([]);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [activeSchoolId, typeFilter, statusFilter]);

  const filteredStaff = useMemo(() => {
    if (!search.trim()) return staff;
    const q = search.trim().toLowerCase();
    return staff.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.employeeNumber.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        (s.qualification && s.qualification.toLowerCase().includes(q)) ||
        s.officialSubjects.some((subj) => subj.subjectName.toLowerCase().includes(q))
    );
  }, [staff, search]);

  const canHire = role === 'admin' || role === 'principal';

  if (isLoading) {
    return <LoadingState label="Loading staff directory..." />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            People & Operations
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Staff & Faculty Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Faculty appointments, official subject qualifications, and personnel dossiers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status="info" label={`${filteredStaff.length} Members`} />
          {canHire && (
            <Link
              to="/staff/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-teal hover:bg-brand-tealDark rounded-xl shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Hire Staff</span>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, employee #, department, subject, or qualification..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50 transition-all"
          />
        </div>

        {/* Role Type Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              typeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Staff
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('teaching')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              typeFilter === 'teaching'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Teaching Faculty
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('support')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              typeFilter === 'support'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Support & Admin
          </button>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          aria-label="Filter staff by employment status"
          className="px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-brand-teal/40 transition-all"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="on_leave">On Leave</option>
          <option value="terminated">Exited / Inactive</option>
        </select>
      </div>

      {/* Staff Grid */}
      {filteredStaff.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-900">No staff members found</p>
              <p className="text-xs text-slate-500 mt-1">
                {search.trim()
                  ? 'No employees match your search query.'
                  : 'Get started by hiring a new faculty or administrative staff member.'}
              </p>
            </div>
            {canHire && (
              <Link
                to="/staff/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-brand-teal bg-brand-teal/10 hover:bg-brand-teal/20 rounded-xl transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Hire New Staff Member</span>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((emp) => {
            const initials = emp.fullName
              ? emp.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              : 'ST';

            return (
              <Card
                key={emp.id}
                className="group hover:border-brand-teal/40 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top Row: Avatar + Name + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-brand-teal/10 text-brand-teal flex items-center justify-center font-bold text-sm tracking-wider flex-shrink-0 group-hover:bg-brand-teal group-hover:text-white transition-colors">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-base truncate group-hover:text-brand-teal transition-colors">
                          {emp.fullName}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono mt-0.5">
                          <span>{emp.employeeNumber}</span>
                          <span>•</span>
                          <span className="font-sans font-medium text-slate-600 truncate">
                            {emp.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    <StatusPill
                      status={
                        emp.status === 'active'
                          ? 'success'
                          : emp.status === 'on_leave'
                          ? 'warning'
                          : 'neutral'
                      }
                      label={
                        emp.status === 'active'
                          ? 'Active'
                          : emp.status === 'on_leave'
                          ? 'On Leave'
                          : 'Exited'
                      }
                    />
                  </div>

                  {/* Department & Qualification badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                      {emp.department}
                    </span>
                    {emp.contractType && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 capitalize">
                        {emp.contractType.replace('_', ' ')}
                      </span>
                    )}
                    {emp.qualification && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium flex items-center gap-1 truncate max-w-[180px]">
                        <GraduationCap className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{emp.qualification}</span>
                      </span>
                    )}
                  </div>

                  {/* Official Subjects for Teachers */}
                  {emp.isTeacher && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        <span>Official Subjects ({emp.officialSubjects.length})</span>
                      </div>
                      {emp.officialSubjects.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {emp.officialSubjects.slice(0, 3).map((sub) => (
                            <span
                              key={sub.id}
                              className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100"
                            >
                              {sub.subjectName}
                            </span>
                          ))}
                          {emp.officialSubjects.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold">
                              +{emp.officialSubjects.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No official subjects appointed</p>
                      )}
                    </div>
                  )}

                  {/* Contact links */}
                  <div className="flex items-center gap-3 pt-2 text-xs text-slate-500">
                    {emp.phone && (
                      <a
                        href={`tel:${emp.phone}`}
                        className="inline-flex items-center gap-1 hover:text-brand-teal transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{emp.phone}</span>
                      </a>
                    )}
                    {emp.email && (
                      <a
                        href={`mailto:${emp.email}`}
                        className="inline-flex items-center gap-1 hover:text-brand-teal transition-colors truncate"
                      >
                        <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </a>
                    )}
                  </div>
                </CardContent>

                {/* Footer link to Dossier */}
                <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 rounded-b-2xl flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {emp.hireDate ? `Joined ${emp.hireDate}` : 'Personnel record'}
                  </span>
                  <Link
                    to={`/staff/${emp.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-teal group-hover:text-brand-tealDark transition-colors"
                  >
                    <span>View Dossier</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
