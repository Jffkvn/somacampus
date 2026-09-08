/**
 * Slice 3 — School Store & Inventory Operations Test Suite
 * Pinned Acceptance:
 * 1. Florence requests markers -> admin approves -> issues -> stock drops -> request fulfilled
 * 2. Laptop custody shows current holder with chain
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inventoryService } from '../modules/inventory/inventoryService';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('../lib/financialAudit', () => ({
  writeFinancialAudit: vi.fn().mockResolvedValue(undefined),
}));

import { writeFinancialAudit } from '../lib/financialAudit';

describe('School Store & Inventory Operations (Slice 3)', () => {
  let tableResponses: Record<string, unknown> = {};
  let seenBuilders: Array<{ table: string; builder: Record<string, any> }> = [];

  const builderFor = (table: string) => {
    let lastInserted: unknown = null;
    const eqFilters: Array<{ col: string; val: unknown }> = [];
    const peopleMatch = () => {
      const rows = (tableResponses as Record<string, unknown>)['peopleRows'];
      if (table === 'people' && Array.isArray(rows)) {
        const found = (rows as Array<Record<string, unknown>>).find((r) =>
          eqFilters.every((f) => r[f.col] === f.val)
        );
        return { data: found ?? null, error: null };
      }
      return null;
    };
    const respond = () => {
      const r = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn((col: string, val: unknown) => {
      eqFilters.push({ col, val });
      return b;
    });
    b.is = vi.fn(() => b);
    b.in = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.limit = vi.fn(() => b);
    b.insert = vi.fn((row: unknown) => {
      lastInserted = row;
      return b;
    });
    b.update = vi.fn(() => b);
    b.single = vi.fn(() => {
      const pm = peopleMatch();
      if (pm) return Promise.resolve(pm);
      const r = tableResponses[table] as { data?: unknown; error?: unknown } | undefined;
      if (lastInserted && (!r || r.data === undefined)) {
        return Promise.resolve({ data: lastInserted, error: null });
      }
      if (Array.isArray(r?.data)) {
        return Promise.resolve({ data: r.data[0] ?? null, error: r.error ?? null });
      }
      return respond();
    });
    b.maybeSingle = vi.fn(() => {
      const pm = peopleMatch();
      if (pm) return Promise.resolve(pm);
      return (b.single as ReturnType<typeof vi.fn>)();
    });
    (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
      respond().then(res as never, rej as never);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    seenBuilders = [];
    mockFrom.mockImplementation((table: string) => {
      const b = builderFor(table);
      seenBuilders.push({ table, builder: b });
      return b;
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
    tableResponses = {
      peopleRows: [
        { id: 'person-florence', auth_user_id: 'auth-florence-uid' },
        { id: 'admin-person-id', auth_user_id: 'auth-admin-uid' },
      ],
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('(1) Stock Request Lifecycle: Florence requests markers -> admin approves -> issues -> stock drops -> fulfilled', async () => {
    mockRpc.mockImplementation((rpcName: string, args: any) => {
      if (rpcName === 'issue_stock_for_request') {
        expect(args.p_school_id).toBe('school-1');
        expect(args.p_request_id).toBe('req-101');
        expect(args.p_lines).toEqual([
          { consumable_id: 'item-markers', quantity: 5 },
        ]);
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    tableResponses.stock_requests = {
      data: {
        id: 'req-101',
        school_id: 'school-1',
        requester_id: 'person-florence',
        status: 'pending',
        purpose: 'Term 3 Whiteboard supplies',
      },
      error: null,
    };

    // Step 1: Approve request
    const approved = await inventoryService.approveStockRequest('req-101', 'admin-person-id');
    expect(approved).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('stock_requests');

    // Step 2: Issue stock -> calls atomic RPC issue_stock_for_request
    const issued = await inventoryService.issueStockForRequest({
      schoolId: 'school-1',
      requestId: 'req-101',
      issuedBy: 'admin-person-id',
      lines: [{ consumableId: 'item-markers', quantity: 5 }],
    });

    expect(issued).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('issue_stock_for_request', {
      p_school_id: 'school-1',
      p_request_id: 'req-101',
      p_issued_by: 'admin-person-id',
      p_lines: [{ consumable_id: 'item-markers', quantity: 5 }],
    });
  });

  it('(2) Stock Shortage Protection: Insufficient stock raises error from RPC without stock decrement', async () => {
    mockRpc.mockImplementation((rpcName: string) => {
      if (rpcName === 'issue_stock_for_request') {
        return Promise.resolve({
          data: null,
          error: {
            message: 'Insufficient stock: item "Whiteboard Markers" has only 3 available, but 10 was requested for issuance',
          },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(
      inventoryService.issueStockForRequest({
        schoolId: 'school-1',
        requestId: 'req-102',
        issuedBy: 'admin-person-id',
        lines: [{ consumableId: 'item-markers', quantity: 10 }],
      })
    ).rejects.toThrow(/Insufficient stock.*Whiteboard Markers/i);
  });

  it('(3) Stock Receipt (GRN): Inward delivery records receipt and increments stock via atomic RPC', async () => {
    mockRpc.mockImplementation((rpcName: string, args: any) => {
      if (rpcName === 'record_stock_receipt') {
        expect(args.p_reference_number).toBe('GRN-2026-089');
        expect(args.p_supplier).toBe('Mukwano Stationery Ltd');
        expect(args.p_lines).toHaveLength(1);
        return Promise.resolve({ data: 'receipt-uuid-999', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const receiptId = await inventoryService.recordStockReceipt({
      schoolId: 'school-1',
      storeId: 'store-main',
      supplier: 'Mukwano Stationery Ltd',
      referenceNumber: 'GRN-2026-089',
      receivedBy: 'admin-person-id',
      notes: 'Delivered in good condition',
      lines: [{ consumableId: 'item-markers', quantity: 50, unitCost: 12000 }],
    });

    expect(receiptId).toBe('receipt-uuid-999');
    expect(mockRpc).toHaveBeenCalledWith('record_stock_receipt', {
      p_school_id: 'school-1',
      p_store_id: 'store-main',
      p_supplier: 'Mukwano Stationery Ltd',
      p_reference_number: 'GRN-2026-089',
      p_received_by: 'admin-person-id',
      p_notes: 'Delivered in good condition',
      p_lines: [{ consumable_id: 'item-markers', quantity: 50, unit_cost: 12000 }],
    });
  });

  it('(4) Asset Custody Chain: Issue laptop to Florence, return, and re-issue to David with full history', async () => {
    mockRpc.mockImplementation((rpcName: string, _args: any) => {
      if (rpcName === 'issue_asset_custody') {
        return Promise.resolve({ data: 'custody-1', error: null });
      }
      if (rpcName === 'return_asset_custody') {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // Step A: Issue asset to Florence
    const custodyId = await inventoryService.issueAsset({
      schoolId: 'school-1',
      assetId: 'asset-laptop-01',
      custodianType: 'employee',
      custodianId: 'person-florence',
      issuedBy: 'admin-person-id',
      expectedReturnDate: '2026-12-15',
      condition: 'good',
      notes: 'Assigned for Term 3 teaching',
    });
    expect(custodyId).toBe('custody-1');

    // Step B: Return asset
    const returned = await inventoryService.returnAsset({
      schoolId: 'school-1',
      assetId: 'asset-laptop-01',
      returnedTo: 'admin-person-id',
      condition: 'good',
      notes: 'Returned at end of term in good condition',
    });
    expect(returned).toBe(true);

    // Step C: History queries asset_custody chain
    tableResponses.asset_custody = {
      data: [
        {
          id: 'custody-2',
          asset_id: 'asset-laptop-01',
          custodian_type: 'employee',
          custodian_id: 'person-david',
          issued_at: '2027-01-10T08:00:00Z',
          returned_at: null,
          condition_on_issue: 'good',
          custodian: { first_name: 'David', last_name: 'Otim' },
        },
        {
          id: 'custody-1',
          asset_id: 'asset-laptop-01',
          custodian_type: 'employee',
          custodian_id: 'person-florence',
          issued_at: '2026-09-01T08:00:00Z',
          returned_at: '2026-12-15T15:00:00Z',
          condition_on_issue: 'good',
          condition_on_return: 'good',
          custodian: { first_name: 'Florence', last_name: 'Nabwire' },
        },
      ],
      error: null,
    };

    const history = await inventoryService.getAssetCustodyHistory('asset-laptop-01');
    expect(history).toHaveLength(2);
    expect(history[0].custodianName).toBe('David Otim');
    expect(history[0].isActive).toBe(true);
    expect(history[1].custodianName).toBe('Florence Nabwire');
    expect(history[1].isActive).toBe(false);
  });

  it('(5) Stock Level Adjustment: Reasoned manual correction logs delta via atomic RPC', async () => {
    mockRpc.mockImplementation((rpcName: string, args: any) => {
      if (rpcName === 'adjust_stock_level') {
        expect(args.p_consumable_id).toBe('item-chalk');
        expect(args.p_new_quantity).toBe(14);
        expect(args.p_reason).toBe('Physical count discrepancy: 1 box damaged by leak');
        return Promise.resolve({ data: 14, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const newQty = await inventoryService.adjustStock({
      schoolId: 'school-1',
      consumableId: 'item-chalk',
      newQuantity: 14,
      reason: 'Physical count discrepancy: 1 box damaged by leak',
      adjustedBy: 'admin-person-id',
    });

    expect(newQty).toBe(14);
  });

  it('(6) Teacher Requisition: Florence creates a stock request for primary whiteboard supplies', async () => {
    tableResponses.stock_requests = {
      data: {
        id: 'req-201',
        school_id: 'school-1',
        requester_id: 'person-florence',
        department: 'Primary',
        purpose: 'Science experiments in P.5',
        status: 'pending',
      },
      error: null,
    };

    tableResponses.stock_request_lines = {
      data: [
        {
          id: 'line-1',
          request_id: 'req-201',
          consumable_id: 'item-filter-paper',
          requested_qty: 2,
        },
      ],
      error: null,
    };

    const req = await inventoryService.createStockRequest({
      schoolId: 'school-1',
      requesterId: 'person-florence',
      department: 'Primary',
      purpose: 'Science experiments in P.5',
      lines: [{ consumableId: 'item-filter-paper', requestedQty: 2 }],
    });

    expect(req).toBeDefined();
    expect(req.id).toBe('req-201');
    expect(mockFrom).toHaveBeenCalledWith('stock_requests');
    expect(mockFrom).toHaveBeenCalledWith('stock_request_lines');
  });

  it('(7) Identity: createStockRequest resolves a raw auth UID to people.id via lookup', async () => {
    tableResponses.stock_requests = {
      data: {
        id: 'req-301',
        school_id: 'school-1',
        requester_id: 'person-florence',
        department: 'Primary',
        purpose: 'Chalk for P.4',
        status: 'pending',
      },
      error: null,
    };
    tableResponses.stock_request_lines = {
      data: [{ id: 'line-301', request_id: 'req-301', consumable_id: 'item-chalk', requested_qty: 2 }],
      error: null,
    };

    const req = await inventoryService.createStockRequest({
      schoolId: 'school-1',
      requesterId: 'auth-florence-uid',
      department: 'Primary',
      purpose: 'Chalk for P.4',
      lines: [{ consumableId: 'item-chalk', requestedQty: 2 }],
    });

    expect(req.id).toBe('req-301');
    const reqInsert = seenBuilders.find((s) => s.table === 'stock_requests');
    const insertedRow = (reqInsert?.builder.insert as ReturnType<typeof vi.fn>)?.mock.calls[0]?.[0] as any;
    expect(insertedRow.requester_id).toBe('person-florence');
  });

  it('(7b) Identity fail-closed: unresolvable requester throws, never writes raw auth UID', async () => {
    await expect(
      inventoryService.createStockRequest({
        schoolId: 'school-1',
        requesterId: 'auth-unknown-uid',
        department: 'Primary',
        purpose: 'Ghost request',
        lines: [{ consumableId: 'item-chalk', requestedQty: 1 }],
      })
    ).rejects.toThrow(/no person record|unresolvable/i);
    expect(seenBuilders.filter((s) => s.table === 'stock_requests').length).toBe(0);
  });

  it('(8) Approve guard: non-pending requests are refused and never audited', async () => {
    tableResponses.stock_requests = {
      data: { id: 'req-101', school_id: 'school-1', status: 'approved' },
      error: null,
    };

    await expect(inventoryService.approveStockRequest('req-101', 'admin-person-id')).rejects.toThrow(
      /pending|already decided|invalid state/i
    );
    expect(writeFinancialAudit).not.toHaveBeenCalled();
  });

  it('(8b) Approve path: pending request approves with decided_by/at and writes audit', async () => {
    tableResponses.stock_requests = {
      data: { id: 'req-102', school_id: 'school-1', status: 'pending' },
      error: null,
    };

    const ok = await inventoryService.approveStockRequest('req-102', 'auth-admin-uid');
    expect(ok).toBe(true);
    const updateBuilder = [...seenBuilders].reverse().find((s) => s.table === 'stock_requests');
    const updateArg = (updateBuilder?.builder.update as ReturnType<typeof vi.fn>)?.mock.calls[0]?.[0] as any;
    expect(updateArg.status).toBe('approved');
    expect(updateArg.decided_by).toBe('admin-person-id');
    expect(updateArg.decided_at).toBeDefined();
    const eqCalls = (updateBuilder?.builder.eq as ReturnType<typeof vi.fn>)?.mock.calls as Array<[string, unknown]>;
    expect(eqCalls).toContainEqual(['status', 'pending']);
    expect(writeFinancialAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        entityType: 'stock_request',
        entityId: 'req-102',
        action: 'approved',
      })
    );
  });

  it('(9) Reject guard + audit: non-pending refused; pending rejects with reason and audit', async () => {
    tableResponses.stock_requests = {
      data: { id: 'req-103', school_id: 'school-1', status: 'fulfilled' },
      error: null,
    };
    await expect(
      inventoryService.rejectStockRequest('req-103', 'admin-person-id', 'Too late')
    ).rejects.toThrow(/pending|already decided|invalid state/i);

    tableResponses.stock_requests = {
      data: { id: 'req-104', school_id: 'school-1', status: 'pending' },
      error: null,
    };
    const ok = await inventoryService.rejectStockRequest('req-104', 'admin-person-id', 'Out of budget');
    expect(ok).toBe(true);
    expect(writeFinancialAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        entityType: 'stock_request',
        entityId: 'req-104',
        action: 'rejected',
      })
    );
  });

  it('(10) Bootstrap: createStore and createCategory insert leadership-scoped rows', async () => {
    tableResponses.stores = {
      data: { id: 'store-1', school_id: 'school-1', name: 'Main Store', location: 'Block A', is_active: true },
      error: null,
    };
    const store = await inventoryService.createStore({
      schoolId: 'school-1',
      name: 'Main Store',
      location: 'Block A',
    });
    expect(store.id).toBe('store-1');
    expect(store.name).toBe('Main Store');

    tableResponses.item_categories = {
      data: { id: 'cat-1', school_id: 'school-1', name: 'Stationery', code: 'STATIONERY', description: null },
      error: null,
    };
    const cat = await inventoryService.createCategory({ schoolId: 'school-1', name: 'Stationery' });
    expect(cat.id).toBe('cat-1');
    expect(cat.code).toBe('STATIONERY');
  });

  it('(11) Receipt fail-closed: missing storeId throws before any RPC (no non-UUID fallback)', async () => {
    await expect(
      inventoryService.recordStockReceipt({
        schoolId: 'school-1',
        storeId: '',
        supplier: 'Mukwano Stationery Ltd',
        referenceNumber: 'GRN-2026-090',
        receivedBy: 'admin-person-id',
        lines: [{ consumableId: 'item-markers', quantity: 5, unitCost: 100 }],
      })
    ).rejects.toThrow(/store/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('(12) Teacher request surface is reachable; manager console stays leadership-only', async () => {
    const { canAccessPath } = await import('../lib/teacherPrivacy');
    expect(canAccessPath('teacher', '/inventory/request')).toBe(true);
    expect(canAccessPath('admin', '/inventory/request')).toBe(true);
    expect(canAccessPath('principal', '/inventory/request')).toBe(true);
    expect(canAccessPath('teacher', '/administration/inventory')).toBe(false);
    const { NAVIGATION_CONFIG } = await import('../config/navigation');
    const teaching = NAVIGATION_CONFIG.find((g) => g.id === 'teaching');
    expect(teaching?.subItems?.some((s) => s.href === '/inventory/request')).toBe(true);
  });

  it('(13) listStockRequests supports own-requests scoping via requesterId filter', async () => {
    tableResponses.stock_requests = { data: [], error: null };
    await inventoryService.listStockRequests('school-1', { requesterId: 'person-florence' });
    const builder = [...seenBuilders].reverse().find((s) => s.table === 'stock_requests');
    const eqCalls = (builder?.builder.eq as ReturnType<typeof vi.fn>)?.mock.calls as Array<[string, unknown]>;
    expect(eqCalls).toContainEqual(['requester_id', 'person-florence']);
  });
});
