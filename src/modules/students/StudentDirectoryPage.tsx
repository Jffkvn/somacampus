import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { studentService, StudentDirectoryRow } from './studentService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { StatusPill } from '../../components/ui/StatusPill';
import { Users, Search, ArrowRight, UserPlus, Filter } from 'lucide-react';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const StudentDirectoryPage: React.FC = () => {
  const { role, schoolId } = useAuth();
  const activeSchoolId = schoolId || PILOT_SCHOOL_ID;

  const [rows, setRows] = useState<StudentDirectoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setRows(await studentService.getStudentDirectory(activeSchoolId));
      } catch (err) {
        console.error('Failed to load student directory', err);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [activeSchoolId]);

  // Extract unique class names for quick filtering
  const classOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.className && r.className !== '—') {
        set.add(r.className);
      }
    });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch =
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.admissionNumber.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q);

      const matchesClass = selectedClass === 'all' || r.className === selectedClass;

      return matchesSearch && matchesClass;
    });
  }, [rows, search, selectedClass]);

  const canAdmit = role === 'admin' || role === 'principal';

  if (isLoading) {
    return <LoadingState label="Loading student directory..." />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header with Title and Primary + Admit Student Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Students & Learners
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Student Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enrolled learners, class assignments, and student dossiers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status="info" label={`${filtered.length} Learners`} />
          {canAdmit && (
            <Link
              to="/students/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-teal hover:bg-brand-tealDark rounded-xl shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Admit Student</span>
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, admission number, or class..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50"
          />
        </div>

        {classOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 text-slate-700"
            >
              <option value="all">All Classes ({rows.length})</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Directory List */}
      {filtered.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No students found</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {rows.length === 0
              ? 'No active enrolments are visible for this school right now.'
              : 'No students match your filter or search query. Try resetting filters.'}
          </p>
          {canAdmit && (
            <div className="pt-2">
              <Link
                to="/students/new"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-brand-teal hover:text-brand-tealDark bg-teal-50 border border-teal-200/80 rounded-xl"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Admit your first student</span>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <Link
                  key={s.studentId}
                  to={`/students/${s.studentId}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-teal-50/40 transition-colors group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <span className="text-sm font-bold text-brand-teal">
                        {s.fullName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-brand-teal transition-colors">
                          {s.fullName}
                        </p>
                        {s.status && s.status !== 'active' && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 uppercase">
                            {s.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                        <span className="font-mono text-slate-600 font-medium">{s.admissionNumber}</span>
                        <span>•</span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-700">
                          {s.className}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-semibold text-brand-teal opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                      View Dossier
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-teal group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
