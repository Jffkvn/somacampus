/**
 * P2A-4 assessment pack service — create packs and load learner progress
 * with objective rollup from the one gradebook.
 */
import { supabase } from '../../lib/supabase';
import {
  buildPackProgress,
  validatePackInput,
  type PackItemSummary,
  type PackKind,
  type PackProgress,
} from './assessmentPackDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapItem(r: any): PackItemSummary {
  return {
    id: r.id,
    itemTitle: r.item_title,
    quizId: r.quiz_id ?? null,
    learningActivityId: r.learning_activity_id ?? null,
    objectiveMap: Array.isArray(r.objective_map) ? r.objective_map : [],
    weight: Number(r.weight ?? 1),
  };
}

export const assessmentPackService = {
  async createPack(input: {
    schoolId: string;
    packKind: PackKind;
    title: string;
    description?: string | null;
    teachingSequenceId?: string | null;
    onlineOfferingId?: string | null;
    subjectId?: string | null;
    isPublished?: boolean;
    createdBy?: string | null;
    items: Array<{
      itemTitle: string;
      quizId?: string | null;
      learningActivityId?: string | null;
      objectiveMap?: Array<{ objectiveCode: string; objectiveTitle?: string | null }>;
      weight?: number;
    }>;
  }): Promise<{ packId: string; itemIds: string[] }> {
    validatePackInput(input);
    if (isMockEnv()) throw new Error('assessmentPack.createPack: unavailable without live database');

    const { data: pack, error } = await supabase
      .from('learning_assessment_packs')
      .insert({
        school_id: input.schoolId,
        pack_kind: input.packKind,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        teaching_sequence_id: input.teachingSequenceId ?? null,
        online_offering_id: input.onlineOfferingId ?? null,
        subject_id: input.subjectId ?? null,
        is_published: input.isPublished ?? true,
        created_by: input.createdBy ?? null,
      })
      .select('id')
      .single();
    if (error || !pack) throw new Error(`assessmentPack.createPack: ${error?.message ?? 'no row'}`);

    const rows = input.items.map((it, i) => ({
      pack_id: pack.id,
      sort_order: i,
      item_title: it.itemTitle.trim(),
      quiz_id: it.quizId ?? null,
      learning_activity_id: it.learningActivityId ?? null,
      objective_map: it.objectiveMap ?? [],
      weight: it.weight ?? 1,
    }));
    const { data: itemRows, error: itemErr } = await supabase
      .from('learning_assessment_items')
      .insert(rows)
      .select('id');
    if (itemErr) throw new Error(`assessmentPack.createPack(items): ${itemErr.message}`);
    return {
      packId: String(pack.id),
      itemIds: ((itemRows ?? []) as any[]).map((r) => String(r.id)),
    };
  },

  async getPack(packId: string): Promise<{
    packId: string;
    packKind: PackKind;
    title: string;
    items: PackItemSummary[];
  } | null> {
    if (isMockEnv()) return null;
    const { data: pack, error } = await supabase
      .from('learning_assessment_packs')
      .select('id, pack_kind, title')
      .eq('id', packId)
      .maybeSingle();
    if (error) throw new Error(`assessmentPack.getPack: ${error.message}`);
    if (!pack) return null;
    const { data: items, error: itemErr } = await supabase
      .from('learning_assessment_items')
      .select('*')
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });
    if (itemErr) throw new Error(`assessmentPack.getPack(items): ${itemErr.message}`);
    return {
      packId: String(pack.id),
      packKind: pack.pack_kind,
      title: pack.title,
      items: ((items ?? []) as any[]).map(mapItem),
    };
  },

  /** Learner progress + objective rollup from learning_results (one gradebook). */
  async getLearnerProgress(packId: string, studentId: string): Promise<PackProgress> {
    const pack = await this.getPack(packId);
    if (!pack) throw new Error('assessmentPack.getLearnerProgress: pack not found');
    if (isMockEnv()) {
      return buildPackProgress({ ...pack, resultsByItem: {} });
    }

    const quizIds = pack.items.map((i) => i.quizId).filter(Boolean) as string[];
    const activityIds = pack.items.map((i) => i.learningActivityId).filter(Boolean) as string[];

    const resultsByItem: PackProgress['resultsByItem'] = {};

    if (quizIds.length) {
      const { data: quizResults, error: qErr } = await supabase
        .from('learning_results')
        .select('quiz_id, learning_activity_id, score, max_score, result_source, marked_at')
        .eq('student_id', studentId)
        .in('quiz_id', quizIds)
        .order('marked_at', { ascending: false });
      if (qErr) throw new Error(`assessmentPack.results(quiz): ${qErr.message}`);
      for (const r of ((quizResults ?? []) as any[]) ?? []) {
        const item = pack.items.find((i) => i.quizId && String(i.quizId) === String(r.quiz_id));
        if (item && !resultsByItem[item.id]) {
          resultsByItem[item.id] = {
            score: r.score == null ? null : Number(r.score),
            maxScore: r.max_score == null ? null : Number(r.max_score),
            source: String(r.result_source),
          };
        }
      }
    }

    if (activityIds.length) {
      const { data: actResults, error: aErr } = await supabase
        .from('learning_results')
        .select('learning_activity_id, score, max_score, result_source, marked_at')
        .eq('student_id', studentId)
        .in('learning_activity_id', activityIds)
        .order('marked_at', { ascending: false });
      if (aErr) throw new Error(`assessmentPack.results(activity): ${aErr.message}`);
      for (const r of ((actResults ?? []) as any[]) ?? []) {
        const item = pack.items.find(
          (i) => i.learningActivityId && String(i.learningActivityId) === String(r.learning_activity_id),
        );
        if (item && !resultsByItem[item.id]) {
          resultsByItem[item.id] = {
            score: r.score == null ? null : Number(r.score),
            maxScore: r.max_score == null ? null : Number(r.max_score),
            source: String(r.result_source),
          };
        }
      }
    }

    return buildPackProgress({ ...pack, resultsByItem });
  },
};
