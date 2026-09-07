-- ==============================================================================
-- SOMACAMPUS MIGRATION: TIMETABLE & TEACHING POLICIES + VERSIONED TEMPLATES
-- Migration ID: 20260915000004
-- ==============================================================================
-- Phase 9I Task 2:
-- 1. Extend public.timetables with versioning, AI scorecard & explanation,
--    approval & publication tracking.
-- 2. Create public.school_timetable_policies (hierarchical institutional workload rules).
-- 3. Create public.timetable_subject_preferences (subject time windows & soft priorities).
-- 4. Create public.publish_timetable_atomic() RPC (enforces single active published invariant).
-- 5. Attach tenant integrity triggers and strict RLS policies.
-- ==============================================================================

-- 1. EXTEND public.timetables
ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'reviewed', 'approved', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_timetable_id UUID REFERENCES public.timetables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS constraint_scorecard JSONB,
  ADD COLUMN IF NOT EXISTS ai_explanation TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_timetables_school_status
  ON public.timetables (school_id, term_id, status);

CREATE INDEX IF NOT EXISTS idx_timetables_active_term
  ON public.timetables (school_id, term_id, is_active);

-- 2. HIERARCHICAL TEACHING & TIMETABLE POLICIES
CREATE TABLE IF NOT EXISTS public.school_timetable_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL DEFAULT 'school_default' 
    CHECK (scope_type IN ('school_default', 'department', 'teacher', 'exception')),
  target_employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  department_name TEXT,
  effective_from DATE,
  effective_to DATE,
  rules JSONB NOT NULL DEFAULT '{
    "max_periods_per_day": 6,
    "max_periods_per_week": 28,
    "max_consecutive_periods": 3,
    "min_break_minutes": 30,
    "max_online_sessions_per_day": 2,
    "max_online_sessions_per_week": 8,
    "max_combined_teaching_hours_per_day": 7.0
  }'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timetable_policies_lookup
  ON public.school_timetable_policies (school_id, scope_type, is_active);

-- 3. SUBJECT SCHEDULING PREFERENCES
CREATE TABLE IF NOT EXISTS public.timetable_subject_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  preferred_time_window TEXT NOT NULL DEFAULT 'ANY' 
    CHECK (preferred_time_window IN ('MORNING', 'MIDDAY', 'AFTERNOON', 'ANY')),
  preferred_start_time TIME,
  preferred_end_time TIME,
  priority_weight INTEGER NOT NULL DEFAULT 5 CHECK (priority_weight BETWEEN 1 AND 10),
  allow_double_periods BOOLEAN NOT NULL DEFAULT false,
  source_type TEXT NOT NULL DEFAULT 'MANUAL' 
    CHECK (source_type IN ('MANUAL', 'HISTORICAL_ADOPTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_preferences_school
  ON public.timetable_subject_preferences (school_id, priority_weight DESC);

-- 4. CROSS-TENANT INTEGRITY CHECK
CREATE OR REPLACE FUNCTION public.check_timetable_policy_cross_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_school_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'school_timetable_policies' THEN
    IF NEW.target_employee_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.employees WHERE id = NEW.target_employee_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: target employee does not belong to school %', NEW.school_id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'timetable_subject_preferences' THEN
    IF NEW.subject_id IS NOT NULL THEN
      SELECT school_id INTO v_ref_school_id FROM public.subjects WHERE id = NEW.subject_id;
      IF v_ref_school_id IS NOT NULL AND v_ref_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: subject does not belong to school %', NEW.school_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_timetable_policies_cross_tenant ON public.school_timetable_policies;
CREATE TRIGGER trg_school_timetable_policies_cross_tenant
  BEFORE INSERT OR UPDATE ON public.school_timetable_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_timetable_policy_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_timetable_subject_preferences_cross_tenant ON public.timetable_subject_preferences;
CREATE TRIGGER trg_timetable_subject_preferences_cross_tenant
  BEFORE INSERT OR UPDATE ON public.timetable_subject_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.check_timetable_policy_cross_tenant_integrity();

-- 5. ATOMIC PUBLISH TRANSACTION (SINGLE-ACTIVE PUBLISHED INVARIANT)
CREATE OR REPLACE FUNCTION public.publish_timetable_atomic(
  p_timetable_id UUID,
  p_published_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_term_id UUID;
  v_archived_count INT;
BEGIN
  SELECT school_id, term_id INTO v_school_id, v_term_id
  FROM public.timetables
  WHERE id = p_timetable_id;
  
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Timetable not found';
  END IF;

  -- Archive previously published active timetable for this school and term
  UPDATE public.timetables
  SET is_active = false,
      status = 'archived',
      updated_at = now()
  WHERE school_id = v_school_id
    AND term_id = v_term_id
    AND is_active = true
    AND id <> p_timetable_id;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  -- Activate the target timetable
  UPDATE public.timetables
  SET is_active = true,
      status = 'published',
      published_at = now(),
      approved_by = p_published_by,
      updated_at = now()
  WHERE id = p_timetable_id;

  RETURN jsonb_build_object(
    'success', true,
    'timetable_id', p_timetable_id,
    'archived_count', v_archived_count
  );
END;
$$;

-- 6. RLS POLICIES
ALTER TABLE public.school_timetable_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_subject_preferences ENABLE ROW LEVEL SECURITY;

-- Helper to check if caller is staff in school
CREATE OR REPLACE FUNCTION public.is_staff_in_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_employee_id_for_school(p_school_id) IS NOT NULL;
$$;

-- Helper to check if caller has leadership/admin role
CREATE OR REPLACE FUNCTION public.is_leadership_in_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND r.name IN ('head_teacher', 'deputy_head', 'director', 'admin', 'bursar', 'academic_head')
  );
$$;

-- Policies for school_timetable_policies
DROP POLICY IF EXISTS timetable_policies_read ON public.school_timetable_policies;
CREATE POLICY timetable_policies_read ON public.school_timetable_policies
  FOR SELECT TO authenticated
  USING (is_staff_in_school(school_id));

DROP POLICY IF EXISTS timetable_policies_write ON public.school_timetable_policies;
CREATE POLICY timetable_policies_write ON public.school_timetable_policies
  FOR ALL TO authenticated
  USING (is_leadership_in_school(school_id))
  WITH CHECK (is_leadership_in_school(school_id));

-- Policies for timetable_subject_preferences
DROP POLICY IF EXISTS subject_preferences_read ON public.timetable_subject_preferences;
CREATE POLICY subject_preferences_read ON public.timetable_subject_preferences
  FOR SELECT TO authenticated
  USING (is_staff_in_school(school_id));

DROP POLICY IF EXISTS subject_preferences_write ON public.timetable_subject_preferences;
CREATE POLICY subject_preferences_write ON public.timetable_subject_preferences
  FOR ALL TO authenticated
  USING (is_leadership_in_school(school_id))
  WITH CHECK (is_leadership_in_school(school_id));
