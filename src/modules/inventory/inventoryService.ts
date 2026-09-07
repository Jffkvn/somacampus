/**
 * SomaCampus School Store, Inventory & Tangible Assets Service (Slice 3)
 * Provides centralized inventory controls, stock requisitions, goods receipts,
 * append-only movement ledger, and asset custody tracking.
 */
import { supabase } from '../../lib/supabase';

export interface InventoryStore {
  id: string;
  schoolId: string;
  name: string;
  location: string | null;
  isActive: boolean;
}

export interface ItemCategory {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  description: string | null;
}

export interface ConsumableItem {
  id: string;
  schoolId: string;
  storeId: string | null;
  storeName?: string | null;
  categoryId: string;
  categoryName?: string;
  name: string;
  sku: string;
  unit: string;
  reorderLevel: number;
  currentQuantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface EquipmentAsset {
  id: string;
  schoolId: string;
  storeId: string | null;
  storeName?: string | null;
  categoryId: string;
  categoryName?: string;
  name: string;
  assetTag: string;
  serialNumber: string | null;
  status: 'available' | 'assigned' | 'under_maintenance' | 'damaged' | 'disposed' | 'lost';
  condition: 'new' | 'good' | 'fair' | 'poor' | 'damaged';
  purchaseDate: string | null;
  purchaseCost: number | null;
  currentCustodian?: {
    custodianType: 'employee' | 'student';
    custodianId: string;
    custodianName: string;
    issuedAt: string;
    expectedReturnDate: string | null;
  } | null;
}

export interface StockReceiptLine {
  id?: string;
  consumableId: string;
  consumableName?: string;
  quantity: number;
  unitCost: number;
}

export interface StockReceipt {
  id: string;
  schoolId: string;
  storeId: string;
  storeName?: string;
  supplier: string;
  referenceNumber: string;
  receivedDate: string;
  receivedBy: string;
  receivedByName?: string;
  notes: string | null;
  lines: StockReceiptLine[];
}

export interface StockRequestLine {
  id?: string;
  consumableId: string;
  consumableName?: string;
  sku?: string;
  unit?: string;
  availableStock?: number;
  requestedQty: number;
  approvedQty?: number | null;
  issuedQty: number;
}

export interface StockRequest {
  id: string;
  schoolId: string;
  requesterId: string;
  requesterName?: string;
  department: string;
  purpose: string;
  status: 'draft' | 'pending' | 'approved' | 'fulfilled' | 'rejected' | 'cancelled';
  requestedDate: string;
  decidedBy: string | null;
  decidedByName?: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  lines: StockRequestLine[];
  createdAt: string;
}

export interface StockMovement {
  id: string;
  schoolId: string;
  consumableId: string;
  consumableName?: string;
  movementType: 'receipt' | 'issuance' | 'adjustment' | 'return';
  quantity: number;
  balanceAfter: number;
  referenceId: string | null;
  reason: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface AssetCustodyHistoryItem {
  id: string;
  assetId: string;
  custodianType: 'employee' | 'student';
  custodianId: string;
  custodianName: string;
  issuedAt: string;
  issuedBy: string;
  issuedByName?: string;
  expectedReturnDate: string | null;
  returnedAt: string | null;
  returnedTo: string | null;
  returnedToName?: string | null;
  conditionOnIssue: string;
  conditionOnReturn: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface InventorySummary {
  totalConsumables: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalAssets: number;
  assignedAssetsCount: number;
  availableAssetsCount: number;
  pendingRequestsCount: number;
}

const isMockEnv = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (url === 'https://test.supabase.co') return false;
  if (!url || url.includes('placeholder') || url.includes('mock')) return true;
  if (process.env.NODE_ENV === 'test') return true;
  return false;
};

// Seed mock data for development and tests
const MOCK_STORES: InventoryStore[] = [
  { id: 'store-main', schoolId: 'school-default', name: 'Main Administration Store', location: 'Admin Block Room 2', isActive: true },
  { id: 'store-lab', schoolId: 'school-default', name: 'Science Laboratory Store', location: 'Science Wing Room 10', isActive: true },
  { id: 'store-lib', schoolId: 'school-default', name: 'Resource & Book Bank', location: 'Library Annex', isActive: true },
];

const MOCK_CATEGORIES: ItemCategory[] = [
  { id: 'cat-stat', schoolId: 'school-default', code: 'STAT', name: 'Stationery & Teaching Supplies', description: 'Markers, pens, paper, chalk' },
  { id: 'cat-book', schoolId: 'school-default', code: 'BOOK', name: 'Textbooks & Readers', description: 'Curriculum books and syllabus readers' },
  { id: 'cat-it', schoolId: 'school-default', code: 'IT', name: 'IT Hardware & Electronics', description: 'Laptops, projectors, peripherals' },
  { id: 'cat-sci', schoolId: 'school-default', code: 'SCI', name: 'Science Lab Consumables', description: 'Reagents, glassware, filters' },
  { id: 'cat-sport', schoolId: 'school-default', code: 'SPORT', name: 'Sports & Games Equipment', description: 'Footballs, cones, netballs' },
];

const MOCK_CONSUMABLES: ConsumableItem[] = [
  {
    id: 'item-markers',
    schoolId: 'school-default',
    storeId: 'store-main',
    storeName: 'Main Administration Store',
    categoryId: 'cat-stat',
    categoryName: 'Stationery & Teaching Supplies',
    name: 'Whiteboard Markers (Black, Pack of 12)',
    sku: 'STAT-WMB-001',
    unit: 'pack',
    reorderLevel: 5,
    currentQuantity: 20,
    status: 'in_stock',
  },
  {
    id: 'item-paper',
    schoolId: 'school-default',
    storeId: 'store-main',
    storeName: 'Main Administration Store',
    categoryId: 'cat-stat',
    categoryName: 'Stationery & Teaching Supplies',
    name: 'A4 Printing Paper (Rotatrim 80gsm)',
    sku: 'STAT-PPR-002',
    unit: 'ream',
    reorderLevel: 10,
    currentQuantity: 4,
    status: 'low_stock',
  },
  {
    id: 'item-chalk',
    schoolId: 'school-default',
    storeId: 'store-main',
    storeName: 'Main Administration Store',
    categoryId: 'cat-stat',
    categoryName: 'Stationery & Teaching Supplies',
    name: 'Dustless White Chalk (Box of 100)',
    sku: 'STAT-CHK-003',
    unit: 'box',
    reorderLevel: 10,
    currentQuantity: 15,
    status: 'in_stock',
  },
  {
    id: 'item-filter-paper',
    schoolId: 'school-default',
    storeId: 'store-lab',
    storeName: 'Science Laboratory Store',
    categoryId: 'cat-sci',
    categoryName: 'Science Lab Consumables',
    name: 'Qualitative Filter Paper Discs (125mm)',
    sku: 'SCI-FLT-001',
    unit: 'pack',
    reorderLevel: 3,
    currentQuantity: 8,
    status: 'in_stock',
  },
  {
    id: 'item-graph',
    schoolId: 'school-default',
    storeId: 'store-main',
    storeName: 'Main Administration Store',
    categoryId: 'cat-stat',
    categoryName: 'Stationery & Teaching Supplies',
    name: 'A4 Grid Graph Books (96 Pages)',
    sku: 'STAT-GRP-004',
    unit: 'piece',
    reorderLevel: 25,
    currentQuantity: 0,
    status: 'out_of_stock',
  },
];

const MOCK_ASSETS: EquipmentAsset[] = [
  {
    id: 'asset-laptop-01',
    schoolId: 'school-default',
    storeId: 'store-main',
    storeName: 'Main Administration Store',
    categoryId: 'cat-it',
    categoryName: 'IT Hardware & Electronics',
    name: 'HP ProBook 450 G8 (Core i5, 16GB, 512GB SSD)',
    assetTag: 'ASSET-IT-001',
    serialNumber: '5CD1249XYZ',
    status: 'available',
    condition: 'good',
    purchaseDate: '2025-01-15',
    purchaseCost: 3200000,
    currentCustodian: null,
  },
  {
    id: 'asset-proj-01',
    schoolId: 'school-default',
    storeId: 'store-main',
    storeName: 'Main Administration Store',
    categoryId: 'cat-it',
    categoryName: 'IT Hardware & Electronics',
    name: 'Optoma X343e DLP Projector (3600 Lumens)',
    assetTag: 'ASSET-IT-002',
    serialNumber: 'Q8RJ1029ABC',
    status: 'assigned',
    condition: 'good',
    purchaseDate: '2025-02-10',
    purchaseCost: 2100000,
    currentCustodian: {
      custodianType: 'employee',
      custodianId: 'person-david',
      custodianName: 'David Otim',
      issuedAt: '2026-08-20T08:00:00Z',
      expectedReturnDate: '2026-12-10',
    },
  },
  {
    id: 'asset-micro-01',
    schoolId: 'school-default',
    storeId: 'store-lab',
    storeName: 'Science Laboratory Store',
    categoryId: 'cat-sci',
    categoryName: 'Science Lab Consumables',
    name: 'Olympus CX23 Binocular Compound Microscope',
    assetTag: 'ASSET-SCI-001',
    serialNumber: 'MIC-998811',
    status: 'available',
    condition: 'good',
    purchaseDate: '2024-06-18',
    purchaseCost: 4500000,
    currentCustodian: null,
  },
];

let MOCK_REQUESTS: StockRequest[] = [
  {
    id: 'req-001',
    schoolId: 'school-default',
    requesterId: 'person-florence',
    requesterName: 'Florence Nabwire',
    department: 'Primary',
    purpose: 'Classroom whiteboard supplies for Term 3 (P.5 Blue)',
    status: 'pending',
    requestedDate: '2026-09-06',
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    rejectionReason: null,
    lines: [
      {
        id: 'req-line-1',
        consumableId: 'item-markers',
        consumableName: 'Whiteboard Markers (Black, Pack of 12)',
        sku: 'STAT-WMB-001',
        unit: 'pack',
        availableStock: 20,
        requestedQty: 3,
        approvedQty: null,
        issuedQty: 0,
      },
    ],
    createdAt: '2026-09-06T10:30:00Z',
  },
];

let MOCK_MOVEMENTS: StockMovement[] = [
  {
    id: 'mov-001',
    schoolId: 'school-default',
    consumableId: 'item-markers',
    consumableName: 'Whiteboard Markers (Black, Pack of 12)',
    movementType: 'receipt',
    quantity: 20,
    balanceAfter: 20,
    referenceId: 'rec-001',
    reason: 'Initial term stock receipt ref: GRN-2026-001',
    createdBy: 'admin-person-id',
    createdByName: 'School Administrator',
    createdAt: '2026-09-01T09:00:00Z',
  },
];

export const inventoryService = {
  /**
   * List all stores / storage locations in the school
   */
  async listStores(schoolId: string): Promise<InventoryStore[]> {
    if (isMockEnv()) {
      return MOCK_STORES;
    }
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data || []).map((s: any) => ({
      id: s.id,
      schoolId: s.school_id,
      name: s.name,
      location: s.location,
      isActive: s.is_active,
    }));
  },

