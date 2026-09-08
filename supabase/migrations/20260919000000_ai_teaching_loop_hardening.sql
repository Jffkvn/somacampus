-- ==============================================================================
-- SOMACAMPUS MIGRATION: AI TEACHING LOOP HARDENING & RESOURCE LIBRARY
-- ==============================================================================
-- 1. Alter assignments table with AI provenance, review state, and publication guard
-- 2. Create school_resources table with RLS and school isolation
-- 3. Trigger and CHECK constraint preventing unapproved AI draft publication
-- 4. Initial seed resources for Grace's Cambridge Centre (Primary 5 Mathematics)
-- ==============================================================================

-- 1. EXTEND ASSIGNMENTS WITH AI PROVENANCE & APPROVAL METADATA
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS is_ai_drafted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_state TEXT NOT NULL DEFAULT 'unreviewed' CHECK (approval_state IN ('unreviewed', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS ai_draft_approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_draft_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS curriculum_objective_code TEXT,
  ADD COLUMN IF NOT EXISTS curriculum_objective_title TEXT,
  ADD COLUMN IF NOT EXISTS resource_id_used UUID;

CREATE INDEX IF NOT EXISTS idx_assignments_ai_state ON public.assignments (school_id, is_ai_drafted, approval_state);

-- 2. TRIGGER FUNCTION: ENFORCE PUBLICATION INVARIANT AT THE DATABASE LAYER
-- Prevents any direct SQL, RPC, script, or service from setting status='published'
-- on an AI draft unless explicitly approved by a verified educator.
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_assignment_ai_publication_gate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.is_ai_drafted = true AND NEW.requires_human_approval = true THEN
    IF NEW.approval_state != 'approved' OR NEW.ai_draft_approved_by IS NULL OR NEW.ai_draft_approved_at IS NULL THEN
      RAISE EXCEPTION 'Database Guard: AI-drafted assignment % cannot be published without verified human approval (approval_state=%, approver=%)',
        NEW.id, NEW.approval_state, NEW.ai_draft_approved_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_assignments_ai_publication_gate ON public.assignments;
CREATE TRIGGER trg_assignments_ai_publication_gate
  BEFORE INSERT OR UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_enforce_assignment_ai_publication_gate();

-- 3. DATABASE CHECK CONSTRAINT (STATIC INVARIANT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_assignments_ai_approval_publish_gate'
  ) THEN
    ALTER TABLE public.assignments ADD CONSTRAINT chk_assignments_ai_approval_publish_gate CHECK (
      NOT (
        status = 'published' AND
        is_ai_drafted = true AND
        requires_human_approval = true AND
        (approval_state != 'approved' OR ai_draft_approved_by IS NULL OR ai_draft_approved_at IS NULL)
      )
    );
  END IF;
END $$;

-- 4. CREATE TENANT-SCOPED SCHOOL_RESOURCES TABLE
CREATE TABLE IF NOT EXISTS public.school_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('worksheet', 'lesson_plan', 'quiz', 'lab_guide', 'revision')),
  subject TEXT NOT NULL,
  stage_level TEXT NOT NULL,
  topic TEXT NOT NULL,
  curriculum_objective_code TEXT NOT NULL,
  curriculum_objective_text TEXT NOT NULL,
  approval_state TEXT NOT NULL DEFAULT 'school_approved' CHECK (approval_state IN ('school_approved', 'teacher_approved', 'draft')),
  author_name TEXT NOT NULL,
  preview_text TEXT NOT NULL,
  content_text TEXT,
  file_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  usage_count INT NOT NULL DEFAULT 0,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_resources_school_obj ON public.school_resources (school_id, curriculum_objective_code);
CREATE INDEX IF NOT EXISTS idx_school_resources_subject_stage ON public.school_resources (school_id, subject, stage_level);

-- 5. RLS POLICIES FOR SCHOOL_RESOURCES
ALTER TABLE public.school_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_resources_auth_read ON public.school_resources;
CREATE POLICY school_resources_auth_read ON public.school_resources
  FOR SELECT TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS school_resources_staff_write ON public.school_resources;
CREATE POLICY school_resources_staff_write ON public.school_resources
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

-- 6. SEED APPROVED MATERIALS FOR ACTIVE SCHOOL
DO $$
DECLARE
  v_school_id UUID;
BEGIN
  SELECT id INTO v_school_id FROM public.schools WHERE code = 'GCC' LIMIT 1;
  IF v_school_id IS NULL THEN
    SELECT id INTO v_school_id FROM public.schools LIMIT 1;
  END IF;

  IF v_school_id IS NOT NULL THEN
    INSERT INTO public.school_resources (
      id,
      school_id,
      title,
      type,
      subject,
      stage_level,
      topic,
      curriculum_objective_code,
      curriculum_objective_text,
      approval_state,
      author_name,
      preview_text,
      content_text,
      tags,
      usage_count,
      rating
    ) VALUES
    (
      '44444444-4444-4444-4444-444444444401',
      v_school_id,
      'Fractions & Decimals: Guided Conversion Practice',
      'worksheet',
      'Mathematics',
      'Stage 5',
      'Fractions & Proportions',
      '5Nn.01',
      '5Nn.01: Understand that equivalent fractions represent the same quantity, and convert between fractions, decimals and percentages.',
      'school_approved',
      'Sarah Namukasa',
      'A 4-part scaffolded worksheet starting with visual bar models, transitioning into standard improper-fraction conversions, and finishing with real-world division word problems.',
      'Step 1: Visual bar models with shaded units. Step 2: Convert 1/4, 2/5, 3/8 into tenths and hundredths. Step 3: Scaffolded word problem dividing 3 loaves of cassava bread equally among 4 students.',
      ARRAY['bar-models', 'scaffolded', 'decimals', 'differentiation', 'fractions'],
      42,
      4.9
    ),
    (
      '44444444-4444-4444-4444-444444444402',
      v_school_id,
      'Primary 5 Multi-Step Word Problem Master Cards',
      'revision',
      'Mathematics',
      'Stage 5',
      'Applied Arithmetic',
      '5Nn.01',
      '5Nn.01: Understand and convert equivalent fractions, decimals and percentages.',
      'school_approved',
      'Sarah Namukasa',
      'Set of 16 printable revision task cards with real East African market scenarios, currency calculations, and self-check answer keys on the reverse.',
      'Card 1: Nakasero market fruit bundle ratios. Card 2: Transport cost per passenger as fraction of fuel capacity.',
      ARRAY['task-cards', 'word-problems', 'revision', 'currency'],
      53,
      4.9
    ),
    (
      '44444444-4444-4444-4444-444444444403',
      v_school_id,
      'East African Rift Valley & Water Basin Cartography',
      'worksheet',
      'Social Studies',
      'Stage 5',
      'Regional Geography',
      '5Gg.02',
      '5Gg.02: Locate major geographical features of the Great Lakes and Rift Valley regions.',
      'teacher_approved',
      'Grace Kyomugisha',
      'Contour identification worksheet, blank drainage basin maps for student labeling, and comparative climate zones table.',
      'Map tracing exercise: Lake Victoria catchment area and White Nile headwaters.',
      ARRAY['maps', 'rift-valley', 'geography', 'lakes'],
      18,
      4.7
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
