import type { FeeTerm } from '../feeSetupService';

/**
 * Structural demo terms for clearly-marked mock envs (tests, no-backend
 * demos). Lives in fixtures/ (mock-rot scan exclusion) — never imported by
 * production paths except behind isMockEnv().
 */
export const MOCK_TERMS: FeeTerm[] = [
  { id: 'term-1', name: 'Term 1', academicYearId: 'ay-2026-2027', isCurrent: true },
  { id: 'term-2', name: 'Term 2', academicYearId: 'ay-2026-2027', isCurrent: false },
  { id: 'term-3', name: 'Term 3', academicYearId: 'ay-2026-2027', isCurrent: false },
];
