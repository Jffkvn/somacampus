import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase 8F Task 2 — draft UI approval gates (logic-level, no DOM).
 *
 * Gate under test: drafts NEVER send directly. Flow is
 * draft (pure composer, no I/O) -> human edit (editable box) ->
 * approve + send (flagged insert with approver). Explain is read-only.
 */

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, auth: { getUser: vi.fn() } },
}));

import {
  composeParentUpdate,
  composeAnnouncement,
  explainFeedback,
  EMPTY_EVIDENCE_MESSAGE,
} from '../modules/communication/aiDraftService';
import { communicationService } from '../modules/communication/communicationService';
import { announcementService } from '../modules/communication/announcementService';

describe('AI draft flow approval gates (Phase 8F Task 2)', () => {
  let captured: { table: string; op: string; payload: any }[] = [];
  let tableResponses: Record<string, unknown> = {};

  const builderFor = (table: string) => {
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.order = () => b;
    b.insert = (payload: any) => {
      captured.push({ table, op: 'insert', payload });
      return b;
    };
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => {
      const r: any = tableResponses[table] ?? { data: null, error: null };
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    };
    b.then = (res: any, rej: any) => {
      const r: any = tableResponses[table] ?? { data: [], error: null };
      if (r instanceof Error) return Promise.reject(r).then(res, rej);
      return Promise.resolve(r).then(res, rej);
    };
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    // Thread participant check passes: viewer is a participant.
    tableResponses = {
      communication_participants: { data: [{ thread_id: 'thread-1' }], error: null },
      communication_messages: {
        data: {
          id: 'msg-1',
          thread_id: 'thread-1',
          sender_id: 'teacher-1',
          body: 'Hello, here is a learning update for Amina.',
          is_ai_drafted: true,
          ai_draft_approved_by: 'teacher-1',
          created_at: '2026-09-10T08:00:00Z',
        },
        error: null,
      },
      school_announcements: {
        data: {
          id: 'ann-1',
          school_id: 'school-1',
          title: 'Sports Day',
          body: 'Sports Day\n\n- Friday at the main field.',
          priority: 'normal',
          target_audience: 'parents',
          target_class_id: null,
          requires_acknowledgement: false,
          published_by: 'person-1',
          published_at: '2026-09-12T08:00:00Z',
          expires_at: null,
        },
        error: null,
      },
    };
    captured = [];
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockImplementation(() => Promise.resolve({ data: true, error: null }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(1) draft lands editable, never sent: compose performs zero service calls', () => {
    const draft = composeParentUpdate('Amina', [
      { observationText: 'Amina read aloud fluently during English group work.', visibility: 'parent_visible' },
    ]);
    // Draft is flagged for human approval — the UI must place it in the
    // editable composer box; there is no direct-send path for drafts.
    expect(draft.isAiDrafted).toBe(true);
    expect(draft.requiresHumanApproval).toBe(true);
    expect(draft.body).toContain('Amina');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('(2) approve + send sets is_ai_drafted + ai_draft_approved_by=self', async () => {
    const sent = await communicationService.sendApprovedDraft(
      'thread-1',
      'teacher-1',
      'Hello, here is a learning update for Amina (edited).'
    );
    const payload = captured.find((c) => c.table === 'communication_messages')?.payload;
    expect(payload.is_ai_drafted).toBe(true);
    expect(payload.ai_draft_approved_by).toBe('teacher-1');
    expect(sent.isAiDrafted).toBe(true);
  });

  it('(2b) manual send path stays unflagged: drafts ALWAYS go editable-first', async () => {
    tableResponses.communication_messages = {
      data: {
        id: 'msg-2',
        thread_id: 'thread-1',
        sender_id: 'teacher-1',
        body: 'Quick manual reply.',
        is_ai_drafted: false,
        ai_draft_approved_by: null,
        created_at: '2026-09-10T08:00:00Z',
      },
      error: null,
    };
    await communicationService.sendMessage('thread-1', 'teacher-1', 'Quick manual reply.');
    const payload = captured.find((c) => c.table === 'communication_messages')?.payload;
    expect(payload.is_ai_drafted).toBe(false);
    expect(payload.ai_draft_approved_by ?? null).toBeNull();
  });

  it('(3) announcement publish from an approved draft sets is_ai_drafted', async () => {
    const draft = composeAnnouncement({
      title: 'Sports Day',
      points: ['Friday at the main field.'],
      audience: 'parents',
    });
    // Draft fills the body field editable — no auto-publish (no service call).
    expect(draft.requiresHumanApproval).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();

    // Human reviews/edits, then publishes: the flagged path carries the draft bit.
    await announcementService.createAnnouncement({
      schoolId: 'school-1',
      title: draft.title,
      body: `${draft.body} (edited)`,
      audience: 'parents',
      actorRole: 'principal',
      isAiDrafted: true,
    });
    const payload = captured.find((c) => c.table === 'school_announcements')?.payload;
    expect(payload.is_ai_drafted).toBe(true);
  });

  it('(4) Explain is read-only: creates no rows', () => {
    const out = explainFeedback(
      'Amina read aloud very fluently during English group work and she really helped her desk partner patiently.',
      ['Amina', 'English', 'partner']
    );
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.text.toLowerCase()).toContain('amina');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it('(5) empty evidence yields no draft and no send', async () => {
    const draft = composeParentUpdate('Denis', []);
    expect(draft.sourceCount).toBe(0);
    expect(draft.body).toBe(EMPTY_EVIDENCE_MESSAGE);
    // Approving an empty edited body is rejected — nothing is inserted.
    await expect(communicationService.sendApprovedDraft('thread-1', 'teacher-1', '   ')).rejects.toThrow();
    expect(captured.filter((c) => c.table === 'communication_messages')).toHaveLength(0);
  });
});
