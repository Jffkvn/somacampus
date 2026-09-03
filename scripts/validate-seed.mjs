#!/usr/bin/env node
/**
 * validate-seed.mjs — static checks for supabase/seed.sql
 *
 * Catches (exit 1):
 *   1. Malformed UUIDs (wrong group lengths, non-hex) anywhere in the file.
 *   2. Duplicate primary-key ids within one table's INSERTs (would silently
 *      hit ON CONFLICT DO NOTHING and hide mistakes).
 *   3. Dangling foreign keys: any UUID in a *_id column that is never defined
 *      as an `id` in any INSERT in the file.
 *
 * Usage: node scripts/validate-seed.mjs [path/to/seed.sql]
 */
import fs from 'node:fs';

const file = process.argv[2] ?? 'supabase/seed.sql';
const raw = fs.readFileSync(file, 'utf8');

// Strip -- line comments (naive: seed.sql has no '--' inside string literals).
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const errors = [];

// --- 1. Malformed UUIDs: find anything UUID-shaped and verify strictly ---
const STRICT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Candidate: 5 dash-separated alnum groups that look like an attempted UUID.
const candidateRe = /[0-9a-z]{4,12}(?:-[0-9a-z]{1,13}){4}/gi;
for (const m of sql.matchAll(candidateRe)) {
  if (!STRICT_UUID.test(m[0])) {
    const line = raw.slice(0, m.index).split('\n').length;
    errors.push(`malformed UUID '${m[0]}' (${file}:${line})`);
  }
}

// --- 2 & 3. Parse INSERTs: tokenize VALUES tuples with quote/paren awareness ---
function splitTuples(valuesSrc) {
  const tuples = [];
  let depth = 0;
  let current = '';
  let inStr = false;
  for (let i = 0; i < valuesSrc.length; i++) {
    const ch = valuesSrc[i];
    if (inStr) {
      current += ch;
      if (ch === "'") {
        if (valuesSrc[i + 1] === "'") {
          current += valuesSrc[++i]; // escaped ''
        } else {
          inStr = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inStr = true;
      current += ch;
      continue;
    }
    if (ch === '(') {
      if (depth === 0) current = '';
      else current += ch;
      depth++;
      continue;
    }
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        tuples.push(current);
        current = '';
      } else {
        current += ch;
      }
      continue;
    }
    if (depth >= 1) current += ch;
  }
  return tuples;
}

function splitValues(tupleSrc) {
  const vals = [];
  let current = '';
  let inStr = false;
  let depth = 0;
  for (let i = 0; i < tupleSrc.length; i++) {
    const ch = tupleSrc[i];
    if (inStr) {
      current += ch;
      if (ch === "'") {
        if (tupleSrc[i + 1] === "'") current += tupleSrc[++i];
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") {
      inStr = true;
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      vals.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  vals.push(current.trim());
  return vals;
}

const unquote = (v) => (v.startsWith("'") && v.endsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v);

// table -> { ids: Map<id, count>, cols per insert }
const tables = new Map();
// every (table, col, value) where col ends in _id and value is a UUID
const references = [];

const insertRe = /INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)(?=ON CONFLICT|;)/gi;
for (const m of sql.matchAll(insertRe)) {
  const [, table, colsSrc, valuesSrc] = m;
  const cols = colsSrc.split(',').map((c) => c.trim());
  if (!tables.has(table)) tables.set(table, new Map());
  for (const tuple of splitTuples(valuesSrc)) {
    const vals = splitValues(tuple);
    if (vals.length !== cols.length) {
      errors.push(`${table}: row has ${vals.length} values but ${cols.length} columns`);
      continue;
    }
    cols.forEach((col, i) => {
      const val = unquote(vals[i]);
      if (col === 'id' && STRICT_UUID.test(val)) {
        const ids = tables.get(table);
        ids.set(val, (ids.get(val) ?? 0) + 1);
      } else if (col.endsWith('_id') && STRICT_UUID.test(val)) {
        references.push({ table, col, val });
      }
    });
  }
}

// --- 2. Duplicate ids ---
const allIds = new Set();
for (const [table, ids] of tables) {
  for (const [id, count] of ids) {
    allIds.add(id);
    if (count > 1) errors.push(`${table}: duplicate id '${id}' x${count} (second insert silently skipped by ON CONFLICT DO NOTHING)`);
  }
}

// --- 3. Dangling FKs ---
for (const { table, col, val } of references) {
  if (!allIds.has(val)) errors.push(`${table}.${col} references unknown id '${val}' (not defined as any id in seed)`);
}

if (errors.length > 0) {
  console.error(`seed validation FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

let idCount = 0;
for (const ids of tables.values()) idCount += ids.size;
console.log(`seed validation OK: ${tables.size} tables, ${idCount} ids, ${references.length} fk references checked.`);
