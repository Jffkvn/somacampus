-- ==============================================================================
-- SOMACAMPUS MIGRATION: FEE SETUP + APPROVAL WORKFLOW (Phase A)
-- Migration ID: 20260922000011
-- ==============================================================================
-- Implements the school-fee price-list workflow agreed with the product owner:
--   * The BURSAR drafts fee_structures (per year + term + class + category).
--   * Only a PRINCIPAL or ADMIN ("Director") can approve them - enforced in
--     RLS, not just the UI.
--   * Approved structures are applied to students by an idempotent RPC that
--     generates student_charges (unique per student + structure, so re-running
--     can never double-bill) and refreshes the per-term student_fee_accounts
--     rollup.
--   * Default fee categories (Tuition mandatory; Meals, Uniform, Materials,
--     Transport optional) are seeded for every existing school. Schools that
--     fold e.g. meals into tuition simply never price the optional category.
--
-- Idempotent: conditional ALTERs, CREATE OR REPLACE, guarded seeds.
-- Archive-Never-Delete respected: no DELETEs (superseded drafts are rejected,
-- superseded charges are never touched).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. APPROVAL COLUMNS ON fee_structures
-- ------------------------------------------------------------------------------
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS proposed_by UUID REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS rejection_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fee_structures'::regclass
      AND conname = 'fee_structures_approval_status_check'
  ) THEN
    ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_approval_status_check
      CHECK (approval_status IN ('draft', 'approved', 'rejected'));
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. IDEMPOTENCY INDEXES
--    One structure row per (school, year, term, class, category) - a NULL
--    class/category is normalised to the zero UUID so NULLs cannot duplicate.
--    One charge per (student, structure) - generation can never double-bill.
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS fee_structures_scope_unique
  ON public.fee_structures (
    school_id, academic_year_id, term_id,
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(fee_category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE UNIQUE INDEX IF NOT EXISTS student_charges_structure_unique
  ON public.student_charges (student_id, fee_structure_id)
  WHERE fee_structure_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. APPROVER ROLE CHECK (Principal / Admin only - bursar drafts, never approves)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_fee_approver_in_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND ur.role_id IN ('admin', 'principal')
  );
$$;

-- ------------------------------------------------------------------------------
-- 4. RLS SPLIT ON fee_structures
--    Bursars (and approvers) write DRAFTS; only approvers may set a row to
--    approved/rejected. No DELETE policy (Archive-Never-Delete).
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS fee_structures_finance ON public.fee_structures;

CREATE POLICY fee_structures_read ON public.fee_structures
  FOR SELECT TO authenticated
  USING (public.has_school_finance_access(school_id));

CREATE POLICY fee_structures_insert ON public.fee_structures
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_school_finance_access(school_id)
    AND (approval_status = 'draft' OR public.is_fee_approver_in_school(school_id))
  );

CREATE POLICY fee_structures_update ON public.fee_structures
  FOR UPDATE TO authenticated
  USING (
    public.has_school_finance_access(school_id)
    AND (approval_status = 'draft' OR public.is_fee_approver_in_school(school_id))
  )
  WITH CHECK (
    public.is_fee_approver_in_school(school_id) OR approval_status = 'draft'
  );

-- ------------------------------------------------------------------------------
-- 5. RPC: set_fee_structure_approval  (Principal / Admin only)
--    Bulk-approves or rejects draft structures for one school.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_fee_structure_approval(
  p_school_id UUID,
  p_structure_ids UUID[],
  p_approve BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
  v_approver_person UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_fee_structure_approval: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_fee_approver_in_school(p_school_id) THEN
    RAISE EXCEPTION 'set_fee_structure_approval: only the Principal or Admin can approve fee changes'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_approver_person
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  UPDATE public.fee_structures fs
  SET approval_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      approved_by = CASE WHEN p_approve THEN v_approver_person ELSE NULL END,
      approved_at = CASE WHEN p_approve THEN now() ELSE NULL END,
      rejection_note = CASE WHEN p_approve THEN NULL ELSE p_note END,
      updated_at = now()
  WHERE fs.school_id = p_school_id
    AND fs.id = ANY(p_structure_ids)
    AND fs.approval_status = 'draft';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated, 'approved', p_approve);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_fee_structure_approval(UUID, UUID[], BOOLEAN, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: generate_charges_from_structures  (finance roles; approved structures only)
--    Idempotent: one charge per (student, structure) via the partial unique
--    index; refreshes student_fee_accounts (assessed/balance/clearance).
-- ------------------------------------------------------------------------------
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

    -- Every actively-enrolled student of the structure's class (NULL class =
    -- the whole school), for the structure's academic year.
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
    SELECT count(*) INTO v_created FROM touched;
  END LOOP;

  -- Refresh the per-term rollup for every student that now has charges for
  -- this term (assessed from charges; paid untouched; clearance recomputed).
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

-- ------------------------------------------------------------------------------
-- 7. DEFAULT FEE CATEGORIES for every existing school
--    Tuition is mandatory; everything else optional (schools that fold meals
--    into tuition simply never price it).
-- ------------------------------------------------------------------------------
INSERT INTO public.fee_categories (school_id, code, name, description, is_mandatory)
SELECT s.id, c.code, c.name, c.description, c.is_mandatory
FROM public.schools s
CROSS JOIN (VALUES
  ('TUITION',   'Tuition',   'Core academic fees',                       true),
  ('MEALS',     'Meals',     'School meals / lunch programme',           false),
  ('UNIFORM',   'Uniform',   'Uniform and wear',                         false),
  ('MATERIALS', 'Materials', 'Learning materials and stationery',        false),
  ('TRANSPORT', 'Transport', 'School transport service',                 false)
) AS c(code, name, description, is_mandatory)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fee_categories fc
  WHERE fc.school_id = s.id AND fc.code = c.code
);
