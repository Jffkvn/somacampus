import React, { useState, useEffect } from 'react';
import { expenseService } from './expenseService';
import { SchoolExpense, SchoolExpenseCategory } from '../../types/domain';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { formatUGX } from '../payroll/calculations';
import {
  TrendingDown,
  ShoppingBag,
  Zap,
  PlusCircle,
  Search,
  X,
  Building2,
  Calendar,
} from 'lucide-react';

export const ExpensesPage: React.FC = () => {
  const [categories, setCategories] = useState<SchoolExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<SchoolExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Record Expense Modal state
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [spentOn, setSpentOn] = useState(new Date().toISOString().split('T')[0]);
  const [paymentChannel, setPaymentChannel] = useState<SchoolExpense['paymentChannel']>('mobile_money');
  const [recipientPayee, setRecipientPayee] = useState('');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      const [cats, exps] = await Promise.all([
        expenseService.getCategories('school-default'),
        expenseService.getExpenses('school-default', 'term-1'),
      ]);
      setCategories(cats);
      setExpenses(exps);
      if (cats.length > 0 && !categoryId) {
        setCategoryId(cats[0].id);
      }
    } catch (err) {
      console.error('Failed to load expenses', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const foodSpent = expenses
    .filter((e) => e.categoryName?.toLowerCase().includes('food') || e.categoryName?.toLowerCase().includes('catering'))
    .reduce((sum, e) => sum + e.amount, 0);
  const utilitiesSpent = expenses
    .filter((e) =>
      e.categoryName?.toLowerCase().includes('elec') ||
      e.categoryName?.toLowerCase().includes('water') ||
      e.categoryName?.toLowerCase().includes('internet')
    )
    .reduce((sum, e) => sum + e.amount, 0);

  const filteredExpenses = expenses.filter((e) => {
    const matchesCategory = selectedCategoryFilter === 'all' || e.categoryId === selectedCategoryFilter;
    const matchesSearch =
      e.recipientPayee.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.referenceNumber && e.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    try {
      setIsSaving(true);
      await expenseService.recordExpense({
        schoolId: 'school-default',
        categoryId,
        amount: numAmount,
        spentOn,
        paymentChannel,
        recipientPayee,
        description,
        referenceNumber: referenceNumber || undefined,
        termId: 'term-1',
      });

      // Reload
      const updated = await expenseService.getExpenses('school-default', 'term-1');
      setExpenses(updated);
      setShowModal(false);
      setAmount('');
      setRecipientPayee('');
      setDescription('');
      setReferenceNumber('');
    } catch (err: any) {
      console.error('Failed to record expense', err);
      alert(err?.message || 'Could not record expense');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingState label="Loading school operational expenses..." />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">
              Institutional Operations
            </span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700">
              Money Out
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            School Operating Expenses
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track and reconcile operational expenditures (catering, power, water, maintenance, and supplies).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <PlusCircle className="w-4 h-4 mr-2" />
            Record Expense
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Term Expenditure"
          value={formatUGX(totalSpent)}
          subValue={`${expenses.length} operating vouchers`}
          icon={TrendingDown}
          iconColor="text-rose-600"
        />
        <StatCard
          label="Food & Catering"
          value={formatUGX(foodSpent)}
          subValue="Boarders & day meals"
          icon={ShoppingBag}
          iconColor="text-amber-600"
        />
        <StatCard
          label="Campus Utilities"
          value={formatUGX(utilitiesSpent)}
          subValue="Power, water & connectivity"
          icon={Zap}
          iconColor="text-blue-600"
        />
        <StatCard
          label="Reporting Cycle"
          value="Term 1 (2026)"
          subValue="Reconciled to date"
          icon={Building2}
        />
      </div>

      {/* Expenses Ledger Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Operating Expenses Ledger</CardTitle>
            <CardDescription>
              Authoritative record of disbursed school operational funds
            </CardDescription>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* Category Filter */}
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-700 w-full sm:w-48"
            >
              <option value="all">All Expense Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search payee, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Spent On</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Payee / Recipient</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {exp.spentOn}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {exp.categoryName || 'General'}
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-semibold">
                      {exp.recipientPayee}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {exp.description}
                    </td>
                    <td className="py-3 px-4 text-xs uppercase text-slate-600">
                      {exp.paymentChannel.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      {exp.referenceNumber || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatUGX(exp.amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <StatusPill
                        status={exp.status === 'reconciled' ? 'success' : 'pending'}
                        label={exp.status.toUpperCase()}
                      />
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 text-sm">
                      No expense records found matching the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Record Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Record Operating Expense
                </h3>
                <p className="text-xs text-slate-500">
                  Document disbursed cash, mobile money, or bank EFT expenditure
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Expense Amount (UGX)
                  </label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 1500000"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Spent On Date
                  </label>
                  <input
                    type="date"
                    value={spentOn}
                    onChange={(e) => setSpentOn(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentChannel}
                    onChange={(e) => setPaymentChannel(e.target.value as any)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white"
                  >
                    <option value="mobile_money">Mobile Money (MTN / Airtel)</option>
                    <option value="bank_transfer">Bank EFT / Transfer</option>
                    <option value="cash">Petty Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Payee / Vendor Name
                  </label>
                  <input
                    type="text"
                    required
                    value={recipientPayee}
                    onChange={(e) => setRecipientPayee(e.target.value)}
                    placeholder="e.g. Umeme, City Mart..."
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Voucher / Receipt Ref
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. MM-109281, REC-441"
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Description / Purpose
                </label>
                <textarea
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Purchase of laboratory test tubes and reagent replenishment for Term 1 science practicals"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSaving}>
                  Save & Log Voucher
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
