export interface AcademicResource {
  id: string;
  title: string;
  type: 'worksheet' | 'lesson_plan' | 'quiz' | 'lab_guide' | 'revision';
  subject: string;
  stageLevel: string;
  topic: string;
  curriculumObjective: string;
  approvalState: 'school_approved' | 'teacher_approved' | 'draft';
  author: string;
  createdAt: string;
  usageCount: number;
  rating: number;
  previewText: string;
  tags: string[];
}

export const SEED_ACADEMIC_RESOURCES: AcademicResource[] = [
  {
    id: 'res-01',
    title: 'Fractions & Decimals: Guided Conversion Practice',
    type: 'worksheet',
    subject: 'Mathematics',
    stageLevel: 'Stage 5',
    topic: 'Fractions & Proportions',
    curriculumObjective: '5Nn.01: Understand and convert equivalent fractions, decimals and percentages.',
    approvalState: 'school_approved',
    author: 'Sarah Namukasa',
    createdAt: '2026-08-28',
    usageCount: 42,
    rating: 4.9,
    previewText: 'A 4-part scaffolded worksheet starting with visual bar models, transitioning into standard improper-fraction conversions, and finishing with real-world division word problems.',
    tags: ['bar-models', 'scaffolded', 'decimals', 'differentiation', 'fractions'],
  },
  {
    id: 'res-02',
    title: 'Persuasive Speech & Thesis Structure Exemplars',
    type: 'lesson_plan',
    subject: 'English',
    stageLevel: 'Stage 5',
    topic: 'Non-Fiction & Persuasive Writing',
    curriculumObjective: '5Ri.01: Distinguish between explicit facts and implied meanings.',
    approvalState: 'school_approved',
    author: 'David Ochieng',
    createdAt: '2026-08-22',
    usageCount: 35,
    rating: 4.8,
    previewText: 'Complete 60-minute lesson outline including warm-up speech analysis, group argument framing matrix, and peer-review rubrics.',
    tags: ['rhetoric', 'peer-review', 'rubrics', 'writing'],
  },
  {
    id: 'res-03',
    title: 'Human Biology & Organ Systems Investigation Guide',
    type: 'lab_guide',
    subject: 'Science',
    stageLevel: 'Stage 5',
    topic: 'Living Things & Systems',
    curriculumObjective: '5Bp.01: Identify human digestive and circulatory systems and organ functions.',
    approvalState: 'school_approved',
    author: 'James Kato',
    createdAt: '2026-08-15',
    usageCount: 29,
    rating: 4.9,
    previewText: 'Safety protocols, onion epidermis slide preparation step-by-step instructions, labeled diagram templates, and inquiry-led conclusion questions.',
    tags: ['laboratory', 'microscope', 'cells', 'diagrams'],
  },
  {
    id: 'res-04',
    title: 'East African Rift Valley & Water Basin Cartography',
    type: 'worksheet',
    subject: 'Social Studies',
    stageLevel: 'Stage 5',
    topic: 'Regional Geography',
    curriculumObjective: '5Gg.02: Locate major geographical features of the Great Lakes and Rift Valley regions.',
    approvalState: 'teacher_approved',
    author: 'Grace Kyomugisha',
    createdAt: '2026-09-01',
    usageCount: 18,
    rating: 4.7,
    previewText: 'Contour identification worksheet, blank drainage basin maps for student labeling, and comparative climate zones table.',
    tags: ['maps', 'rift-valley', 'geography', 'lakes'],
  },
  {
    id: 'res-05',
    title: 'Stage 7 Algebraic Equations & Balance Scales Quiz',
    type: 'quiz',
    subject: 'Mathematics',
    stageLevel: 'Stage 7',
    topic: 'Linear Algebra',
    curriculumObjective: '7Ae.01: Formulate and solve single-variable linear equations using inverse operations.',
    approvalState: 'school_approved',
    author: 'Florence Nabakooza',
    createdAt: '2026-09-02',
    usageCount: 24,
    rating: 5.0,
    previewText: '10-question diagnostic quiz with multiple-choice conceptual questions and written step-by-step balancing evaluations with marking key.',
    tags: ['algebra', 'diagnostic', 'equations', 'marking-key'],
  },
  {
    id: 'res-06',
    title: 'Circulatory System Heart Rate & Recovery Experiment',
    type: 'lab_guide',
    subject: 'Science',
    stageLevel: 'Stage 6',
    topic: 'Human Biology',
    curriculumObjective: '6Bh.03: Investigate changes in pulse and respiration during physical exertion and resting phases.',
    approvalState: 'teacher_approved',
    author: 'David Musoke',
    createdAt: '2026-08-30',
    usageCount: 21,
    rating: 4.8,
    previewText: 'Data collection tables, graphing guide for time-series pulse recovery, and analytical reflection prompts connecting biology and athletics.',
    tags: ['pulse-rate', 'graphing', 'data-collection', 'experiment'],
  },
  {
    id: 'res-07',
    title: 'Primary 5 Multi-Step Word Problem Master Cards',
    type: 'revision',
    subject: 'Mathematics',
    stageLevel: 'Stage 5',
    topic: 'Applied Arithmetic',
    curriculumObjective: '5Nn.08: Solve two-step word problems involving money, time, and mass with estimation verification.',
    approvalState: 'school_approved',
    author: 'Sarah Namukasa',
    createdAt: '2026-09-04',
    usageCount: 53,
    rating: 4.9,
    previewText: 'Set of 16 printable revision task cards with real East African market scenarios, currency calculations, and self-check answer keys on the reverse.',
    tags: ['task-cards', 'word-problems', 'revision', 'currency'],
  },
];
