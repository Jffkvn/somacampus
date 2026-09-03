import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { studentService, StudentDirectoryRow } from './studentService';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { StatusPill } from '../../components/ui/StatusPill';
import { Users, Search, ArrowRight } from 'lucide-react';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const StudentDirectoryPage: React.FC = () => {
  const [rows, setRows] = useState<StudentDirectoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setRows(await studentService.getStudentDirectory(PILOT_SCHOOL_ID));
      } catch (err) {
        console.error('Failed to load student directory', err);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.admissionNumber.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (isLoading) {
    return <LoadingState label="Loading student directory..." />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Students
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Student Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enrolled learners and their attendance profiles
          </p>
        </div>
        <StatusPill status="info" label={`${filtered.length} Students`} />
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, admission number, or class..."
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal/50"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No students found</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {rows.length === 0
              ? 'No active enrolments are visible for this school right now.'
              : 'No students match your search. Try a different name or admission number.'}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <Link
                  key={s.studentId}
                  to={`/students/${s.studentId}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-teal-50/40 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-brand-teal">
                        {s.fullName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{s.fullName}</p>
                      <p className="text-xs text-slate-400">
                        {s.admissionNumber} • {s.className}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