  /**
   * List item categories
   */
  async listCategories(schoolId: string): Promise<ItemCategory[]> {
    if (isMockEnv()) {
      return MOCK_CATEGORIES;
    }
    const { data, error } = await supabase
      .from('item_categories')
      .select('*')
      .eq('school_id', schoolId)
      .order('name');
    if (error) throw error;
    return (data || []).map((c: any) => ({
      id: c.id,
      schoolId: c.school_id,
      name: c.name,
      code: c.code,
      description: c.description,
    }));
  },

  /**
   * List consumables with stock status
   */
  async listConsumables(
    schoolId: string,
    options?: { categoryId?: string; search?: string }
  ): Promise<ConsumableItem[]> {
    if (isMockEnv()) {
      let items = [...MOCK_CONSUMABLES];
      if (options?.categoryId && options.categoryId !== 'all') {
        items = items.filter((i) => i.categoryId === options.categoryId);
      }
      if (options?.search) {
        const q = options.search.toLowerCase();
        items = items.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
      }
      return items;
    }

    let query = supabase
      .from('consumables')
      .select('*, store:stores(name), category:item_categories(name)')
      .eq('school_id', schoolId);

    if (options?.categoryId && options.categoryId !== 'all') {
      query = query.eq('category_id', options.categoryId);
    }
    if (options?.search) {
      query = query.or(`name.ilike.%${options.search}%,sku.ilike.%${options.search}%`);
    }

    const { data, error } = await query.order('name');
    if (error) throw error;

    return (data || []).map((row: any) => {
      const qty = Number(row.current_quantity || 0);
      const reorder = Number(row.reorder_level || 5);
      let status: 'in_stock' | 'low_stock' | 'out_of_stock' = 'in_stock';
      if (qty <= 0) status = 'out_of_stock';
      else if (qty <= reorder) status = 'low_stock';

      return {
        id: row.id,
        schoolId: row.school_id,
        storeId: row.store_id,
        storeName: row.store?.name || null,
        categoryId: row.category_id,
        categoryName: row.category?.name || 'Uncategorized',
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        reorderLevel: reorder,
        currentQuantity: qty,
        status,
      };
    });
  },

