#!/usr/bin/env node
/**
 * .agents/skills/somacampus-verify/scripts/detect-mock-rot.mjs
 *
 * Stage 1: Production Trust Gate - Mock Rot & In-Memory Cheat Detection.
 * Scans all production runtime service files to ensure:
 * 1. No mutable in-memory fallback arrays masking missing tables or RPCs.
 * 2. No hardcoded metric zeroes (e.g. usedDays: 0) used to forge green tests.
 * 3. Fail-closed error handling (no catch { return []; } masking DB errors).
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

const IGNORE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\/test\//,
  /\/tests\//,
  /\/mocks\//,
  /\/fixtures\//,
];

const VIOLATION_RULES = [
  {
    name: 'In-memory fallback or mock array/object in runtime service',
    regex: /(?:let|const|var)\s+(?:mock\w*|fallback\w*|fake\w*|memoryStore\w*)\s*(?::\s*[^=]+)?\s*=\s*[\[\{]/i,
    severity: 'ERROR',
  },
  {
    name: 'Module-scope mutable state array (potential in-memory cheat)',
    regex: /^let\s+\w*(?:records|items|data|store|cache)\w*\s*(?::\s*[^=]+)?\s*=\s*\[\s*\];/m,
    severity: 'ERROR',
  },
  {
    name: 'Hardcoded zero metric placeholder (usedDays: 0)',
    regex: /\busedDays\s*:\s*0\b/,
    severity: 'ERROR',
  },
  {
    name: 'Swallowed database exception masking failure with empty array',
    regex: /catch\s*\([^)]*\)\s*\{\s*return\s*\[\s*\];\s*\}/,
    severity: 'WARN',
  },
];

function getAllServiceFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllServiceFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('Service.ts') || entry.name.endsWith('Service.tsx'))) {
      const relPath = path.relative(ROOT_DIR, fullPath);
      if (!IGNORE_PATTERNS.some((p) => p.test(relPath))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

console.log('🔍 [Stage 1] Scanning runtime services for mock rot and in-memory cheats...');
const serviceFiles = getAllServiceFiles(SRC_DIR);
console.log(`   Found ${serviceFiles.length} runtime service files to inspect.`);

let errorCount = 0;
let warnCount = 0;

for (const filePath of serviceFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(ROOT_DIR, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const rule of VIOLATION_RULES) {
      if (rule.regex.test(line)) {
        const msg = `${relPath}:${i + 1} - [${rule.severity}] ${rule.name}\n    Line: "${line.trim()}"`;
        if (rule.severity === 'ERROR') {
          console.error(`❌ ${msg}`);
          errorCount++;
        } else {
          console.warn(`⚠️  ${msg}`);
          warnCount++;
        }
      }
    }
  }
}

console.log('\n--- Mock Rot Scan Summary ---');
console.log(`Total Services Inspected: ${serviceFiles.length}`);
console.log(`Violations Found: ${errorCount} Errors, ${warnCount} Warnings`);

if (errorCount > 0) {
  console.error('\n🚫 Production Trust Gate FAILED: Runtime code contains mock cheats or forbidden fallbacks.');
  process.exit(1);
} else {
  console.log('\n✅ Production Trust Gate PASSED: Zero runtime mock rot or in-memory cheats detected.');
  process.exit(0);
}
