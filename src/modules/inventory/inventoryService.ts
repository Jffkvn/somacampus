/**
 * SomaCampus School Store, Inventory & Tangible Assets Service (Slice 3)
 * Provides centralized inventory controls, stock requisitions, goods receipts,
 * append-only movement ledger, and asset custody tracking.
 *
 * Mock Honesty: Fails closed on database errors. Zero synthetic in-memory mocks.
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
  return !url || url.includes('placeholder') || url.includes('mock');
};

const errMessage = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message)
    : 'Unknown database error';

export const inventoryService = {
  /**
   * List all stores / storage locations in the school
   */
  async listStores(schoolId: string): Promise<InventoryStore[]> {
    if (isMockEnv()) {
      return [];
    }
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw new Error(`inventoryService.listStores: ${errMessage(error)}`);
    }
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
      return [];
    }
    const { data, error } = await supabase
      .from('item_categories')
      .select('*')
      .eq('school_id', schoolId)
      .order('name');

    if (error) {
      throw new Error(`inventoryService.listCategories: ${errMessage(error)}`);
    }
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
      return [];
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
    if (error) {
      throw new Error(`inventoryService.listConsumables: ${errMessage(error)}`);
    }

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
      return [];
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
    if (error) {
      throw new Error(`inventoryService.listAssets: ${errMessage(error)}`);
    }

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
      return [];
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
    if (error) {
      throw new Error(`inventoryService.listStockRequests: ${errMessage(error)}`);
    }

    return (data || []).map((row: any) => {
      const reqPerson = Array.isArray(row.requester) ? row.requester[0] : row.requester;
      const decPerson = Array.isArray(row.decider) ? row.decider[0] : row.decider;

      return {
        id: row.id,
        schoolId: row.school_id,
        requesterId: row.requester_id,
        requesterName: `${reqPerson?.first_name || ''} ${reqPerson?.last_name || ''}`.trim() || 'Staff Member',
        department: row.department,
        purpose: row.purpose,
        status: row.status,
        requestedDate: row.requested_date || row.created_at?.slice(0, 10),
        decidedBy: row.decided_by,
        decidedByName: decPerson ? `${decPerson.first_name || ''} ${decPerson.last_name || ''}`.trim() : null,
        decidedAt: row.decided_at,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
        lines: (row.lines || []).map((l: any) => ({
          id: l.id,
          consumableId: l.consumable_id,
          consumableName: l.consumable?.name || 'Unknown Item',
          sku: l.consumable?.sku || '',
          unit: l.consumable?.unit || 'piece',
          availableStock: Number(l.consumable?.current_quantity || 0),
          requestedQty: Number(l.requested_qty || 0),
          approvedQty: l.approved_qty !== null && l.approved_qty !== undefined ? Number(l.approved_qty) : null,
          issuedQty: Number(l.issued_qty || 0),
        })),
      };
    });
  },

  /**
   * List append-only stock ledger movements
   */
  async listStockMovements(schoolId: string, consumableId?: string): Promise<StockMovement[]> {
    if (isMockEnv()) {
      return [];
    }

    let query = supabase
      .from('stock_movements')
      .select(`
        *,
        consumable:consumables(name),
        creator:people!created_by(first_name, last_name)
      `)
      .eq('school_id', schoolId);

    if (consumableId) {
      query = query.eq('consumable_id', consumableId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      throw new Error(`inventoryService.listStockMovements: ${errMessage(error)}`);
    }

    return (data || []).map((m: any) => {
      const creator = Array.isArray(m.creator) ? m.creator[0] : m.creator;
      return {
        id: m.id,
        schoolId: m.school_id,
        consumableId: m.consumable_id,
        consumableName: m.consumable?.name || 'Consumable Item',
        movementType: m.movement_type,
        quantity: Number(m.quantity || 0),
        balanceAfter: Number(m.balance_after || 0),
        referenceId: m.reference_id,
        reason: m.reason,
        createdBy: m.created_by,
        createdByName: creator ? `${creator.first_name || ''} ${creator.last_name || ''}`.trim() : 'Operator',
        createdAt: m.created_at,
      };
    });
  },

  /**
   * Get high-level inventory metrics
   */
  async getInventoryMetrics(schoolId: string): Promise<InventorySummary> {
    if (isMockEnv()) {
      return {
        totalConsumables: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        totalAssets: 0,
        assignedAssetsCount: 0,
        availableAssetsCount: 0,
        pendingRequestsCount: 0,
      };
    }

    const [consumables, assets, requests] = await Promise.all([
      this.listConsumables(schoolId),
      this.listAssets(schoolId),
      this.listStockRequests(schoolId, 'pending'),
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
   * Alias for getInventoryMetrics used by cockpit UI
   */
  async getInventorySummary(schoolId: string): Promise<InventorySummary> {
    return this.getInventoryMetrics(schoolId);
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
      throw new Error('Cannot create stock request in mock environment: live database required.');
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

    if (reqErr || !reqData) {
      throw new Error(`inventoryService.createStockRequest: ${errMessage(reqErr)}`);
    }

    const linesToInsert = payload.lines.map((l) => ({
      request_id: reqData.id,
      consumable_id: l.consumableId,
      requested_qty: l.requestedQty,
    }));

    const { error: linesErr } = await supabase
      .from('stock_request_lines')
      .insert(linesToInsert);

    if (linesErr) {
      throw new Error(`inventoryService.createStockRequest lines: ${errMessage(linesErr)}`);
    }

    return { id: reqData.id };
  },

  /**
   * Approve a stock request (leadership action)
   */
  async approveStockRequest(requestId: string, decidedBy: string): Promise<boolean> {
    if (isMockEnv()) {
      throw new Error('Cannot approve stock request in mock environment: live database required.');
    }

    const { error } = await supabase
      .from('stock_requests')
      .update({
        status: 'approved',
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) {
      throw new Error(`inventoryService.approveStockRequest: ${errMessage(error)}`);
    }
    return true;
  },

  /**
   * Reject a stock request
   */
  async rejectStockRequest(requestId: string, decidedBy: string, rejectionReason: string): Promise<boolean> {
    if (isMockEnv()) {
      throw new Error('Cannot reject stock request in mock environment: live database required.');
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

    if (error) {
      throw new Error(`inventoryService.rejectStockRequest: ${errMessage(error)}`);
    }
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
      throw new Error('Cannot issue stock in mock environment: live database required.');
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
   * Record goods receipt from supplier (atomic RPC record_stock_receipt)
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
      throw new Error('Cannot record stock receipt in mock environment: live database required.');
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
      throw new Error('Cannot adjust stock in mock environment: live database required.');
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
      throw new Error('Cannot issue asset in mock environment: live database required.');
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
      throw new Error('Cannot return asset in mock environment: live database required.');
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
      return [];
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

    if (error) {
      throw new Error(`inventoryService.getAssetCustodyHistory: ${errMessage(error)}`);
    }

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
      throw new Error('Cannot create consumable item in mock environment: live database required.');
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

    if (error) {
      throw new Error(`inventoryService.createConsumableItem: ${errMessage(error)}`);
    }
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
      throw new Error('Cannot create equipment asset in mock environment: live database required.');
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

    if (error) {
      throw new Error(`inventoryService.createEquipmentAsset: ${errMessage(error)}`);
    }
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
