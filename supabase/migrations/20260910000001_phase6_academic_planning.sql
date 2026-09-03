-- ==============================================================================
-- SOMACAMPUS PHASE 6 MIGRATION: ACADEMIC PLANNING & CURRICULUM INTEGRATION
-- ==============================================================================
-- 1. school_curriculum_adoptions: School-level framework + version activation
-- 2. school_curriculum_subject_maps: Adoption-scoped mapping (local -> curriculum subject)
-- 3. schemes_of_work: Long-term term plans (Year, Term, Class, Subject, Stage)
-- 4. medium_term_plans: 2-3 week units (e.g. Number Sense & Equivalent Fractions)
-- 5. teaching_sequences: Planned sequential lesson activities in a unit
-- 6. teaching_sequence_objectives: Join table linking sequences to learning objectives
-- 7. lesson_learning_objectives: Join table linking actual lessons to learning objectives
-- 8. interventions extension: Relational FK curriculum_objective_id -> learning_objectives
--
-- MULTI-TENANCY:
-- All planning tables enforce strict multi-tenant isolation via school_id.
-- ==============================================================================

-- 1. SCHOOL CURRICULUM ADOPTION
CREATE TABLE IF NOT EXISTS school_curriculum_adoptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  adopted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (school_id, framework_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_school_adoptions_school
  ON school_curriculum_adoptions (school_id);

-- 2. SCHOOL SUBJECT MAPPING (Adoption-Scoped per Architectural Correction #2)
CREATE TABLE IF NOT EXISTS school_curriculum_subject_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  adoption_id UUID NOT NULL REFERENCES school_curriculum_adoptions(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  curriculum_subject_id UUID NOT NULL REFERENCES curriculum_subjects(id) ON DELETE CASCADE,
  UNIQUE (adoption_id, subject_id, curriculum_subject_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_maps_lookup
  ON school_curriculum_subject_maps (school_id, subject_id);

-- 3. SCHEMES OF WORK (Term Long-Term Plan)
CREATE TABLE IF NOT EXISTS schemes_of_work (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES curriculum_stages(id) ON DELETE RESTRICT,
  created_by_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  overview_text TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'approved', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schemes_lookup
  ON schemes_of_work (school_id, class_id, subject_id, term_id);

-- 4. MEDIUM-TERM PLANS (Curriculum Units: e.g. Weeks 1-3)
CREATE TABLE IF NOT EXISTS medium_term_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES schemes_of_work(id) ON DELETE CASCADE,
  unit_number INT NOT NULL,
  title TEXT NOT NULL,              -- e.g. 'Unit 1: Number Sense & Equivalent Fractions'
  week_start INT NOT NULL,          -- Week 1
  week_end INT NOT NULL,            -- Week 3
  learning_focus TEXT,
  estimated_periods INT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, unit_number)
);

CREATE INDEX IF NOT EXISTS idx_mtp_scheme
  ON medium_term_plans (scheme_id);

-- 5. TEACHING SEQUENCES (Planned Lessons in a Unit)
CREATE TABLE IF NOT EXISTS teaching_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medium_term_plan_id UUID NOT NULL REFERENCES medium_term_plans(id) ON DELETE CASCADE,
  sequence_number INT NOT NULL,
  title TEXT NOT NULL,              -- e.g. 'Lesson 1: Visualizing Proper Fractions'
  suggested_activities TEXT,
  suggested_resources TEXT,
  recommended_duration_mins INT NOT NULL DEFAULT 45,
  display_order INT NOT NULL DEFAULT 0,
  UNIQUE (medium_term_plan_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_sequences_mtp
  ON teaching_sequences (medium_term_plan_id);

-- 6. TEACHING SEQUENCE OBJECTIVES (Join Table to Canonical Objectives)
CREATE TABLE IF NOT EXISTS teaching_sequence_objectives (
  teaching_sequence_id UUID NOT NULL REFERENCES teaching_sequences(id) ON DELETE CASCADE,
  learning_objective_id UUID NOT NULL REFERENCES learning_objectives(id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (teaching_sequence_id, learning_objective_id)
);

-- 7. LESSON TO OBJECTIVES RELATIONAL LINK
CREATE TABLE IF NOT EXISTS lesson_learning_objectives (
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  learning_objective_id UUID NOT NULL REFERENCES learning_objectives(id) ON DELETE RESTRICT,
  teaching_sequence_id UUID REFERENCES teaching_sequences(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  PRIMARY KEY (lesson_id, learning_objective_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_obj_lesson
  ON lesson_learning_objectives (lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_obj_objective
  ON lesson_learning_objectives (learning_objective_id);

-- 8. INTERVENTIONS RELATIONAL OBJECTIVE FK EXTENSION (Correction #3)
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS curriculum_objective_id UUID
  REFERENCES learning_objectives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_interventions_curriculum_objective
  ON interventions (curriculum_objective_id)
  WHERE curriculum_objective_id IS NOT NULL;

COMMENT ON COLUMN interventions.curriculum_objective_ref IS
  'DEPRECATED: Use curriculum_objective_id instead. Retained for historical migration.';

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- School planning tables enforce multi-tenant isolation via school_id.

ALTER TABLE school_curriculum_adoptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_curriculum_subject_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE schemes_of_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE medium_term_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_sequence_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_learning_objectives ENABLE ROW LEVEL SECURITY;

-- 1. School Curriculum Adoptions RLS
CREATE POLICY school_adoptions_read ON school_curriculum_adoptions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY school_adoptions_write ON school_curriculum_adoptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_adoptions.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

-- 2. School Curriculum Subject Maps RLS
CREATE POLICY school_subject_maps_read ON school_curriculum_subject_maps
  FOR SELECT TO authenticated USING (true);

CREATE POLICY school_subject_maps_write ON school_curriculum_subject_maps
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_subject_maps.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

-- 3. Schemes of Work RLS
CREATE POLICY schemes_read ON schemes_of_work
  FOR SELECT TO authenticated USING (true);

CREATE POLICY schemes_write ON schemes_of_work
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = schemes_of_work.school_id
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

-- 4. Medium-Term Plans RLS
CREATE POLICY mtp_read ON medium_term_plans
  FOR SELECT TO authenticated USING (true);

CREATE POLICY mtp_write ON medium_term_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM schemes_of_work s
      JOIN user_roles ur ON ur.school_id = s.school_id
      JOIN roles r ON r.id = ur.role_id
      WHERE s.id = medium_term_plans.scheme_id
        AND ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

-- 5. Teaching Sequences RLS
CREATE POLICY sequences_read ON teaching_sequences
  FOR SELECT TO authenticated USING (true);

CREATE POLICY sequences_write ON teaching_sequences
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM medium_term_plans m
      JOIN schemes_of_work s ON s.id = m.scheme_id
      JOIN user_roles ur ON ur.school_id = s.school_id
      JOIN roles r ON r.id = ur.role_id
      WHERE m.id = teaching_sequences.medium_term_plan_id
        AND ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

-- 6. Teaching Sequence Objectives RLS
CREATE POLICY seq_obj_read ON teaching_sequence_objectives
  FOR SELECT TO authenticated USING (true);

CREATE POLICY seq_obj_write ON teaching_sequence_objectives
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teaching_sequences t
      JOIN medium_term_plans m ON m.id = t.medium_term_plan_id
      JOIN schemes_of_work s ON s.id = m.scheme_id
      JOIN user_roles ur ON ur.school_id = s.school_id
      JOIN roles r ON r.id = ur.role_id
      WHERE t.id = teaching_sequence_objectives.teaching_sequence_id
        AND ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

-- 7. Lesson Learning Objectives RLS
CREATE POLICY lesson_obj_read ON lesson_learning_objectives
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lesson_obj_write ON lesson_learning_objectives
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.id = lesson_learning_objectives.lesson_id
        AND (
          l.teacher_id IN (
            SELECT e.id FROM employees e
            JOIN people p ON p.id = e.person_id
            WHERE p.auth_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid()
              AND ur.school_id = l.school_id
              AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
          )
        )
    )
  );
