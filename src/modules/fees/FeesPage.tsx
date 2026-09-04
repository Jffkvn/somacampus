import React, { useState, useEffect } from 'react';
import { financeService } from '../finance/financeService';
import { StudentFeeAccount, StudentFeeStatement, FeePayment } from '../../types/domain';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { formatCurrency } from '../../lib/utils';
import { DollarSign, Upload, Search, CheckCircle2, AlertCircle, PlusCircle, Receipt, X, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STUDENTS = [
  { id: 'stud-amari', name: 'Amari Kyomugisha', admissionNumber: '2026/0142', className: 'Stage 5 Blue' },
  { id: 'stud-aurora', name: 'Aurora Namukasa', admissionNumber: '2026/0143', className: 'Stage 7 Red' },
  { id: 'stud-brian', name: 'Brian Musoke', admissionNumber: '2026/0098', className: 'Stage 5 Blue' },
  { id: 'stud-claire', name: 'Claire Nabatanzi', admissionNumber: '2026/0115', className: 'Stage 6 Yellow' },
];

export const FeesPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<StudentFeeAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeStatement, setActiveStatement] = useState<StudentFeeStatement | null>(null);
  const [lastReceipt, setLastReceipt] = useState<FeePayment | null>(null);

  // Form state for rapid intake
  const [selectedStudentId, setSelectedStudentId] = useState('stud-aurora');
  const [amount, setAmount] = useState('800000');
  const [channel, setChannel] = useState<FeePayment['paymentChannel']>('bank_deposit');
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('Joseph Namukasa');
  const [payerPhone, setPayerPhone] = useState('+256782334455');
  const [notes, setNotes] = useState('Term 1 tuition payment');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      const accs = await financeService.getStudentFeeAccounts('school-default', 'term-1');
      setAccounts(accs);
    } catch (err) {
      console.error('Failed to load fee accounts', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const totalAssessed = accounts.reduce((sum, a) => sum + a.assessedAmount, 0);
  const totalCollected = accounts.reduce((sum, a) => sum + a.paidAmount, 0);
  const totalOutstanding = accounts.reduce((sum, a) => sum + a.balance, 0);
  const clearancePercentage = totalAssessed > 0 ? ((totalCollected / totalAssessed) * 100).toFixed(1) : '0';

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const pmt = await financeService.recordPayment({
        schoolId: 'school-default',
        studentId: selectedStudentId,
        amount: parseFloat(amount) || 0,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentChannel: channel,
        paymentReference: reference || `REF-${Date.now().toString().slice(-6)}`,
        payerName,
        payerPhone,
        notes,
      });

      setLastReceipt(pmt);
      setShowPaymentModal(false);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenStatement = async (studentId: string) => {
    const stmt = await financeService.getStudentFeeStatement(studentId);
    setActiveStatement(stmt);
  };

  if (isLoading && accounts.length === 0) {
    return <LoadingState label="Loading fee accounts & clearance ledgers..." />;
  }

  const filteredAccounts = accounts.filter((acc) => {
    const s = STUDENTS.find((st) => st.id === acc.studentId);
    const text = `${s?.name || ''} ${s?.admissionNumber || ''} ${s?.className || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            School Finance & Fee Accounting
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Fee Accounts & Clearance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time student fee charges, manual intake reconciliation & clearance tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            leftIcon={<PlusCircle className="w-4 h-4" />}
            onClick={() => {
              setLastReceipt(null);
              setShowPaymentModal(true);
            }}
          >
            Record Payment
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Upload className="w-4 h-4" />}
            onClick={() => navigate('/fees/import')}
          >
            Import Bank / Telco Statement
          </Button>
        </div>
      </div>

      {/* Success Notification Banner on Payment */}
      {lastReceipt && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                Payment Recorded Successfully • Receipt #{lastReceipt.receiptNumber}
              </p>
              <p className="text-xs text-emerald-700">
                Amount: {formatCurrency(lastReceipt.amount)} via {lastReceipt.paymentChannel} (Ref: {lastReceipt.paymentReference}). Allocated automatically against student charges.
              </p>
            </div>
          </div>
          <button
            onClick={() => setLastReceipt(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-medium p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 Headline Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Total Assessed"
          value={formatCurrency(totalAssessed)}
          subValue="Term 1 obligations"
          icon={DollarSign}
        />
        <StatCard
          label="Collected Payments"
          value={formatCurrency(totalCollected)}
          subValue="Reconciled to date"
          icon={CheckCircle2}
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(totalOutstanding)}
          subValue="Unpaid student arrears"
          icon={AlertCircle}
          iconColor="text-red-600"
        />
        <StatCard
          label="Clearance Rate"
          value={`${clearancePercentage}%`}
          trend={{ value: 'Target: 85%', direction: 'neutral' }}
          icon={DollarSign}
        />
      </div>

      {/* Accounts Ledger Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Student Accounts Ledger</CardTitle>
            <CardDescription>
              Operational balance derived deterministically from charges, payments, and adjustments
            </CardDescription>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student, class, admission..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal"
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4 text-right">Assessed</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4">Clearance Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((acc) => {
                  const s = STUDENTS.find((st) => st.id === acc.studentId);
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 block">
                          {s?.name || 'Student'}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {s?.admissionNumber || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {s?.className || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                        {formatCurrency(acc.assessedAmount)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-700">
                        {formatCurrency(acc.paidAmount)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {acc.balance > 0 ? (
                          <span className="text-rose-600">{formatCurrency(acc.balance)}</span>
                        ) : (
                          <span className="text-emerald-600">UGX 0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusPill
                          status={
                            acc.clearanceStatus === 'cleared'
                              ? 'success'
                              : acc.clearanceStatus === 'partial'
                              ? 'warning'
                              : 'critical'
                          }
                          label={
                            acc.clearanceStatus === 'cleared'
                              ? 'Cleared'
                              : acc.clearanceStatus === 'partial'
                              ? 'Partial'
                              : 'Overdue'
                          }
                        />
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleOpenStatement(acc.studentId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-brand-teal bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> Statement
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Record Payment Fast Intake Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-brand-teal" />
                <h3 className="text-lg font-bold text-slate-900">Record Fee Payment</h3>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Select Student
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white"
                >
                  {STUDENTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.admissionNumber} — {s.className})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Amount (UGX)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-sm font-semibold border border-slate-200 rounded-lg p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Payment Channel
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white"
                  >
                    <option value="bank_deposit">Bank Deposit</option>
                    <option value="mobile_money">MTN / Airtel Mobile Money</option>
                    <option value="bank_transfer">Electronic Funds Transfer</option>
                    <option value="cash">Cash Voucher</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Reference / Slip / TxID
                </label>
                <input
                  type="text"
                  placeholder="e.g. BNK-123498 or MM-881920"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Payer Name
                  </label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Payer Phone
                  </label>
                  <input
                    type="tel"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Payment Reference / Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Term 1 tuition payment"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-xs text-emerald-800">
                <span className="font-semibold">Automated Allocation:</span> Payment will allocate against the oldest outstanding charges (Tuition first, then Catering, then Clubs). Excess amount will be retained as unallocated credit.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSubmitting}>
                  Confirm & Allocate Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Fee Statement Modal */}
      {activeStatement && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{activeStatement.studentName}</h3>
                <p className="text-xs text-slate-500">
                  Admission: {activeStatement.admissionNumber} • {activeStatement.className}
                </p>
              </div>
              <button
                onClick={() => setActiveStatement(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Charges Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Assessed Term Charges
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Fee Item</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeStatement.charges.map((chg) => (
                      <tr key={chg.id}>
                        <td className="p-3 font-medium text-slate-900">{chg.description}</td>
                        <td className="p-3 text-right">{formatCurrency(chg.amount)}</td>
                        <td className="p-3 text-right text-emerald-700 font-semibold">{formatCurrency(chg.paidAmount)}</td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          {chg.balance > 0 ? (
                            <span className="text-rose-600">{formatCurrency(chg.balance)}</span>
                          ) : (
                            <span className="text-emerald-600">UGX 0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment History */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Recorded Payments & Receipts
              </h4>
              {activeStatement.payments.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No payments recorded yet for this student.</p>
              ) : (
                <div className="space-y-2">
                  {activeStatement.payments.map((p) => (
                    <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-900 block">
                          Receipt #{p.receiptNumber} • {formatCurrency(p.amount)}
                        </span>
                        <span className="text-slate-500">
                          {p.paymentDate} via {p.paymentChannel} (Ref: {p.paymentReference})
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px] uppercase">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Statement Summary Banner */}
            <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider block">Total Outstanding Balance</span>
                <span className="text-xl font-bold text-white">
                  {formatCurrency(activeStatement.balance)}
                </span>
              </div>
              <StatusPill
                status={activeStatement.clearanceStatus === 'cleared' ? 'success' : 'critical'}
                label={activeStatement.clearanceStatus.toUpperCase()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
