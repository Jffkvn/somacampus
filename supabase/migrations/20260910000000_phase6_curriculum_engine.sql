-- ==============================================================================
-- SOMACAMPUS PHASE 6 MIGRATION: GENERIC CURRICULUM ENGINE
-- ==============================================================================
-- 1. curriculum_frameworks: Educational jurisdictions/framework standards
-- 2. curriculum_versions: Historically immutable syllabus editions (e.g. 2026.1)
-- 3. curriculum_subjects: Canonical subjects within a framework version
-- 4. curriculum_stages: Grade/stage bands (Stages 1 through 6)
-- 5. curriculum_strands: Primary content/skill domains
-- 6. curriculum_sub_strands: Optional sub-domain groupings (Guardrail H)
-- 7. learning_objectives: Canonical first-class learning objective entities
-- 8. learning_objective_relationships: Prerequisite, progression, and cross-curricular links
--
-- COMPOSITE VERSION SAFETY:
-- Every table carries version_id. Composite UNIQUE + composite FK constraints
-- enforce that related entities all belong to the SAME curriculum version.
-- ==============================================================================

-- 1. CURRICULUM FRAMEWORKS
CREATE TABLE IF NOT EXISTS curriculum_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,       -- e.g. 'CAMBRIDGE_PRIMARY'
  name TEXT NOT NULL,              -- 'Cambridge Primary'
  jurisdiction TEXT,               -- 'International'
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CURRICULUM VERSIONS
CREATE TABLE IF NOT EXISTS curriculum_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID NOT NULL REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  version_code TEXT NOT NULL,      -- e.g. '2026.1'
  release_year INT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (framework_id, version_code)
);

-- 3. CURRICULUM SUBJECTS
CREATE TABLE IF NOT EXISTS curriculum_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,              -- 'MATH', 'ENG', 'SCI', 'GP', 'COMP'
  name TEXT NOT NULL,              -- 'Mathematics', 'English', etc.
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  UNIQUE (version_id, code),
  UNIQUE (id, version_id)         -- Target for composite FKs
);

-- 4. CURRICULUM STAGES
CREATE TABLE IF NOT EXISTS curriculum_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  stage_number INT NOT NULL,       -- 1, 2, 3, 4, 5, 6
  name TEXT NOT NULL,              -- 'Stage 1', 'Stage 5'
  typical_age_range TEXT,          -- 'Age 9-10'
  display_order INT NOT NULL DEFAULT 0,
  UNIQUE (version_id, stage_number),
  UNIQUE (id, version_id)         -- Target for composite FKs
);

-- 5. CURRICULUM STRANDS
CREATE TABLE IF NOT EXISTS curriculum_strands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL,        -- Enforces same version as subject & stage
  subject_id UUID NOT NULL,
  stage_id UUID,                   -- Optional: strands may span all stages or be stage-specific
  code TEXT NOT NULL,              -- 'N', 'G', 'S', 'TWM'
  name TEXT NOT NULL,              -- 'Number', 'Geometry & Measure'
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  UNIQUE (id, version_id),        -- Target for composite FKs
  FOREIGN KEY (subject_id, version_id)
    REFERENCES curriculum_subjects(id, version_id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id, version_id)
    REFERENCES curriculum_stages(id, version_id) ON DELETE CASCADE
);

-- Partial unique indexes to handle nullable stage_id across all PostgreSQL versions
CREATE UNIQUE INDEX IF NOT EXISTS idx_strands_with_stage
  ON curriculum_strands (subject_id, stage_id, code)
  WHERE stage_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_strands_without_stage
  ON curriculum_strands (subject_id, code)
  WHERE stage_id IS NULL;

-- 6. CURRICULUM SUB-STRANDS (Optional Depth per Guardrail H)
CREATE TABLE IF NOT EXISTS curriculum_sub_strands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL,
  strand_id UUID NOT NULL,
  code TEXT NOT NULL,              -- 'Nn', 'Nf'
  name TEXT NOT NULL,              -- 'Fractions, Decimals and Percentages'
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  UNIQUE (strand_id, code),
  UNIQUE (id, version_id),        -- Target for composite FKs
  FOREIGN KEY (strand_id, version_id)
    REFERENCES curriculum_strands(id, version_id) ON DELETE CASCADE
);

-- 7. LEARNING OBJECTIVES
CREATE TABLE IF NOT EXISTS learning_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  stage_id UUID NOT NULL,
  strand_id UUID NOT NULL,
  sub_strand_id UUID,              -- Optional per Guardrail H (NULL for flat subjects like GP/COMP)
  code TEXT NOT NULL,              -- '5Nn.01'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  progression_order INT NOT NULL DEFAULT 0,
  is_authoritative BOOLEAN NOT NULL DEFAULT false,
  provenance_source TEXT,          -- e.g. 'Cambridge Primary Mathematics Curriculum Framework'
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version_id, code),
  -- Composite FKs enforce that all related records belong to the SAME version
  FOREIGN KEY (subject_id, version_id)
    REFERENCES curriculum_subjects(id, version_id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id, version_id)
    REFERENCES curriculum_stages(id, version_id) ON DELETE CASCADE,
  FOREIGN KEY (strand_id, version_id)
    REFERENCES curriculum_strands(id, version_id) ON DELETE CASCADE,
  FOREIGN KEY (sub_strand_id, version_id)
    REFERENCES curriculum_sub_strands(id, version_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_objectives_stage
  ON learning_objectives (stage_id);

CREATE INDEX IF NOT EXISTS idx_learning_objectives_subject_stage
  ON learning_objectives (subject_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_learning_objectives_strand
  ON learning_objectives (strand_id);

-- 8. LEARNING OBJECTIVE RELATIONSHIPS
CREATE TABLE IF NOT EXISTS learning_objective_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_objective_id UUID NOT NULL REFERENCES learning_objectives(id) ON DELETE CASCADE,
  target_objective_id UUID NOT NULL REFERENCES learning_objectives(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (
    relationship_type IN ('prerequisite', 'precursor', 'extension', 'cross_curricular')
  ),
  notes TEXT,
  CHECK (source_objective_id <> target_objective_id),
  UNIQUE (source_objective_id, target_objective_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_obj_rel_source
  ON learning_objective_relationships (source_objective_id);

CREATE INDEX IF NOT EXISTS idx_obj_rel_target
  ON learning_objective_relationships (target_objective_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Global curriculum catalog is publicly readable by all authenticated users.
-- Insert, update, and delete are restricted strictly to service_role / system administrators.

ALTER TABLE curriculum_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_strands ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_sub_strands ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_objective_relationships ENABLE ROW LEVEL SECURITY;

-- 1. Read Policies (Open to authenticated)
CREATE POLICY curriculum_frameworks_read ON curriculum_frameworks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY curriculum_versions_read ON curriculum_versions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY curriculum_subjects_read ON curriculum_subjects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY curriculum_stages_read ON curriculum_stages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY curriculum_strands_read ON curriculum_strands
  FOR SELECT TO authenticated USING (true);

CREATE POLICY curriculum_sub_strands_read ON curriculum_sub_strands
  FOR SELECT TO authenticated USING (true);

CREATE POLICY learning_objectives_read ON learning_objectives
  FOR SELECT TO authenticated USING (true);

CREATE POLICY learning_objective_relationships_read ON learning_objective_relationships
  FOR SELECT TO authenticated USING (true);
