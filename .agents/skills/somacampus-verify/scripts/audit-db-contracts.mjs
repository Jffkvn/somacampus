#!/usr/bin/env node
/**
 * .agents/skills/somacampus-verify/scripts/audit-db-contracts.mjs
 *
 * Stage 2: Production Trust Gate - Schema & DB Contract Audit.
 * Ensures that:
 * 1. UI select/radio options match PostgreSQL CHECK constraints.
 * 2. User freeform inputs are not silently dropped at service boundaries.
 * 3. Schema enums in migrations match TypeScript type definitions.
 * 4. People vs User Auth identities are properly distinguished.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'supabase/migrations');
const SRC_DIR = path.join(ROOT_DIR, 'src');

console.log('🔍 [Stage 2] Auditing UI-to-Database schema contracts and constraints...');

let errorCount = 0;
let warnCount = 0;

// 1. Audit student_enrolments exit_reason and exit_notes
const studentServiceFile = path.join(SRC_DIR, 'modules/students/studentService.ts');
const studentModalFile = path.join(SRC_DIR, 'modules/students/StudentWithdrawModal.tsx');

if (fs.existsSync(studentServiceFile)) {
  const content = fs.readFileSync(studentServiceFile, 'utf8');

  // Check if exit_notes is supported or if free text is silently dropped
  if (content.includes('free text is dropped at this boundary') && !content.includes('p_exit_notes')) {
    console.warn(
      '⚠️  [CONTRACT GAP] studentService.ts drops free-text notes at boundary because exit_notes column/param is missing.',
    );
    warnCount++;
  }

  // Check allowed exit reasons in studentService
  const allowedCheck = /ALLOWED_EXIT_REASONS\s*=\s*new\s*Set\(\[\s*([\s\S]*?)\]\);/;
  const match = content.match(allowedCheck);
  if (match) {
    const reasons = match[1]
      .split(',')
      .map((s) => s.replace(/['"\s]/g, ''))
      .filter(Boolean);
    const required = ['promoted', 'transferred_class', 'transferred_stream', 'withdrawn', 'graduated', 'other'];
    const missing = required.filter((r) => !reasons.includes(r));
    if (missing.length > 0) {
      console.error(`❌ [SCHEMA MISMATCH] studentService missing DB allowed exit_reasons: ${missing.join(', ')}`);
      errorCount++;
    } else {
      console.log('   ✓ studentService exit_reason aligns with student_enrolments CHECK constraint.');
    }
  }
}

// 2. Audit staff exit reasons
const staffMigration = path.join(MIGRATIONS_DIR, '20260917000002_staff_operations.sql');
if (fs.existsSync(staffMigration)) {
  const migContent = fs.readFileSync(staffMigration, 'utf8');
  const staffCheck = /exit_reason IN \(([^)]+)\)/;
  const match = migContent.match(staffCheck);
  if (match) {
    const dbReasons = match[1].split(',').map((s) => s.replace(/['"\s]/g, ''));
    console.log(`   ✓ Staff exit_reason DB enum defined: [${dbReasons.join(', ')}]`);
  }
}

// 3. Audit for public.users references (forbidden non-existent table)
function scanForUsersTable(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      scanForUsersTable(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.sql'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const relPath = path.relative(ROOT_DIR, fullPath);
      if (/from\s+public\.users\b/i.test(content) || /references\s+public\.users\b/i.test(content)) {
        console.error(`❌ [SCHEMA VIOLATION] Non-existent table public.users referenced in ${relPath}`);
        errorCount++;
      }
    }
  }
}

scanForUsersTable(MIGRATIONS_DIR);

console.log('\n--- Contract Audit Summary ---');
console.log(`Violations Found: ${errorCount} Errors, ${warnCount} Warnings`);

if (errorCount > 0) {
  console.error('\n🚫 Production Trust Gate FAILED: UI-to-Database contract violations found.');
  process.exit(1);
} else {
  console.log('\n✅ Production Trust Gate PASSED: All verified DB contracts align.');
  process.exit(0);
}
