-- ============================================================================
-- SomaCampus Hardening Part C: Explicit WITH CHECK on planning writes
-- Migration: 20260912000003_planning_with_check_split.sql
-- ============================================================================
-- Splits every Phase 6 (20260910000001) FOR ALL ... USING-only write policy into
-- explicit per-verb policies with IDENTICAL role/school conditions, only the
-- verbs split: SELECT (USING), INSERT (WITH CHECK), UPDATE (USING + WITH CHECK).
-- No DELETE policy is created for any planning table: deletes are explicitly
-- denied (previously allowed via FOR ALL). Idempotent: DROP IF EXISTS first.
-- Tables/policies covered (7):
--   school_curriculum_adoptions.school_adoptions_write
--   school_curriculum_subject_maps.school_subject_maps_write
--   schemes_of_work.schemes_write
--   medium_term_plans.mtp_write
--   teaching_sequences.sequences_write
--   teaching_sequence_objectives.seq_obj_write
--   lesson_learning_objectives.lesson_obj_write

-- 1. School Curriculum Adoptions
DROP POLICY IF EXISTS school_adoptions_write ON school_curriculum_adoptions;
DROP POLICY IF EXISTS school_adoptions_select ON school_curriculum_adoptions;
DROP POLICY IF EXISTS school_adoptions_insert ON school_curriculum_adoptions;
DROP POLICY IF EXISTS school_adoptions_update ON school_curriculum_adoptions;

CREATE POLICY school_adoptions_select ON school_curriculum_adoptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_adoptions.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

CREATE POLICY school_adoptions_insert ON school_curriculum_adoptions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_adoptions.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

CREATE POLICY school_adoptions_update ON school_curriculum_adoptions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_adoptions.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_adoptions.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

-- 2. School Curriculum Subject Maps
DROP POLICY IF EXISTS school_subject_maps_write ON school_curriculum_subject_maps;
DROP POLICY IF EXISTS school_subject_maps_select ON school_curriculum_subject_maps;
DROP POLICY IF EXISTS school_subject_maps_insert ON school_curriculum_subject_maps;
DROP POLICY IF EXISTS school_subject_maps_update ON school_curriculum_subject_maps;

CREATE POLICY school_subject_maps_select ON school_curriculum_subject_maps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_subject_maps.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

CREATE POLICY school_subject_maps_insert ON school_curriculum_subject_maps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_subject_maps.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

CREATE POLICY school_subject_maps_update ON school_curriculum_subject_maps
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_subject_maps.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_curriculum_subject_maps.school_id
        AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
    )
  );

-- 3. Schemes of Work
DROP POLICY IF EXISTS schemes_write ON schemes_of_work;
DROP POLICY IF EXISTS schemes_select ON schemes_of_work;
DROP POLICY IF EXISTS schemes_insert ON schemes_of_work;
DROP POLICY IF EXISTS schemes_update ON schemes_of_work;

CREATE POLICY schemes_select ON schemes_of_work
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = schemes_of_work.school_id
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

CREATE POLICY schemes_insert ON schemes_of_work
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = schemes_of_work.school_id
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

CREATE POLICY schemes_update ON schemes_of_work
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = schemes_of_work.school_id
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = schemes_of_work.school_id
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

-- 4. Medium-Term Plans
DROP POLICY IF EXISTS mtp_write ON medium_term_plans;
DROP POLICY IF EXISTS mtp_select ON medium_term_plans;
DROP POLICY IF EXISTS mtp_insert ON medium_term_plans;
DROP POLICY IF EXISTS mtp_update ON medium_term_plans;

CREATE POLICY mtp_select ON medium_term_plans
  FOR SELECT TO authenticated
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

CREATE POLICY mtp_insert ON medium_term_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM schemes_of_work s
      JOIN user_roles ur ON ur.school_id = s.school_id
      JOIN roles r ON r.id = ur.role_id
      WHERE s.id = medium_term_plans.scheme_id
        AND ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

CREATE POLICY mtp_update ON medium_term_plans
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM schemes_of_work s
      JOIN user_roles ur ON ur.school_id = s.school_id
      JOIN roles r ON r.id = ur.role_id
      WHERE s.id = medium_term_plans.scheme_id
        AND ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM schemes_of_work s
      JOIN user_roles ur ON ur.school_id = s.school_id
      JOIN roles r ON r.id = ur.role_id
      WHERE s.id = medium_term_plans.scheme_id
        AND ur.user_id = auth.uid()
        AND (r.id IN ('admin', 'principal', 'teacher') OR r.name IN ('admin', 'principal', 'teacher'))
    )
  );

-- 5. Teaching Sequences
DROP POLICY IF EXISTS sequences_write ON teaching_sequences;
DROP POLICY IF EXISTS sequences_select ON teaching_sequences;
DROP POLICY IF EXISTS sequences_insert ON teaching_sequences;
DROP POLICY IF EXISTS sequences_update ON teaching_sequences;

CREATE POLICY sequences_select ON teaching_sequences
  FOR SELECT TO authenticated
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

CREATE POLICY sequences_insert ON teaching_sequences
  FOR INSERT TO authenticated
  WITH CHECK (
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

CREATE POLICY sequences_update ON teaching_sequences
  FOR UPDATE TO authenticated
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
  )
  WITH CHECK (
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

-- 6. Teaching Sequence Objectives
DROP POLICY IF EXISTS seq_obj_write ON teaching_sequence_objectives;
DROP POLICY IF EXISTS seq_obj_select ON teaching_sequence_objectives;
DROP POLICY IF EXISTS seq_obj_insert ON teaching_sequence_objectives;
DROP POLICY IF EXISTS seq_obj_update ON teaching_sequence_objectives;

CREATE POLICY seq_obj_select ON teaching_sequence_objectives
  FOR SELECT TO authenticated
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

CREATE POLICY seq_obj_insert ON teaching_sequence_objectives
  FOR INSERT TO authenticated
  WITH CHECK (
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

CREATE POLICY seq_obj_update ON teaching_sequence_objectives
  FOR UPDATE TO authenticated
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
  )
  WITH CHECK (
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

-- 7. Lesson Learning Objectives
DROP POLICY IF EXISTS lesson_obj_write ON lesson_learning_objectives;
DROP POLICY IF EXISTS lesson_obj_select ON lesson_learning_objectives;
DROP POLICY IF EXISTS lesson_obj_insert ON lesson_learning_objectives;
DROP POLICY IF EXISTS lesson_obj_update ON lesson_learning_objectives;

CREATE POLICY lesson_obj_select ON lesson_learning_objectives
  FOR SELECT TO authenticated
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

CREATE POLICY lesson_obj_insert ON lesson_learning_objectives
  FOR INSERT TO authenticated
  WITH CHECK (
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

CREATE POLICY lesson_obj_update ON lesson_learning_objectives
  FOR UPDATE TO authenticated
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
  )
  WITH CHECK (
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

-- Explicit: no DELETE policy on any planning table — deletes stay denied.
