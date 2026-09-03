import React, { useState, useEffect } from 'react';
import { feesService, FeesDashboardViewModel } from './feesService';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { formatCurrency } from '../../lib/utils';
import { DollarSign, Upload, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const FeesPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<FeesDashboardViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const res = await feesService.getFeesDashboard('school-grace-01');
        setData(res);
      } catch (err) {
        console.error('Failed to load fees dashboard', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading || !data) {
    return <LoadingState label="Loading fee accounts & clearance ledgers..." />;
  }

  const filteredAccounts = data.accounts.filter(
    (acc) =>
      acc.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.className.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Finance & Fee Reconciliation
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Fee Accounts & Clearance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Student fee obligations, reconciliation and clearance tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            leftIcon={<Upload className="w-4 h-4" />}
            onClick={() => navigate('/fees/import')}
          >
            Import Bank / Telco Statement
          </Button>
        </div>
      </div>

      {/* 4 Headline Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Total Assessed"
          value={formatCurrency(data.totalAssessed)}
          subValue="Term 1 obligations"
          icon={DollarSign}
        />
        <StatCard
          label="Collected Payments"
          value={formatCurrency(data.totalCollected)}
          subValue="Reconciled to date"
          icon={CheckCircle2}
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(data.totalOutstanding)}
          subValue="Unpaid student arrears"
          icon={AlertCircle}
          iconColor="text-red-600"
        />
        <StatCard
          label="Clearance Rate"
          value={`${data.clearancePercentage}%`}
          trend={{ value: 'Target: 85%', direction: 'neutral' }}
          icon={DollarSign}
        />
      </div>

      {/* Student Fee Accounts Ledger Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Student Accounts Ledger</CardTitle>
            <CardDescription>Real-time balances and verified clearance states</CardDescription>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student or admission #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal transition-all"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-6">Student</th>
                  <th className="py-3 px-6">Class</th>
                  <th className="py-3 px-6">Assessed</th>
                  <th className="py-3 px-6">Paid</th>
                  <th className="py-3 px-6">Balance</th>
                  <th className="py-3 px-6">Clearance</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <p className="font-bold text-slate-900">{acc.studentName}</p>
                      <p className="text-[11px] text-slate-400">Adm: {acc.admissionNumber}</p>
                    </td>
                    <td className="py-4 px-6 text-slate-700 font-medium">{acc.className}</td>
                    <td className="py-4 px-6 font-mono text-slate-700">{formatCurrency(acc.assessedAmount)}</td>
                    <td className="py-4 px-6 font-mono text-emerald-700 font-semibold">{formatCurrency(acc.paidAmount)}</td>
                    <td className="py-4 px-6 font-mono">
                      {acc.balance === 0 ? (
                        <span className="text-slate-400 font-medium">UGX 0</span>
                      ) : (
                        <span className="text-red-700 font-bold">{formatCurrency(acc.balance)}</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <StatusPill
                        status={
                          acc.clearanceStatus === 'cleared'
                            ? 'success'
                            : acc.clearanceStatus === 'partial'
                            ? 'pending'
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
                    <td className="py-4 px-6 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/fees/accounts/${acc.id}`)}
                      >
                        Ledger
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
