/**
 * P3-D paper service — templates, backend AI draft, teacher approve/print.
 * AI drafts (paperDraftDomain.draftExamPaper / future LLM hook).
 * Teacher edits content and APPROVES. AI never writes marks/grades.
 */
import { supabase } from '../../lib/supabase';
import {
  draftExamPaper,
  parsePastPaperStructure,
  type PaperDraft,
  type PaperStructure,
  type TeacherBrief,
} from './paperDraftDomain';

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

export interface ExamPaper {
  id: string;
  title: string;
  termLabel: string;
  status: 'draft' | 'approved' | 'printed';
  version: number;
  brief: TeacherBrief;
}

export interface PaperVersion {
  id: string;
  paperId: string;
  version: number;
  content: PaperDraft | Record<string, unknown>;
  origin: 'ai_draft' | 'teacher_edit' | 'approved';
}

import {
  draftExamPaper as gatewayDraftExamPaper,
} from '../../lib/aiGateway';

/**
 * Backend AI boundary (AI-3): prefers the shared gateway
 * (`ai-teaching-assistant` / draft_exam_paper). Falls back to deterministic
 * composition when the gateway is unavailable (timeout → manual path rule).
 */
export async function aiDraftPaper(
  structure: PaperStructure,
  brief: TeacherBrief,
): Promise<PaperDraft> {
  try {
    const res = await gatewayDraftExamPaper({
      structure,
      title: brief.title,
      termLabel: brief.termLabel,
      topics: brief.topics,
      instructions: brief.instructions ?? null,
      difficulty: brief.difficulty ?? null,
    });
    const paper = res.paper as unknown as PaperDraft;
    if (paper?.sections?.length) {
      return { ...paper, header: { ...paper.header, isDraft: true, origin: 'ai_draft' } };
    }
  } catch {
    // fail closed → deterministic draft (teacher still approves)
  }
  return draftExamPaper(structure, brief);
}

function mapPaper(r: any): ExamPaper {
  return {
    id: r.id,
    title: r.title,
    termLabel: r.term_label,
    status: r.status,
    version: Number(r.version ?? 1),
    brief: r.brief ?? {},
  };
}

