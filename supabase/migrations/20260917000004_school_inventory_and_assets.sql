-- ============================================================================
-- Migration: 20260917000004_school_inventory_and_assets.sql
-- Description: Core School Store, Inventory, Assets & Physical Operations (Slice 3)
-- ============================================================================

-- 1. Stores / Storage Locations
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stores_school_name UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_stores_school ON public.stores(school_id);

-- 2. Item Categories
CREATE TABLE IF NOT EXISTS public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_item_categories_school_code UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_item_categories_school ON public.item_categories(school_id);

-- 3. Consumable Items (SKU, unit, reorder level, live stock)
CREATE TABLE IF NOT EXISTS public.consumables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.item_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece',
  reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  current_quantity INTEGER NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_consumables_school_sku UNIQUE (school_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_consumables_school ON public.consumables(school_id);
CREATE INDEX IF NOT EXISTS idx_consumables_category ON public.consumables(category_id);
CREATE INDEX IF NOT EXISTS idx_consumables_store ON public.consumables(store_id);

-- 4. Equipment & Tangible Assets (Serials, Status, Condition)
CREATE TABLE IF NOT EXISTS public.equipment_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.item_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  asset_tag TEXT NOT NULL,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'under_maintenance', 'damaged', 'disposed', 'lost')),
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('new', 'good', 'fair', 'poor', 'damaged')),
  purchase_date DATE,
  purchase_cost NUMERIC(12,2) CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_equipment_assets_school_tag UNIQUE (school_id, asset_tag)
);

