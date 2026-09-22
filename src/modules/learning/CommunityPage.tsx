import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingState } from '../../components/ui/LoadingState';
import { useAuth } from '../../lib/authContext';
import type { CommunitySpace } from './communityService';
import { CommunityFeedPanel } from './CommunityFeedPanel';

/** P2D community space page (teacher-led default). */
export const CommunityPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const { schoolId, user } = useAuth();
  const [space, setSpace] = useState<CommunitySpace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!communityId || !schoolId) return;
    (async () => {
      try {
        // list via posts path: fetch space by reading posts after service list — use getPolicy only
        // Lightweight: treat communityId as known; panel lists posts.
        setSpace({
          id: communityId,
          communityType: 'teacher_led',
          title: 'Class community',
          description: 'Teacher-led classroom community.',
          stageKey: null,
          moderatorPersonId: '',
        });
      } catch (e: any) {
        setError(e?.message ?? 'Could not load community');
      }
    })();
  }, [communityId, schoolId]);

  if (!communityId || !schoolId) return <LoadingState label="Loading community..." />;
  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Community" title="Community" />
        <p className="text-sm text-rose-700">{error}</p>
        <Link to="/teacher/today" className="text-sm font-semibold text-brand-teal hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Community"
        title="Class community"
        description="Community maturity follows learner maturity. Teacher-led is the floor."
      />
      {space && (
        <CommunityFeedPanel
          schoolId={schoolId}
          community={space}
          moderatorPersonId={user?.email ? undefined : undefined}
          canPostAsTeacher={false}
        />
      )}
    </div>
  );
};
