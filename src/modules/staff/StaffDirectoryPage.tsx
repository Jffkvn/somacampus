import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { staffService } from './staffService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { StatusPill } from '../../components/ui/StatusPill';
import { PageHeader } from '../../components/ui/PageHeader';
import { Sheet } from '../../components/ui/Sheet';
import { HireStaffWizardPage } from './HireStaffWizardPage';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import {
  Users,
  Search,
  ArrowRight,
  UserPlus,
  AlertCircle,
} from 'lucide-react';
import type { StaffMemberSummary } from '../../types/domain';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const StaffDirectoryPage: React.FC = () => {
  const { role, schoolId } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const activeSchoolId = schoolId || PILOT_SCHOOL_ID;

  const [staff, setStaff] = useState<StaffMemberSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'teaching' | 'support'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'on_leave' | 'terminated'>('all');
  const [hireOpen, setHireOpen] = useState(false);

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

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await staffService.listStaff(activeSchoolId, {
        type: typeFilter,
        status: statusFilter,
      });
      setStaff(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to reload staff directory.');
    } finally {
      setIsLoading(false);
    }
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
      <PageHeader
        eyebrow="People & Operations"
        title="Staff directory"
        description="Faculty appointments, subjects, and personnel dossiers"
        chips={<StatusPill status="info" label={`${filteredStaff.length} members`} />}
        actions={
          canHire ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="w-4 h-4" />}
              onClick={() => setHireOpen(true)}
            >
              Hire Staff
            </Button>
          ) : undefined
        }
      />

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

      {/* Staff list — dense rows for scanning (P2) */}
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
              <Button
                variant="outline"
                size="sm"
                leftIcon={<UserPlus className="w-4 h-4" />}
                onClick={() => setHireOpen(true)}
              >
                Hire New Staff Member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-2.5">Staff</th>
                  <th className="px-3 py-2.5 hidden sm:table-cell">Dept</th>
                  <th className="px-3 py-2.5 hidden md:table-cell">Subjects</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 w-10" aria-label="Open dossier" />
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((emp) => {
                  const initials = emp.fullName
                    ? emp.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'ST';
                  const subjectNames = emp.officialSubjects.map((s) => s.subjectName);
                  return (
                    <tr
                      key={emp.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/staff/${emp.id}`}
                          className="flex items-center gap-3 group no-underline"
                        >
                          <div className="w-8 h-8 rounded-lg bg-brand-teal/10 text-brand-teal flex items-center justify-center text-[11px] font-bold tracking-wide flex-shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate group-hover:text-brand-teal transition-colors">
                              {emp.fullName}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              <span className="font-mono">{emp.employeeNumber}</span>
                              <span className="mx-1">·</span>
                              {emp.role}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs text-slate-600">{emp.department}</span>
                        {emp.contractType && (
                          <span className="block text-[11px] text-slate-400 capitalize">
                            {emp.contractType.replace('_', ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {emp.isTeacher ? (
                          subjectNames.length > 0 ? (
                            <span className="text-xs text-slate-700">
                              {subjectNames.slice(0, 3).join(', ')}
                              {subjectNames.length > 3 ? ` +${subjectNames.length - 3}` : ''}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">None</span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
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
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          to={`/staff/${emp.id}`}
                          aria-label={`Open dossier for ${emp.fullName}`}
                          className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-brand-teal hover:bg-brand-teal/10 transition-colors"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* P2 — hire wizard as side sheet (page route /staff/new still available) */}
      <Sheet
        open={hireOpen}
        onClose={() => {
          setHireOpen(false);
          void reload();
        }}
        title="Hire staff"
        description="Appointment, compensation, and official subjects — one panel"
        widthClassName="w-full max-w-3xl"
      >
        <HireStaffWizardPage
          embedded
          onClose={() => {
            setHireOpen(false);
            void reload();
          }}
          onHired={(empId) => {
            setHireOpen(false);
            toast.success('Staff hired', 'Open the dossier to review compensation and subjects.');
            navigate(`/staff/${empId}`);
          }}
        />
      </Sheet>
    </div>
  );
};
