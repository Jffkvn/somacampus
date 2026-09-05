-- ==============================================================================
-- SOMACAMPUS MIGRATION: ONLINE ADMISSIONS (ENQUIRY-TO-OFFER)
-- Migration ID: 20260914000001
-- ==============================================================================
-- Phase 9B Task 1 (schema only): reception-driven admissions pipeline for the
-- online learning centre alongside the physical school. Centre flow is
-- enquiry -> consultation/assessment -> offer -> acceptance -> enrolment:
-- acceptance of an offer creates a row in the existing 9A online_enrolments
-- table (app/service writes, NOT a DB trigger -- keep the DB dumb).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS before each CREATE. No CREATE OR REPLACE helpers
-- here: RLS reuses the 9A helpers public.online_centre_is_staff /
-- public.online_centre_can_write (SECURITY DEFINER, SET search_path).
-- No USING(true) on school data: every policy is school-scoped from the
-- row's own school_id.
--
-- DELIBERATE DEVIATIONS / DECISIONS (documented):
-- 1. NO phone columns anywhere in this migration (locked decision): the only
--    parent contact field is email (nullable -- walk-in enquiries may have
--    none; CHECKed for '@' when present). No phone, no alternate contacts.
-- 2. Age is stored as date_of_birth DATE NULLABLE only (age is derivable
--    app-side); no separate age column to avoid dual-source drift.
-- 3. school_id is denormalised onto every admissions table (9A convention):
--    every policy is school-scoped from the row itself. Cross-table
--    school-match (e.g. offer.offering.school vs offer.school) is enforced
--    app-side by the 9B-2 service, not by DB CHECKs/FKs.
-- 4. online_consultations allows MULTIPLE rows per enquiry (re-assessment):
--    no UNIQUE(enquiry_id). Latest row is advisory truth, resolved app-side.
-- 5. online_offers.offering_id is NOT NULL ON DELETE RESTRICT (an offer is a
--    commercial record -- the offering must not vanish beneath it), while
--    pricing_option_id is NULLABLE ON DELETE SET NULL (draft offers may
--    predate pricing; deleting a pricing option must not delete history).
-- 6. Acceptance writes live in the 9B-2 service as acceptOffer(): offer ->
--    accepted + INSERT into online_enrolments in one flow. NO DB trigger and
--    NO updated_at auto-trigger here -- updated_at is app-maintained.
-- 7. RLS is staff-only (reads AND writes via the 9A staff/writer helpers).
--    No learner/parent/guardian policies: admissions is reception-driven,
--    and there is no self-service enquiry portal in 9B-1. No DELETE policies
--    yet (9A convention -- delete flows arrive later).
-- 8. Enquiry status includes BOTH accepted and enrolled: accepted = offer
--    accepted (commercial close), enrolled = online_enrolments row exists
--    (fulfilment close). The 9B-2 service advances accepted -> enrolled.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. online_enquiries (reception-created; email-only contact, no phones)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  parent_name TEXT NOT NULL CHECK (length(btrim(parent_name)) >= 2),
  email TEXT CHECK (email IS NULL OR email LIKE '%@%'),
  student_name TEXT NOT NULL CHECK (length(btrim(student_name)) >= 2),
  date_of_birth DATE,
  current_school TEXT,
  interest_offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  requested_notes TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'assessed', 'offered', 'accepted', 'declined', 'enrolled')),
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. online_consultations (assessment; multiple rows per enquiry allowed)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enquiry_id UUID NOT NULL REFERENCES public.online_enquiries(id) ON DELETE CASCADE,
  assessor_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  level_notes TEXT,
  needs TEXT,
  schedule_fit TEXT,
  recommended_offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  recommended_frequency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 3. online_offers (commercial terms: offering + pricing option + frequency)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enquiry_id UUID NOT NULL REFERENCES public.online_enquiries(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.online_offerings(id) ON DELETE RESTRICT,
  pricing_option_id UUID REFERENCES public.online_pricing_options(id) ON DELETE SET NULL,
  frequency_text TEXT,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- Indexes on actual query paths
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS online_enquiries_school_idx
  ON public.online_enquiries (school_id);
CREATE INDEX IF NOT EXISTS online_enquiries_school_status_idx
  ON public.online_enquiries (school_id, status);
CREATE INDEX IF NOT EXISTS online_enquiries_interest_offering_idx
  ON public.online_enquiries (interest_offering_id)
  WHERE interest_offering_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS online_consultations_school_idx
  ON public.online_consultations (school_id);
CREATE INDEX IF NOT EXISTS online_consultations_enquiry_idx
  ON public.online_consultations (enquiry_id);
CREATE INDEX IF NOT EXISTS online_consultations_recommended_offering_idx
  ON public.online_consultations (recommended_offering_id)
  WHERE recommended_offering_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS online_offers_school_idx
  ON public.online_offers (school_id);
CREATE INDEX IF NOT EXISTS online_offers_enquiry_idx
  ON public.online_offers (enquiry_id);
CREATE INDEX IF NOT EXISTS online_offers_school_status_idx
  ON public.online_offers (school_id, status);
CREATE INDEX IF NOT EXISTS online_offers_offering_idx
  ON public.online_offers (offering_id);

-- ------------------------------------------------------------------------------
-- RLS: ENABLE + staff-only school-scoped policies (reception-driven;
-- no learner/parent writes or reads in 9B-1)
-- ------------------------------------------------------------------------------
ALTER TABLE public.online_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_offers ENABLE ROW LEVEL SECURITY;

-- -- online_enquiries ------------------------------------------------------------
DROP POLICY IF EXISTS online_enquiries_read ON public.online_enquiries;
CREATE POLICY online_enquiries_read ON public.online_enquiries
  FOR SELECT TO authenticated
  USING (public.online_centre_is_staff(school_id));

DROP POLICY IF EXISTS online_enquiries_insert ON public.online_enquiries;
CREATE POLICY online_enquiries_insert ON public.online_enquiries
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_enquiries_update ON public.online_enquiries;
CREATE POLICY online_enquiries_update ON public.online_enquiries
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_consultations --------------------------------------------------------
DROP POLICY IF EXISTS online_consultations_read ON public.online_consultations;
CREATE POLICY online_consultations_read ON public.online_consultations
  FOR SELECT TO authenticated
  USING (public.online_centre_is_staff(school_id));

DROP POLICY IF EXISTS online_consultations_insert ON public.online_consultations;
CREATE POLICY online_consultations_insert ON public.online_consultations
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_consultations_update ON public.online_consultations;
CREATE POLICY online_consultations_update ON public.online_consultations
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));

-- -- online_offers ---------------------------------------------------------------
DROP POLICY IF EXISTS online_offers_read ON public.online_offers;
CREATE POLICY online_offers_read ON public.online_offers
  FOR SELECT TO authenticated
  USING (public.online_centre_is_staff(school_id));

DROP POLICY IF EXISTS online_offers_insert ON public.online_offers;
CREATE POLICY online_offers_insert ON public.online_offers
  FOR INSERT TO authenticated
  WITH CHECK (public.online_centre_can_write(school_id));

DROP POLICY IF EXISTS online_offers_update ON public.online_offers;
CREATE POLICY online_offers_update ON public.online_offers
  FOR UPDATE TO authenticated
  USING (public.online_centre_can_write(school_id))
  WITH CHECK (public.online_centre_can_write(school_id));
