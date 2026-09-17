import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { StatusPill } from '../../components/ui/StatusPill';
import { Modal } from '../../components/ui/Modal';
import { SlideToConfirm } from '../../components/ui/SlideToConfirm';
import { useToast } from '../../components/ui/Toast';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { DollarSign, Users, CheckCircle2 } from 'lucide-react';

/**
 * P2 — dev-only live component bench (Bencho concept).
 * Route is DEV-gated in App.tsx; not linked in production nav.
 */
export const DesignBenchPage: React.FC = () => {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        eyebrow="Design bench"
        title="Institutional Glass primitives"
        description="Live gallery for the design system. Dev-only — not in production navigation."
      />

      <Card>
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
          <CardDescription>Variants + loading</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" isLoading>Loading</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status pills</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(['success', 'pending', 'warning', 'critical', 'info', 'neutral'] as const).map((s) => (
            <StatusPill key={s} status={s} label={s} />
          ))}
        </CardContent>
      </Card>

      <section aria-label="Stat cards">
        <h2 className="text-sm font-bold text-slate-700 mb-3">Stat cards (Number Flow)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Cash received" value="UGX 5,200,000" subValue="Hero money" icon={DollarSign} />
          <StatCard label="Pupils" value={128} subValue="Enrolled" icon={Users} />
          <StatCard
            label="Cleared"
            value="28.1%"
            subValue="With trend"
            icon={CheckCircle2}
            trend={{ value: '+2.1%', direction: 'up', isPositive: true }}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Modal &amp; confirm</CardTitle>
          <CardDescription>Focus trap · Escape · hold-to-confirm · toast</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <SlideToConfirm
            label="Hold to confirm"
            onConfirm={() => toast.success('Confirmed', 'SlideToConfirm completed.')}
          />
          <Button variant="ghost" onClick={() => toast.info('Info toast', 'Neutral operator message.')}>
            Info toast
          </Button>
          <Button variant="ghost" onClick={() => toast.error('Error toast', 'Something failed on purpose.')}>
            Error toast
          </Button>
          <Button variant="outline" onClick={() => setShowSkeleton((v) => !v)}>
            {showSkeleton ? 'Hide skeleton' : 'Show skeleton'}
          </Button>
        </CardContent>
      </Card>

      {showSkeleton && (
        <div className="space-y-3">
          <LoadingState variant="table" rows={3} label="Table skeleton" />
          <LoadingState variant="cards" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Empty state</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No online programmes yet"
            description="Create the first programme to start the online centre catalogue."
          />
        </CardContent>
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Bench modal">
        <p className="text-sm text-slate-600">
          Accessible dialog sample: focus is trapped, Escape closes, backdrop click dismisses.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => { setModalOpen(false); toast.success('Saved', 'Bench modal action.'); }}>
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
};