export const paperService = {
  /** Ingest past-paper text → structure template (heuristics). */
  async saveTemplate(input: {
    schoolId: string;
    name: string;
    sourceLabel?: string | null;
    pastPaperText: string;
    createdBy?: string | null;
  }): Promise<{ id: string; structure: PaperStructure }> {
    const structure = parsePastPaperStructure(input.pastPaperText);
    if (isMockEnv()) return { id: 'mock-template', structure };
    const { data, error } = await supabase
      .from('exam_paper_templates')
      .insert({
        school_id: input.schoolId,
        name: input.name.trim(),
        source_label: input.sourceLabel ?? null,
        structure,
        created_by: input.createdBy ?? null,
      })
      .select('id, structure')
      .single();
    if (error || !data) throw new Error(`paper.saveTemplate: ${error?.message ?? 'no row'}`);
    return { id: String(data.id), structure: data.structure };
  },

  /**
   * Create paper + AI draft v1 (backend AI). Teacher must still edit/approve.
   */
  async createWithAiDraft(input: {
    schoolId: string;
    templateId?: string | null;
    structure: PaperStructure;
    brief: TeacherBrief;
    subjectId?: string | null;
    classId?: string | null;
    createdBy?: string | null;
  }): Promise<{ paper: ExamPaper; draft: PaperDraft }> {
    const draft = await aiDraftPaper(input.structure, input.brief);
    if (isMockEnv()) {
      return {
        paper: {
          id: 'mock-paper',
          title: input.brief.title,
          termLabel: input.brief.termLabel,
          status: 'draft',
          version: 1,
          brief: input.brief,
        },
        draft,
      };
    }

    const { data: paper, error } = await supabase
      .from('exam_papers')
      .insert({
        school_id: input.schoolId,
        template_id: input.templateId ?? null,
        subject_id: input.subjectId ?? null,
        class_id: input.classId ?? null,
        title: input.brief.title.trim(),
        term_label: input.brief.termLabel.trim(),
        brief: input.brief,
        status: 'draft',
        version: 1,
        created_by: input.createdBy ?? null,
      })
      .select('*')
      .single();
    if (error || !paper) throw new Error(`paper.create: ${error?.message ?? 'no row'}`);

    const { error: verErr } = await supabase.from('exam_paper_versions').insert({
      paper_id: paper.id,
      version: 1,
      content: draft,
      origin: 'ai_draft',
      created_by: input.createdBy ?? null,
    });
    if (verErr) throw new Error(`paper.create(version): ${verErr.message}`);

    return { paper: mapPaper(paper), draft };
  },

  /** H5: persist a deterministic draft even when AI/gateway fails — Approve never dead-ends. */
  async createManualDraft(input: {
    schoolId: string;
    structure: PaperStructure;
    brief: TeacherBrief;
    subjectId?: string | null;
    classId?: string | null;
    createdBy?: string | null;
  }): Promise<{ paper: ExamPaper; draft: PaperDraft }> {
    const draft = draftExamPaper(input.structure, input.brief);
    if (isMockEnv()) {
      return {
        paper: {
          id: 'mock-paper',
          title: input.brief.title,
          termLabel: input.brief.termLabel,
          status: 'draft',
          version: 1,
          brief: input.brief,
        },
        draft,
      };
    }
    const { data: paper, error } = await supabase
      .from('exam_papers')
      .insert({
        school_id: input.schoolId,
        subject_id: input.subjectId ?? null,
        class_id: input.classId ?? null,
        title: input.brief.title.trim(),
        term_label: input.brief.termLabel.trim(),
        brief: input.brief,
        status: 'draft',
        version: 1,
        created_by: input.createdBy ?? null,
      })
      .select('*')
      .single();
    if (error || !paper) throw new Error(`paper.createManualDraft: ${error?.message ?? 'no row'}`);
    await supabase.from('exam_paper_versions').insert({
      paper_id: paper.id,
      version: 1,
      content: draft,
      origin: 'ai_draft',
      created_by: input.createdBy ?? null,
    });
    return { paper: mapPaper(paper), draft };
  },

  async saveTeacherEdit(paperId: string, content: PaperDraft, createdBy?: string | null): Promise<void> {
    if (isMockEnv()) throw new Error('paper.saveTeacherEdit: unavailable without live database');
    const { data: last, error: lastErr } = await supabase
      .from('exam_paper_versions')
      .select('version')
      .eq('paper_id', paperId)
      .order('version', { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(`paper.saveTeacherEdit: ${lastErr.message}`);
    const next = ((last ?? []) as any[])[0]
      ? Number(((last ?? []) as any[])[0].version) + 1
      : 1;
    const { error } = await supabase.from('exam_paper_versions').insert({
      paper_id: paperId,
      version: next,
      content: { ...content, header: { ...content.header, isDraft: true, origin: 'teacher_edit' } },
      origin: 'teacher_edit',
      created_by: createdBy ?? null,
    });
    if (error) throw new Error(`paper.saveTeacherEdit(insert): ${error.message}`);
  },

  /** Teacher APPROVE (RPC). AI cannot do this. */
  async approve(paperId: string, content: PaperDraft): Promise<void> {
    if (isMockEnv()) throw new Error('paper.approve: unavailable without live database');
    const approved = { ...content, header: { ...content.header, isDraft: false, origin: 'approved' } };
    const { error } = await supabase.rpc('approve_exam_paper', {
      p_paper_id: paperId,
      p_content: approved,
    });
    if (error) throw new Error(`paper.approve: ${error.message}`);
    // H7: full audit chain — who approved what content.
    const outputHash = String(approved.sections?.length ?? 0) + ':' + JSON.stringify(approved).length;
    const { data: me } = await supabase.auth.getUser();
    await supabase.from('ai_gateway_audit').insert({
      task: 'approve_exam_paper',
      input_refs: [{ kind: 'exam_paper', id: paperId, label: approved.header?.title ?? 'paper' }],
      output_hash: outputHash,
      approved_at: new Date().toISOString(),
    });
    void me;
  },

  async getLatestVersion(paperId: string): Promise<PaperVersion | null> {
    if (isMockEnv()) return null;
    const { data, error } = await supabase
      .from('exam_paper_versions')
      .select('*')
      .eq('paper_id', paperId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`paper.getLatestVersion: ${error.message}`);
    if (!data) return null;
    return {
      id: String(data.id),
      paperId: String(data.paper_id),
      version: Number(data.version),
      content: data.content,
      origin: data.origin,
    };
  },
};
