/**
 * Regression: approve_admission_application must reference only columns that
 * exist (live failure 2026-09-10: `column "school_id" of relation "people"
 * does not exist`). The 20260918000000 redefinition inserted school_id into
 * people/students (neither table has that column) and used non-existent
 * student_guardians columns (person_id, is_emergency_contact,
 * is_primary_contact, can_pickup). Fixed in 20260922000000.
 *
 * This test resolves the ACTIVE function body (last CREATE OR REPLACE wins,
 * migration filename order) and asserts the inserts match the real schema.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

function activeApproveBody(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const bodies: string[] = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    // Split on each (re)definition of the function; keep every body.
    const re =
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.approve_admission_application\s*\(/gi;
    let m: RegExpExecArray | null;
    const idx: number[] = [];
    while ((m = re.exec(text)) !== null) idx.push(m.index);
    for (const i of idx) bodies.push(text.slice(i, i + 12000));
  }
  expect(bodies.length).toBeGreaterThan(0);
  return bodies[bodies.length - 1];
}

describe('approve_admission_application schema contract', () => {
  it('people insert references no school_id (people has no such column)', () => {
    const body = activeApproveBody();
    const peopleInserts = [...body.matchAll(/INSERT INTO public\.people\s*\(([^)]+)\)/gi)].map(
      (m) => m[1],
    );
    expect(peopleInserts.length).toBeGreaterThan(0);
    for (const cols of peopleInserts) {
      expect(cols).not.toMatch(/\bschool_id\b/);
    }
  });

  it('students insert references no school_id (students has no such column)', () => {
    const body = activeApproveBody();
    const studentsInserts = [...body.matchAll(/INSERT INTO public\.students\s*\(([^)]+)\)/gi)].map(
      (m) => m[1],
    );
    expect(studentsInserts.length).toBeGreaterThan(0);
    for (const cols of studentsInserts) {
      expect(cols).not.toMatch(/\bschool_id\b/);
    }
  });

  it('guardian link uses guardian_person_id/is_primary (real student_guardians columns)', () => {
    const body = activeApproveBody();
    const linkInserts = [
      ...body.matchAll(/INSERT INTO public\.student_guardians\s*\(([^)]+)\)/gi),
    ].map((m) => m[1]);
    expect(linkInserts.length).toBeGreaterThan(0);
    for (const cols of linkInserts) {
      expect(cols).toMatch(/\bguardian_person_id\b/);
      expect(cols).toMatch(/\bis_primary\b/);
      expect(cols).not.toMatch(/\bis_emergency_contact\b/);
      expect(cols).not.toMatch(/\bis_primary_contact\b/);
      expect(cols).not.toMatch(/\bcan_pickup\b/);
    }
  });

  it('keeps the admin-or-principal gate and pending guard', () => {
    const body = activeApproveBody();
    expect(body).toMatch(/is_admin_or_principal_in_school/);
    expect(body).toMatch(/must be pending/);
  });
});
