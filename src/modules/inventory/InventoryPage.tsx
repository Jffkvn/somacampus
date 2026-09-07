import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Download,
  History,
  Laptop,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import {
  inventoryService,
  type ConsumableItem,
  type EquipmentAsset,
  type StockRequest,
  type StockMovement,
  type ItemCategory,
  type InventoryStore,
  type InventorySummary,
  type AssetCustodyHistoryItem,
} from './inventoryService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

type InventoryTab = 'consumables' | 'assets' | 'requests' | 'movements';

export const InventoryPage: React.FC = () => {
  const { schoolId, user } = useAuth();
  const effectiveSchoolId = schoolId ?? PILOT_SCHOOL_ID;

  const [activeTab, setActiveTab] = useState<InventoryTab>('consumables');
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [stores, setStores] = useState<InventoryStore[]>([]);

  // Consumables state
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [consumableCategory, setConsumableCategory] = useState<string>('all');
  const [consumableSearch, setConsumableSearch] = useState<string>('');
  const [consumableLowStockOnly, setConsumableLowStockOnly] = useState<boolean>(false);

  // Assets state
  const [assets, setAssets] = useState<EquipmentAsset[]>([]);
  const [assetCategory, setAssetCategory] = useState<string>('all');
  const [assetStatus, setAssetStatus] = useState<string>('all');
  const [assetSearch, setAssetSearch] = useState<string>('');

  // Requests state
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [requestStatus, setRequestStatus] = useState<string>('all');

  // Movements state
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Modals state
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState<boolean>(false);
  const [selectedAdjustItem, setSelectedAdjustItem] = useState<ConsumableItem | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState<boolean>(false);
  const [selectedRequestToIssue, setSelectedRequestToIssue] = useState<StockRequest | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [selectedRequestToReject, setSelectedRequestToReject] = useState<StockRequest | null>(null);
  const [isAddConsumableOpen, setIsAddConsumableOpen] = useState<boolean>(false);
  const [isAddAssetOpen, setIsAddAssetOpen] = useState<boolean>(false);
  const [isAssignAssetOpen, setIsAssignAssetOpen] = useState<boolean>(false);
  const [selectedAssetToAssign, setSelectedAssetToAssign] = useState<EquipmentAsset | null>(null);
  const [isReturnAssetOpen, setIsReturnAssetOpen] = useState<boolean>(false);
  const [selectedAssetToReturn, setSelectedAssetToReturn] = useState<EquipmentAsset | null>(null);
  const [isCustodyHistoryOpen, setIsCustodyHistoryOpen] = useState<boolean>(false);
  const [custodyHistory, setCustodyHistory] = useState<AssetCustodyHistoryItem[]>([]);
  const [selectedAssetForHistory, setSelectedAssetForHistory] = useState<EquipmentAsset | null>(null);

  // Form states
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');

  // Receipt form state
  const [receiptSupplier, setReceiptSupplier] = useState<string>('');
  const [receiptRef, setReceiptRef] = useState<string>('');
  const [receiptStoreId, setReceiptStoreId] = useState<string>('');
  const [receiptNotes, setReceiptNotes] = useState<string>('');
  const [receiptConsumableId, setReceiptConsumableId] = useState<string>('');
  const [receiptQty, setReceiptQty] = useState<number>(1);
  const [receiptUnitCost, setReceiptUnitCost] = useState<number>(0);

  // New Request form state
  const [newReqDepartment, setNewReqDepartment] = useState<string>('Primary');
  const [newReqPurpose, setNewReqPurpose] = useState<string>('');
  const [newReqConsumableId, setNewReqConsumableId] = useState<string>('');
  const [newReqQty, setNewReqQty] = useState<number>(1);

  // New Consumable item form state
  const [newConsName, setNewConsName] = useState<string>('');
  const [newConsSku, setNewConsSku] = useState<string>('');
  const [newConsCatId, setNewConsCatId] = useState<string>('');
  const [newConsStoreId, setNewConsStoreId] = useState<string>('');
  const [newConsUnit, setNewConsUnit] = useState<string>('piece');
  const [newConsReorder, setNewConsReorder] = useState<number>(5);
  const [newConsInitialQty, setNewConsInitialQty] = useState<number>(0);

  // New Asset form state
  const [newAssetName, setNewAssetName] = useState<string>('');
  const [newAssetTag, setNewAssetTag] = useState<string>('');
  const [newAssetSerial, setNewAssetSerial] = useState<string>('');
  const [newAssetCatId, setNewAssetCatId] = useState<string>('');
  const [newAssetStoreId, setNewAssetStoreId] = useState<string>('');
  const [newAssetCondition, setNewAssetCondition] = useState<'new' | 'good' | 'fair' | 'poor' | 'damaged'>('good');
  const [newAssetCost, setNewAssetCost] = useState<number>(0);

  // Asset Assignment form state
  const [assignCustodianType, setAssignCustodianType] = useState<'employee' | 'student'>('employee');
  const [assignCustodianId, setAssignCustodianId] = useState<string>('');
  const [assignReturnDate, setAssignReturnDate] = useState<string>('');
  const [assignNotes, setAssignNotes] = useState<string>('');

  // Asset Return form state
  const [returnCondition, setReturnCondition] = useState<'new' | 'good' | 'fair' | 'poor' | 'damaged'>('good');
  const [returnNotes, setReturnNotes] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [sum, cats, strs, cons, ass, reqs, movs] = await Promise.all([
        inventoryService.getInventorySummary(effectiveSchoolId),
        inventoryService.listCategories(effectiveSchoolId),
        inventoryService.listStores(effectiveSchoolId),
        inventoryService.listConsumables(effectiveSchoolId, {
          categoryId: consumableCategory,
          search: consumableSearch,
        }),
        inventoryService.listAssets(effectiveSchoolId, {
          categoryId: assetCategory,
          status: assetStatus,
          search: assetSearch,
        }),
        inventoryService.listStockRequests(effectiveSchoolId, requestStatus),
        inventoryService.listStockMovements(effectiveSchoolId),
      ]);

      setSummary(sum);
      setCategories(cats);
      setStores(strs);
      setConsumables(cons);
      setAssets(ass);
      setRequests(reqs);
      setMovements(movs);

      if (cats.length > 0 && !newConsCatId) setNewConsCatId(cats[0].id);
      if (cats.length > 0 && !newAssetCatId) setNewAssetCatId(cats[0].id);
      if (strs.length > 0 && !receiptStoreId) setReceiptStoreId(strs[0].id);
      if (cons.length > 0 && !receiptConsumableId) setReceiptConsumableId(cons[0].id);
      if (cons.length > 0 && !newReqConsumableId) setNewReqConsumableId(cons[0].id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load inventory data');
    } finally {
      setIsLoading(false);
    }
  }, [
    effectiveSchoolId,
    consumableCategory,
    consumableSearch,
    assetCategory,
    assetStatus,
    assetSearch,
    requestStatus,
    newConsCatId,
    newAssetCatId,
    receiptStoreId,
    receiptConsumableId,
    newReqConsumableId,
  ]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Flash message helper
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Filtered consumables
  const displayedConsumables = useMemo(() => {
    if (!consumableLowStockOnly) return consumables;
    return consumables.filter((c) => c.status === 'low_stock' || c.status === 'out_of_stock');
  }, [consumables, consumableLowStockOnly]);

  // Handle GRN Receipt Submit
  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptSupplier.trim() || !receiptRef.trim() || !receiptConsumableId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'admin-person-id';
      await inventoryService.recordStockReceipt({
        schoolId: effectiveSchoolId,
        storeId: receiptStoreId || (stores[0]?.id ?? 'store-main'),
        supplier: receiptSupplier.trim(),
        referenceNumber: receiptRef.trim(),
        receivedBy: callerId,
        notes: receiptNotes.trim() || undefined,
        lines: [
          {
            consumableId: receiptConsumableId,
            quantity: Number(receiptQty),
            unitCost: Number(receiptUnitCost),
          },
        ],
      });
      setIsReceiptModalOpen(false);
      setReceiptSupplier('');
      setReceiptRef('');
      setReceiptNotes('');
      showSuccess(`Stock receipt "${receiptRef.trim()}" successfully recorded and added to ledger.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record stock receipt');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Quick Adjust Submit
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjustItem || !adjustReason.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'admin-person-id';
      await inventoryService.adjustStock({
        schoolId: effectiveSchoolId,
        consumableId: selectedAdjustItem.id,
        newQuantity: Number(adjustQty),
        reason: adjustReason.trim(),
        adjustedBy: callerId,
      });
      setIsAdjustModalOpen(false);
      setSelectedAdjustItem(null);
      setAdjustReason('');
      showSuccess(`Stock level for ${selectedAdjustItem.name} adjusted to ${adjustQty}.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to adjust stock');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle New Stock Request Submit
  const handleNewRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReqPurpose.trim() || !newReqConsumableId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'person-florence';
      await inventoryService.createStockRequest({
        schoolId: effectiveSchoolId,
        requesterId: callerId,
        department: newReqDepartment,
        purpose: newReqPurpose.trim(),
        lines: [
          {
            consumableId: newReqConsumableId,
            requestedQty: Number(newReqQty),
          },
        ],
      });
      setIsRequestModalOpen(false);
      setNewReqPurpose('');
      showSuccess('Material requisition submitted successfully.');
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit stock request');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Approve Request
  const handleApproveRequest = async (requestId: string) => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'admin-person-id';
      await inventoryService.approveStockRequest(requestId, callerId);
      showSuccess('Stock request approved. Ready for issuance.');
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to approve stock request');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Issue Stock for Request
  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestToIssue) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'admin-person-id';
      const lines = selectedRequestToIssue.lines.map((l) => ({
        consumableId: l.consumableId,
        quantity: l.approvedQty !== null && l.approvedQty !== undefined ? l.approvedQty : l.requestedQty,
      }));
      await inventoryService.issueStockForRequest({
        schoolId: effectiveSchoolId,
        requestId: selectedRequestToIssue.id,
        issuedBy: callerId,
        lines,
      });
      setIsIssueModalOpen(false);
      setSelectedRequestToIssue(null);
      showSuccess(`Stock issued and request marked fulfilled. Stock balances updated.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to issue stock');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Reject Request
  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestToReject || !rejectReason.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'admin-person-id';
      await inventoryService.rejectStockRequest(selectedRequestToReject.id, callerId, rejectReason.trim());
      setIsRejectModalOpen(false);
      setSelectedRequestToReject(null);
      setRejectReason('');
      showSuccess('Stock request rejected.');
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject stock request');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Add Consumable
  const handleAddConsumableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConsName.trim() || !newConsSku.trim() || !newConsCatId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await inventoryService.createConsumableItem({
        schoolId: effectiveSchoolId,
        categoryId: newConsCatId,
        storeId: newConsStoreId || null,
        name: newConsName.trim(),
        sku: newConsSku.trim().toUpperCase(),
        unit: newConsUnit,
        reorderLevel: Number(newConsReorder),
        initialQuantity: Number(newConsInitialQty),
      });
      setIsAddConsumableOpen(false);
      setNewConsName('');
      setNewConsSku('');
      setNewConsInitialQty(0);
      showSuccess(`Consumable item "${newConsName.trim()}" created successfully.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create consumable item');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Add Asset
  const handleAddAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName.trim() || !newAssetTag.trim() || !newAssetCatId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await inventoryService.createEquipmentAsset({
        schoolId: effectiveSchoolId,
        categoryId: newAssetCatId,
        storeId: newAssetStoreId || null,
        name: newAssetName.trim(),
        assetTag: newAssetTag.trim().toUpperCase(),
        serialNumber: newAssetSerial.trim() || null,
        condition: newAssetCondition,
        purchaseCost: Number(newAssetCost) || null,
      });
      setIsAddAssetOpen(false);
      setNewAssetName('');
      setNewAssetTag('');
      setNewAssetSerial('');
      setNewAssetCost(0);
      showSuccess(`Asset "${newAssetName.trim()}" registered in inventory.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register asset');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Issue Asset
  const handleAssignAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetToAssign || !assignCustodianId.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'admin-person-id';
      await inventoryService.issueAsset({
        schoolId: effectiveSchoolId,
        assetId: selectedAssetToAssign.id,
        custodianType: assignCustodianType,
        custodianId: assignCustodianId.trim(),
        issuedBy: callerId,
        expectedReturnDate: assignReturnDate || undefined,
        notes: assignNotes.trim() || undefined,
      });
      setIsAssignAssetOpen(false);
      setSelectedAssetToAssign(null);
      setAssignCustodianId('');
      setAssignNotes('');
      showSuccess(`Asset "${selectedAssetToAssign.name}" issued to custodian.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to assign asset custody');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Return Asset
  const handleReturnAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetToReturn) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const callerId = user?.id || 'admin-person-id';
      await inventoryService.returnAsset({
        schoolId: effectiveSchoolId,
        assetId: selectedAssetToReturn.id,
        returnedTo: callerId,
        condition: returnCondition,
        notes: returnNotes.trim() || undefined,
      });
      setIsReturnAssetOpen(false);
      setSelectedAssetToReturn(null);
      setReturnNotes('');
      showSuccess(`Asset "${selectedAssetToReturn.name}" returned and made available.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to return asset');
    } finally {
      setIsProcessing(false);
    }
  };

  // View Custody History
  const handleOpenCustodyHistory = async (asset: EquipmentAsset) => {
    setSelectedAssetForHistory(asset);
    setIsCustodyHistoryOpen(true);
    try {
      const history = await inventoryService.getAssetCustodyHistory(asset.id);
      setCustodyHistory(history);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load custody history');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Warehouse className="w-8 h-8 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Warehouse, Store & Asset Control</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Consumable supplies, goods received notes, material requisitions, and tangible asset custody tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadAllData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsRequestModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Request Supplies
          </Button>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <div className="flex-1">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <div className="flex-1">{successMessage}</div>
        </div>
      )}

      {/* Metrics Banner */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-3 bg-emerald-50 rounded-lg text-emerald-700">
                <Boxes className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Stock Catalog</p>
                <p className="text-xl font-bold text-slate-900">{summary.totalConsumables} Items</p>
                <p className="text-xs text-slate-500">
                  {summary.lowStockCount > 0 ? (
                    <span className="text-amber-600 font-semibold">{summary.lowStockCount} low stock</span>
                  ) : (
                    'Healthy levels'
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-3 bg-red-50 rounded-lg text-red-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Depleted Items</p>
                <p className="text-xl font-bold text-slate-900">{summary.outOfStockCount}</p>
                <p className="text-xs text-slate-500">Immediate reorder needed</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-lg text-blue-700">
                <Laptop className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Equipment Assets</p>
                <p className="text-xl font-bold text-slate-900">{summary.totalAssets}</p>
                <p className="text-xs text-slate-500">
                  <span className="text-blue-600 font-medium">{summary.assignedAssetsCount} assigned</span>, {summary.availableAssetsCount} available
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-lg text-amber-700">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Staff Requests</p>
                <p className="text-xl font-bold text-slate-900">{summary.pendingRequestsCount}</p>
                <p className="text-xs text-slate-500">Pending leadership decision</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('consumables')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'consumables'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Package className="w-4 h-4" />
          Consumables & Stock
          {summary && summary.lowStockCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full font-bold">
              {summary.lowStockCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('assets')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'assets'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Laptop className="w-4 h-4" />
          Equipment & Tangible Assets
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'requests'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          Stock Requests Queue
          {summary && summary.pendingRequestsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-800 rounded-full font-bold">
              {summary.pendingRequestsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'movements'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="w-4 h-4" />
          Movements Ledger
        </button>
      </div>

      {isLoading ? (
        <LoadingState label="Loading warehouse and stock assets..." className="py-12" />
      ) : (
        <>
          {/* TAB 1: CONSUMABLES */}
          {activeTab === 'consumables' && (
            <div className="space-y-4">
              {/* Controls Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search SKU or item name..."
                      value={consumableSearch}
                      onChange={(e) => setConsumableSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  <select
                    value={consumableCategory}
                    onChange={(e) => setConsumableCategory(e.target.value)}
                    className="py-1.5 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-slate-700"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consumableLowStockOnly}
                      onChange={(e) => setConsumableLowStockOnly(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Show Low/Out of Stock Only
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsAddConsumableOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Item
                  </Button>
                  <Button size="sm" onClick={() => setIsReceiptModalOpen(true)}>
                    <Download className="w-4 h-4 mr-1.5" />
                    Receive Stock (GRN)
                  </Button>
                </div>
              </div>

              {/* Consumables Table */}
              <Card className="border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="py-3 px-4">SKU</th>
                        <th className="py-3 px-4">Item Name</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Store</th>
                        <th className="py-3 px-4">Unit</th>
                        <th className="py-3 px-4 text-center">Reorder Level</th>
                        <th className="py-3 px-4 text-center">Available Stock</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedConsumables.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400">
                            No consumable items match your filters.
                          </td>
                        </tr>
                      ) : (
                        displayedConsumables.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                            <td className="py-3 px-4 font-mono font-medium text-slate-800 text-xs">{item.sku}</td>
                            <td className="py-3 px-4 font-semibold text-slate-900">{item.name}</td>
                            <td className="py-3 px-4 text-slate-500">{item.categoryName}</td>
                            <td className="py-3 px-4 text-slate-500">{item.storeName || 'Main Store'}</td>
                            <td className="py-3 px-4 text-slate-500">{item.unit}</td>
                            <td className="py-3 px-4 text-center text-slate-500">{item.reorderLevel}</td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`font-bold text-base ${
                                  item.status === 'out_of_stock'
                                    ? 'text-red-600'
                                    : item.status === 'low_stock'
                                    ? 'text-amber-600'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {item.currentQuantity}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {item.status === 'in_stock' && <StatusPill status="success" label="In Stock" />}
                              {item.status === 'low_stock' && <StatusPill status="warning" label="Low Stock" />}
                              {item.status === 'out_of_stock' && <StatusPill status="critical" label="Out of Stock" />}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedAdjustItem(item);
                                  setAdjustQty(item.currentQuantity);
                                  setIsAdjustModalOpen(true);
                                }}
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                                Adjust
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 2: EQUIPMENT ASSETS */}
          {activeTab === 'assets' && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search asset tag, name..."
                      value={assetSearch}
                      onChange={(e) => setAssetSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <select
                    value={assetCategory}
                    onChange={(e) => setAssetCategory(e.target.value)}
                    className="py-1.5 px-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={assetStatus}
                    onChange={(e) => setAssetStatus(e.target.value)}
                    className="py-1.5 px-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Statuses</option>
                    <option value="available">Available</option>
                    <option value="assigned">Assigned</option>
                    <option value="under_maintenance">Under Maintenance</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setIsAddAssetOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Register Asset
                  </Button>
                </div>
              </div>

              {/* Assets Table */}
              <Card className="border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="py-3 px-4">Asset Tag</th>
                        <th className="py-3 px-4">Item Name</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Serial Number</th>
                        <th className="py-3 px-4">Condition</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Current Custodian</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assets.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            No equipment assets found.
                          </td>
                        </tr>
                      ) : (
                        assets.map((asset) => (
                          <tr key={asset.id} className="hover:bg-slate-50/75 transition-colors">
                            <td className="py-3 px-4 font-mono font-medium text-slate-800 text-xs">{asset.assetTag}</td>
                            <td className="py-3 px-4 font-semibold text-slate-900">{asset.name}</td>
                            <td className="py-3 px-4 text-slate-500">{asset.categoryName}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-500">{asset.serialNumber || '—'}</td>
                            <td className="py-3 px-4">
                              <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {asset.condition}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {asset.status === 'available' && <StatusPill status="success" label="Available" />}
                              {asset.status === 'assigned' && <StatusPill status="info" label="Assigned" />}
                              {asset.status === 'under_maintenance' && <StatusPill status="warning" label="Maintenance" />}
                              {asset.status === 'damaged' && <StatusPill status="critical" label="Damaged" />}
                              {asset.status === 'lost' && <StatusPill status="neutral" label="Lost" />}
                            </td>
                            <td className="py-3 px-4">
                              {asset.currentCustodian ? (
                                <div>
                                  <p className="font-semibold text-slate-800">{asset.currentCustodian.custodianName}</p>
                                  <p className="text-xs text-slate-400">
                                    Since {new Date(asset.currentCustodian.issuedAt).toLocaleDateString()}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">In Store</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenCustodyHistory(asset)}
                                title="View Custody Chain"
                              >
                                <History className="w-3.5 h-3.5" />
                              </Button>
                              {asset.status === 'available' ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedAssetToAssign(asset);
                                    setIsAssignAssetOpen(true);
                                  }}
                                >
                                  Issue
                                </Button>
                              ) : asset.status === 'assigned' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedAssetToReturn(asset);
                                    setIsReturnAssetOpen(true);
                                  }}
                                >
                                  Return
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 3: STOCK REQUESTS */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <select
                    value={requestStatus}
                    onChange={(e) => setRequestStatus(e.target.value)}
                    className="py-1.5 px-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Request Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <Button size="sm" onClick={() => setIsRequestModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Requisition
                </Button>
              </div>

              {/* Requests List */}
              <div className="space-y-3">
                {requests.length === 0 ? (
                  <Card className="p-8 text-center text-slate-400 border-slate-200">
                    No material requests recorded.
                  </Card>
                ) : (
                  requests.map((req) => (
                    <Card key={req.id} className="border-slate-200">
                      <CardContent className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{req.requesterName}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                              {req.department}
                            </span>
                            {req.status === 'pending' && <StatusPill status="pending" label="Pending Decision" />}
                            {req.status === 'approved' && <StatusPill status="info" label="Approved (Ready to Issue)" />}
                            {req.status === 'fulfilled' && <StatusPill status="success" label="Fulfilled" />}
                            {req.status === 'rejected' && <StatusPill status="critical" label="Rejected" />}
                          </div>
                          <p className="text-sm text-slate-600 font-medium">{req.purpose}</p>
                          <div className="text-xs text-slate-400 flex items-center gap-3">
                            <span>Requested: {new Date(req.requestedDate).toLocaleDateString()}</span>
                            {req.decidedByName && <span>Decided by: {req.decidedByName}</span>}
                            {req.rejectionReason && (
                              <span className="text-red-600 font-semibold">Reason: {req.rejectionReason}</span>
                            )}
                          </div>
                          {/* Lines list */}
                          <div className="pt-2 flex flex-wrap gap-2">
                            {req.lines.map((l) => (
                              <span
                                key={l.id || l.consumableId}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700"
                              >
                                <span className="font-medium text-slate-900">{l.consumableName}:</span>
                                <span>{l.requestedQty} {l.unit} requested</span>
                                {l.issuedQty > 0 && (
                                  <span className="text-emerald-700 font-semibold">({l.issuedQty} issued)</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {req.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApproveRequest(req.id)}
                                disabled={isProcessing}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedRequestToIssue(req);
                                  setIsIssueModalOpen(true);
                                }}
                                disabled={isProcessing}
                              >
                                Issue Stock
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => {
                                  setSelectedRequestToReject(req);
                                  setIsRejectModalOpen(true);
                                }}
                                disabled={isProcessing}
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          {req.status === 'approved' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedRequestToIssue(req);
                                setIsIssueModalOpen(true);
                              }}
                              disabled={isProcessing}
                            >
                              Issue Stock
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: MOVEMENTS LEDGER */}
          {activeTab === 'movements' && (
            <div className="space-y-4">
              <Card className="border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-200 py-3 px-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-800">Append-Only Stock Ledger</CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Immutable transaction log tracking receipts, issuances, and reasoned adjustments.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="py-2.5 px-4">Timestamp</th>
                        <th className="py-2.5 px-4">Item</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4 text-center">Quantity Delta</th>
                        <th className="py-2.5 px-4 text-center">Balance After</th>
                        <th className="py-2.5 px-4">Reason / Notes</th>
                        <th className="py-2.5 px-4">Performed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {movements.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            Zero movement records logged.
                          </td>
                        </tr>
                      ) : (
                        movements.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50/75">
                            <td className="py-2.5 px-4 text-xs font-mono text-slate-500">
                              {new Date(m.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{m.consumableName}</td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                                  m.movementType === 'receipt'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : m.movementType === 'issuance'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {m.movementType}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-center font-bold">
                              <span className={m.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-center font-semibold text-slate-800">{m.balanceAfter}</td>
                            <td className="py-2.5 px-4 text-slate-600 text-xs">{m.reason}</td>
                            <td className="py-2.5 px-4 text-xs text-slate-500">{m.createdByName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* MODAL: Goods Received Note (Receive Stock) */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-600" />
                Record Goods Received Note (GRN)
              </h3>
              <button onClick={() => setIsReceiptModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReceiptSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Supplier / Vendor</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mukwano Stationery Ltd"
                  value={receiptSupplier}
                  onChange={(e) => setReceiptSupplier(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Delivery Note / Invoice Ref (Unique)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GRN-2026-089"
                  value={receiptRef}
                  onChange={(e) => setReceiptRef(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Destination Store</label>
                  <select
                    value={receiptStoreId}
                    onChange={(e) => setReceiptStoreId(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Consumable Item</label>
                  <select
                    value={receiptConsumableId}
                    onChange={(e) => setReceiptConsumableId(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    {consumables.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.sku})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Quantity Received</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={receiptQty}
                    onChange={(e) => setReceiptQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Unit Cost (UGX)</label>
                  <input
                    type="number"
                    min={0}
                    value={receiptUnitCost}
                    onChange={(e) => setReceiptUnitCost(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Notes / Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional delivery details..."
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsReceiptModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Recording...' : 'Record Inward Stock'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Adjust Stock Level */}
      {isAdjustModalOpen && selectedAdjustItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Adjust Stock Level</h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Item</p>
                <p className="font-bold text-slate-900">{selectedAdjustItem.name}</p>
                <p className="text-xs text-slate-400 font-mono">{selectedAdjustItem.sku}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Current Stock</p>
                  <p className="text-xl font-bold text-slate-800">{selectedAdjustItem.currentQuantity} {selectedAdjustItem.unit}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">New Physical Count</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-lg font-bold border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              {(() => {
                const delta = adjustQty - selectedAdjustItem.currentQuantity;
                return (
                  <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border border-slate-200">
                    <div>
                      <p className="text-xs text-slate-600 font-semibold uppercase">Ledger Movement Delta</p>
                      <p className="text-xs text-slate-400">Recorded to immutable audit ledger</p>
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                          delta > 0
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : delta < 0
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : `${delta}`} {selectedAdjustItem.unit}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Reason for Adjustment <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Physical stock count audit discrepancy / damaged box discarded"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsAdjustModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing || !adjustReason.trim()}>
                  {isProcessing ? 'Updating...' : 'Save Stock Adjustment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Request Supplies */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Material Requisition</h3>
              <button onClick={() => setIsRequestModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleNewRequestSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Department</label>
                  <select
                    value={newReqDepartment}
                    onChange={(e) => setNewReqDepartment(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Primary">Primary</option>
                    <option value="Secondary">Secondary</option>
                    <option value="Science">Science & Lab</option>
                    <option value="Humanities">Humanities</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Item to Request</label>
                  <select
                    value={newReqConsumableId}
                    onChange={(e) => setNewReqConsumableId(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    {consumables.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Avail: {c.currentQuantity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Quantity Requested</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={newReqQty}
                  onChange={(e) => setNewReqQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Purpose / Class <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Term 3 whiteboard supplies for P.5 Blue"
                  value={newReqPurpose}
                  onChange={(e) => setNewReqPurpose(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsRequestModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing || !newReqPurpose.trim()}>
                  {isProcessing ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Issue Stock Confirmation */}
      {isIssueModalOpen && selectedRequestToIssue && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Issue Stock & Fulfill Request</h3>
              <button onClick={() => setIsIssueModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleIssueSubmit} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Requester</p>
                <p className="font-bold text-slate-900">{selectedRequestToIssue.requesterName}</p>
                <p className="text-xs text-slate-500">{selectedRequestToIssue.purpose}</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="text-xs font-semibold text-slate-700 uppercase">Items to be issued:</p>
                {selectedRequestToIssue.lines.map((l) => {
                  const issueQty = l.approvedQty !== null && l.approvedQty !== undefined ? l.approvedQty : l.requestedQty;
                  const isPartial = l.approvedQty !== null && l.approvedQty !== undefined && l.approvedQty < l.requestedQty;
                  return (
                    <div key={l.id || l.consumableId} className="flex justify-between items-center text-sm">
                      <div>
                        <span className="font-medium text-slate-800">{l.consumableName}</span>
                        {isPartial && (
                          <span className="ml-2 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Partial (Req: {l.requestedQty})
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-emerald-700">
                        {issueQty} {l.unit}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-slate-500">
                Issuing these items will atomically decrement store balances and create immutable movement records.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsIssueModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Issuing...' : 'Confirm Issuance'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reject Request */}
      {isRejectModalOpen && selectedRequestToReject && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-red-600">Reject Stock Request</h3>
              <button onClick={() => setIsRejectModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRejectSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this material request cannot be approved..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsRejectModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={isProcessing || !rejectReason.trim()}
                >
                  {isProcessing ? 'Rejecting...' : 'Reject Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Consumable Item */}
      {isAddConsumableOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Add New Consumable Item</h3>
              <button onClick={() => setIsAddConsumableOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddConsumableSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whiteboard Markers (Red, Pack of 12)"
                  value={newConsName}
                  onChange={(e) => setNewConsName(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">SKU Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. STAT-WMR-005"
                    value={newConsSku}
                    onChange={(e) => setNewConsSku(e.target.value)}
                    className="w-full text-sm font-mono border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category</label>
                  <select
                    value={newConsCatId}
                    onChange={(e) => setNewConsCatId(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Store</label>
                  <select
                    value={newConsStoreId}
                    onChange={(e) => setNewConsStoreId(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="">Default Store</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Unit</label>
                  <select
                    value={newConsUnit}
                    onChange={(e) => setNewConsUnit(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="piece">Piece</option>
                    <option value="pack">Pack</option>
                    <option value="box">Box</option>
                    <option value="ream">Ream</option>
                    <option value="set">Set</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Reorder Level</label>
                  <input
                    type="number"
                    min={0}
                    value={newConsReorder}
                    onChange={(e) => setNewConsReorder(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Initial Stock</label>
                  <input
                    type="number"
                    min={0}
                    value={newConsInitialQty}
                    onChange={(e) => setNewConsInitialQty(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsAddConsumableOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Saving...' : 'Add Consumable Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Equipment Asset */}
      {isAddAssetOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Register Tangible Asset</h3>
              <button onClick={() => setIsAddAssetOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddAssetSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Asset Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lenovo ThinkPad E14"
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Asset Tag (Barcode/ID)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ASSET-IT-009"
                    value={newAssetTag}
                    onChange={(e) => setNewAssetTag(e.target.value)}
                    className="w-full text-sm font-mono border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Serial Number</label>
                  <input
                    type="text"
                    placeholder="e.g. PF29A88Z"
                    value={newAssetSerial}
                    onChange={(e) => setNewAssetSerial(e.target.value)}
                    className="w-full text-sm font-mono border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category</label>
                  <select
                    value={newAssetCatId}
                    onChange={(e) => setNewAssetCatId(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Store</label>
                  <select
                    value={newAssetStoreId}
                    onChange={(e) => setNewAssetStoreId(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="">Default Store</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Condition</label>
                  <select
                    value={newAssetCondition}
                    onChange={(e) => setNewAssetCondition(e.target.value as any)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Purchase Cost (UGX)</label>
                <input
                  type="number"
                  min={0}
                  value={newAssetCost}
                  onChange={(e) => setNewAssetCost(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsAddAssetOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Saving...' : 'Register Asset'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Issue Asset Custody */}
      {isAssignAssetOpen && selectedAssetToAssign && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Issue Asset Custody</h3>
              <button onClick={() => setIsAssignAssetOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAssignAssetSubmit} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Asset</p>
                <p className="font-bold text-slate-900">{selectedAssetToAssign.name}</p>
                <p className="text-xs text-slate-400 font-mono">{selectedAssetToAssign.assetTag}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Custodian Type</label>
                  <select
                    value={assignCustodianType}
                    onChange={(e) => setAssignCustodianType(e.target.value as any)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="employee">Staff / Teacher</option>
                    <option value="student">Student</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Expected Return</label>
                  <input
                    type="date"
                    value={assignReturnDate}
                    onChange={(e) => setAssignReturnDate(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Custodian ID (Person UUID) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. person-florence or UUID"
                  value={assignCustodianId}
                  onChange={(e) => setAssignCustodianId(e.target.value)}
                  className="w-full text-sm font-mono border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Handover Notes</label>
                <textarea
                  rows={2}
                  placeholder="Condition on issue, chargers, accessories..."
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsAssignAssetOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing || !assignCustodianId.trim()}>
                  {isProcessing ? 'Issuing...' : 'Issue Asset'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Return Asset Custody */}
      {isReturnAssetOpen && selectedAssetToReturn && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Return Asset to Store</h3>
              <button onClick={() => setIsReturnAssetOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReturnAssetSubmit} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Asset</p>
                <p className="font-bold text-slate-900">{selectedAssetToReturn.name}</p>
                <p className="text-xs text-slate-500">
                  Current holder: {selectedAssetToReturn.currentCustodian?.custodianName || 'Staff'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Condition on Return</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value as any)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                >
                  <option value="good">Good (No defects)</option>
                  <option value="fair">Fair (Normal wear and tear)</option>
                  <option value="poor">Poor (Requires maintenance)</option>
                  <option value="damaged">Damaged (Faulty/broken)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Return Inspection Notes</label>
                <textarea
                  rows={2}
                  placeholder="Notes on visual inspection, battery, missing cables..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setIsReturnAssetOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Returning...' : 'Accept Return'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Custody History Chain */}
      {isCustodyHistoryOpen && selectedAssetForHistory && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-600" />
                  Asset Custody Chain
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedAssetForHistory.assetTag} • {selectedAssetForHistory.name}
                </p>
              </div>
              <button onClick={() => setIsCustodyHistoryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[65vh] overflow-y-auto space-y-4">
              {custodyHistory.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No historical custody records for this asset.</p>
              ) : (
                <div className="space-y-3">
                  {custodyHistory.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-lg border ${
                        item.isActive ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{item.custodianName}</span>
                            <span className="text-xs px-2 py-0.5 rounded capitalize font-medium bg-slate-200/70 text-slate-700">
                              {item.custodianType}
                            </span>
                            {item.isActive ? (
                              <StatusPill status="info" label="Current Holder" />
                            ) : (
                              <StatusPill status="neutral" label="Returned" />
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Issued: {new Date(item.issuedAt).toLocaleDateString()} by {item.issuedByName}
                            {item.returnedAt && ` • Returned: ${new Date(item.returnedAt).toLocaleDateString()}`}
                          </p>
                          {item.notes && <p className="text-xs text-slate-600 mt-1 italic">{item.notes}</p>}
                        </div>
                        <div className="text-right text-xs">
                          <span className="text-slate-500">Condition: </span>
                          <span className="font-semibold capitalize text-slate-800">{item.conditionOnIssue}</span>
                          {item.conditionOnReturn && (
                            <span className="text-slate-500"> → {item.conditionOnReturn}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <Button variant="outline" onClick={() => setIsCustodyHistoryOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
