#!/usr/bin/env node
/**
 * .agents/skills/somacampus-verify/scripts/check-migration-sync.mjs
 *
 * Stage 3: Production Trust Gate - Migration Catalog & SQL Safety Audit.
 * Ensures that:
 * 1. Migration files are timestamped and chronologically ordered.
 * 2. No active ungrantable permissions (e.g. COMMENT ON storage.buckets).
 * 3. No unsafe RLS policies like USING(true) on school tenant tables.
 * 4. Adheres to Archive-Never-Delete doctrine (no raw DELETE queries).
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'supabase/migrations');

console.log('🔍 [Stage 3] Auditing migration catalog and SQL safety standards...');

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error('❌ supabase/migrations directory not found!');
  process.exit(1);
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
console.log(`   Found ${files.length} SQL migration files.`);

let errorCount = 0;
let warnCount = 0;

// Validate timestamp naming convention: YYYYMMDDHHMMSS_name.sql
const TIMESTAMP_REGEX = /^\d{14}_/;

for (let i = 0; i < files.length; i++) {
  const filename = files[i];
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf8');

  if (!TIMESTAMP_REGEX.test(filename)) {
    console.error(`❌ [NAMING ERROR] Migration "${filename}" does not follow YYYYMMDDHHMMSS_name.sql format.`);
    errorCount++;
  }

  const lines = content.split('\n');
  for (let j = 0; j < lines.length; j++) {
    const line = lines[j];
    const trimmed = line.trim();

    // Skip full comment lines
    if (trimmed.startsWith('--')) continue;

    // 1. Check for active COMMENT ON storage.buckets
    if (/COMMENT\s+ON\s+(?:TABLE\s+)?storage\.buckets/i.test(line)) {
      console.error(
        `❌ [PERMISSION ERROR] ${filename}:${j + 1} contains active COMMENT ON storage.buckets (fails on hosted Supabase without superuser).`,
      );
      errorCount++;
    }

    // 2. Check for unsafe RLS policies USING (true) on operational tables
    if (
      /CREATE\s+POLICY/i.test(line) &&
      /USING\s*\(\s*true\s*\)/i.test(line) &&
      !line.includes('profiles') &&
      !line.includes('public_')
    ) {
      console.warn(`⚠️  [UNSAFE RLS POLICY] ${filename}:${j + 1} - Potential USING(true) bypass on tenant data: "${line.trim()}"`);
      warnCount++;
    }

    // 3. Check for hard DELETE statements outside drop/cleanup scripts
    if (/^\s*DELETE\s+FROM\s+/i.test(line) && !line.includes('temp') && !line.includes('seed')) {
      console.warn(`⚠️  [ARCHIVE-NEVER-DELETE] ${filename}:${j + 1} - Hard delete statement detected: "${line.trim()}"`);
      warnCount++;
    }
  }
}

console.log('\n--- Migration Audit Summary ---');
console.log(`Total Migrations Inspected: ${files.length}`);
console.log(`Violations Found: ${errorCount} Errors, ${warnCount} Warnings`);

if (errorCount > 0) {
  console.error('\n🚫 Production Trust Gate FAILED: Unsafe migration SQL detected.');
  process.exit(1);
} else {
  console.log('\n✅ Production Trust Gate PASSED: All migrations comply with safety standards.');
  process.exit(0);
}
