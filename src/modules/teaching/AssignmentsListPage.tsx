import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assignmentService } from './assignmentService';
import type { Assignment, EvidenceTrack } from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';

const DEFAULT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

export const AssignmentsListPage: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<'all' | EvidenceTrack>('all');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    assignmentService
      .getAssignments(DEFAULT_SCHOOL_ID)
      .then((data) => {
        if (isMounted) {
          setAssignments(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message ?? 'Failed to load assignments');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = assignments.filter((a) => {
    if (trackFilter === 'all') return true;
    return a.evidenceTrack === trackFilter;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            Teaching Loop &bull; Academic Evidence
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Homework &amp; Assignments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage classwork, homework, and formal assessments linked to teaching context.
          </p>
        </div>
        <Link to="/teaching/assignments/new">
          <Button variant="primary" className="bg-teal-700 hover:bg-teal-800 text-white">
            + Create Assignment
          </Button>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTrackFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            trackFilter === 'all'
              ? 'bg-teal-700 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Activities ({assignments.length})
        </button>
        <button
          onClick={() => setTrackFilter('diagnostic_evidence')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            trackFilter === 'diagnostic_evidence'
              ? 'bg-teal-700 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Diagnostic Evidence (
          {assignments.filter((a) => a.evidenceTrack === 'diagnostic_evidence').length})
        </button>
        <button
          onClick={() => setTrackFilter('formal_graded')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            trackFilter === 'formal_graded'
              ? 'bg-indigo-700 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Formal Assessments (
          {assignments.filter((a) => a.evidenceTrack === 'formal_graded').length})
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <LoadingState label="Loading assignments..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No assignments found"
          description={
            trackFilter === 'all'
              ? 'No assignments or homework have been created yet.'
              : `No assignments matching the "${trackFilter.replace('_', ' ')}" track.`
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((a) => {
            const isFormal = a.evidenceTrack === 'formal_graded';
            return (
              <Card key={a.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isFormal
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {isFormal ? 'Formal Graded' : 'Diagnostic Evidence'}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">
                        {a.submissionType}
                      </span>
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900">
                      {a.title}
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {a.className} {a.streamName ? `• ${a.streamName}` : ''} &bull;{' '}
                      {a.subjectName ?? 'General'}
                    </p>
                  </div>
                  <StatusPill
                    status={a.status === 'published' ? 'success' : 'neutral'}
                    label={a.status}
                    size="sm"
                  />
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-xs text-slate-600 line-clamp-2">{a.instructions}</p>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <div>
                      <span>Due: {a.dueDate}</span>
                      {isFormal && a.maxScore && (
                        <span className="ml-2 font-semibold text-slate-700">
                          Max: {a.maxScore} pts
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-slate-700">
                      {a.submittedCount ?? 0}/{a.expectedCount ?? 0} Submitted
                      {(a.missingCount ?? 0) > 0 && (
                        <span className="text-red-600 ml-1">
                          &bull; {a.missingCount} Missing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <Link to={`/teaching/assignments/${a.id}`}>
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        Review Submissions &rarr;
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
