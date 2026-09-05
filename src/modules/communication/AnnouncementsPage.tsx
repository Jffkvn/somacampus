import React, { useState, useEffect, useCallback } from 'react';
import { announcementService } from './announcementService';
import type {
  Announcement,
  AnnouncementAckResponse,
  AnnouncementAudience,
  AnnouncementPriority,
} from './announcementService';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Megaphone, Sparkles } from 'lucide-react';
import { composeAnnouncement } from './aiDraftService';

const AUDIENCES: AnnouncementAudience[] = [
  'school',
  'staff',
  'teachers',
  'parents',
  'students',
  'class',
];

const PRIORITIES: AnnouncementPriority[] = ['normal', 'important', 'urgent', 'emergency'];

function priorityVariant(priority: AnnouncementPriority): 'neutral' | 'info' | 'warning' | 'critical' {
  if (priority === 'emergency') return 'critical';
  if (priority === 'urgent') return 'warning';
  if (priority === 'important') return 'info';
  return 'neutral';
}

export const AnnouncementsPage: React.FC = () => {
  const { role, schoolId, user } = useAuth();
  const canCreate = role === 'admin' || role === 'principal';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [personId, setPersonId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Staff create form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Draft points (one per line): the Draft button composes these + the title
  // into the editable body field. Drafts NEVER auto-publish.
  const [points, setPoints] = useState('');
  const [isAiDraft, setIsAiDraft] = useState(false);
  const [audience, setAudience] = useState<AnnouncementAudience>('school');
  const [targetClassId, setTargetClassId] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [requiresAck, setRequiresAck] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [ackingId, setAckingId] = useState<string | null>(null);

  const loadFeed = useCallback(
    async (viewerId: string | null) => {
      if (!schoolId) {
        setError('No school context for this session.');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        const feed = await announcementService.getAnnouncements(
          schoolId,
          viewerId ?? undefined
        );
        setAnnouncements(feed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load announcements.');
      } finally {
        setIsLoading(false);
      }
    },
    [schoolId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let viewerId: string | null = null;
      try {
        if (user?.id) {
          const { data } = await supabase
            .from('people')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();
          viewerId = (data as any)?.id ?? null;
        }
      } catch {
        viewerId = null;
      }
      if (cancelled) return;
      setPersonId(viewerId);
      await loadFeed(viewerId);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    try {
      setIsPublishing(true);
      setFormError(null);
      // Approval gate: bodies composed via Draft publish flagged
      // (is_ai_drafted=true); manual bodies stay unflagged.
      const created = await announcementService.createAnnouncement({
        schoolId,
        title,
        body,
        audience,
        priority,
        requiresAcknowledgement: requiresAck,
        targetClassId: audience === 'class' ? targetClassId.trim() || null : null,
        publishedBy: personId,
        actorRole: role,
        isAiDrafted: isAiDraft,
      });
      setAnnouncements((prev) => [created, ...prev]);
      setTitle('');
      setBody('');
      setPoints('');
      setIsAiDraft(false);
      setAudience('school');
      setTargetClassId('');
      setPriority('normal');
      setRequiresAck(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not publish announcement.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleAcknowledge = async (id: string, response: AnnouncementAckResponse) => {
    if (!personId) {
      setError('Could not resolve your staff record — acknowledgement unavailable.');
      return;
    }
    try {
      setAckingId(id);
      await announcementService.acknowledge(id, personId, response);
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, acknowledged: true, myResponse: response } : a
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record acknowledgement.');
    } finally {
      setAckingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingState label="Loading announcements..." />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-4xl mx-auto animate-in fade-in">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Announcements & Broadcasts
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Targeted school announcements for staff, parents, students, and classes. In-app only.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {canCreate && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Publish announcement</CardTitle>
              <CardDescription>
                Draft fills the message field for review — nothing publishes until you press Publish. RLS enforces admin/principal publish.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePublish} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sports Day moved to Friday"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Key points (one per line) — for AI draft only
                </label>
                <textarea
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  rows={2}
                  placeholder="e.g. Friday at the main field&#10;Bring packed lunch"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  placeholder="Write the announcement..."
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                />
                {isAiDraft && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="font-semibold text-amber-800">
                      AI draft — review & edit before publishing.
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAiDraft(false)}
                      className="shrink-0 font-bold text-amber-700 underline"
                    >
                      Discard draft flag
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Audience
                  </label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as AnnouncementPriority)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {audience === 'class' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Target class ID
                  </label>
                  <input
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(e.target.value)}
                    placeholder="e.g. class UUID for the targeted class"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={requiresAck}
                  onChange={(e) => setRequiresAck(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Requires acknowledgement
              </label>
              {formError && <p className="text-sm text-red-700">{formError}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  leftIcon={<Sparkles className="w-4 h-4" />}
                  onClick={() => {
                    const lines = points.split('\n').map((p) => p.trim()).filter(Boolean);
                    const draft = composeAnnouncement({ title: title.trim() || 'Announcement', points: lines });
                    setBody(draft.body);
                    setIsAiDraft(true);
                  }}
                >
                  Draft
                </Button>
                <Button variant="primary" type="submit" isLoading={isPublishing}>
                  Publish
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="There are no announcements for your audience right now. Staff broadcasts will appear here."
        />
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <Card key={a.id} className={a.isExpired ? 'opacity-60' : undefined}>
              <CardContent>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-bold text-slate-900">{a.title}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={priorityVariant(a.priority)} label={a.priority} />
                    {a.isExpired && <StatusPill status="neutral" label="expired" />}
                  </div>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">
                    To {a.audience}
                    {a.audience === 'class' && a.targetClassId ? ` • class ${a.targetClassId}` : ''}
                    {' • '}
                    {new Date(a.publishedAt).toLocaleDateString()}
                  </span>
                  {a.requiresAcknowledgement &&
                    (a.acknowledged ? (
                      <StatusPill
                        status="success"
                        label={a.myResponse ? `Acknowledged (${a.myResponse})` : 'Acknowledged'}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={ackingId === a.id}
                          onClick={() => handleAcknowledge(a.id, 'acknowledged')}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={ackingId === a.id}
                          onClick={() => handleAcknowledge(a.id, 'yes')}
                        >
                          Yes
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={ackingId === a.id}
                          onClick={() => handleAcknowledge(a.id, 'no')}
                        >
                          No
                        </Button>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
