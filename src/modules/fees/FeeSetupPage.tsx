import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { feeSetupService, FeeCategory, FeeClass, FeeStructureRow, FeeTerm } from '../finance/feeSetupService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../lib/authContext';
import { CheckCircle2, Lock, Users, Info, AlertCircle } from 'lucide-react';

/**
 * Fee Setup — the school's price list (Phase A).
 *
 * Designed for non-technical staff: pick a term, type amounts into a plain
 * class-by-category grid, save. The Bursar's save becomes a draft for the
 * Principal/Admin to approve; only approved fees can be applied to students,
 * and applying is idempotent (bill lines can never be created twice).
 */

interface GridCell {
  structureId?: string;
  amount: number | null;
  approvalStatus: FeeStructureRow['approvalStatus'] | 'new';
  rejectionNote?: string | null;
}

const cellKey = (classId: string, categoryId: string) => `${classId}|${categoryId}`;

export const FeeSetupPage: React.FC = () => {
  const { schoolId, role } = useAuth();
  const isApprover = role === 'principal' || role === 'admin';

  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [terms, setTerms] = useState<FeeTerm[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [classes, setClasses] = useState<FeeClass[]>([]);
  const [structures, setStructures] = useState<FeeStructureRow[]>([]);

  // cell values under edit: key -> numeric string
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);

  const selectedTerm = terms.find((t) => t.id === selectedTermId) ?? null;

  const cells = useMemo(() => {
    const map = new Map<string, GridCell>();
    for (const s of structures) {
      if (!s.classId || !s.categoryId) continue;
      map.set(cellKey(s.classId, s.categoryId), {
        structureId: s.id,
        amount: s.amount,
        approvalStatus: s.approvalStatus,
        rejectionNote: s.rejectionNote,
      });
    }
    return map;
  }, [structures]);

  const loadSetup = useCallback(async (termId: string) => {
    if (!schoolId || !termId) return;
    setIsLoading(true);
    setPageError(null);
    try {
      const data = await feeSetupService.getFeeSetup(schoolId, termId);
      setCategories(data.categories);
      setClasses(data.classes);
      setStructures(data.structures);
      setEdits({});
    } catch (err) {
      console.error('Failed to load fee setup', err);
      setPageError(err instanceof Error ? err.message : 'Could not load the fee setup.');
    } finally {
      setIsLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    async function loadTerms() {
      if (!schoolId) {
        setPageError('No school selected. Sign in first.');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const list = await feeSetupService.getTerms(schoolId);
        setTerms(list);
        const initial = list.find((t) => t.isCurrent) ?? list[0];
        if (initial) {
          setSelectedTermId(initial.id);
          await loadSetup(initial.id);
        } else {
          setPageError('No academic terms exist yet. Ask the Admin to set up the academic year first.');
          setIsLoading(false);
        }
      } catch (err) {
        console.error(err);
        setPageError(err instanceof Error ? err.message : 'Could not load terms.');
        setIsLoading(false);
      }
    }
    loadTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const onTermChange = (termId: string) => {
    setSelectedTermId(termId);
    setNotice(null);
    void loadSetup(termId);
  };

  const setEdit = (classId: string, categoryId: string, raw: string) => {
    setEdits((prev) => ({ ...prev, [cellKey(classId, categoryId)]: raw }));
  };

  const fillColumn = (categoryId: string, raw: string) => {
    const value = raw.replace(/[^0-9.]/g, '');
    if (!value) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const cls of classes) {
        const key = cellKey(cls.id, categoryId);
        const cell = cells.get(key);
        const isLocked = cell?.approvalStatus === 'approved';
        if (!isLocked) next[key] = value;
      }
      return next;
    });
  };

  const pendingDrafts = structures.filter((s) => s.approvalStatus === 'draft');
  const approvedStructures = structures.filter((s) => s.approvalStatus === 'approved');

  const buildSaveEdits = () => {
    const saveEdits: Array<{
      structureId?: string;
      classId: string;
      categoryId: string;
      title: string;
      amount: number;
      resetToDraft?: boolean;
    }> = [];
    for (const cls of classes) {
      for (const cat of categories) {
        const key = cellKey(cls.id, cat.id);
        if (!(key in edits)) continue;
        const amount = Number(edits[key]);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const cell = cells.get(key);
        saveEdits.push({
          structureId: cell?.structureId,
          classId: cls.id,
          categoryId: cat.id,
          title: `${cat.name} fee`,
          amount,
          resetToDraft: cell?.approvalStatus === 'rejected',
        });
      }
    }
    return saveEdits;
  };

  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const cls of classes) {
      for (const cat of categories) {
        const key = cellKey(cls.id, cat.id);
        if (!(key in edits)) continue;
        const amount = Number(edits[key]);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const cell = cells.get(key);
        if (!cell || cell.amount !== amount) count += 1;
      }
    }
    return count;
  }, [edits, classes, categories, cells]);

  const handleSave = async () => {
    if (!schoolId || !selectedTermId || !selectedTerm) return;
    const edits = buildSaveEdits();
    if (edits.length === 0) {
      setNotice('Nothing to save yet — type an amount into the grid first.');
      return;
    }
    setIsSaving(true);
    setNotice(null);
    setPageError(null);
    try {
      await feeSetupService.saveDrafts(schoolId, selectedTermId, selectedTerm.academicYearId, edits);
      await loadSetup(selectedTermId);
      setNotice(
        isApprover
          ? 'Saved. Remember to approve the drafts below before applying them to students.'
          : 'Saved. Your changes were sent to the Principal for approval.',
      );
    } catch (err) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'Could not save the fee grid.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproval = async (approve: boolean) => {
    if (!schoolId) return;
    const ids = pendingDrafts.map((s) => s.id);
    if (ids.length === 0) return;
    setIsApproving(true);
    setNotice(null);
    try {
      const res = await feeSetupService.setApproval(schoolId, ids, approve, approve ? undefined : 'Please review and resubmit.');
      await loadSetup(selectedTermId);
      setNotice(
        approve
          ? `Approved ${res.updated} fee line${res.updated === 1 ? '' : 's'}. You can now apply them to students.`
          : `${res.updated} fee line${res.updated === 1 ? '' : 's'} returned to draft.`,
      );
    } catch (err) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleApply = async () => {
    if (!schoolId || !selectedTermId) return;
    const ids = approvedStructures.map((s) => s.id);
    if (ids.length === 0) return;
    setIsApplying(true);
    setPageError(null);
    try {
      const res = await feeSetupService.generateCharges(schoolId, selectedTermId, ids);
      setNotice(
        res.charges_created > 0
          ? `Created ${res.charges_created} bill line${res.charges_created === 1 ? '' : 's'} for ${res.students} student${res.students === 1 ? '' : 's'}. They now appear in Fee Accounts and on the Family Portal.`
          : 'Every enrolled student already has these bill lines — nothing new was created.',
      );
      setShowApplyConfirm(false);
    } catch (err) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'Could not apply fees to students.');
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="Loading fee setup..." />;
  }

  if (pageError && categories.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{pageError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="pb-6 border-b border-slate-200/80">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">School Finance</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">Fee Setup</h1>
        <p className="text-sm text-slate-500 mt-1">
          Set what each class pays per term. The Bursar drafts the amounts; the Principal approves before they reach students.
        </p>
      </div>

      {/* Term picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">Term:</span>
        {terms.map((t) => (
          <button
            key={t.id}
            onClick={() => onTermChange(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
              t.id === selectedTermId
                ? 'bg-brand-teal text-white border-brand-teal'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t.name}{t.isCurrent ? ' •' : ''}
          </button>
        ))}
        <span className="text-[11px] text-slate-400 ml-1">• marks the current term</span>
      </div>

      {notice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {notice}
        </div>
      )}
      {pageError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {pageError}
        </div>
      )}

      {/* Pending approval panel (Principal / Admin only) */}
      {isApprover && pendingDrafts.length > 0 && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">
                {pendingDrafts.length} fee line{pendingDrafts.length === 1 ? '' : 's'} waiting for your approval
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Drafted by the Bursar for this term. Approving unlocks "Apply to students".
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleApproval(false)} disabled={isApproving}>
                Reject
              </Button>
              <Button variant="primary" size="sm" onClick={() => handleApproval(true)} disabled={isApproving}>
                {isApproving ? 'Approving…' : 'Approve all'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing grid */}
      <Card>
        <CardHeader>
          <CardTitle>What each class pays — {selectedTerm?.name ?? ''}</CardTitle>
          <CardDescription>
            Type amounts in UGX. Use "Fill all" to set one price for every class at once, then adjust individual classes.
            {!isApprover && ' Approved amounts are locked until the Principal changes them.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4 font-semibold">Class</th>
                  {categories.map((cat) => (
                    <th key={cat.id} className="py-2 px-3 font-semibold min-w-[190px]">
                      <span className="inline-flex items-center gap-1.5">
                        {cat.name}
                        {cat.isMandatory ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-bold">MANDATORY</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">OPTIONAL</span>
                        )}
                      </span>
                      <span className="block mt-1 font-normal normal-case text-[11px] text-slate-400 flex items-center gap-1">
                        Fill all:
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="amount"
                          className="w-24 px-2 py-0.5 border border-slate-200 rounded-lg text-xs normal-case"
                          onBlur={(e) => fillColumn(cat.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              fillColumn(cat.id, (e.target as HTMLInputElement).value);
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </span>
                    </th>
                  ))}
                  <th className="py-2 pl-4 font-semibold text-right">Term total</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => {
                  let rowTotal = 0;
                  const rowCells = categories.map((cat) => {
                    const key = cellKey(cls.id, cat.id);
                    const cell = cells.get(key);
                    const edited = edits[key];
                    const amount = edited !== undefined ? Number(edited) : cell?.amount ?? null;
                    const isLocked = cell?.approvalStatus === 'approved' && edited === undefined;
                    if (amount !== null && Number.isFinite(amount) && amount > 0) rowTotal += amount;
                    return { cat, key, cell, amount, isLocked };
                  });
                  return (
                    <tr key={cls.id} className="border-t border-slate-100">
                      <td className="py-2.5 pr-4 font-semibold text-slate-800">{cls.name}</td>
                      {rowCells.map(({ cat, key, cell, amount, isLocked }) => (
                        <td key={key} className="py-2 px-3">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              {formatCurrency(amount ?? 0)}
                            </span>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="—"
                              value={edits[key] ?? (amount !== null && amount > 0 ? String(amount) : '')}
                              onChange={(e) => setEdit(cls.id, cat.id, e.target.value.replace(/[^0-9.]/g, ''))}
                              className="w-32 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
                            />
                          )}
                          {cell?.approvalStatus === 'approved' && (
                            <span className="block text-[10px] text-emerald-600 mt-0.5">approved</span>
                          )}
                          {cell?.approvalStatus === 'rejected' && (
                            <span className="block text-[10px] text-red-500 mt-0.5">
                              {cell.rejectionNote ? `returned: ${cell.rejectionNote}` : 'returned to draft'}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="py-2.5 pl-4 text-right font-bold text-slate-800">
                        {rowTotal > 0 ? formatCurrency(rowTotal) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {classes.length === 0 && (
                  <tr>
                    <td colSpan={categories.length + 2} className="py-6 text-center text-slate-400 text-sm">
                      No classes yet — add them under Academics first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Saving sends your amounts for approval. Nothing reaches students until approved AND applied.
            </p>
            <Button variant="primary" onClick={handleSave} disabled={isSaving || dirtyCount === 0}>
              {isSaving ? 'Saving…' : `Save ${dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'Draft'}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Apply to students */}
      {approvedStructures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-teal" />
              Apply approved fees to students
            </CardTitle>
            <CardDescription>
              Creates a bill line for every enrolled student covered by the {approvedStructures.length} approved
              fee line{approvedStructures.length === 1 ? '' : 's'} for {selectedTerm?.name}. Running this again
              never creates duplicates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showApplyConfirm ? (
              <Button variant="primary" onClick={() => setShowApplyConfirm(true)}>
                Apply to students
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  Create bill lines for all enrolled students now?
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={handleApply} disabled={isApplying}>
                    {isApplying ? 'Creating bill lines…' : 'Yes, create bill lines'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowApplyConfirm(false)} disabled={isApplying}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
