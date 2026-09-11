import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { financeService } from '../finance/financeService';
import { studentService } from '../students/studentService';
import type { StudentFeeStatement } from '../../types/domain';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { formatCurrency } from '../../lib/utils';
import { ArrowLeft, Printer, Receipt } from 'lucide-react';
import { useAuth } from '../../lib/authContext';

interface ClubRow {
  activityName: string;
  status: string;
  chargeAmount: number | null;
  clearance: string;
}

/**
 * Pupil fee dossier: identity, totals, charges, payments + receipts,
 * club enrolments with charge/clearance, printable statement.
 */
export const FeeProfilePage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const { schoolId } = useAuth();
  const [statement, setStatement] = useState<StudentFeeStatement | null>(null);
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [className, setClassName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        if (!studentId) throw new Error('No pupil selected.');
        const [stmt, dir] = await Promise.all([
          financeService.getStudentFeeStatement(studentId),
          schoolId ? studentService.getStudentDirectory(schoolId) : Promise.resolve([]),
        ]);
        if (!stmt) throw new Error('No fee record found for this pupil.');
        setStatement(stmt);
        setClassName(dir.find((d) => d.studentId === studentId)?.className ?? stmt.className);
        setClubs(await financeService.getStudentClubEnrolments(studentId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load fee profile.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [studentId, schoolId]);

  if (isLoading) return <LoadingState label="Loading pupil fee profile..." />;
  if (error || !statement) {
    return (
      <div className="space-y-4">
        <Link to="/fees">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Fee Accounts
          </Button>
        </Link>
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
          {error ?? 'No fee record found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/fees">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Fee Accounts
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{statement.studentName}</h1>
            <p className="text-xs text-slate-500">
              {statement.admissionNumber}
              {className ? ` • ${className}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill
            status={statement.clearanceStatus === 'cleared' ? 'success' : statement.clearanceStatus === 'partial' ? 'warning' : 'critical'}
            label={statement.clearanceStatus}
          />
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> Print statement
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent>
            <p className="text-xs font-bold text-slate-500 uppercase">Assessed</p>
            <p className="text-2xl font-extrabold text-slate-900">{formatCurrency(statement.totalAssessed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs font-bold text-slate-500 uppercase">Paid</p>
            <p className="text-2xl font-extrabold text-emerald-700">{formatCurrency(statement.totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs font-bold text-slate-500 uppercase">Balance</p>
            <p className={`text-2xl font-extrabold ${statement.balance > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {formatCurrency(statement.balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Charges</CardTitle>
          <CardDescription>Assessed term charges with amounts paid and owing.</CardDescription>
        </CardHeader>
        <CardContent>
          {statement.charges.length === 0 ? (
            <p className="text-sm text-slate-500">No charges assessed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Fee item</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Paid</th>
                    <th className="p-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.charges.map((c) => (
                    <tr key={c.id}>
                      <td className="p-3 font-medium text-slate-900">{c.description}</td>
                      <td className="p-3 text-right">{formatCurrency(c.amount)}</td>
                      <td className="p-3 text-right text-emerald-700 font-semibold">{formatCurrency(c.paidAmount)}</td>
                      <td className="p-3 text-right font-bold">{formatCurrency(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history & receipts</CardTitle>
          <CardDescription>Every recorded payment with receipt reference.</CardDescription>
        </CardHeader>
        <CardContent>
          {statement.payments.length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {statement.payments.map((p) => (
                <div key={p.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Receipt className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-slate-500">
                        {p.paymentDate} • {p.paymentChannel}
                        {p.receiptNumber ? ` • ${p.receiptNumber}` : ''}
                        {p.payerName ? ` • ${p.payerName}` : ''}
                      </p>
                      {p.unallocatedAmount > 0 && (
                        <p className="text-xs text-amber-700">
                          {formatCurrency(p.unallocatedAmount)} held as unallocated credit
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusPill status={p.status === 'fully_allocated' ? 'success' : 'warning'} label={p.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clubs & activities</CardTitle>
          <CardDescription>Enrolments with linked charges and operational clearance.</CardDescription>
        </CardHeader>
        <CardContent>
          {clubs.length === 0 ? (
            <p className="text-sm text-slate-500">Not enrolled in any clubs or activities.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Activity</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Charge</th>
                    <th className="p-3 text-center">Clearance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clubs.map((c, i) => (
                    <tr key={`${c.activityName}-${i}`}>
                      <td className="p-3 font-medium text-slate-900">{c.activityName}</td>
                      <td className="p-3 text-slate-600">{c.status}</td>
                      <td className="p-3 text-right">{c.chargeAmount == null ? '—' : formatCurrency(c.chargeAmount)}</td>
                      <td className="p-3 text-center">
                        <StatusPill
                          status={c.clearance === 'cleared' ? 'success' : c.clearance === 'not_cleared' ? 'critical' : 'warning'}
                          label={c.clearance}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
