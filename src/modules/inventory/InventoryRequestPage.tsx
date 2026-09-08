import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import {
  inventoryService,
  type ConsumableItem,
  type StockRequest,
} from './inventoryService';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

/**
 * Teacher supply-request surface (request-only).
 *
 * Reachable at /inventory/request by teacher + admin + principal. Teachers
 * file material requisitions and read ONLY their own requests (service
 * requester_id filter + RLS own-row policy). The manager console at
 * /administration/inventory stays admin/principal-only.
 */
export const InventoryRequestPage: React.FC = () => {
  const { schoolId, user } = useAuth();
  const effectiveSchoolId = schoolId ?? PILOT_SCHOOL_ID;

  const [personId, setPersonId] = useState<string | null>(null);
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [requests, setRequests] = useState<StockRequest[]>([]);

  const [department, setDepartment] = useState<string>('Primary');
  const [consumableId, setConsumableId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [purpose, setPurpose] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (!user?.id) {
        throw new Error('Sign-in required: no session identity for supply requests.');
      }
      const { data: person, error: personErr } = await supabase
        .from('people')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (personErr) throw personErr;
      const pid = (person as { id?: string } | null)?.id ?? null;
      if (!pid) {
        throw new Error('No person record for this session — ask admin to link your sign-in to a staff profile.');
      }
      setPersonId(pid);
      const [cons, reqs] = await Promise.all([
        inventoryService.listConsumables(effectiveSchoolId),
        inventoryService.listStockRequests(effectiveSchoolId, { requesterId: pid }),
      ]);
      setConsumables(cons);
      setRequests(reqs);
      if (cons.length > 0 && !consumableId) setConsumableId(cons[0].id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load supply request data');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSchoolId, user?.id, consumableId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purpose.trim() || !consumableId || !personId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await inventoryService.createStockRequest({
        schoolId: effectiveSchoolId,
        requesterId: personId,
        department,
        purpose: purpose.trim(),
        lines: [{ consumableId, requestedQty: Number(quantity) }],
      });
      setPurpose('');
      setSuccessMessage('Supply request submitted — leadership will review it in the stock requests queue.');
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit supply request');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-8 h-8 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Supply Requests</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Request classroom supplies from the school store and track your own requisitions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <div className="flex-1">{successMessage}</div>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading supply requests..." className="py-12" />
      ) : (
        <>
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <h2 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                New Supply Request
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Department</label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                    >
                      <option value="Primary">Primary</option>
                      <option value="Secondary">Secondary</option>
                      <option value="Science">Science &amp; Lab</option>
                      <option value="Humanities">Humanities</option>
                      <option value="Administration">Administration</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Item</label>
                    <select
                      value={consumableId}
                      onChange={(e) => setConsumableId(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white"
                    >
                      {consumables.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Avail: {c.currentQuantity})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Purpose / Class <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Term 3 whiteboard supplies for P.5 Blue"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isProcessing || !purpose.trim() || !personId}>
                    {isProcessing ? 'Submitting...' : 'Submit Request'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h2 className="font-bold text-slate-900">My Requests</h2>
            {requests.length === 0 ? (
              <Card className="p-8 text-center text-slate-400 border-slate-200">
                No supply requests yet — your requisitions will appear here.
              </Card>
            ) : (
              requests.map((req) => (
                <Card key={req.id} className="border-slate-200">
                  <CardContent className="p-5 space-y-1">
                    <div className="flex items-center gap-2">
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
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
