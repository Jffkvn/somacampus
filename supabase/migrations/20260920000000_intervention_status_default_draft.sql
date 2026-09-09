-- ==============================================================================
-- Migration: 20260920000000_intervention_status_default_draft.sql
-- Phase C evidence integrity: new interventions start as 'draft'.
--
-- The interventions.status column defaulted to 'active', letting rows enter
-- the active lifecycle without teacher activation or observation provenance.
-- The service layer now defaults creates to 'draft' and gates activation
-- behind activateIntervention (draft → active + observation linkage +
-- teacher authorization); this aligns the DB default so direct inserts
-- (outside the service) are draft-neutral too. Single statement,
-- re-runnable, no triggers, no new tables, no data backfill.
-- ==============================================================================

ALTER TABLE public.interventions ALTER COLUMN status SET DEFAULT 'draft';
