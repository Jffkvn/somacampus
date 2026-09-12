-- ==============================================================================
-- SOMACAMPUS MIGRATION: GENERATE_CHARGES COUNT FIX
-- Migration ID: 20260922000013
-- ==============================================================================
-- Bug: v_created was OVERWRITTEN per structure iteration, so the reported
-- charges_created reflected only the LAST structure (a class with no enrolled
-- students zeroed the count even though earlier structures had billed).
-- Charges themselves were always created correctly (unique index prevents
-- double-billing); only the returned counter lied. Accumulate per iteration.
-- Idempotent: CREATE OR REPLACE.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.generate_charges_from_structures(
  p_school_id UUID,
  p_term_id UUID,
  p_structure_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_structure RECORD;
  v_year_id UUID;
  v_due_date DATE;
  v_created INT := 0;
  v_iter INT := 0;
  v_touched_students INT := 0;
  v_actor UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'generate_charges_from_structures: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_school_finance_access(p_school_id) THEN
    RAISE EXCEPTION 'generate_charges_from_structures: caller has no finance access for school %',
      p_school_id USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_actor FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1;

  FOR v_structure IN
    SELECT fs.id, fs.class_id, fs.academic_year_id, fs.title, fs.amount,
           fs.currency, fs.fee_category_id, fs.approval_status, t.start_date
    FROM public.fee_structures fs
    JOIN public.terms t ON t.id = p_term_id
    WHERE fs.id = ANY(p_structure_ids)
      AND fs.school_id = p_school_id
      AND fs.term_id = p_term_id
  LOOP
    IF v_structure.approval_status <> 'approved' THEN
      RAISE EXCEPTION 'generate_charges_from_structures: structure % is not approved', v_structure.id
        USING ERRCODE = '42501';
    END IF;
    v_year_id := v_structure.academic_year_id;
    v_due_date := COALESCE(v_structure.start_date, CURRENT_DATE);

    WITH touched AS (
      INSERT INTO public.student_charges (
        school_id, student_id, academic_year_id, term_id, fee_category_id,
        fee_structure_id, description, amount, currency, due_date, created_by
      )
      SELECT p_school_id, se.student_id, v_structure.academic_year_id, p_term_id,
             v_structure.fee_category_id, v_structure.id, v_structure.title,
             v_structure.amount, v_structure.currency, v_due_date, v_actor
      FROM public.student_enrolments se
      WHERE se.school_id = p_school_id
        AND se.status = 'active'
        AND se.academic_year_id = v_structure.academic_year_id
        AND (v_structure.class_id IS NULL OR se.class_id = v_structure.class_id)
      ON CONFLICT (student_id, fee_structure_id) WHERE fee_structure_id IS NOT NULL
      DO NOTHING
      RETURNING student_id
    )
    SELECT count(*) INTO v_iter FROM touched;
    v_created := v_created + v_iter;
  END LOOP;

  WITH touched AS (
    SELECT DISTINCT ch.student_id
    FROM public.student_charges ch
    WHERE ch.school_id = p_school_id AND ch.term_id = p_term_id
  ), upserted AS (
    INSERT INTO public.student_fee_accounts (
      school_id, student_id, academic_year_id, term_id,
      assessed_amount, paid_amount, balance, clearance_status
    )
    SELECT p_school_id, t.student_id, v_year_id, p_term_id,
           COALESCE(SUM(ch.amount), 0), 0,
           COALESCE(SUM(ch.amount), 0),
           'overdue'
    FROM touched t
    LEFT JOIN public.student_charges ch
      ON ch.student_id = t.student_id AND ch.term_id = p_term_id
    GROUP BY t.student_id
    ON CONFLICT (student_id, term_id) DO UPDATE
      SET assessed_amount = EXCLUDED.assessed_amount,
          balance = GREATEST(0, EXCLUDED.assessed_amount - student_fee_accounts.paid_amount),
          clearance_status = CASE
            WHEN EXCLUDED.assessed_amount <= 0 THEN student_fee_accounts.clearance_status
            WHEN GREATEST(0, EXCLUDED.assessed_amount - student_fee_accounts.paid_amount) <= 0 THEN 'cleared'
            WHEN student_fee_accounts.paid_amount > 0 THEN 'partial'
            ELSE 'overdue'
          END,
          academic_year_id = EXCLUDED.academic_year_id,
          updated_at = now()
    RETURNING student_id
  )
  SELECT count(*) INTO v_touched_students FROM upserted;

  RETURN jsonb_build_object(
    'charges_created', v_created,
    'students', v_touched_students,
    'structures', coalesce(array_length(p_structure_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_charges_from_structures(UUID, UUID, UUID[]) TO authenticated;
