-- ==============================================================================
-- SOMACAMPUS MIGRATION: FEE APPROVAL RPC FIX (no updated_at on fee_structures)
-- Migration ID: 20260922000012
-- ==============================================================================
-- set_fee_structure_approval (20260922000011) referenced updated_at, which the
-- live fee_structures table does not have. Revision drops that assignment.
-- Idempotent: CREATE OR REPLACE.
-- ==============================================================================

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
      rejection_note = CASE WHEN p_approve THEN NULL ELSE p_note END
  WHERE fs.school_id = p_school_id
    AND fs.id = ANY(p_structure_ids)
    AND fs.approval_status = 'draft';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated, 'approved', p_approve);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_fee_structure_approval(UUID, UUID[], BOOLEAN, TEXT) TO authenticated;
