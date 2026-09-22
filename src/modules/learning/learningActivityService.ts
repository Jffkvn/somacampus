/**
 * Digital Learning Spine — learning_activities service (M3).
 *
 * Charter: docs/plans/2026-09-22-digital-learning-spine.md
 * PLAN (Phase 6 sequences/objectives) · ACTIVITY (this) · DELIVERY (lessons / sessions).
 *
 * P0 types only: ASSIGNMENT | RESOURCE | LIVE_SESSION
 */
import { supabase } from '../../lib/supabase';

export type LearningActivityType = 'ASSIGNMENT' | 'RESOURCE' | 'LIVE_SESSION';

export interface LearningActivity {
  id: string;
  schoolId: string;
  teachingSequenceId: string | null;
  onlineOfferingId: string | null;
  activityType: LearningActivityType;
  title: string;
  instructions: string | null;
  resourceUrl: string | null;
  resourceStoragePath: string | null;
  sortOrder: number;
  isPublished: boolean;
  assignedDate: string | null;
  dueDate: string | null;
  onlineSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLearningActivityInput {
  schoolId: string;
  teachingSequenceId?: string | null;
  onlineOfferingId?: string | null;
  activityType: LearningActivityType;
  title: string;
  instructions?: string | null;
  resourceUrl?: string | null;
  resourceStoragePath?: string | null;
  sortOrder?: number;
  isPublished?: boolean;
  assignedDate?: string | null;
  dueDate?: string | null;
  onlineSessionId?: string | null;
  objectiveIds?: string[];
}

function mapRow(r: any): LearningActivity {
  return {
    id: r.id,
    schoolId: r.school_id,
    teachingSequenceId: r.teaching_sequence_id ?? null,
    onlineOfferingId: r.online_offering_id ?? null,
    activityType: r.activity_type,
    title: r.title,
    instructions: r.instructions ?? null,
    resourceUrl: r.resource_url ?? null,
    resourceStoragePath: r.resource_storage_path ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    isPublished: Boolean(r.is_published),
    assignedDate: r.assigned_date ?? null,
    dueDate: r.due_date ?? null,
    onlineSessionId: r.online_session_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function validateCreate(input: CreateLearningActivityInput): void {
  if (!input.schoolId) throw new Error('learningActivities: schoolId is required');
  if (!input.title?.trim()) throw new Error('learningActivities: title is required');
  if (!input.teachingSequenceId && !input.onlineOfferingId) {
    throw new Error('learningActivities: teachingSequenceId or onlineOfferingId is required');
  }
  if (input.onlineSessionId && !input.onlineOfferingId) {
    throw new Error('learningActivities: LIVE_SESSION provenance requires onlineOfferingId');
  }
  if (input.dueDate && input.assignedDate && input.dueDate < input.assignedDate) {
    throw new Error('learningActivities: dueDate cannot be before assignedDate');
  }
}

export const learningActivityService = {
  async createActivity(input: CreateLearningActivityInput): Promise<LearningActivity> {
    validateCreate(input);

    const { data, error } = await supabase
      .from('learning_activities')
      .insert({
        school_id: input.schoolId,
        teaching_sequence_id: input.teachingSequenceId ?? null,
        online_offering_id: input.onlineOfferingId ?? null,
        activity_type: input.activityType,
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        resource_url: input.resourceUrl ?? null,
        resource_storage_path: input.resourceStoragePath ?? null,
        sort_order: input.sortOrder ?? 0,
        is_published: input.isPublished ?? true,
        assigned_date: input.assignedDate ?? null,
        due_date: input.dueDate ?? null,
        online_session_id: input.onlineSessionId ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`learningActivities.createActivity: ${error?.message ?? 'no row'}`);
    }

    const activity = mapRow(data);

    if (input.objectiveIds?.length) {
      const rows = input.objectiveIds.map((objectiveId) => ({
        activity_id: activity.id,
        objective_id: objectiveId,
      }));
      const { error: objErr } = await supabase.from('learning_activity_objectives').insert(rows);
      if (objErr) {
        console.warn('learningActivities: objective links failed', objErr);
      }
    }

    return activity;
  },

  async listByOffering(onlineOfferingId: string): Promise<LearningActivity[]> {
    const { data, error } = await supabase
      .from('learning_activities')
      .select('*')
      .eq('online_offering_id', onlineOfferingId)
      .order('sort_order', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) throw new Error(`learningActivities.listByOffering: ${error.message}`);
    return (data ?? []).map(mapRow);
  },

  async listBySequence(teachingSequenceId: string): Promise<LearningActivity[]> {
    const { data, error } = await supabase
      .from('learning_activities')
      .select('*')
      .eq('teaching_sequence_id', teachingSequenceId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`learningActivities.listBySequence: ${error.message}`);
    return (data ?? []).map(mapRow);
  },

  async getActivity(id: string): Promise<LearningActivity | null> {
    const { data, error } = await supabase
      .from('learning_activities')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`learningActivities.getActivity: ${error.message}`);
    return data ? mapRow(data) : null;
  },

  async linkObjectives(activityId: string, objectiveIds: string[]): Promise<void> {
    const rows = objectiveIds.map((objectiveId) => ({
      activity_id: activityId,
      objective_id: objectiveId,
    }));
    const { error } = await supabase.from('learning_activity_objectives').insert(rows);
    if (error) throw new Error(`learningActivities.linkObjectives: ${error.message}`);
  },
};
