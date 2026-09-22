/**
 * P3-D paper production — structure + brief → BACKEND AI DRAFT.
 * Teacher inputs: past-paper structure + topics/counts/marks.
 * AI drafts in the backend (this module / future LLM hook).
 * Teacher edits + APPROVES. AI never writes marks/grades.
 */

export interface PaperSectionSpec {
  code: string;
  title: string;
  n: number;
  marksEach: number;
}

export interface PaperStructure {
  sections: PaperSectionSpec[];
  timeMinutes?: number | null;
  totalMarks?: number | null;
  stems?: string[];
}

export interface TeacherBrief {
  title: string;
  termLabel: string;
  /** Curriculum topics / objectives to cover. */
  topics: string[];
  /** Optional difficulty hint (does not decide grades). */
  difficulty?: 'mixed' | 'accessible' | 'stretch';
  instructions?: string | null;
}

export interface DraftQuestion {
  n: number;
  text: string;
  marks: number;
  topic: string;
}

export interface DraftSection {
  code: string;
  title: string;
  questions: DraftQuestion[];
}

export interface PaperDraft {
  header: {
    title: string;
    termLabel: string;
    timeMinutes: number | null;
    totalMarks: number;
    instructions: string | null;
    /** Always true until teacher approves. */
    isDraft: boolean;
    origin: 'ai_draft' | 'teacher_edit' | 'approved';
  };
  sections: DraftSection[];
}

const DEFAULT_STEMS = [
  'Calculate',
  'Explain why',
  'Show that',
  'Work out',
  'Describe',
  'Solve',
];

/** Heuristics: parse past-paper text into a structure template. */
export function parsePastPaperStructure(text: string): PaperStructure {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections: PaperSectionSpec[] = [];
  const stems = new Set<string>();
  let timeMinutes: number | null = null;
  let totalMarks: number | null = null;

  const sectionRe = /^section\s+([a-z])\b[:.\s-]*(.*)$/i;
  const marksRe = /\[(\d+)\s*marks?\]/i;
  const timeRe = /time[:\s]*(\d+)\s*(?:hours?|hrs?)(?:\s*(\d+)\s*(?:minutes?|mins?))?/i;
  const totalRe = /total[:\s]*(\d+)\s*marks?/i;
  const qRe = /^(\d+)[.)]\s+(.*)$/;

  let current: PaperSectionSpec | null = null;
  for (const line of lines) {
    const t = timeRe.exec(line);
    if (t) {
      timeMinutes = Number(t[1]) * 60 + (t[2] ? Number(t[2]) : 0);
    }
    const tot = totalRe.exec(line);
    if (tot) totalMarks = Number(tot[1]);

    const sec = sectionRe.exec(line);
    if (sec) {
      current = {
        code: sec[1].toUpperCase(),
        title: (sec[2] || 'Questions').trim() || 'Questions',
        n: 0,
        marksEach: 1,
      };
      sections.push(current);
      continue;
    }

    const q = qRe.exec(line);
    if (q) {
      if (!current) {
        current = { code: 'A', title: 'Questions', n: 0, marksEach: 1 };
        sections.push(current);
      }
      current.n += 1;
      const m = marksRe.exec(line);
      if (m) current.marksEach = Number(m[1]);
      const stem = DEFAULT_STEMS.find((s) => q[2].toLowerCase().startsWith(s.toLowerCase()));
      if (stem) stems.add(stem);
    }
  }

  if (!sections.length) {
    sections.push({ code: 'A', title: 'Questions', n: 8, marksEach: 2 });
  }
  const structure: PaperStructure = {
    sections,
    timeMinutes,
    totalMarks: totalMarks ?? sections.reduce((a, s) => a + s.n * s.marksEach, 0),
    stems: [...stems],
  };
  return structure;
}

/**
 * BACKEND AI DRAFT — composes a new paper from structure + teacher brief.
 * Deterministic composition in v1 (topics × stems × sections); the call
 * site is the AI boundary (swap in an LLM later). Teacher must approve.
 */
export function draftExamPaper(structure: PaperStructure, brief: TeacherBrief): PaperDraft {
  if (!brief.topics?.length) {
    throw new Error('paperDraft: teacher topics are required');
  }
  if (!structure.sections?.length) {
    throw new Error('paperDraft: past-paper structure needs sections');
  }

  const stems = structure.stems?.length ? structure.stems : DEFAULT_STEMS;
  let qn = 0;
  const sections: DraftSection[] = structure.sections.map((sec) => {
    const questions: DraftQuestion[] = [];
    for (let i = 0; i < sec.n; i++) {
      const topic = brief.topics[i % brief.topics.length];
      const stem = stems[i % stems.length];
      qn += 1;
      questions.push({
        n: qn,
        text: `${stem} — ${topic} (item ${i + 1}). Show your working.`,
        marks: sec.marksEach,
        topic,
      });
    }
    return { code: sec.code, title: sec.title, questions };
  });

  const totalMarks =
    structure.totalMarks ??
    sections.reduce((a, s) => a + s.questions.reduce((x, q) => x + q.marks, 0), 0);

  return {
    header: {
      title: brief.title,
      termLabel: brief.termLabel,
      timeMinutes: structure.timeMinutes ?? null,
      totalMarks,
      instructions: brief.instructions ?? 'Answer ALL questions. Show your working.',
      isDraft: true,
      origin: 'ai_draft',
    },
    sections,
  };
}

/** Teacher must approve; AI never finalises. */
export function assertTeacherOwnsApproval(): void {
  // Structural reminder for call sites — approval RPC requires staff role.
}