  /**
   * List equipment assets and active custodians
   */
  async listAssets(
    schoolId: string,
    options?: { categoryId?: string; status?: string; search?: string }
  ): Promise<EquipmentAsset[]> {
    if (isMockEnv()) {
      let items = [...MOCK_ASSETS];
      if (options?.categoryId && options.categoryId !== 'all') {
        items = items.filter((i) => i.categoryId === options.categoryId);
      }
      if (options?.status && options.status !== 'all') {
        items = items.filter((i) => i.status === options.status);
      }
      if (options?.search) {
        const q = options.search.toLowerCase();
        items = items.filter(
          (i) => i.name.toLowerCase().includes(q) || i.assetTag.toLowerCase().includes(q)
        );
      }
      return items;
    }

    let query = supabase
      .from('equipment_assets')
      .select(`
        *,
        store:stores(name),
        category:item_categories(name),
        active_custody:asset_custody(
          id, custodian_type, custodian_id, issued_at, expected_return_date, returned_at,
          custodian:people(first_name, last_name)
        )
      `)
      .eq('school_id', schoolId);

    if (options?.categoryId && options.categoryId !== 'all') {
      query = query.eq('category_id', options.categoryId);
    }
    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options?.search) {
      query = query.or(`name.ilike.%${options.search}%,asset_tag.ilike.%${options.search}%`);
    }

