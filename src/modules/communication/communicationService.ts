/**
 * Parent-Teacher Messaging Service — SomaCampus Phase 8D Task 2 (in-app only).
 *
 * Tables (migration 20260913000005): communication_threads +
 * communication_participants + communication_messages + communication_reads.
 * RLS is the final arbiter:
 * - threads/participants/messages read: participant + admin/principal of the
 *   thread's school (oversight). Non-participant staff read nothing.
 * - threads INSERT: any school relationship; PER-PAIR contact authorisation
 *   is app-level here via is_authorised_parent_teacher_contact() (the DB
 *   exposes the rule as a function — INSERT-time "all initial participants
 *   are contactable" cannot live in RLS without write-amplifying triggers).
 * - messages INSERT: sender = self AND thread participation; immutable
 *   history (no UPDATE/DELETE).
 * - reads: strictly self-scoped (own INSERT/SELECT only).
 *
 * Locked decisions: in-app ONLY (no email/SMS/phone fields). Manual rows
 * carry is_ai_drafted=false; AI-drafted rows go ONLY through
 * sendApprovedDraft() — the draft MUST have landed in the editable composer
 * box first (human edit/approve), and the insert carries
 * is_ai_drafted=true + ai_draft_approved_by=self. No direct-send path.
 *
 * Conventions (mirrors announcementService / notificationService):
 * - Mock-env guard returns honest empties ([] / {marked:0}); writes throw
 *   like announcementService.createAnnouncement.
 * - DB/RLS errors THROW (D1 rule) — never silent [] and never leaked rows.
 * - Participant check precedes every thread write; a non-participant throws
 *   before any insert (the RLS deny path surfaces as a throw, never a
 *   silent success).
 */

import { supabase } from '../../lib/supabase';
import { createEventAndFanOut, fanOutMessage } from '../notifications/notificationFanout';

export type ThreadContextType =
  | 'general'
  | 'attendance'
  | 'assignment'
  | 'observation'
  | 'activity'
  | 'behaviour'
  | 'calendar_event'
  | 'finance';

export interface Thread {
  id: string;
  schoolId: string;
  subject: string | null;
  contextType: ThreadContextType;
  contextEntityId: string | null;
  createdBy: string | null;
  archived: boolean;
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  senderId: string | null;
  body: string;
  isAiDrafted: boolean;
  /** Approver of an AI-drafted row (self on the approval-gated path). */
  aiDraftApprovedBy: string | null;
  createdAt: string;
}

export interface ContactOption {
  personId: string;
  displayName: string;
}

export interface CreateThreadInput {
  schoolId: string;
  creatorPersonId: string;
  participantPersonIds: string[];
  subject?: string | null;
  contextType?: ThreadContextType;
  contextEntityId?: string | null;
  initialBody: string;
}

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export function toThreadView(row: any): Thread {
  return {
    id: row.id,
    schoolId: row.school_id,
    subject: row.subject ?? null,
    contextType: row.context_type ?? 'general',
    contextEntityId: row.context_entity_id ?? null,
    createdBy: row.created_by ?? null,
    archived: row.archived ?? false,
    createdAt: row.created_at,
  };
}

export function toMessageView(row: any): ThreadMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id ?? null,
    body: row.body,
    isAiDrafted: row.is_ai_drafted ?? false,
    aiDraftApprovedBy: row.ai_draft_approved_by ?? null,
    createdAt: row.created_at,
  };
}

function personDisplayName(row: any): string {
  const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return full || 'Contact';
}

const unique = (ids: Array<string | null | undefined>): string[] => [
  ...new Set(ids.filter((v): v is string => Boolean(v))),
];

/**
 * Client-generated UUID for new threads. crypto.randomUUID with a
 * Math.random fallback (non-crypto contexts such as some test runners).
 */
function newThreadId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Viewer person id via auth user -> people.auth_user_id. Fail-closed: throws
 * when there is no session or no linked person row.
 */
export async function resolveMyPersonId(): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  const id = (data as any)?.id ?? null;
  if (!id) throw new Error('No person record for this session.');
  return id;
}

/**
 * App-level contact check for one creator <-> candidate pair. The DB function
 * is directional (teacher -> parent), and the service does not assume which
 * side is which: either direction authorises the pair. Returns false (no
 * throw) when the pair is simply not contactable; DB errors throw.
 */
