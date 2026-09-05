import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, auth: { getUser: vi.fn() } },
}));

import { communicationService } from '../modules/communication/communicationService';

describe('Communication Service — parent-teacher messaging (Phase 8D Task 2)', () => {
  let tableResponses: Record<string, unknown> = {};
  let tableQueues: Record<string, Array<{ data: any; error: any }>> = {};
  let rpcQueue: Array<{ data: any; error: any }> = [];
  let captured: { table: string; op: string; payload: any; filters: Array<[string, any]>; inFilters: Array<[string, any[]]> }[] = [];
  let chainLog: Array<{ table: string; method: string }> = [];

  const nextResponse = (table: string) => {
    const q = tableQueues[table];
    if (q && q.length > 0) return Promise.resolve(q.shift());
    const r: any = tableResponses[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: null });
  };

  const builderFor = (table: string) => {
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const b: any = {};
    const log = (method: string) => {
      chainLog.push({ table, method });
      return b;
    };
    b.select = () => log('select');
    b.eq = (col: string, val: any) => {
      filters.push([col, val]);
      return log('eq');
    };
    b.in = (col: string, vals: any[]) => {
      inFilters.push([col, vals]);
      return log('in');
    };
    b.order = () => log('order');
    b.limit = () => log('limit');
    b.update = (payload: any) => {
      captured.push({ table, op: 'update', payload, filters, inFilters });
      return log('update');
    };
    b.upsert = (payload: any) => {
      captured.push({ table, op: 'upsert', payload, filters, inFilters });
      return log('upsert');
    };
    b.insert = (payload: any) => {
      captured.push({ table, op: 'insert', payload, filters: [...filters], inFilters: [...inFilters] });
      return log('insert');
    };
    b.maybeSingle = () => {
      chainLog.push({ table, method: 'maybeSingle' });
      return nextResponse(table);
    };
    b.single = () => {
      chainLog.push({ table, method: 'single' });
      return nextResponse(table);
    };
    b.then = (res: any, rej: any) => nextResponse(table).then(res, rej);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockImplementation(() => {
      if (rpcQueue.length > 0) return Promise.resolve(rpcQueue.shift());
      return Promise.resolve({ data: true, error: null });
    });
    tableResponses = {};
    tableQueues = {};
    rpcQueue = [];
    captured = [];
    chainLog = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(a) thread list returns the viewer participant threads mapped', async () => {
    tableResponses.communication_participants = {
      data: [{ thread_id: 'thread-1' }, { thread_id: 'thread-2' }],
      error: null,
    };
    tableResponses.communication_threads = {
      data: [
        {
          id: 'thread-1',
          school_id: 'school-1',
          subject: 'Amari reading progress',
          context_type: 'observation',
          context_entity_id: null,
          created_by: 'teacher-1',
          archived: false,
          created_at: '2026-09-10T08:00:00Z',
        },
        {
          id: 'thread-2',
          school_id: 'school-1',
          subject: 'Trip consent',
          context_type: 'activity',
          context_entity_id: 'activity-7',
          created_by: 'parent-1',
          archived: false,
          created_at: '2026-09-08T08:00:00Z',
        },
      ],
      error: null,
    };

    const threads = await communicationService.getMyThreads('person-9', 'school-1');

    expect(threads).toHaveLength(2);
    expect(threads[0].id).toBe('thread-1');
    expect(threads[0].subject).toBe('Amari reading progress');
    expect(threads[0].contextType).toBe('observation');
    expect(threads[1].contextEntityId).toBe('activity-7');
    expect(mockFrom).toHaveBeenCalledWith('communication_participants');
    expect(mockFrom).toHaveBeenCalledWith('communication_threads');
  });

  it('(a2) empty participation resolves to an empty list without a thread read', async () => {
    tableResponses.communication_participants = { data: [], error: null };

    const threads = await communicationService.getMyThreads('person-9', 'school-1');

    expect(threads).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('communication_participants');
    expect(mockFrom).not.toHaveBeenCalledWith('communication_threads');
  });

  it('(b) create thread authorises every pairing via the contact fn before insert', async () => {
    rpcQueue = [{ data: true, error: null }];
    // NOTE: no communication_threads response is stubbed — the service must
    // NOT read the thread row back (pre-membership RETURNING would be
    // denied with 42501). The thread object is built from the client id.
    tableResponses.communication_participants = { data: null, error: null };
    tableResponses.communication_messages = { data: null, error: null };

    const created = await communicationService.createThread({
      schoolId: 'school-1',
      creatorPersonId: 'teacher-1',
      participantPersonIds: ['parent-1'],
      subject: 'Homework check-in',
      contextType: 'assignment',
      contextEntityId: 'assign-3',
      initialBody: 'Hello — quick check-in on the homework.',
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(created.schoolId).toBe('school-1');
    expect(created.subject).toBe('Homework check-in');
    expect(created.contextType).toBe('assignment');
    expect(created.contextEntityId).toBe('assign-3');
    expect(created.createdBy).toBe('teacher-1');
    expect(created.archived).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith(
      'is_authorised_parent_teacher_contact',
      expect.objectContaining({ p_school_id: 'school-1' })
    );
    const threadInsert = captured.find((c) => c.table === 'communication_threads' && c.op === 'insert');
    expect(threadInsert).toBeDefined();
    expect(threadInsert!.payload.school_id).toBe('school-1');
    // The returned thread carries the client-generated id used at insert.
    expect(threadInsert!.payload.id).toBe(created.id);
    const participantInsert = captured.find(
      (c) => c.table === 'communication_participants' && c.op === 'insert'
    );
    expect(participantInsert).toBeDefined();
    const messageInsert = captured.find(
      (c) => c.table === 'communication_messages' && c.op === 'insert'
    );
    expect(messageInsert).toBeDefined();
    expect(messageInsert!.payload.thread_id).toBe(created.id);
  });

  it('(b3) create flow performs no returning select on thread/participants/message inserts', async () => {
    rpcQueue = [{ data: true, error: null }];
    tableResponses.communication_participants = { data: null, error: null };
    tableResponses.communication_messages = { data: null, error: null };

    const created = await communicationService.createThread({
      schoolId: 'school-1',
      creatorPersonId: 'teacher-1',
      participantPersonIds: ['parent-1'],
      subject: 'No returning',
      initialBody: 'First message.',
    });

    // Thread insert chain: insert only — a .select()/.single() here would be
    // the pre-membership RETURNING deny (creator is not yet a participant).
    const threadChain = chainLog
      .filter((c) => c.table === 'communication_threads')
      .map((c) => c.method);
    expect(threadChain).toContain('insert');
    expect(threadChain).not.toContain('select');
    expect(threadChain).not.toContain('single');
    // Same treatment for the other two writes in the flow: their read
    // policies are thread/participation-scoped and unsatisfied mid-flow.
    for (const table of ['communication_participants', 'communication_messages']) {
      const chain = chainLog.filter((c) => c.table === table).map((c) => c.method);
      expect(chain).toContain('insert');
      expect(chain).not.toContain('select');
      expect(chain).not.toContain('single');
    }
    // Full flow still resolves the thread object with the client id.
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    const threadInsert = captured.find((c) => c.table === 'communication_threads' && c.op === 'insert');
    expect(threadInsert!.payload.id).toBe(created.id);
  });

  it('(b2) unauthorized pairing throws and inserts nothing', async () => {
    rpcQueue = [
      { data: false, error: null },
      { data: false, error: null },
    ];

    await expect(
      communicationService.createThread({
        schoolId: 'school-1',
        creatorPersonId: 'teacher-1',
        participantPersonIds: ['parent-stranger'],
        subject: 'Hello',
        initialBody: 'Should never send.',
      })
    ).rejects.toThrow();
    expect(captured.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('(c) send message as a participant inserts with self sender', async () => {
    tableResponses.communication_participants = {
      data: [{ thread_id: 'thread-1', person_id: 'teacher-1' }],
      error: null,
    };
    tableResponses.communication_messages = {
      data: {
        id: 'msg-2',
        thread_id: 'thread-1',
        sender_id: 'teacher-1',
        body: 'See you Friday.',
        is_ai_drafted: false,
        created_at: '2026-09-12T09:00:00Z',
      },
      error: null,
    };

    const sent = await communicationService.sendMessage('thread-1', 'teacher-1', 'See you Friday.');

    expect(sent.id).toBe('msg-2');
    expect(sent.body).toBe('See you Friday.');
    const insert = captured.find((c) => c.table === 'communication_messages' && c.op === 'insert');
    expect(insert).toBeDefined();
    expect(insert!.payload).toMatchObject({ thread_id: 'thread-1', sender_id: 'teacher-1' });
  });

  it('(c2) send as a non-participant throws (RLS deny path) with no insert', async () => {
    tableResponses.communication_participants = { data: [], error: null };

    await expect(
      communicationService.sendMessage('thread-1', 'intruder-1', 'Sneaky message.')
    ).rejects.toThrow();
    expect(captured.filter((c) => c.table === 'communication_messages' && c.op === 'insert')).toHaveLength(0);
  });

  it('(d) mark-read inserts own receipts only', async () => {
    tableResponses.communication_messages = {
      data: [{ id: 'msg-1' }, { id: 'msg-2' }],
      error: null,
    };
    tableResponses.communication_reads = { data: [], error: null };

    const res = await communicationService.markThreadRead('thread-1', 'parent-1');

    expect(res.marked).toBe(2);
    const inserts = captured.filter((c) => c.table === 'communication_reads' && c.op === 'insert');
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert.payload.reader_id).toBe('parent-1');
    }
  });

  it('(d2) already-read messages are not re-inserted', async () => {
    tableResponses.communication_messages = {
      data: [{ id: 'msg-1' }, { id: 'msg-2' }],
      error: null,
    };
    tableResponses.communication_reads = {
      data: [{ message_id: 'msg-1', reader_id: 'parent-1' }],
      error: null,
    };

    const res = await communicationService.markThreadRead('thread-1', 'parent-1');

    expect(res.marked).toBe(1);
    const inserts = captured.filter((c) => c.table === 'communication_reads' && c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ message_id: 'msg-2', reader_id: 'parent-1' });
  });

  it('(contact) teacher picker resolves only contactable parents via the assignment chain', async () => {
    tableQueues.employees = [
      { data: { id: 'emp-t1' }, error: null },
    ];
    tableQueues.class_teachers = [{ data: [{ class_id: 'class-5' }], error: null }];
    tableQueues.subject_teachers = [{ data: [], error: null }];
    tableQueues.school_activities = [{ data: [], error: null }];
    tableQueues.student_enrolments = [{ data: [{ student_id: 'student-1' }], error: null }];
    tableResponses.student_guardians = {
      data: [{ guardian_person_id: 'parent-1', student_id: 'student-1' }],
      error: null,
    };
    tableResponses.people = {
      data: [{ id: 'parent-1', first_name: 'Amina', last_name: 'Okello' }],
      error: null,
    };

    const options = await communicationService.getContactableParents('teacher-1', 'school-1');

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ personId: 'parent-1', displayName: 'Amina Okello' });
    // Chain touched: assignments -> enrolments -> guardians -> people. No
    // free-text people search: the people read is id-scoped, never a search.
    expect(mockFrom).toHaveBeenCalledWith('class_teachers');
    expect(mockFrom).toHaveBeenCalledWith('student_enrolments');
    expect(mockFrom).toHaveBeenCalledWith('student_guardians');
    expect(mockFrom).toHaveBeenCalledWith('people');
  });

  it('(contact) parent picker resolves only their own childrens teachers', async () => {
    tableResponses.student_guardians = {
      data: [{ student_id: 'student-1' }],
      error: null,
    };
    tableResponses.student_enrolments = {
      data: [{ student_id: 'student-1', class_id: 'class-5' }],
      error: null,
    };
    tableQueues.class_teachers = [{ data: [{ teacher_id: 'emp-t1' }], error: null }];
    tableQueues.subject_teachers = [{ data: [], error: null }];
    tableResponses.employees = {
      data: [{ id: 'emp-t1', person_id: 'teacher-1' }],
      error: null,
    };
    tableResponses.people = {
      data: [{ id: 'teacher-1', first_name: 'Sarah', last_name: 'Namukasa' }],
      error: null,
    };

    const options = await communicationService.getContactableTeachers('parent-1', 'school-1');

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ personId: 'teacher-1', displayName: 'Sarah Namukasa' });
    expect(mockFrom).toHaveBeenCalledWith('student_guardians');
    expect(mockFrom).toHaveBeenCalledWith('student_enrolments');
    expect(mockFrom).toHaveBeenCalledWith('class_teachers');
    expect(mockFrom).toHaveBeenCalledWith('people');
  });

  it('(e) mock env returns honest empties / no-ops without touching the DB', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');

    expect(await communicationService.getMyThreads('person-9', 'school-1')).toEqual([]);
    expect(await communicationService.getThreadMessages('thread-1', 'person-9')).toEqual([]);
    expect(await communicationService.getContactableParents('teacher-1', 'school-1')).toEqual([]);
    expect(await communicationService.getContactableTeachers('parent-1', 'school-1')).toEqual([]);
    expect(await communicationService.markThreadRead('thread-1', 'person-9')).toEqual({ marked: 0 });
    await expect(
      communicationService.createThread({
        schoolId: 'school-1',
        creatorPersonId: 'teacher-1',
        participantPersonIds: ['parent-1'],
        subject: 'Hi',
        initialBody: 'Hello.',
      })
    ).rejects.toThrow();
    await expect(communicationService.sendMessage('thread-1', 'person-9', 'Hi')).rejects.toThrow();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('(f) DB errors throw (denials are never masked)', async () => {
    tableResponses.communication_participants = {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    };
    await expect(communicationService.getMyThreads('person-9', 'school-1')).rejects.toThrow();
    await expect(communicationService.sendMessage('thread-1', 'person-9', 'Hi')).rejects.toThrow();

    tableResponses.communication_threads = {
      data: null,
      error: { code: '500', message: 'boom' },
    };
    tableResponses.communication_participants = {
      data: [{ thread_id: 'thread-1' }],
      error: null,
    };
    await expect(communicationService.getMyThreads('person-9', 'school-1')).rejects.toThrow('boom');
  });
});