    const { data, error } = await query.order('name');
    if (error) throw error;

    return (data || []).map((row: any) => {
      const activeRows = Array.isArray(row.active_custody)
        ? row.active_custody.filter((c: any) => c.returned_at === null)
        : [];
      const activeCustody = activeRows[0];

      let currentCustodian = null;
      if (activeCustody) {
        const p = Array.isArray(activeCustody.custodian) ? activeCustody.custodian[0] : activeCustody.custodian;
        currentCustodian = {
          custodianType: activeCustody.custodian_type,
          custodianId: activeCustody.custodian_id,
          custodianName: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Assigned Holder',
          issuedAt: activeCustody.issued_at,
          expectedReturnDate: activeCustody.expected_return_date,
        };
      }

      return {
        id: row.id,
        schoolId: row.school_id,
        storeId: row.store_id,
        storeName: row.store?.name || null,
        categoryId: row.category_id,
        categoryName: row.category?.name || 'Uncategorized',
        name: row.name,
        assetTag: row.asset_tag,
        serialNumber: row.serial_number,
        status: row.status,
        condition: row.condition,
        purchaseDate: row.purchase_date,
        purchaseCost: row.purchase_cost ? Number(row.purchase_cost) : null,
        currentCustodian,
      };
    });
  },

  /**
   * List material requisitions / stock requests
   */
  async listStockRequests(schoolId: string, status?: string): Promise<StockRequest[]> {
    if (isMockEnv()) {
      let reqs = [...MOCK_REQUESTS];
      if (status && status !== 'all') {
        reqs = reqs.filter((r) => r.status === status);
      }
      return reqs;
    }

    let query = supabase
      .from('stock_requests')
      .select(`
        *,
        requester:people!requester_id(first_name, last_name),
        decider:people!decided_by(first_name, last_name),
        lines:stock_request_lines(
          id, consumable_id, requested_qty, approved_qty, issued_qty,
          consumable:consumables(name, sku, unit, current_quantity)
        )
      `)
      .eq('school_id', schoolId);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((r: any) => {
      const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
      const decider = Array.isArray(r.decider) ? r.decider[0] : r.decider;
      const rawLines = Array.isArray(r.lines) ? r.lines : [];

      return {
        id: r.id,
        schoolId: r.school_id,
        requesterId: r.requester_id,
        requesterName: `${requester?.first_name || ''} ${requester?.last_name || ''}`.trim() || 'Staff Member',
        department: r.department,
        purpose: r.purpose,
        status: r.status,
        requestedDate: r.requested_date,
        decidedBy: r.decided_by,
        decidedByName: decider ? `${decider.first_name || ''} ${decider.last_name || ''}`.trim() : null,
        decidedAt: r.decided_at,
        rejectionReason: r.rejection_reason,
        createdAt: r.created_at,
        lines: rawLines.map((l: any) => {
          const item = Array.isArray(l.consumable) ? l.consumable[0] : l.consumable;
          return {
            id: l.id,
            consumableId: l.consumable_id,
            consumableName: item?.name || 'Item',
            sku: item?.sku || '',
            unit: item?.unit || 'piece',
            availableStock: Number(item?.current_quantity || 0),
            requestedQty: Number(l.requested_qty || 0),
            approvedQty: l.approved_qty !== null ? Number(l.approved_qty) : null,
            issuedQty: Number(l.issued_qty || 0),
          };
        }),
      };
    });
  },

  /**
   * List stock movements (audit log)
   */
  async listStockMovements(schoolId: string, consumableId?: string): Promise<StockMovement[]> {
    if (isMockEnv()) {
      let movs = [...MOCK_MOVEMENTS];
      if (consumableId) {
        movs = movs.filter((m) => m.consumableId === consumableId);
      }
      return movs;
    }

    let query = supabase
      .from('stock_movements')
      .select('*, consumable:consumables(name), creator:people(first_name, last_name)')
      .eq('school_id', schoolId);

    if (consumableId) {
      query = query.eq('consumable_id', consumableId);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) throw error;

    return (data || []).map((m: any) => {
      const c = Array.isArray(m.consumable) ? m.consumable[0] : m.consumable;
      const creator = Array.isArray(m.creator) ? m.creator[0] : m.creator;
      return {
        id: m.id,
        schoolId: m.school_id,
        consumableId: m.consumable_id,
        consumableName: c?.name || 'Item',
        movementType: m.movement_type,
        quantity: Number(m.quantity),
        balanceAfter: Number(m.balance_after),
        referenceId: m.reference_id,
        reason: m.reason,
        createdBy: m.created_by,
        createdByName: creator ? `${creator.first_name || ''} ${creator.last_name || ''}`.trim() : 'Staff',
        createdAt: m.created_at,
      };
    });
  },

