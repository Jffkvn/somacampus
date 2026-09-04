-- ============================================================================
-- SomaCampus Hardening Part C: Drop legacy open planning reads
-- Migration: 20260912000007_drop_legacy_planning_reads.sql
-- ============================================================================
-- Phase 6 file 20260910000001 created permissive open-read policies
-- (FOR SELECT ... USING (true)) on all 7 planning tables. Migration
-- 20260912000003 replaced the write side with scoped per-verb policies and
-- added scoped *_select policies with IDENTICAL role/school conditions — the
-- open reads were left behind and still permit cross-school SELECTs.
-- This migration drops ONLY those 7 legacy open-read policies. The scoped
-- *_select policies from 20260912000003 are now authoritative for reads.
-- Idempotent: DROP IF EXISTS.
DROP POLICY IF EXISTS school_adoptions_read ON school_curriculum_adoptions;
DROP POLICY IF EXISTS school_subject_maps_read ON school_curriculum_subject_maps;
DROP POLICY IF EXISTS schemes_read ON schemes_of_work;
DROP POLICY IF EXISTS mtp_read ON medium_term_plans;
DROP POLICY IF EXISTS sequences_read ON teaching_sequences;
DROP POLICY IF EXISTS seq_obj_read ON teaching_sequence_objectives;
DROP POLICY IF EXISTS lesson_obj_read ON lesson_learning_objectives;
