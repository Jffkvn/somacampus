import React, { useState, useEffect, useCallback } from 'react';
import { communicationService, resolveMyPersonId } from './communicationService';
import type {
  Thread,
  ThreadMessage,
  ThreadContextType,
  ContactOption,
} from './communicationService';
import { useAuth } from '../../lib/authContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import { observationService } from '../teaching/observationService';
import { composeParentUpdate } from './aiDraftService';

const CONTEXT_TYPES: ThreadContextType[] = [
  'general',
  'attendance',
  'assignment',
  'observation',
  'activity',
  'behaviour',
  'calendar_event',
  'finance',
];

function contextLabel(thread: Thread): string {
  if (thread.contextType === 'general') return 'General';
  const base = thread.contextType.replace(/_/g, ' ');
  return thread.contextEntityId ? `${base} • ${thread.contextEntityId.slice(0, 8)}` : base;
}

const ThreadView: React.FC<{
  thread: Thread;
  personId: string;
  onSent: () => void;
}> = ({ thread, personId, onSent }) => {
  const { role } = useAuth();
  // Draft-update gate: teacher only. Drafts ALWAYS land in the editable
  // reply box first (human edit -> approve -> send); no direct-send path.
  const canDraftUpdate = role === 'teacher';
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [readMarked, setReadMarked] = useState(false);
  const [isAiDraft, setIsAiDraft] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        setReadMarked(false);
        const history = await communicationService.getThreadMessages(thread.id, personId);
        if (cancelled) return;
        setMessages(history);
        const receipt = await communicationService.markThreadRead(thread.id, personId);
        if (cancelled) return;
        setReadMarked(receipt.marked >= 0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load this conversation.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thread.id, personId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    try {
      setIsSending(true);
      // Approval gate: AI-drafted content sends ONLY via the flagged path
      // (is_ai_drafted=true + ai_draft_approved_by=self) after human edit.
      const sent = isAiDraft
        ? await communicationService.sendApprovedDraft(thread.id, personId, reply.trim())
        : await communicationService.sendMessage(thread.id, personId, reply.trim());
      setMessages((prev) => [...prev, sent]);
      setReply('');
      setIsAiDraft(false);
      setDraftNotice(null);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Teacher-only "Draft update": composes from the thread's recent
   * parent_visible observations for the linked student — filtered
   * server-side by getParentVisibleObservationsForStudent, with the
   * client-side parent_visible check kept as belt-and-braces. The draft
   * lands in the editable reply box — never sent directly. Empty evidence
   * => honest notice, no draft, no send.
   */
  const handleDraftUpdate = async () => {
    if (!canDraftUpdate || !thread.contextEntityId) {
      setDraftNotice('No linked student on this thread — drafts need thread context.');
      return;
    }
    try {
      setIsDrafting(true);
      setDraftNotice(null);
      const all = await observationService.getParentVisibleObservationsForStudent(thread.contextEntityId);
      const approved = (all ?? []).filter((o) => o.visibility === 'parent_visible');
      const studentName = approved[0]?.studentName ?? thread.subject ?? 'this student';
      const draft = composeParentUpdate(
        studentName,
        approved.map((o) => ({ observationText: o.observationText, visibility: 'parent_visible' as const }))
      );
      if (draft.sourceCount === 0) {
        setDraftNotice('No approved observations to summarize yet — draft not created.');
        return;
      }
      setReply(draft.body);
      setIsAiDraft(true);
    } catch (err) {
      setDraftNotice(err instanceof Error ? err.message : 'Could not compose the draft.');
    } finally {
      setIsDrafting(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading conversation..." />;
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{thread.subject || 'Conversation'}</CardTitle>
          <CardDescription>
            {contextLabel(thread)}
            {thread.archived ? ' • archived' : ''}
          </CardDescription>
        </div>
        {readMarked && <StatusPill status="success" label="Read" />}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Start the conversation with the reply box below."
          />
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const mine = m.senderId === personId;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      mine
                        ? 'bg-brand-teal text-white'
                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`text-[11px] mt-1 ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                      {new Date(m.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <form onSubmit={handleSend} className="space-y-2 pt-2 border-t border-slate-100">
          {draftNotice && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              {draftNotice}
            </p>
          )}
          {isAiDraft && (
            <div className="flex items-center justify-between gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="font-semibold text-amber-800">
                AI draft — review & edit before sending. Sending records you as approver.
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsAiDraft(false);
                  setReply('');
                  setDraftNotice(null);
                }}
                className="shrink-0 font-bold text-amber-700 underline"
              >
                Discard
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Write a reply..."
            className="flex-1 text-sm border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          />
          {canDraftUpdate && (
            <Button
              variant="secondary"
              type="button"
              disabled={isDrafting}
              onClick={handleDraftUpdate}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              {isDrafting ? 'Drafting...' : 'Draft update'}
            </Button>
          )}
          <Button variant="primary" type="submit" isLoading={isSending} leftIcon={<Send className="w-4 h-4" />}>
            Send
          </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export const MessagesPage: React.FC = () => {
  const { role, schoolId } = useAuth();
  const canStartThread = role === 'teacher' || role === 'parent';

  const [personId, setPersonId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New thread form (contact picker is a resolved list — no free-text search).
  const [contactId, setContactId] = useState('');
  const [subject, setSubject] = useState('');
  const [contextType, setContextType] = useState<ThreadContextType>('general');
  const [firstMessage, setFirstMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  const loadThreads = useCallback(
    async (viewerId: string) => {
      if (!schoolId) {
        setError('No school context for this session.');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        const list = await communicationService.getMyThreads(viewerId, schoolId);
        setThreads(list);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load conversations.');
      } finally {
        setIsLoading(false);
      }
    },
    [schoolId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const viewerId = await resolveMyPersonId();
        if (cancelled) return;
        setPersonId(viewerId);
        await loadThreads(viewerId);
        if (cancelled || !schoolId) return;
        if (role === 'teacher') {
          setContacts(await communicationService.getContactableParents(viewerId, schoolId));
        } else if (role === 'parent') {
          setContacts(await communicationService.getContactableTeachers(viewerId, schoolId));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not initialise messaging.');
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !personId || !contactId) return;
    try {
      setIsCreating(true);
      setFormError(null);
      const created = await communicationService.createThread({
        schoolId,
        creatorPersonId: personId,
        participantPersonIds: [contactId],
        subject: subject.trim() || null,
        contextType,
        initialBody: firstMessage.trim(),
      });
      setThreads((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setContactId('');
      setSubject('');
      setContextType('general');
      setFirstMessage('');
      setShowComposer(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not start the conversation.');
    } finally {
      setIsCreating(false);
    }
  };

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingState label="Loading conversations..." />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-6xl mx-auto animate-in fade-in">
      <div className="border-b border-slate-200 pb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Messages</h1>
          <p className="text-sm text-slate-500 mt-1">
            Parent-teacher conversations. In-app only — contact authorisation enforced.
          </p>
        </div>
        {canStartThread && (
          <Button variant={showComposer ? 'secondary' : 'primary'} onClick={() => setShowComposer((v) => !v)}>
            {showComposer ? 'Close' : 'New message'}
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {showComposer && canStartThread && personId && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>New conversation</CardTitle>
              <CardDescription>
                {role === 'teacher'
                  ? 'Only parents of children in your assigned classes, subjects, or activities are listed.'
                  : 'Only teachers of your own children are listed.'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  {role === 'teacher' ? 'Parent' : 'Teacher'}
                </label>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value="">Select a contact…</option>
                  {contacts.map((c) => (
                    <option key={c.personId} value={c.personId}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
                {contacts.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    No authorised contacts found for your current assignments.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Subject
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Reading progress this term"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Topic
                  </label>
                  <select
                    value={contextType}
                    onChange={(e) => setContextType(e.target.value as ThreadContextType)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  >
                    {CONTEXT_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Message
                </label>
                <textarea
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  rows={3}
                  placeholder="Write the first message..."
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                />
              </div>
              {formError && <p className="text-sm text-red-700">{formError}</p>}
              <div className="flex justify-end">
                <Button variant="primary" type="submit" isLoading={isCreating} disabled={!contactId || !firstMessage.trim()}>
                  Start conversation
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Conversations</CardTitle>
                <CardDescription>{threads.length} thread{threads.length === 1 ? '' : 's'}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {threads.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No conversations"
                  description="Your parent-teacher conversations will appear here."
                />
              ) : (
                <div className="space-y-2">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left rounded-xl border p-3 transition-colors ${
                        t.id === selectedId
                          ? 'border-brand-teal bg-brand-teal/5'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {t.subject || 'Conversation'}
                        </p>
                        {t.archived && <StatusPill status="neutral" label="archived" />}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {contextLabel(t)} • {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          {selected && personId ? (
            <ThreadView
              thread={selected}
              personId={personId}
              onSent={() => personId && loadThreads(personId)}
            />
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Choose a thread from the list to read and reply."
            />
          )}
        </div>
      </div>
    </div>
  );
};
