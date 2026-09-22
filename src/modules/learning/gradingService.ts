/**
 * P3-A grading scale service — school-configured bands + formula.
 */
import { supabase } from '../../lib/supabase';
import {
  buildTermOverall,
  validateScale,
  type GradingScale,
  type ResultFormula,
  type SubjectMark,
  type TermOverall,
} from './gradingDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapScale(r: any): GradingScale {
  return {
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    formula: r.formula,
    bands: Array.isArray(r.bands) ? r.bands : [],
    subjectWeights: r.subject_weights ?? {},
    divisions: Array.isArray(r.divisions) ? r.divisions : [],
    rounding: r.rounding ?? 'whole',
  };
}

export const gradingService = {
  async listScales(schoolId: string): Promise<GradingScale[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('grading_scales')
      .select('*')
      .eq('school_id', schoolId)
      .order('is_default', { ascending: false });
    if (error) throw new Error(`grading.listScales: ${error.message}`);
    return (data ?? []).map(mapScale);
  },

  async createScale(input: {
    schoolId: string;
    name: string;
    formula: ResultFormula;
    bands: GradingScale['bands'];
    subjectWeights?: Record<string, number>;
    divisions?: Array<{ maxAggregate: number; label: string }>;
    rounding?: 'whole' | 'one_decimal';
    isDefault?: boolean;
  }): Promise<GradingScale> {
    validateScale(input);
    if (isMockEnv()) throw new Error('grading.createScale: unavailable without live database');
    const { data, error } = await supabase
      .from('grading_scales')
      .insert({
        school_id: input.schoolId,
        name: input.name.trim(),
        formula: input.formula,
        bands: input.bands,
        subject_weights: input.subjectWeights ?? {},
        divisions: input.divisions ?? [],
        rounding: input.rounding ?? 'whole',
        is_default: input.isDefault ?? false,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`grading.createScale: ${error?.message ?? 'no row'}`);
    return mapScale(data);
  },

  /** Pure preview — never writes. */
  previewOverall(scale: GradingScale, marks: SubjectMark[]): TermOverall {
    return buildTermOverall(scale, marks);
  },
};