  /**
   * Get store and asset high-level metrics
   */
  async getInventorySummary(schoolId: string): Promise<InventorySummary> {
    if (isMockEnv()) {
      return {
        totalConsumables: MOCK_CONSUMABLES.length,
        lowStockCount: MOCK_CONSUMABLES.filter((c) => c.status === 'low_stock').length,
        outOfStockCount: MOCK_CONSUMABLES.filter((c) => c.status === 'out_of_stock').length,
        totalAssets: MOCK_ASSETS.length,
        assignedAssetsCount: MOCK_ASSETS.filter((a) => a.status === 'assigned').length,
        availableAssetsCount: MOCK_ASSETS.filter((a) => a.status === 'available').length,
        pendingRequestsCount: MOCK_REQUESTS.filter((r) => r.status === 'pending').length,
      };
    }

    const [consumables, assets, requests] = await Promise.all([
      this.listConsumables(schoolId),
      this.listAssets(schoolId),
      this.listStockRequests(schoolId),
    ]);

    return {
      totalConsumables: consumables.length,
      lowStockCount: consumables.filter((c) => c.status === 'low_stock').length,
      outOfStockCount: consumables.filter((c) => c.status === 'out_of_stock').length,
      totalAssets: assets.length,
      assignedAssetsCount: assets.filter((a) => a.status === 'assigned').length,
      availableAssetsCount: assets.filter((a) => a.status === 'available').length,
      pendingRequestsCount: requests.filter((r) => r.status === 'pending').length,
    };
  },

  /**
   * Create a new stock request (staff requisition)
   */
  async createStockRequest(payload: {
    schoolId: string;
    requesterId: string;
    department: string;
    purpose: string;
    lines: Array<{ consumableId: string; requestedQty: number }>;
  }): Promise<{ id: string }> {
    if (isMockEnv()) {
      const newReq: StockRequest = {
        id: `req-${Date.now()}`,
        schoolId: payload.schoolId,
        requesterId: payload.requesterId,
        requesterName: 'Staff Requester',
        department: payload.department,
        purpose: payload.purpose,
        status: 'pending',
        requestedDate: new Date().toISOString().slice(0, 10),
        decidedBy: null,
        decidedByName: null,
        decidedAt: null,
        rejectionReason: null,
        createdAt: new Date().toISOString(),
        lines: payload.lines.map((l, idx) => {
          const item = MOCK_CONSUMABLES.find((c) => c.id === l.consumableId);
          return {
            id: `line-${Date.now()}-${idx}`,
            consumableId: l.consumableId,
            consumableName: item?.name || 'Item',
            sku: item?.sku || '',
            unit: item?.unit || 'piece',
            availableStock: item?.currentQuantity || 0,
            requestedQty: l.requestedQty,
            approvedQty: null,
            issuedQty: 0,
          };
        }),
      };
      MOCK_REQUESTS.unshift(newReq);
      return { id: newReq.id };
    }

    const { data: reqData, error: reqErr } = await supabase
      .from('stock_requests')
      .insert({
        school_id: payload.schoolId,
        requester_id: payload.requesterId,
        department: payload.department,
        purpose: payload.purpose,
        status: 'pending',
      })
      .select('id')
      .single();

    if (reqErr) throw reqErr;

    const linesToInsert = payload.lines.map((l) => ({
      request_id: reqData.id,
      consumable_id: l.consumableId,
      requested_qty: l.requestedQty,
    }));

    const { error: linesErr } = await supabase
      .from('stock_request_lines')
      .insert(linesToInsert);

    if (linesErr) throw linesErr;

    return { id: reqData.id };
  },

