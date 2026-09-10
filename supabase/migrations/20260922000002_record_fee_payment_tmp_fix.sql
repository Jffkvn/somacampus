-- ============================================================================
-- Atomic fee payment recording: payment -> allocate -> account -> audit.
-- Migration: 20260922000001_record_fee_payment.sql
-- ============================================================================
-- financeService.recordPayment() previously did 3+ separate PostgREST calls
-- (payment insert, allocation inserts, audit writes) and omitted the NOT NULL
-- student_account_id column, so every live payment failed and any partial
-- success would leave a payment without allocations. This RPC performs the
-- whole waterfall in ONE implicit Postgres transaction: any RAISE rolls back
-- everything. SECURITY DEFINER with an explicit finance-role gate
-- (has_school_finance_access); REVOKE/GRANT at the bottom.
-- Account resolution: UNIQUE(student_id, term_id); resolves the school's
-- current term (current academic year + current term, else first term) and
-- creates the account row when missing. Allocation is oldest-due-first
-- across the pupil's open student_charges, mirroring the client engine.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_school_id UUID,
  p_student_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_channel TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_payer_name TEXT DEFAULT NULL,
  p_payer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_id UUID;
  v_term_id UUID;
  v_account_id UUID;
  v_payment_id UUID;
  v_receipt TEXT;
  v_remaining NUMERIC;
  v_status TEXT;
  v_alloc_total NUMERIC := 0;
  v_caller_person_id UUID;
  c RECORD;
  v_outstanding NUMERIC;
  v_take NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_fee_payment: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'record_fee_payment: amount must be greater than zero'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_school_finance_access(p_school_id) THEN
    RAISE EXCEPTION 'record_fee_payment: caller lacks finance access for school %', p_school_id
      USING ERRCODE = '42501';
  END IF;

  -- Pupil must be enrolled in this school (students carries no school_id;
  -- enrolments are the school-membership authority).
  IF NOT EXISTS (
    SELECT 1 FROM public.student_enrolments se
    WHERE se.student_id = p_student_id
      AND se.school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'record_fee_payment: student % is not enrolled in school %', p_student_id, p_school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Current term: current year + current term, else first term of the year.
  SELECT ay.id INTO v_year_id
  FROM public.academic_years ay
  WHERE ay.school_id = p_school_id AND ay.is_current = true
  ORDER BY ay.id LIMIT 1;
  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'record_fee_payment: school % has no current academic year', p_school_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT t.id INTO v_term_id
  FROM public.terms t
  WHERE t.academic_year_id = v_year_id AND t.is_current = true
  ORDER BY t.term_number LIMIT 1;
  IF v_term_id IS NULL THEN
    SELECT t.id INTO v_term_id
    FROM public.terms t
    WHERE t.academic_year_id = v_year_id
    ORDER BY t.term_number LIMIT 1;
  END IF;
  IF v_term_id IS NULL THEN
    RAISE EXCEPTION 'record_fee_payment: school % has no terms configured', p_school_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve or create the fee account for (student, term).
  SELECT a.id INTO v_account_id
  FROM public.student_fee_accounts a
  WHERE a.student_id = p_student_id AND a.term_id = v_term_id;
  IF v_account_id IS NULL THEN
    INSERT INTO public.student_fee_accounts (
      school_id, student_id, academic_year_id, term_id,
      assessed_amount, paid_amount, balance, clearance_status
    ) VALUES (
      p_school_id, p_student_id, v_year_id, v_term_id, 0, 0, 0, 'overdue'
    )
    RETURNING id INTO v_account_id;
  END IF;

  v_receipt := 'RCP-' || to_char(now(), 'YYYYMMDD') || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  -- Staging table is created UNCONDITIONALLY before the loop: a pupil with
  -- zero open charges must still reach the final INSERT (zero rows), not
  -- raise `relation "tmp_fee_alloc" does not exist`.
  CREATE TEMP TABLE IF NOT EXISTS tmp_fee_alloc (
    charge_id UUID, amount NUMERIC
  ) ON COMMIT DROP;
  DELETE FROM tmp_fee_alloc;

  -- Oldest-due-first allocation across open charges.
  v_remaining := p_amount;
  FOR c IN
    SELECT ch.id, ch.amount,
      COALESCE((SELECT SUM(pa.amount) FROM public.payment_allocations pa
        WHERE pa.charge_id = ch.id), 0) AS already_paid
    FROM public.student_charges ch
    WHERE ch.student_id = p_student_id AND ch.school_id = p_school_id
    ORDER BY ch.due_date ASC, ch.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_outstanding := GREATEST(0, c.amount - c.already_paid);
    IF v_outstanding > 0 THEN
      v_take := LEAST(v_remaining, v_outstanding);
      INSERT INTO tmp_fee_alloc (charge_id, amount) VALUES (c.id, v_take);
      v_remaining := v_remaining - v_take;
      v_alloc_total := v_alloc_total + v_take;
    END IF;
  END LOOP;

  IF v_remaining = p_amount THEN
    v_status := 'unallocated';
  ELSIF v_remaining > 0 THEN
    v_status := 'partially_allocated';
  ELSE
    v_status := 'fully_allocated';
  END IF;

  INSERT INTO public.fee_payments (
    school_id, student_account_id, student_id, amount, payment_date,
    payment_channel, payment_reference, payer_name, payer_phone,
    receipt_number, unallocated_amount, status, notes
  ) VALUES (
    p_school_id, v_account_id, p_student_id, p_amount, p_payment_date,
    p_payment_channel, p_payment_reference, p_payer_name, p_payer_phone,
    v_receipt, v_remaining, v_status, p_notes
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.payment_allocations (school_id, payment_id, charge_id, amount)
  SELECT p_school_id, v_payment_id, charge_id, amount FROM tmp_fee_alloc;

  -- Refresh account aggregates: paid rises by allocated total; balance is
  -- assessed minus paid (floored at zero; overpayments sit as unallocated).
  UPDATE public.student_fee_accounts a
  SET paid_amount = paid_amount + v_alloc_total,
      balance = GREATEST(0, assessed_amount - (paid_amount + v_alloc_total)),
      clearance_status = CASE
        WHEN assessed_amount <= 0 THEN clearance_status
        WHEN assessed_amount - (paid_amount + v_alloc_total) <= 0 THEN 'cleared'
        WHEN (paid_amount + v_alloc_total) > 0 THEN 'partial'
        ELSE 'overdue' END,
      updated_at = now()
  WHERE a.id = v_account_id;

  SELECT p.id INTO v_caller_person_id
  FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1;

  INSERT INTO public.financial_audit_logs (
    school_id, entity_type, entity_id, action,
    previous_data, new_data, performed_by, reason
  ) VALUES (
    p_school_id, 'payment', v_payment_id, 'create',
    NULL,
    jsonb_build_object('receipt', v_receipt, 'amount', p_amount,
      'allocated', v_alloc_total, 'unallocated', v_remaining, 'status', v_status),
    v_caller_person_id,
    'record_fee_payment ' || v_receipt
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'receipt_number', v_receipt,
    'status', v_status,
    'allocated', v_alloc_total,
    'unallocated', v_remaining,
    'account_id', v_account_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_fee_payment(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
