import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../lib/authContext';
import { resolveStudentId } from './learningCockpitService';
import { StudentQuizPanel } from './StudentQuizPanel';
import { LoadingState } from '../../components/ui/LoadingState';
import { useEffect, useState } from 'react';

/** P2A-1 quiz route: /student/quiz/:quizId */
export const StudentQuizPage: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const { schoolId, user } = useAuth();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) {
      setError('Sign in as a learner to take this quiz.');
      return;
    }
    resolveStudentId(user.email)
      .then(setStudentId)
      .catch((e) => {
        console.error(e);
        setError('We could not identify your learner account.');
      });
  }, [user?.email]);

  if (!schoolId || !quizId) {
    return <LoadingState label="Loading quiz..." />;
  }
  if (error || !studentId) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Assessments" title="Quiz" />
        <p className="text-sm text-rose-700">{error ?? 'Unavailable'}</p>
        <Link to="/student/home" className="text-sm font-semibold text-brand-teal hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Assessments"
        title="Quiz"
        description="Deterministic answer-key scoring. No AI marks."
      />
      <StudentQuizPanel schoolId={schoolId} studentId={studentId} quizId={quizId} />
      <Link to="/student/home" className="text-sm font-semibold text-brand-teal hover:underline">
        Back to home
      </Link>
    </div>
  );
};
