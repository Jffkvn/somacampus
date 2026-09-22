/**
 * P3-A grading config UI — school grading table + formula.
 * Teacher/admin configures; math is deterministic (gradingDomain).
 */
import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, Scale } from 'lucide-react';
import { gradingService } from './gradingService';
import {
  DEFAULT_BANDS,
  UG_DIVISION_PRESET,
  buildTermOverall,
  type GradingScale,
  type ResultFormula,
  type SubjectMark,
} from './gradingDomain';

const inputClass =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40';

export interface GradingScalePanelProps {
  schoolId: string;
  canEdit?: boolean;
}

const SAMPLE: SubjectMark[] = [
  { subjectCode: 'MATH', subjectName: 'Mathematics', score: 82, maxScore: 100 },
  { subjectCode: 'ENG', subjectName: 'English', score: 76, maxScore: 100 },
  { subjectCode: 'SCI', subjectName: 'Science', score: 88, maxScore: 100 },
];

export const GradingScalePanel: React.FC<GradingScalePanelProps> = ({
  schoolId,
  canEdit = false,
}) => {
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [formula, setFormula] = useState<ResultFormula>('mean');
  const [name, setName] = useState('School grading');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const draft: GradingScale = {
    id: 'draft',
    schoolId,
    name,
    formula,
    bands: DEFAULT_BANDS,
    divisions: UG_DIVISION_PRESET,
    rounding: 'whole',
  };
  const preview = buildTermOverall(draft, SAMPLE);

  const load = async () => {
    try {
      setError(null);
      setScales(await gradingService.listScales(schoolId));
    } catch (err: any) {
      setError(err?.message ?? 'Could not load grading scales');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const save = async () => {
    setIsSaving(true);
    try {
      await gradingService.createScale({
        schoolId,
        name,
        formula,
        bands: DEFAULT_BANDS,
        divisions: UG_DIVISION_PRESET,
        isDefault: scales.length === 0,
      });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not save grading scale');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Formal assessment"
        title="Grading & aggregates"
        description="School-configured formula: mean · total · aggregate/division. Uganda preset is optional — not hard-coded."
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Scale className="w-4 h-4 text-brand-teal" /> Result formula
              </span>
            </CardTitle>
            <CardDescription>How the school counts a term (explicit — no hidden rescale).</CardDescription>
          </div>
          <StatusPill status="info" label={formula} />
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600">Scale name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="block text-xs font-semibold text-slate-600">Formula</label>
          <select
            className={inputClass}
            value={formula}
            onChange={(e) => setFormula(e.target.value as ResultFormula)}
          >
            <option value="mean">Mean (average %)</option>
            <option value="total">Total (sum of marks)</option>
            <option value="aggregate_division">Aggregate + division</option>
          </select>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Sample preview (82 / 76 / 88)</p>
            <p className="font-bold text-slate-900">
              {preview.label ?? '—'}
              {preview.division ? ` · ${preview.division}` : ''}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {preview.subjects.map((s) => `${s.subjectName} ${s.grade ?? '—'}`).join(' · ')}
            </p>
          </div>

          {canEdit && (
            <Button type="button" disabled={isSaving} onClick={() => void save()} className="bg-brand-teal text-white">
              {isSaving ? 'Saving…' : 'Save grading scale'}
            </Button>
          )}
        </CardContent>
      </Card>

      {scales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved scales</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-slate-100">
              {scales.map((s) => (
                <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                  <StatusPill status="neutral" label={s.formula} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
