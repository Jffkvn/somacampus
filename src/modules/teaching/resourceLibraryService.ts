import { supabase } from '../../lib/supabase';
import type { AcademicResource } from './academicResources';

export type { AcademicResource };

const isMockEnv = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co' ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY === 'placeholder-anon-key';

export interface ResourceFilter {
  subject?: string;
  stageLevel?: string;
  type?: string;
  approvalState?: string;
  searchQuery?: string;
}

export interface CreateResourceInput {
  schoolId: string;
  title: string;
  type: 'worksheet' | 'lesson_plan' | 'quiz' | 'lab_guide' | 'revision';
  subject: string;
  stageLevel: string;
  topic: string;
  curriculumObjectiveCode: string;
  curriculumObjectiveText: string;
  approvalState?: 'school_approved' | 'teacher_approved' | 'draft';
  authorName: string;
  previewText: string;
  contentText?: string;
  fileUrl?: string;
  tags?: string[];
}

function mapResourceRow(row: any): AcademicResource {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    subject: row.subject,
    stageLevel: row.stage_level,
    topic: row.topic,
    curriculumObjective: `${row.curriculum_objective_code}: ${row.curriculum_objective_text}`,
    approvalState: row.approval_state,
    author: row.author_name,
    createdAt: String(row.created_at || '').slice(0, 10),
    usageCount: row.usage_count ?? 0,
    rating: Number(row.rating ?? 5.0),
    previewText: row.preview_text,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

export const resourceLibraryService = {
  /**
   * Fetches school-scoped approved curriculum materials from live database.
   * Fails closed on database errors (Production Trust Gate Inviolable Law 1).
   */
  async getResources(schoolId: string, filter?: ResourceFilter): Promise<AcademicResource[]> {
    if (isMockEnv()) {
      return [];
    }

    let query = supabase
      .from('school_resources')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (filter?.subject && filter.subject !== 'all') {
      query = query.eq('subject', filter.subject);
    }
    if (filter?.stageLevel && filter.stageLevel !== 'all') {
      query = query.eq('stage_level', filter.stageLevel);
    }
    if (filter?.type && filter.type !== 'all') {
      query = query.eq('type', filter.type);
    }
    if (filter?.approvalState && filter.approvalState !== 'all') {
      query = query.eq('approval_state', filter.approvalState);
    } else {
      // Default tenant-safe scope: exclude drafts unless explicitly requested.
      query = query.in('approval_state', ['school_approved', 'teacher_approved']);
    }
    if (filter?.searchQuery && filter.searchQuery.trim()) {
      const q = filter.searchQuery.trim();
      query = query.or(`title.ilike.%${q}%,topic.ilike.%${q}%,curriculum_objective_code.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('resourceLibraryService.getResources error:', error);
      throw new Error(`Failed to load school resources: ${error.message}`);
    }

    return (data || []).map(mapResourceRow);
  },

  /**
   * Search-Before-Generate: finds approved resources matching a curriculum objective code.
   */
  async findMatchingResources(schoolId: string, objectiveCode: string): Promise<AcademicResource[]> {
    if (isMockEnv()) {
      return [];
    }

    const { data, error } = await supabase
      .from('school_resources')
      .select('*')
      .eq('school_id', schoolId)
      .eq('curriculum_objective_code', objectiveCode.trim())
      .in('approval_state', ['school_approved', 'teacher_approved'])
      .order('usage_count', { ascending: false });

    if (error) {
      console.error('resourceLibraryService.findMatchingResources error:', error);
      throw new Error(`Failed to load school resources: ${error.message}`);
    }

    return (data || []).map(mapResourceRow);
  },

  /**
   * Fetches a single school-scoped resource. Returns null when the row does not
   * exist in the caller's school (fail-closed: cross-tenant reads resolve null).
   * Throws on database errors.
   */
  async getResourceById(schoolId: string, resourceId: string): Promise<AcademicResource | null> {
    if (isMockEnv()) {
      return null;
    }

    const { data, error } = await supabase
      .from('school_resources')
      .select('*')
      .eq('school_id', schoolId)
      .eq('id', resourceId)
      .maybeSingle();

    if (error) {
      console.error('resourceLibraryService.getResourceById error:', error);
      throw new Error(`Failed to load school resource: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return mapResourceRow(data);
  },

  /**
   * Creates a new verified curriculum resource in the school's library.
   * Tenant enforcement is RLS-reliant (service role never used client-side).
   */
  async createResource(payload: CreateResourceInput): Promise<AcademicResource> {
    if (isMockEnv()) {
      throw new Error('Database write unavailable in mock environment');
    }

    if (!payload.schoolId || !payload.schoolId.trim()) {
      throw new Error('A valid school scope is required to create a school resource');
    }
    if (!payload.title || !payload.title.trim()) {
      throw new Error('Resource title is required');
    }
    if (!payload.curriculumObjectiveCode || !payload.curriculumObjectiveCode.trim()) {
      throw new Error('Curriculum objective code is required');
    }
    if (!payload.authorName || !payload.authorName.trim()) {
      throw new Error('Author name is required');
    }

    const { data, error } = await supabase
      .from('school_resources')
      .insert({
        school_id: payload.schoolId,
        title: payload.title.trim(),
        type: payload.type,
        subject: payload.subject,
        stage_level: payload.stageLevel,
        topic: payload.topic.trim(),
        curriculum_objective_code: payload.curriculumObjectiveCode.trim(),
        curriculum_objective_text: payload.curriculumObjectiveText.trim(),
        approval_state: payload.approvalState ?? 'school_approved',
        author_name: payload.authorName.trim(),
        preview_text: payload.previewText.trim(),
        content_text: payload.contentText ?? payload.previewText.trim(),
        file_url: payload.fileUrl ?? null,
        tags: payload.tags ?? [],
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create school resource: ${error?.message ?? 'Unknown error'}`);
    }

    return mapResourceRow(data);
  },
};
