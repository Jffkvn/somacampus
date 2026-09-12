-- ==============================================================================
-- SOMACAMPUS MIGRATION: DROP LEGACY 2-ARG APPROVE OVERLOAD
-- Migration ID: 20260922000016
-- ==============================================================================
-- 20260922000015 revised approve_timetable_atomic with the scorecard
-- attestation rule, which created a NEW 3-arg signature; the legacy 2-arg
-- overload (no bypass note support) remained and still allowed a silent
-- NULL-scorecard pass. Callers with 2 args resolve via p_note's default on
-- the 3-arg signature, so the overload is safe to drop.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.approve_timetable_atomic(UUID, UUID);