  /**
   * Approve a stock request (leadership action)
   */
  async approveStockRequest(requestId: string, decidedBy: string): Promise<boolean> {
    if (isMockEnv()) {
      const req = MOCK_REQUESTS.find((r) => r.id === requestId);
      if (req) {
        req.status = 'approved';
        req.decidedBy = decidedBy;
        req.decidedAt = new Date().toISOString();
        req.lines.forEach((l) => {
          if (l.approvedQty === null || l.approvedQty === undefined) {
            l.approvedQty = l.requestedQty;
          }
        });
        return true;
      }
      return false;
    }

    const { error } = await supabase
      .from('stock_requests')
      .update({
        status: 'approved',
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) throw error;
    return true;
  },

  /**
   * Reject a stock request
   */
  async rejectStockRequest(requestId: string, decidedBy: string, rejectionReason: string): Promise<boolean> {
    if (isMockEnv()) {
      const req = MOCK_REQUESTS.find((r) => r.id === requestId);
      if (req) {
        req.status = 'rejected';
        req.decidedBy = decidedBy;
        req.decidedAt = new Date().toISOString();
        req.rejectionReason = rejectionReason;
        return true;
      }
      return false;
    }

    const { error } = await supabase
      .from('stock_requests')
      .update({
        status: 'rejected',
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq('id', requestId);

    if (error) throw error;
    return true;
  },

  /**
   * Issue stock for an approved/pending request (atomic RPC issue_stock_for_request)
   */
  async issueStockForRequest(payload: {
    schoolId: string;
    requestId: string;
    issuedBy: string;
    lines: Array<{ consumableId: string; quantity: number }>;
  }): Promise<boolean> {
    if (isMockEnv()) {
      const req = MOCK_REQUESTS.find((r) => r.id === payload.requestId);
      if (!req) throw new Error('Stock request not found');

      for (const line of payload.lines) {
        const item = MOCK_CONSUMABLES.find((c) => c.id === line.consumableId);
        if (!item) throw new Error('Consumable item not found');
        if (item.currentQuantity < line.quantity) {
          throw new Error(
            `Insufficient stock: item "${item.name}" has only ${item.currentQuantity} available, but ${line.quantity} was requested for issuance`
          );
        }
        item.currentQuantity -= line.quantity;
        if (item.currentQuantity <= 0) item.status = 'out_of_stock';
        else if (item.currentQuantity <= item.reorderLevel) item.status = 'low_stock';

        const reqLine = req.lines.find((l) => l.consumableId === line.consumableId);
        if (reqLine) {
          reqLine.issuedQty += line.quantity;
          reqLine.approvedQty = reqLine.approvedQty ?? line.quantity;
        }

        MOCK_MOVEMENTS.unshift({
          id: `mov-${Date.now()}`,
          schoolId: payload.schoolId,
          consumableId: line.consumableId,
          consumableName: item.name,
          movementType: 'issuance',
          quantity: -line.quantity,
          balanceAfter: item.currentQuantity,
          referenceId: payload.requestId,
          reason: `Issued for request purpose: ${req.purpose}`,
          createdBy: payload.issuedBy,
          createdByName: 'Administrator',
          createdAt: new Date().toISOString(),
        });
      }

      req.status = 'fulfilled';
      req.decidedBy = payload.issuedBy;
      req.decidedAt = new Date().toISOString();
      return true;
    }

    const { data, error } = await supabase.rpc('issue_stock_for_request', {
      p_school_id: payload.schoolId,
      p_request_id: payload.requestId,
      p_issued_by: payload.issuedBy,
      p_lines: payload.lines.map((l) => ({
        consumable_id: l.consumableId,
        quantity: l.quantity,
      })),
    });

    if (error) throw error;
    return !!data;
  },

  /**
   * Record a Goods Received Note (Inward delivery, atomic RPC record_stock_receipt)
   */
  async recordStockReceipt(payload: {
    schoolId: string;
    storeId: string;
    supplier: string;
    referenceNumber: string;
    receivedBy: string;
    notes?: string;
    lines: Array<{ consumableId: string; quantity: number; unitCost?: number }>;
  }): Promise<string> {
    if (isMockEnv()) {
      for (const line of payload.lines) {
        const item = MOCK_CONSUMABLES.find((c) => c.id === line.consumableId);
        if (item) {
          item.currentQuantity += line.quantity;
          if (item.currentQuantity > item.reorderLevel) item.status = 'in_stock';
          else if (item.currentQuantity > 0) item.status = 'low_stock';

          MOCK_MOVEMENTS.unshift({
            id: `mov-${Date.now()}`,
            schoolId: payload.schoolId,
            consumableId: line.consumableId,
            consumableName: item.name,
            movementType: 'receipt',
            quantity: line.quantity,
            balanceAfter: item.currentQuantity,
            referenceId: `rec-${Date.now()}`,
            reason: `Stock receipt ref: ${payload.referenceNumber}`,
            createdBy: payload.receivedBy,
            createdByName: 'Administrator',
            createdAt: new Date().toISOString(),
          });
        }
      }
      return `receipt-${Date.now()}`;
    }

    const { data, error } = await supabase.rpc('record_stock_receipt', {
      p_school_id: payload.schoolId,
      p_store_id: payload.storeId,
      p_supplier: payload.supplier,
      p_reference_number: payload.referenceNumber,
      p_received_by: payload.receivedBy,
      p_notes: payload.notes || '',
      p_lines: payload.lines.map((l) => ({
        consumable_id: l.consumableId,
        quantity: l.quantity,
        unit_cost: l.unitCost || 0,
      })),
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Adjust stock level with reason (atomic RPC adjust_stock_level)
   */
  async adjustStock(payload: {
    schoolId: string;
    consumableId: string;
    newQuantity: number;
    reason: string;
    adjustedBy: string;
  }): Promise<number> {
    if (isMockEnv()) {
      const item = MOCK_CONSUMABLES.find((c) => c.id === payload.consumableId);
      if (!item) throw new Error('Consumable item not found');
      const delta = payload.newQuantity - item.currentQuantity;
      item.currentQuantity = payload.newQuantity;
      if (item.currentQuantity <= 0) item.status = 'out_of_stock';
      else if (item.currentQuantity <= item.reorderLevel) item.status = 'low_stock';
      else item.status = 'in_stock';

      MOCK_MOVEMENTS.unshift({
        id: `mov-${Date.now()}`,
        schoolId: payload.schoolId,
        consumableId: payload.consumableId,
        consumableName: item.name,
        movementType: 'adjustment',
        quantity: delta,
        balanceAfter: item.currentQuantity,
        referenceId: null,
        reason: payload.reason,
        createdBy: payload.adjustedBy,
        createdByName: 'Administrator',
        createdAt: new Date().toISOString(),
      });

      return payload.newQuantity;
    }

    const { data, error } = await supabase.rpc('adjust_stock_level', {
      p_school_id: payload.schoolId,
      p_consumable_id: payload.consumableId,
      p_new_quantity: payload.newQuantity,
      p_reason: payload.reason,
      p_adjusted_by: payload.adjustedBy,
    });

    if (error) throw error;
    return Number(data);
  },

  /**
   * Issue asset custody to an employee or student (atomic RPC issue_asset_custody)
   */
  async issueAsset(payload: {
    schoolId: string;
    assetId: string;
    custodianType: 'employee' | 'student';
    custodianId: string;
    issuedBy: string;
    expectedReturnDate?: string;
    condition?: 'new' | 'good' | 'fair' | 'poor' | 'damaged';
    notes?: string;
  }): Promise<string> {
    if (isMockEnv()) {
      const asset = MOCK_ASSETS.find((a) => a.id === payload.assetId);
      if (!asset) throw new Error('Equipment asset not found');
      if (asset.status !== 'available') {
        throw new Error(`Asset Not Available: Asset status is "${asset.status}", cannot issue custody`);
      }
      asset.status = 'assigned';
      asset.condition = payload.condition || asset.condition;
      asset.currentCustodian = {
        custodianType: payload.custodianType,
        custodianId: payload.custodianId,
        custodianName: 'Assigned Custodian',
        issuedAt: new Date().toISOString(),
        expectedReturnDate: payload.expectedReturnDate || null,
      };
      return `custody-${Date.now()}`;
    }

    const { data, error } = await supabase.rpc('issue_asset_custody', {
      p_school_id: payload.schoolId,
      p_asset_id: payload.assetId,
      p_custodian_type: payload.custodianType,
      p_custodian_id: payload.custodianId,
      p_issued_by: payload.issuedBy,
      p_expected_return: payload.expectedReturnDate || null,
      p_condition: payload.condition || 'good',
      p_notes: payload.notes || '',
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Return asset custody (atomic RPC return_asset_custody)
   */
  async returnAsset(payload: {
    schoolId: string;
    assetId: string;
    returnedTo: string;
    condition?: 'new' | 'good' | 'fair' | 'poor' | 'damaged';
    notes?: string;
  }): Promise<boolean> {
    if (isMockEnv()) {
      const asset = MOCK_ASSETS.find((a) => a.id === payload.assetId);
      if (!asset) throw new Error('Equipment asset not found');
      asset.status = payload.condition === 'damaged' ? 'damaged' : 'available';
      if (payload.condition) asset.condition = payload.condition;
      asset.currentCustodian = null;
      return true;
    }

    const { data, error } = await supabase.rpc('return_asset_custody', {
      p_school_id: payload.schoolId,
      p_asset_id: payload.assetId,
      p_returned_to: payload.returnedTo,
      p_condition: payload.condition || 'good',
      p_notes: payload.notes || '',
    });

    if (error) throw error;
    return !!data;
  },

  /**
   * Get complete chronological custody history for an equipment asset
   */
  async getAssetCustodyHistory(assetId: string): Promise<AssetCustodyHistoryItem[]> {
    if (isMockEnv()) {
      return [
        {
          id: 'custody-1',
          assetId,
          custodianType: 'employee',
          custodianId: 'person-florence',
          custodianName: 'Florence Nabwire',
          issuedAt: '2026-09-01T08:00:00Z',
          issuedBy: 'admin-person-id',
          issuedByName: 'School Administrator',
          expectedReturnDate: '2026-12-15',
          returnedAt: null,
          returnedTo: null,
          returnedToName: null,
          conditionOnIssue: 'good',
          conditionOnReturn: null,
          notes: 'Assigned for teaching',
          isActive: true,
        },
      ];
    }

    const { data, error } = await supabase
      .from('asset_custody')
      .select(`
        *,
        custodian:people!custodian_id(first_name, last_name),
        issuer:people!issued_by(first_name, last_name),
        receiver:people!returned_to(first_name, last_name)
      `)
      .eq('asset_id', assetId)
      .order('issued_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((c: any) => {
      const custodian = Array.isArray(c.custodian) ? c.custodian[0] : c.custodian;
      const issuer = Array.isArray(c.issuer) ? c.issuer[0] : c.issuer;
      const receiver = Array.isArray(c.receiver) ? c.receiver[0] : c.receiver;

      return {
        id: c.id,
        assetId: c.asset_id,
        custodianType: c.custodian_type,
        custodianId: c.custodian_id,
        custodianName: `${custodian?.first_name || ''} ${custodian?.last_name || ''}`.trim() || 'Custodian',
        issuedAt: c.issued_at,
        issuedBy: c.issued_by,
        issuedByName: issuer ? `${issuer.first_name || ''} ${issuer.last_name || ''}`.trim() : 'Staff',
        expectedReturnDate: c.expected_return_date,
        returnedAt: c.returned_at,
        returnedTo: c.returned_to,
        returnedToName: receiver ? `${receiver.first_name || ''} ${receiver.last_name || ''}`.trim() : null,
        conditionOnIssue: c.condition_on_issue,
        conditionOnReturn: c.condition_on_return,
        notes: c.notes,
        isActive: c.returned_at === null,
      };
    });
  },

  /**
   * Create a new consumable item
   */
  async createConsumableItem(payload: {
    schoolId: string;
    storeId?: string | null;
    categoryId: string;
    name: string;
    sku: string;
    unit: string;
    reorderLevel: number;
    initialQuantity?: number;
  }): Promise<ConsumableItem> {
    if (isMockEnv()) {
      const newCons: ConsumableItem = {
        id: `item-${Date.now()}`,
        schoolId: payload.schoolId,
        storeId: payload.storeId || null,
        categoryId: payload.categoryId,
        name: payload.name,
        sku: payload.sku,
        unit: payload.unit,
        reorderLevel: payload.reorderLevel,
        currentQuantity: payload.initialQuantity || 0,
        status: (payload.initialQuantity || 0) > payload.reorderLevel ? 'in_stock' : 'low_stock',
      };
      MOCK_CONSUMABLES.push(newCons);
      return newCons;
    }

    const { data, error } = await supabase
      .from('consumables')
      .insert({
        school_id: payload.schoolId,
        store_id: payload.storeId || null,
        category_id: payload.categoryId,
        name: payload.name,
        sku: payload.sku,
        unit: payload.unit,
        reorder_level: payload.reorderLevel,
        current_quantity: payload.initialQuantity || 0,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      schoolId: data.school_id,
      storeId: data.store_id,
      categoryId: data.category_id,
      name: data.name,
      sku: data.sku,
      unit: data.unit,
      reorderLevel: data.reorder_level,
      currentQuantity: data.current_quantity,
      status: data.current_quantity > data.reorder_level ? 'in_stock' : data.current_quantity > 0 ? 'low_stock' : 'out_of_stock',
    };
  },

  /**
   * Create a new equipment asset
   */
  async createEquipmentAsset(payload: {
    schoolId: string;
    storeId?: string | null;
    categoryId: string;
    name: string;
    assetTag: string;
    serialNumber?: string | null;
    condition?: 'new' | 'good' | 'fair' | 'poor' | 'damaged';
    purchaseDate?: string | null;
    purchaseCost?: number | null;
  }): Promise<EquipmentAsset> {
    if (isMockEnv()) {
      const newAsset: EquipmentAsset = {
        id: `asset-${Date.now()}`,
        schoolId: payload.schoolId,
        storeId: payload.storeId || null,
        categoryId: payload.categoryId,
        name: payload.name,
        assetTag: payload.assetTag,
        serialNumber: payload.serialNumber || null,
        status: 'available',
        condition: payload.condition || 'good',
        purchaseDate: payload.purchaseDate || null,
        purchaseCost: payload.purchaseCost || null,
        currentCustodian: null,
      };
      MOCK_ASSETS.push(newAsset);
      return newAsset;
    }

    const { data, error } = await supabase
      .from('equipment_assets')
      .insert({
        school_id: payload.schoolId,
        store_id: payload.storeId || null,
        category_id: payload.categoryId,
        name: payload.name,
        asset_tag: payload.assetTag,
        serial_number: payload.serialNumber || null,
        status: 'available',
        condition: payload.condition || 'good',
        purchase_date: payload.purchaseDate || null,
        purchase_cost: payload.purchaseCost || null,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      schoolId: data.school_id,
      storeId: data.store_id,
      categoryId: data.category_id,
      name: data.name,
      assetTag: data.asset_tag,
      serialNumber: data.serial_number,
      status: data.status,
      condition: data.condition,
      purchaseDate: data.purchase_date,
      purchaseCost: data.purchase_cost ? Number(data.purchase_cost) : null,
      currentCustodian: null,
    };
  },
};
