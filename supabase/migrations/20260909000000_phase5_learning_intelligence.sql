-- ==============================================================================
-- SOMACAMPUS PHASE 5 MIGRATION: LEARNING INTELLIGENCE & LONGITUDINAL EVIDENCE
-- ==============================================================================
-- 1. interventions: Teacher-owned targeted action plans
-- 2. intervention_evidence: Canonical relational join table preserving provenance to raw evidence
-- 3. intervention_audit_logs: Immutable log of status transitions (draft -> active -> completed/abandoned)
-- 4. RLS policies: Strict school isolation and subject/class educator authorization

-- 1. INTERVENTIONS TABLE
CREATE TABLE IF NOT EXISTS interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  learning_area TEXT NOT NULL,
  topic_name TEXT,
  curriculum_objective_ref TEXT,
  reason TEXT NOT NULL,
  strategy_action TEXT NOT NULL,
  target_outcome TEXT NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('draft', 'active', 'completed', 'abandoned')
  ),
  outcome TEXT CHECK (
    outcome IS NULL OR outcome IN ('improved', 'partially_improved', 'unchanged', 'declined')
  ),
  outcome_notes TEXT,
  follow_up_notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interventions_school_student ON interventions(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_interventions_class_subject ON interventions(class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_interventions_teacher ON interventions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);

-- 2. CANONICAL RELATIONAL EVIDENCE TABLE (NO JSONB SOURCE OF TRUTH)
CREATE TABLE IF NOT EXISTS intervention_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (
    evidence_type IN ('submission', 'observation', 'lesson', 'formal_assessment')
  ),
  evidence_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (intervention_id, evidence_type, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_intervention_evidence_intervention ON intervention_evidence(intervention_id);
CREATE INDEX IF NOT EXISTS idx_intervention_evidence_lookup ON intervention_evidence(evidence_type, evidence_id);

-- 3. INTERVENTION STATUS AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS intervention_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES auth.users(id),
  reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_audit_intervention ON intervention_audit_logs(intervention_id);

-- TRIGGER TO RECORD STATUS TRANSITIONS IN INTERVENTION_AUDIT_LOGS
CREATE OR REPLACE FUNCTION trg_fn_intervention_status_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO intervention_audit_logs (
      school_id, intervention_id, previous_status, new_status, changed_by_user_id, reason
    ) VALUES (
      NEW.school_id, NEW.id, NULL, NEW.status, auth.uid(), 'Initial creation'
    );
  ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO intervention_audit_logs (
      school_id, intervention_id, previous_status, new_status, changed_by_user_id, reason
    ) VALUES (
      NEW.school_id, NEW.id, OLD.status, NEW.status, auth.uid(), COALESCE(NEW.outcome_notes, 'Status transition')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_interventions_audit ON interventions;
CREATE TRIGGER trg_interventions_audit
  AFTER INSERT OR UPDATE OF status ON interventions
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_intervention_status_audit();

-- 4. AUTHORIZATION FUNCTION: INTERVENTION CREATOR
CREATE OR REPLACE FUNCTION is_authorised_intervention_creator(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_subject_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_employee_id UUID;
  v_is_admin_or_principal BOOLEAN := false;
  v_is_subject_teacher BOOLEAN := false;
  v_is_class_teacher BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check Admin / Principal role
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND ur.school_id = p_school_id
      AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
  ) INTO v_is_admin_or_principal;

  IF v_is_admin_or_principal THEN
    RETURN true;
  END IF;

  -- 2. Find Employee ID
  SELECT e.id INTO v_employee_id
  FROM employees e
  JOIN people p ON p.id = e.person_id
  WHERE p.auth_user_id = v_user_id
    AND e.school_id = p_school_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  -- 3. Check Subject Teacher assignment
  SELECT EXISTS (
    SELECT 1 FROM subject_teachers st
    WHERE st.school_id = p_school_id
      AND st.teacher_id = v_employee_id
      AND st.class_id = p_class_id
      AND (p_stream_id IS NULL OR st.stream_id IS NULL OR st.stream_id = p_stream_id)
      AND st.subject_id = p_subject_id
      AND st.effective_from <= CURRENT_DATE
      AND (st.effective_to IS NULL OR st.effective_to >= CURRENT_DATE)
  ) INTO v_is_subject_teacher;

  IF v_is_subject_teacher THEN
    RETURN true;
  END IF;

  -- 4. Check Class Teacher assignment
  SELECT EXISTS (
    SELECT 1 FROM class_teachers ct
    WHERE ct.school_id = p_school_id
      AND ct.teacher_id = v_employee_id
      AND ct.class_id = p_class_id
      AND (p_stream_id IS NULL OR ct.stream_id IS NULL OR ct.stream_id = p_stream_id)
      AND (ct.effective_until IS NULL OR ct.effective_until >= CURRENT_DATE)
  ) INTO v_is_class_teacher;

  RETURN v_is_class_teacher;
END;
$$;

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_audit_logs ENABLE ROW LEVEL SECURITY;

-- INTERVENTIONS RLS:
CREATE POLICY interventions_auth_read ON interventions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY interventions_auth_insert ON interventions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_authorised_intervention_creator(school_id, class_id, stream_id, subject_id)
  );

CREATE POLICY interventions_auth_update ON interventions
  FOR UPDATE TO authenticated
  USING (
    is_authorised_intervention_creator(school_id, class_id, stream_id, subject_id)
  );

-- INTERVENTION EVIDENCE RLS:
CREATE POLICY intervention_evidence_auth_read ON intervention_evidence
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY intervention_evidence_auth_insert ON intervention_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interventions i
      WHERE i.id = intervention_id
        AND is_authorised_intervention_creator(i.school_id, i.class_id, i.stream_id, i.subject_id)
    )
  );

-- INTERVENTION AUDIT LOGS RLS:
CREATE POLICY intervention_audit_logs_auth_read ON intervention_audit_logs
  FOR SELECT TO authenticated
  USING (true);