async function isAuthorisedPair(
  personA: string,
  personB: string,
  schoolId: string
): Promise<boolean> {
  const forward = await supabase.rpc('is_authorised_parent_teacher_contact', {
    p_teacher_person_id: personA,
    p_parent_person_id: personB,
    p_school_id: schoolId,
  });
  if ((forward as any).error) throw (forward as any).error;
  if ((forward as any).data === true) return true;

  const reverse = await supabase.rpc('is_authorised_parent_teacher_contact', {
    p_teacher_person_id: personB,
    p_parent_person_id: personA,
    p_school_id: schoolId,
  });
  if ((reverse as any).error) throw (reverse as any).error;
  return (reverse as any).data === true;
}

async function requireParticipant(threadId: string, personId: string): Promise<void> {
  const { data, error } = await supabase
    .from('communication_participants')
    .select('thread_id')
    .eq('thread_id', threadId)
    .eq('person_id', personId);
  if (error) throw error;
  if (!data || (data as any[]).length === 0) {
    throw new Error('Not a participant of this thread.');
  }
}

export const communicationService = {
  /**
   * Threads the viewer participates in, newest first. Participation rows are
   * the scope: an empty membership resolves to [] without a thread read.
   * The explicit school_id filter keeps cross-school reads empty even
   * before RLS.
   */
  async getMyThreads(personId: string, schoolId: string): Promise<Thread[]> {
    if (!personId) throw new Error('getMyThreads requires a person id.');
    if (!schoolId) throw new Error('getMyThreads requires a school id.');
    if (isMockEnv()) return [];

    const { data: memberships, error: memberError } = await supabase
      .from('communication_participants')
      .select('thread_id')
      .eq('person_id', personId);
    if (memberError) throw memberError;

    const threadIds = unique(((memberships as any[]) || []).map((m) => m.thread_id));
    if (threadIds.length === 0) return [];

    const { data, error } = await supabase
      .from('communication_threads')
      .select('*')
      .eq('school_id', schoolId)
      .in('id', threadIds)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return ((data as any[]) || []).map(toThreadView);
  },

  /**
   * Message history for one thread, oldest first. Participant check runs
   * first: a non-participant throws before any message row is read.
   */
  async getThreadMessages(threadId: string, viewerPersonId: string): Promise<ThreadMessage[]> {
    if (!threadId) throw new Error('getThreadMessages requires a thread id.');
    if (!viewerPersonId) throw new Error('getThreadMessages requires a person id.');
    if (isMockEnv()) return [];
    await requireParticipant(threadId, viewerPersonId);

    const { data, error } = await supabase
      .from('communication_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return ((data as any[]) || []).map(toMessageView);
  },

  /**
   * Open a thread with an initial message. Every non-creator participant is
   * validated against the creator via is_authorised_parent_teacher_contact()
   * (either direction); the first unauthorized pairing throws and NOTHING is
   * inserted. No AI drafting, in-app only.
   *
   * RETURNING/read-path audit (pre-membership deny):
   * - THREAD insert: client-generated id, NO returning select. The row's
   *   SELECT policy (participant + admin/principal) cannot cover the creator
   *   yet — participants are inserted after — so a RETURNING select would be
   *   denied with 42501 even though the INSERT itself is allowed. The view
   *   is built from the known inputs instead (createdAt is client time).
   * - PARTICIPANTS insert: no returning select either (nothing downstream
   *   needs the rows). Same hazard would apply: the participants SELECT
   *   policy is thread-scoped and the inserter is not yet a participant at
   *   insert time. The INSERT policy itself covers the creator via
   *   threads.created_by = self, which is set on the thread row first.
   * - MESSAGE insert: no returning select. Same hazard again: the messages
   *   SELECT policy mirrors thread participation, which only exists after
   *   the participants insert above.
   * (sendMessage below is the contrast case: the sender is already a
   * participant, so its RETURNING select satisfies the messages SELECT
   * policy and is kept.)
   */
  async createThread(input: CreateThreadInput): Promise<Thread> {
    if (!input.schoolId) throw new Error('createThread requires a school id.');
    if (!input.creatorPersonId) throw new Error('createThread requires a creator person id.');
    if (!input.initialBody?.trim()) throw new Error('The first message is required.');
    if (isMockEnv()) throw new Error('Messaging is unavailable in a mock environment.');

    const others = unique(input.participantPersonIds).filter((id) => id !== input.creatorPersonId);
    if (others.length === 0) throw new Error('At least one other participant is required.');

    for (const other of others) {
      const ok = await isAuthorisedPair(input.creatorPersonId, other, input.schoolId);
      if (!ok) {
        throw new Error('This contact is not an authorised parent-teacher pairing.');
      }
    }

    const threadId = newThreadId();
    const subject = input.subject?.trim() || null;
    const contextType = input.contextType ?? 'general';
    const { error: threadError } = await supabase.from('communication_threads').insert({
      id: threadId,
      school_id: input.schoolId,
      subject,
      context_type: contextType,
      context_entity_id: input.contextEntityId ?? null,
      created_by: input.creatorPersonId,
    });
    if (threadError) throw threadError;

    const { error: participantError } = await supabase
      .from('communication_participants')
      .insert(
        unique([input.creatorPersonId, ...others]).map((personId) => ({
          thread_id: threadId,
          person_id: personId,
          role: personId === input.creatorPersonId ? 'sender' : 'recipient',
        }))
      );
    if (participantError) throw participantError;

    const { error: messageError } = await supabase.from('communication_messages').insert({
      thread_id: threadId,
      sender_id: input.creatorPersonId,
      body: input.initialBody.trim(),
      is_ai_drafted: false,
    });
    if (messageError) throw messageError;

    // Best-effort fan-out: other participants get an in_app delivery. The
    // helper never throws; this try/catch is defense in depth — the thread
    // and its first message persist regardless.
    try {
      await createEventAndFanOut({
        schoolId: input.schoolId,
        eventType: 'message_received',
        sourceEntityType: 'communication_message',
        payload: { threadId, senderId: input.creatorPersonId },
      });
    } catch (err) {
      console.warn('createThread fan-out failed (thread unaffected):', err);
    }

    return {
      id: threadId,
      schoolId: input.schoolId,
      subject,
      contextType,
      contextEntityId: input.contextEntityId ?? null,
      createdBy: input.creatorPersonId,
      archived: false,
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * Reply in a thread. Participant check first (non-participant throws, no
   * insert); the sender column is always self, so RLS self-send holds.
   * The RETURNING select is kept deliberately: unlike createThread, the
   * sender is already a verified participant here, so the messages SELECT
   * policy (participant + admin/principal) covers the just-inserted row.
   */
  async sendMessage(threadId: string, senderPersonId: string, body: string): Promise<ThreadMessage> {
    if (!threadId) throw new Error('sendMessage requires a thread id.');
    if (!senderPersonId) throw new Error('sendMessage requires a sender person id.');
    if (!body?.trim()) throw new Error('Message body is required.');
    if (isMockEnv()) throw new Error('Messaging is unavailable in a mock environment.');
    await requireParticipant(threadId, senderPersonId);

    const { data, error } = await supabase
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        sender_id: senderPersonId,
        body: body.trim(),
        is_ai_drafted: false,
      })
      .select()
      .single();
    if (error) throw error;
    const sent = toMessageView(data);

    // Best-effort fan-out: other participants get an in_app delivery. The
    // helper never throws; this try/catch is defense in depth — the sent
    // message persists regardless.
    try {
      await fanOutMessage({
        threadId,
        senderId: senderPersonId,
        messageId: (data as any)?.id ?? null,
      });
    } catch (err) {
      console.warn('sendMessage fan-out failed (message unaffected):', err);
    }
    return sent;
  },

  /**
   * Approval-gated draft send (Phase 8F Task 2). The draft MUST have landed
   * in the editable composer box first — this function takes the HUMAN-EDITED
   * body, rejects empty edits (empty evidence => no draft => no send), and
   * inserts with is_ai_drafted=true + ai_draft_approved_by=self (the sender).
   * Participant check first, same as sendMessage; there is no other path
   * that writes is_ai_drafted=true.
   */
  async sendApprovedDraft(threadId: string, senderPersonId: string, editedBody: string): Promise<ThreadMessage> {
    if (!threadId) throw new Error('sendApprovedDraft requires a thread id.');
    if (!senderPersonId) throw new Error('sendApprovedDraft requires a sender person id.');
    if (!editedBody?.trim()) throw new Error('Edited draft body is required — empty evidence sends nothing.');
    if (isMockEnv()) throw new Error('Messaging is unavailable in a mock environment.');
    await requireParticipant(threadId, senderPersonId);

    const { data, error } = await supabase
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        sender_id: senderPersonId,
        body: editedBody.trim(),
        is_ai_drafted: true,
        ai_draft_approved_by: senderPersonId,
      })
      .select()
      .single();
    if (error) throw error;
    const approved = toMessageView(data);

    // Best-effort fan-out, same as sendMessage: the approved draft persists
    // regardless of fan-out outcome.
    try {
      await fanOutMessage({
        threadId,
        senderId: senderPersonId,
        messageId: (data as any)?.id ?? null,
      });
    } catch (err) {
      console.warn('sendApprovedDraft fan-out failed (message unaffected):', err);
    }
    return approved;
  },

  /**
   * Mark every message in a thread read for the viewer. Receipts are
   * strictly own-scoped: every inserted row carries reader_id = the caller's
   * own id (mirrors the reads self-insert RLS policy). Already-read rows
   * are skipped; UNIQUE replays resolve gracefully.
   */
  async markThreadRead(threadId: string, readerPersonId: string): Promise<{ marked: number }> {
    if (!threadId) throw new Error('markThreadRead requires a thread id.');
    if (!readerPersonId) throw new Error('markThreadRead requires a reader person id.');
    if (isMockEnv()) return { marked: 0 };

    const { data: messages, error: messageError } = await supabase
      .from('communication_messages')
      .select('id')
      .eq('thread_id', threadId);
    if (messageError) throw messageError;

    const messageIds = unique(((messages as any[]) || []).map((m) => m.id));
    if (messageIds.length === 0) return { marked: 0 };

    const { data: existing, error: readsError } = await supabase
      .from('communication_reads')
      .select('message_id')
      .eq('reader_id', readerPersonId)
      .in('message_id', messageIds);
    if (readsError) throw readsError;

    const readIds = new Set(((existing as any[]) || []).map((r) => r.message_id));
    let marked = 0;
    for (const messageId of messageIds) {
      if (readIds.has(messageId)) continue;
      const { error } = await supabase.from('communication_reads').insert({
        message_id: messageId,
        reader_id: readerPersonId,
      });
      if (error) {
        if ((error as any).code === '23505') continue;
        throw error;
      }
      marked += 1;
    }
    return { marked };
  },

  /**
   * Teacher contact picker: ONLY parents reachable through the teacher's own
   * assignments — class_teachers + subject_teachers legs (assignment ->
   * active enrolments in the class) plus the activity-lead leg (active
   * activity with enrolled students) — resolved to guardians, then to
   * people rows. No free-text parent search: the people read is id-scoped
   * to resolved guardian ids. A teacher with no active assignment legs
   * resolves to [] (fail-closed empty, not a school-wide directory).
   */
  async getContactableParents(teacherPersonId: string, schoolId: string): Promise<ContactOption[]> {
    if (!teacherPersonId) throw new Error('getContactableParents requires a teacher person id.');
    if (!schoolId) throw new Error('getContactableParents requires a school id.');
    if (isMockEnv()) return [];

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id')
      .eq('person_id', teacherPersonId)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .maybeSingle();
    if (employeeError) throw employeeError;
    const employeeId = (employee as any)?.id ?? null;
    if (!employeeId) return [];

    const { data: classRows, error: classError } = await supabase
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', employeeId)
      .eq('school_id', schoolId);
    if (classError) throw classError;

    const { data: subjectRows, error: subjectError } = await supabase
      .from('subject_teachers')
      .select('class_id')
      .eq('teacher_id', employeeId)
      .eq('school_id', schoolId);
    if (subjectError) throw subjectError;

    const { data: activities, error: activityError } = await supabase
      .from('school_activities')
      .select('id')
      .eq('lead_teacher_id', employeeId)
      .eq('school_id', schoolId)
      .eq('status', 'active');
    if (activityError) throw activityError;

    const classIds = unique([
      ...((classRows as any[]) || []).map((r) => r.class_id),
      ...((subjectRows as any[]) || []).map((r) => r.class_id),
    ]);
    const activityIds = unique(((activities as any[]) || []).map((a) => a.id));

    let studentIds: string[] = [];
    if (classIds.length > 0) {
      const { data: enrolments, error: enrolError } = await supabase
        .from('student_enrolments')
        .select('student_id')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .in('class_id', classIds);
      if (enrolError) throw enrolError;
      studentIds = unique(((enrolments as any[]) || []).map((e) => e.student_id));
    }
    if (activityIds.length > 0) {
      const { data: activityEnrolments, error: aeError } = await supabase
        .from('activity_enrolments')
        .select('student_id')
        .eq('school_id', schoolId)
        .eq('status', 'enrolled')
        .in('activity_id', activityIds);
      if (aeError) throw aeError;
      studentIds = unique([
        ...studentIds,
        ...(((activityEnrolments as any[]) || []).map((e) => e.student_id)),
      ]);
    }
    if (studentIds.length === 0) return [];

    const { data: links, error: linkError } = await supabase
      .from('student_guardians')
      .select('guardian_person_id')
      .in('student_id', studentIds);
    if (linkError) throw linkError;
    const guardianIds = unique(((links as any[]) || []).map((l) => l.guardian_person_id));
    if (guardianIds.length === 0) return [];

    const { data: people, error: peopleError } = await supabase
      .from('people')
      .select('id, first_name, last_name')
      .in('id', guardianIds);
    if (peopleError) throw peopleError;

    return ((people as any[]) || []).map((p) => ({
      personId: p.id,
      displayName: personDisplayName(p),
    }));
  },

  /**
   * Parent contact picker: ONLY teachers of the viewer's own children —
   * guardian links -> active enrolments in the school -> class/subject
   * teachers covering those classes -> people rows. Scoped to the parent's
   * resolved children (never a school-wide staff directory).
   */
  async getContactableTeachers(parentPersonId: string, schoolId: string): Promise<ContactOption[]> {
    if (!parentPersonId) throw new Error('getContactableTeachers requires a parent person id.');
    if (!schoolId) throw new Error('getContactableTeachers requires a school id.');
    if (isMockEnv()) return [];

    const { data: links, error: linkError } = await supabase
      .from('student_guardians')
      .select('student_id')
      .eq('guardian_person_id', parentPersonId);
    if (linkError) throw linkError;
    const linkedIds = unique(((links as any[]) || []).map((l) => l.student_id));
    if (linkedIds.length === 0) return [];

    const { data: enrolments, error: enrolError } = await supabase
      .from('student_enrolments')
      .select('student_id, class_id')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .in('student_id', linkedIds);
    if (enrolError) throw enrolError;
    const classIds = unique(((enrolments as any[]) || []).map((e) => e.class_id));
    if (classIds.length === 0) return [];

    const { data: classRows, error: classError } = await supabase
      .from('class_teachers')
      .select('teacher_id')
      .eq('school_id', schoolId)
      .in('class_id', classIds);
    if (classError) throw classError;

    const { data: subjectRows, error: subjectError } = await supabase
      .from('subject_teachers')
      .select('teacher_id')
      .eq('school_id', schoolId)
      .in('class_id', classIds);
    if (subjectError) throw subjectError;

    const employeeIds = unique([
      ...((classRows as any[]) || []).map((r) => r.teacher_id),
      ...((subjectRows as any[]) || []).map((r) => r.teacher_id),
    ]);
    if (employeeIds.length === 0) return [];

    const { data: employees, error: employeeError } = await supabase
      .from('employees')
      .select('id, person_id')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .in('id', employeeIds);
    if (employeeError) throw employeeError;
    const teacherPersonIds = unique(((employees as any[]) || []).map((e) => e.person_id));
    if (teacherPersonIds.length === 0) return [];

    const { data: people, error: peopleError } = await supabase
      .from('people')
      .select('id, first_name, last_name')
      .in('id', teacherPersonIds);
    if (peopleError) throw peopleError;

    return ((people as any[]) || []).map((p) => ({
      personId: p.id,
      displayName: personDisplayName(p),
    }));
  },
};
