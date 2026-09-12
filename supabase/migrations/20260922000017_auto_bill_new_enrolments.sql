-- ============================================================================
-- SOMACAMPUS MIGRATION: AUTO-ASSESS MID-TERM ENROLMENTS (Session 10)
-- Migration ID: 20260922000017
-- ============================================================================
-- A pupil admitted mid-term was never billed until someone manually ran
-- "Apply to students". This trigger bills every new ACTIVE enrolment from
-- the approved price list automatically, using the same rules as
-- generate_charges_from_structures (approved-only, class-or-whole-school,
-- idempotent per (student, structure), rollups refreshed).
--
-- Term resolution: the enrolment year's current term, else the term
-- containing today. No resolvable term -> silent no-op (nothing to bill
-- against; documented, never an error that could break admissions).
-- Due date: enrolment day (CURRENT_DATE) when the term already started,
-- else the term start (pre-term admission).
-- Backfill-safe: fires only on NEW inserts; existing rows untouched.
-- Idempotent: same ON CONFLICT as the manual engine; replays are no-ops.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bill_new_enrolment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term_id UUID;
  v_term_start DATE;
  v_due DATE;
  v_created INT := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  BEGIN

  SELECT t.id, t.start_date INTO v_term_id, v_term_start
  FROM public.terms t
  WHERE t.academic_year_id = NEW.academic_year_id AND t.is_current = true
  ORDER BY t.term_number
  LIMIT 1;

  IF v_term_id IS NULL THEN
    SELECT t.id, t.start_date INTO v_term_id, v_term_start
    FROM public.terms t
    WHERE t.academic_year_id = NEW.academic_year_id
      AND CURRENT_DATE BETWEEN t.start_date AND t.end_date
    ORDER BY t.term_number
    LIMIT 1;
  END IF;

  IF v_term_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_due := COALESCE(v_term_start, CURRENT_DATE);
  IF v_due < CURRENT_DATE THEN
    v_due := CURRENT_DATE;
  END IF;

  WITH touched AS (
    INSERT INTO public.student_charges (
      school_id, student_id, academic_year_id, term_id, fee_category_id,
      fee_structure_id, description, amount, currency, due_date, created_by
    )
    SELECT NEW.school_id, NEW.student_id, fs.academic_year_id, v_term_id,
           fs.fee_category_id, fs.id, fs.title,
           fs.amount, fs.currency, v_due, NULL
    FROM public.fee_structures fs
    WHERE fs.school_id = NEW.school_id
      AND fs.academic_year_id = NEW.academic_year_id
      AND fs.term_id = v_term_id
      AND fs.approval_status = 'approved'
      AND fs.fee_category_id IS NOT NULL
      AND (fs.class_id IS NULL OR fs.class_id = NEW.class_id)
    ON CONFLICT (student_id, fee_structure_id) WHERE fee_structure_id IS NOT NULL
    DO NOTHING
    RETURNING student_id
  )
  SELECT count(*) INTO v_created FROM touched;

  IF v_created > 0 THEN
    WITH sums AS (
      SELECT COALESCE(SUM(ch.amount), 0) AS assessed,
             COALESCE(SUM((SELECT COALESCE(SUM(pa.amount), 0)
                           FROM public.payment_allocations pa
                           JOIN public.student_charges sc2 ON sc2.id = pa.charge_id
                           WHERE sc2.student_id = NEW.student_id AND sc2.term_id = v_term_id)), 0) AS paid
      FROM public.student_charges ch
      WHERE ch.student_id = NEW.student_id AND ch.term_id = v_term_id
    )
    INSERT INTO public.student_fee_accounts (
      school_id, student_id, academic_year_id, term_id,
      assessed_amount, paid_amount, balance, clearance_status
    )
    SELECT NEW.school_id, NEW.student_id, NEW.academic_year_id, v_term_id,
           sums.assessed, sums.paid, GREATEST(0, sums.assessed - sums.paid),
           CASE WHEN sums.assessed <= 0 THEN 'overdue'
                WHEN sums.assessed - sums.paid <= 0 THEN 'cleared'
                WHEN sums.paid > 0 THEN 'partial'
                ELSE 'overdue' END
    FROM sums
    ON CONFLICT (student_id, term_id) DO UPDATE SET
      assessed_amount = EXCLUDED.assessed_amount,
      balance = GREATEST(0, EXCLUDED.assessed_amount - student_fee_accounts.paid_amount),
      clearance_status = CASE WHEN EXCLUDED.assessed_amount <= 0 THEN student_fee_accounts.clearance_status
        WHEN EXCLUDED.assessed_amount - student_fee_accounts.paid_amount <= 0 THEN 'cleared'
        WHEN student_fee_accounts.paid_amount > 0 THEN 'partial'
        ELSE 'overdue' END,
      updated_at = now();
  END IF;

  RETURN NEW;
  END;
EXCEPTION
  -- Billing must NEVER break enrolment: on any unexpected failure, admit
  -- first and warn. The manual "Apply to students" engine remains the repair
  -- path for unbilled pupils.
  WHEN OTHERS THEN
    RAISE WARNING 'bill_new_enrolment skipped billing for enrolment %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_new_enrolment ON public.student_enrolments;
CREATE TRIGGER trg_bill_new_enrolment
  AFTER INSERT ON public.student_enrolments
  FOR EACH ROW EXECUTE FUNCTION public.bill_new_enrolment();