CREATE INDEX IF NOT EXISTS idx_equipment_assets_school ON public.equipment_assets(school_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assets_status ON public.equipment_assets(status);

-- 5. Stock Receipts (Goods Received Note / Inward Deliveries)
CREATE TABLE IF NOT EXISTS public.stock_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  supplier TEXT NOT NULL,
  reference_number TEXT NOT NULL,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_receipts_school_ref UNIQUE (school_id, reference_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_receipts_school ON public.stock_receipts(school_id);

CREATE TABLE IF NOT EXISTS public.stock_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.stock_receipts(id) ON DELETE CASCADE,
  consumable_id UUID NOT NULL REFERENCES public.consumables(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) DEFAULT 0 CHECK (unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_receipt_lines_receipt ON public.stock_receipt_lines(receipt_id);

-- 6. Stock Requests (Staff Material Requisitions)
CREATE TABLE IF NOT EXISTS public.stock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  department TEXT NOT NULL DEFAULT 'Primary',
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'fulfilled', 'rejected', 'cancelled')),
  requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  decided_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_requests_school ON public.stock_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_requester ON public.stock_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON public.stock_requests(status);

CREATE TABLE IF NOT EXISTS public.stock_request_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.stock_requests(id) ON DELETE CASCADE,
  consumable_id UUID NOT NULL REFERENCES public.consumables(id) ON DELETE RESTRICT,
  requested_qty INTEGER NOT NULL CHECK (requested_qty > 0),
  approved_qty INTEGER CHECK (approved_qty IS NULL OR approved_qty >= 0),
  issued_qty INTEGER NOT NULL DEFAULT 0 CHECK (issued_qty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_request_lines_request ON public.stock_request_lines(request_id);

-- 7. Stock Movements (Append-Only Transaction Ledger)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  consumable_id UUID NOT NULL REFERENCES public.consumables(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt', 'issuance', 'adjustment', 'return')),
  quantity INTEGER NOT NULL CHECK (quantity != 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reference_id UUID,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_school ON public.stock_movements(school_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_consumable ON public.stock_movements(consumable_id);

-- Immutability trigger on stock_movements
CREATE OR REPLACE FUNCTION public.prevent_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Policy Invariant Violation: stock_movements ledger is strictly immutable. Updates and deletes are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_stock_movement_mutation ON public.stock_movements;
CREATE TRIGGER trg_prevent_stock_movement_mutation
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_stock_movement_mutation();

-- 8. Asset Custody Ledger (1-active-holder constraint per asset)
CREATE TABLE IF NOT EXISTS public.asset_custody (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.equipment_assets(id) ON DELETE CASCADE,
  custodian_type TEXT NOT NULL CHECK (custodian_type IN ('employee', 'student')),
  custodian_id UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  expected_return_date DATE,
  returned_at TIMESTAMPTZ,
  returned_to UUID REFERENCES public.people(id) ON DELETE SET NULL,
  condition_on_issue TEXT NOT NULL DEFAULT 'good' CHECK (condition_on_issue IN ('new', 'good', 'fair', 'poor', 'damaged')),
  condition_on_return TEXT CHECK (condition_on_return IS NULL OR condition_on_return IN ('new', 'good', 'fair', 'poor', 'damaged')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_custody_school ON public.asset_custody(school_id);
CREATE INDEX IF NOT EXISTS idx_asset_custody_asset ON public.asset_custody(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_custody_custodian ON public.asset_custody(custodian_id);

-- Invariant: Exactly one active custody record per asset
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_asset_custody ON public.asset_custody(asset_id)
  WHERE returned_at IS NULL;

-- 9. Asset Damage Reports
CREATE TABLE IF NOT EXISTS public.damage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.equipment_assets(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe', 'total_loss')),
  action_taken TEXT,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_damage_reports_school ON public.damage_reports(school_id);
CREATE INDEX IF NOT EXISTS idx_damage_reports_asset ON public.damage_reports(asset_id);

-- ============================================================================
-- RLS POLICIES (School-Scoped from Migration One)
-- ============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;

-- Stores: staff read, leadership write
CREATE POLICY stores_read ON public.stores
  FOR SELECT USING (public.is_staff_in_school(school_id));
CREATE POLICY stores_write ON public.stores
  FOR ALL USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- Item Categories: staff read, leadership write
CREATE POLICY categories_read ON public.item_categories
  FOR SELECT USING (public.is_staff_in_school(school_id));
CREATE POLICY categories_write ON public.item_categories
  FOR ALL USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- Consumables: staff read, leadership write
CREATE POLICY consumables_read ON public.consumables
  FOR SELECT USING (public.is_staff_in_school(school_id));
CREATE POLICY consumables_write ON public.consumables
  FOR ALL USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- Equipment Assets: staff read, leadership write
CREATE POLICY equipment_assets_read ON public.equipment_assets
  FOR SELECT USING (public.is_staff_in_school(school_id));
CREATE POLICY equipment_assets_write ON public.equipment_assets
  FOR ALL USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- Stock Receipts: leadership read/write
CREATE POLICY stock_receipts_read ON public.stock_receipts
  FOR SELECT USING (public.is_leadership_in_school(school_id));
CREATE POLICY stock_receipts_write ON public.stock_receipts
  FOR ALL USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

CREATE POLICY stock_receipt_lines_read ON public.stock_receipt_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.stock_receipts sr
    WHERE sr.id = stock_receipt_lines.receipt_id
      AND public.is_leadership_in_school(sr.school_id)
  ));
CREATE POLICY stock_receipt_lines_write ON public.stock_receipt_lines
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.stock_receipts sr
    WHERE sr.id = stock_receipt_lines.receipt_id
      AND public.is_leadership_in_school(sr.school_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stock_receipts sr
    WHERE sr.id = stock_receipt_lines.receipt_id
      AND public.is_leadership_in_school(sr.school_id)
  ));

-- Stock Requests: staff read own + leadership read all; staff insert; leadership decision
CREATE POLICY stock_requests_read ON public.stock_requests
  FOR SELECT USING (
    public.is_leadership_in_school(school_id)
    OR (
      public.is_staff_in_school(school_id)
      AND requester_id IN (
        SELECT id FROM public.people WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY stock_requests_insert ON public.stock_requests
  FOR INSERT WITH CHECK (
    public.is_staff_in_school(school_id)
    AND requester_id IN (
      SELECT id FROM public.people WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY stock_requests_update ON public.stock_requests
  FOR UPDATE USING (
    public.is_leadership_in_school(school_id)
    OR (
      status = 'draft'
      AND requester_id IN (
        SELECT id FROM public.people WHERE auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_leadership_in_school(school_id)
    OR (
      status IN ('draft', 'pending')
      AND requester_id IN (
        SELECT id FROM public.people WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY stock_request_lines_read ON public.stock_request_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.stock_requests sr
    WHERE sr.id = stock_request_lines.request_id
      AND (
        public.is_leadership_in_school(sr.school_id)
        OR (
          public.is_staff_in_school(sr.school_id)
          AND sr.requester_id IN (
            SELECT id FROM public.people WHERE auth_user_id = auth.uid()
          )
        )
      )
  ));

CREATE POLICY stock_request_lines_write ON public.stock_request_lines
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.stock_requests sr
    WHERE sr.id = stock_request_lines.request_id
      AND (
        public.is_leadership_in_school(sr.school_id)
        OR (
          sr.status = 'draft'
          AND sr.requester_id IN (
            SELECT id FROM public.people WHERE auth_user_id = auth.uid()
          )
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stock_requests sr
    WHERE sr.id = stock_request_lines.request_id
      AND (
        public.is_leadership_in_school(sr.school_id)
        OR (
          sr.status IN ('draft', 'pending')
          AND sr.requester_id IN (
            SELECT id FROM public.people WHERE auth_user_id = auth.uid()
          )
        )
      )
  ));

-- Stock Movements: staff read, leadership write
CREATE POLICY stock_movements_read ON public.stock_movements
  FOR SELECT USING (public.is_staff_in_school(school_id));
CREATE POLICY stock_movements_insert ON public.stock_movements
  FOR INSERT WITH CHECK (public.is_leadership_in_school(school_id));

-- Asset Custody: staff read, leadership write
CREATE POLICY asset_custody_read ON public.asset_custody
  FOR SELECT USING (public.is_staff_in_school(school_id));
CREATE POLICY asset_custody_write ON public.asset_custody
  FOR ALL USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- Damage Reports: staff read/insert, leadership update
CREATE POLICY damage_reports_read ON public.damage_reports
  FOR SELECT USING (public.is_staff_in_school(school_id));
CREATE POLICY damage_reports_insert ON public.damage_reports
  FOR INSERT WITH CHECK (public.is_staff_in_school(school_id));
CREATE POLICY damage_reports_update ON public.damage_reports
  FOR UPDATE USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

-- ============================================================================
-- ATOMIC RPCs FOR STORE OPERATIONS
-- ============================================================================

-- RPC 1: Record Goods Received Note (Inward Stock Receipt)
CREATE OR REPLACE FUNCTION public.record_stock_receipt(
  p_school_id UUID,
  p_store_id UUID,
  p_supplier TEXT,
  p_reference_number TEXT,
  p_received_by UUID,
  p_notes TEXT,
  p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipt_id UUID;
  v_line JSONB;
  v_consumable_id UUID;
  v_quantity INTEGER;
  v_unit_cost NUMERIC(12,2);
  v_new_balance INTEGER;
BEGIN
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'Access Denied: Leadership role required to record stock receipts';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_receipts
    WHERE school_id = p_school_id AND reference_number = p_reference_number
  ) THEN
    RAISE EXCEPTION 'Duplicate Reference: Receipt with reference % already exists for this school', p_reference_number;
  END IF;

  INSERT INTO public.stock_receipts (
    school_id, store_id, supplier, reference_number, received_date, received_by, notes
  ) VALUES (
    p_school_id, p_store_id, p_supplier, p_reference_number, CURRENT_DATE, p_received_by, p_notes
  )
  RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_consumable_id := (v_line->>'consumable_id')::UUID;
    v_quantity := (v_line->>'quantity')::INTEGER;
    v_unit_cost := COALESCE((v_line->>'unit_cost')::NUMERIC, 0);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid Quantity: Received quantity must be greater than zero';
    END IF;

    -- Insert line
    INSERT INTO public.stock_receipt_lines (receipt_id, consumable_id, quantity, unit_cost)
    VALUES (v_receipt_id, v_consumable_id, v_quantity, v_unit_cost);

    -- Update consumable current stock
    UPDATE public.consumables
    SET current_quantity = current_quantity + v_quantity,
        updated_at = now()
    WHERE id = v_consumable_id AND school_id = p_school_id
    RETURNING current_quantity INTO v_new_balance;

    -- Append movement row
    INSERT INTO public.stock_movements (
      school_id, consumable_id, movement_type, quantity, balance_after, reference_id, reason, created_by
    ) VALUES (
      p_school_id, v_consumable_id, 'receipt', v_quantity, v_new_balance, v_receipt_id,
      'Stock receipt ref: ' || p_reference_number, p_received_by
    );
  END LOOP;

  RETURN v_receipt_id;
END;
$$;

-- RPC 2: Issue Stock for Approved/Pending Request (Fulfill Request)
CREATE OR REPLACE FUNCTION public.issue_stock_for_request(
  p_school_id UUID,
  p_request_id UUID,
  p_issued_by UUID,
  p_lines JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_line JSONB;
  v_consumable_id UUID;
  v_qty INTEGER;
  v_current_stock INTEGER;
  v_item_name TEXT;
  v_new_balance INTEGER;
BEGIN
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'Access Denied: Leadership role required to issue stock';
  END IF;

  SELECT * INTO v_req FROM public.stock_requests WHERE id = p_request_id AND school_id = p_school_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock request not found';
  END IF;

  IF v_req.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Invalid State: Cannot issue stock for request in % status', v_req.status;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_consumable_id := (v_line->>'consumable_id')::UUID;
    v_qty := (v_line->>'quantity')::INTEGER;

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Check current stock
    SELECT name, current_quantity INTO v_item_name, v_current_stock
    FROM public.consumables
    WHERE id = v_consumable_id AND school_id = p_school_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Consumable item not found';
    END IF;

    IF v_current_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock: item "%" has only % available, but % was requested for issuance',
        v_item_name, v_current_stock, v_qty;
    END IF;

    -- Decrement stock
    UPDATE public.consumables
    SET current_quantity = current_quantity - v_qty,
        updated_at = now()
    WHERE id = v_consumable_id AND school_id = p_school_id
    RETURNING current_quantity INTO v_new_balance;

    -- Update request line issued_qty
    UPDATE public.stock_request_lines
    SET issued_qty = issued_qty + v_qty,
        approved_qty = COALESCE(approved_qty, v_qty)
    WHERE request_id = p_request_id AND consumable_id = v_consumable_id;

    -- Append-only movement
    INSERT INTO public.stock_movements (
      school_id, consumable_id, movement_type, quantity, balance_after, reference_id, reason, created_by
    ) VALUES (
      p_school_id, v_consumable_id, 'issuance', -v_qty, v_new_balance, p_request_id,
      'Issued for request purpose: ' || v_req.purpose, p_issued_by
    );
  END LOOP;

  -- Determine if request is fulfilled
  IF EXISTS (
    SELECT 1 FROM public.stock_request_lines
    WHERE request_id = p_request_id AND issued_qty < requested_qty
  ) THEN
    UPDATE public.stock_requests
    SET status = 'approved',
        decided_by = p_issued_by,
        decided_at = now(),
        updated_at = now()
    WHERE id = p_request_id;
  ELSE
    UPDATE public.stock_requests
    SET status = 'fulfilled',
        decided_by = p_issued_by,
        decided_at = now(),
        updated_at = now()
    WHERE id = p_request_id;
  END IF;

  RETURN true;
END;
$$;

-- RPC 3: Adjust Stock Level with Reasoned Movement
CREATE OR REPLACE FUNCTION public.adjust_stock_level(
  p_school_id UUID,
  p_consumable_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT,
  p_adjusted_by UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_qty INTEGER;
  v_delta INTEGER;
BEGIN
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'Access Denied: Leadership role required to adjust stock levels';
  END IF;

  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Invalid Quantity: Adjusted stock quantity cannot be negative';
  END IF;

  SELECT current_quantity INTO v_old_qty
  FROM public.consumables
  WHERE id = p_consumable_id AND school_id = p_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consumable item not found';
  END IF;

  v_delta := p_new_quantity - v_old_qty;

  IF v_delta = 0 THEN
    RETURN p_new_quantity;
  END IF;

  UPDATE public.consumables
  SET current_quantity = p_new_quantity,
      updated_at = now()
  WHERE id = p_consumable_id AND school_id = p_school_id;

  INSERT INTO public.stock_movements (
    school_id, consumable_id, movement_type, quantity, balance_after, reason, created_by
  ) VALUES (
    p_school_id, p_consumable_id, 'adjustment', v_delta, p_new_quantity, p_reason, p_adjusted_by
  );

  RETURN p_new_quantity;
END;
$$;

-- RPC 4: Issue Asset Custody
CREATE OR REPLACE FUNCTION public.issue_asset_custody(
  p_school_id UUID,
  p_asset_id UUID,
  p_custodian_type TEXT,
  p_custodian_id UUID,
  p_issued_by UUID,
  p_expected_return DATE,
  p_condition TEXT,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset RECORD;
  v_custody_id UUID;
BEGIN
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'Access Denied: Leadership role required to issue asset custody';
  END IF;

  SELECT * INTO v_asset
  FROM public.equipment_assets
  WHERE id = p_asset_id AND school_id = p_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipment asset not found';
  END IF;

  IF v_asset.status != 'available' THEN
    RAISE EXCEPTION 'Asset Not Available: Asset status is "%", cannot issue custody', v_asset.status;
  END IF;

  INSERT INTO public.asset_custody (
    school_id, asset_id, custodian_type, custodian_id, issued_at, issued_by,
    expected_return_date, condition_on_issue, notes
  ) VALUES (
    p_school_id, p_asset_id, p_custodian_type, p_custodian_id, now(), p_issued_by,
    p_expected_return, COALESCE(p_condition, 'good'), p_notes
  )
  RETURNING id INTO v_custody_id;

  UPDATE public.equipment_assets
  SET status = 'assigned',
      condition = COALESCE(p_condition, condition),
      updated_at = now()
  WHERE id = p_asset_id;

  RETURN v_custody_id;
END;
$$;

-- RPC 5: Return Asset Custody
CREATE OR REPLACE FUNCTION public.return_asset_custody(
  p_school_id UUID,
  p_asset_id UUID,
  p_returned_to UUID,
  p_condition TEXT,
  p_notes TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_custody_id UUID;
BEGIN
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'Access Denied: Leadership role required to process asset returns';
  END IF;

  SELECT id INTO v_custody_id
  FROM public.asset_custody
  WHERE asset_id = p_asset_id AND returned_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active custody record found for asset %', p_asset_id;
  END IF;

  UPDATE public.asset_custody
  SET returned_at = now(),
      returned_to = p_returned_to,
      condition_on_return = COALESCE(p_condition, condition_on_issue),
      notes = CASE
        WHEN p_notes IS NOT NULL AND p_notes != '' THEN COALESCE(notes || ' | Return: ', '') || p_notes
        ELSE notes
      END
  WHERE id = v_custody_id;

  UPDATE public.equipment_assets
  SET status = CASE
        WHEN p_condition = 'damaged' THEN 'damaged'
        ELSE 'available'
      END,
      condition = COALESCE(p_condition, condition),
      updated_at = now()
  WHERE id = p_asset_id;

  RETURN true;
END;
$$;
