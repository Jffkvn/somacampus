import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';
import { Button } from './Button';
import { StatusPill } from './StatusPill';
import { ArrowLeft, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ModulePlaceholderProps {
  title: string;
  moduleName: string;
  description: string;
  scheduledPhase: string;
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({
  title,
  moduleName,
  description,
  scheduledPhase,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            {moduleName}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
        <StatusPill status="info" label={`Scheduled: ${scheduledPhase}`} />
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-teal" />
            <span>Architecture & Data Contract Established</span>
          </CardTitle>
          <CardDescription>
            This module boundary is strictly defined in `SOMACAMPUS_v1_7.md` and `REUSE_REGISTER.md`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <p>
            The domain models, database schema, and security RLS boundaries for this module are established.
            Per the approved phased implementation plan, active UI workflows will be implemented in subsequent vertical slices after the Teacher Daily Loop (Phase 2) and Leadership Monitoring (Phase 3) are complete.
          </p>
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => navigate(-1)}
            >
              Back to Previous Screen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
