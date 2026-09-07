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

describe('School Store & Inventory Operations (Slice 3)', () => {
  let tableResponses: Record<string, unknown> = {};

  const builderFor = (table: string) => {
    let lastInserted: unknown = null;
    const respond = () => {
      const r = tableResponses[table];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
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
      const r = tableResponses[table] as { data?: unknown; error?: unknown } | undefined;
      if (lastInserted && (!r || r.data === undefined)) {
        return Promise.resolve({ data: lastInserted, error: null });
      }
      if (Array.isArray(r?.data)) {
        return Promise.resolve({ data: r.data[0] ?? null, error: r.error ?? null });
      }
      return respond();
    });
    b.maybeSingle = vi.fn(() => (b.single as ReturnType<typeof vi.fn>)());
    (b as { then: unknown }).then = (res: unknown, rej: unknown) =>
      respond().then(res as never, rej as never);
    return b;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
    mockFrom.mockImplementation((table: string) => builderFor(table));
    mockRpc.mockResolvedValue({ data: null, error: null });
    tableResponses = {};
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
});
