/**
 * P2D teacher-led community feed. Default model for younger learners.
 * Peer features stay behind school policy (communityDomain).
 */
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, MessagesSquare, Pin } from 'lucide-react';
import { communityService, type CommunitySpace } from './communityService';
import { canCreateCommunity, type CommunityPolicy } from './communityDomain';

export interface CommunityFeedPanelProps {
  schoolId: string;
  stageKey?: string;
  community: CommunitySpace;
  moderatorPersonId?: string | null;
  canPostAsTeacher?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  teacher_led: 'Teacher-led',
  study_group: 'Study group',
  peer_review: 'Peer review',
  club: 'Club',
};

export const CommunityFeedPanel: React.FC<CommunityFeedPanelProps> = ({
  schoolId,
  stageKey = '',
  community,
  moderatorPersonId,
  canPostAsTeacher = false,
}) => {
  const [policy, setPolicy] = useState<CommunityPolicy | null>(null);
  const [posts, setPosts] = useState<Awaited<ReturnType<typeof communityService.listPosts>>>([]);
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const [p, list] = await Promise.all([
        communityService.getPolicy(schoolId, stageKey),
        communityService.listPosts(community.id),
      ]);
      setPolicy(p);
      setPosts(list);
    } catch (err: any) {
      console.error('Community load failed:', err);
      setError('We could not load this community right now.');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id, schoolId, stageKey]);

  const peerAllowed = policy
    ? canCreateCommunity(policy, community.communityType).allowed
    : community.communityType === 'teacher_led';

  const post = async () => {
    if (!moderatorPersonId || !body.trim()) return;
    setIsSaving(true);
    try {
      await communityService.createPost({
        schoolId,
        communityId: community.id,
        authorPersonId: moderatorPersonId,
        body,
        isPinned,
      });
      setBody('');
      setIsPinned(false);
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not post');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (id: string, next: boolean) => {
    try {
      await communityService.moderatePost(id, { isPinned: next });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not update pin');
    }
  };

  const toggleLock = async (id: string, next: boolean) => {
    try {
      await communityService.moderatePost(id, { isLocked: next });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not update lock');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <MessagesSquare className="w-4 h-4 text-brand-teal" /> {community.title}
            </span>
          </CardTitle>
          <CardDescription>
            {community.description || 'Teacher-led classroom community (not a social network).'}
          </CardDescription>
        </div>
        <StatusPill
          status={community.communityType === 'teacher_led' ? 'success' : 'info'}
          label={TYPE_LABEL[community.communityType] ?? community.communityType}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!peerAllowed && community.communityType !== 'teacher_led' && (
          <p className="text-xs text-amber-700">
            Peer features are off for this stage policy — teacher-led only.
          </p>
        )}

        {canPostAsTeacher && moderatorPersonId && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Class challenge, show-and-tell, or teacher question…"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                />
                Pin to top
              </label>
              <Button type="button" size="sm" disabled={isSaving || !body.trim()} onClick={() => void post()}>
                {isSaving ? 'Posting…' : 'Post to class'}
              </Button>
            </div>
          </div>
        )}

        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                {p.isPinned && <Pin className="w-3.5 h-3.5 text-brand-teal" />}
                <span className="text-[11px] text-slate-400">{String(p.createdAt).slice(0, 10)}</span>
                {canPostAsTeacher && (
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-brand-teal hover:underline"
                      onClick={() => void togglePin(p.id, !p.isPinned)}
                    >
                      {p.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-slate-500 hover:underline"
                      onClick={() => void toggleLock(p.id, !p.isLocked)}
                    >
                      {p.isLocked ? 'Unlock' : 'Lock'}
                    </button>
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-800">{p.body}</p>
              {p.isLocked && (
                <p className="text-[11px] text-slate-400 mt-1">Locked — no further replies.</p>
              )}
            </li>
          ))}
          {posts.length === 0 && (
            <li className="text-sm text-slate-400">No posts yet — start with a class challenge.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
};
