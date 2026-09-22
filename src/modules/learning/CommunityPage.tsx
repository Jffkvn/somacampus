import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingState } from '../../components/ui/LoadingState';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import type { CommunitySpace } from './communityService';
import { CommunityFeedPanel } from './CommunityFeedPanel';
import { PeerReviewPanel } from './PeerReviewPanel';

async function resolvePersonIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase.from('people').select('id').eq('email', email).limit(1);
  if (error || !data?.length) return null;
  return String(data[0].id);
}

/** P2D community space page (teacher-led default). */
export const CommunityPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const { schoolId, user, role } = useAuth();
  const [space, setSpace] = useState<CommunitySpace | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);

  useEffect(() => {
    if (!communityId || !schoolId) return;
    setSpace({
      id: communityId,
      communityType: 'teacher_led',
      title: 'Class community',
      description: 'Teacher-led classroom community (challenges, show-and-tell, class Q).',
      stageKey: null,
      moderatorPersonId: '',
    });
  }, [communityId, schoolId]);

  useEffect(() => {
    if (!user?.email) return;
    void resolvePersonIdByEmail(user.email).then(setPersonId);
  }, [user?.email]);

  if (!communityId || !schoolId) return <LoadingState label="Loading community..." />;

  const canPost = role === 'teacher' || role === 'principal' || role === 'admin';

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
          moderatorPersonId={personId}
          canPostAsTeacher={canPost && Boolean(personId)}
        />
      )}
      {/* P2D-3 structured peer review (formative, policy-gated) */}
      <PeerReviewPanel
        schoolId={schoolId}
        canAuthor={canPost}
        createdByPersonId={personId}
      />
    </div>
  );
};
