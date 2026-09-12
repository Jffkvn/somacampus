#!/usr/bin/env node
/**
 * check-service-columns.mjs — Service↔Schema column drift guard
 *
 * Catches (exit 1) service code selecting columns that no migration defines:
 *   1. Builds table -> columns from supabase/migrations/*.sql
 *      (CREATE TABLE column defs + ALTER TABLE ... ADD COLUMN).
 *   2. Scans src/**\/*.{ts,tsx} for .from('<table>').select('<cols>') — including
 *      columns held in `<NAME>_SELECT`-style string constants.
 *   3. Flags any selected top-level column missing from the migration map for
 *      that table. Embedded relations (person:people!fk(...)) and unknown
 *      tables/views are skipped (cannot verify views offline).
 *
 * This is the automated guard for the phantom-column defect class
 * (activity_enrolments.student_name, fee_structures.updated_at, ...).
 *
 * Usage: node check-service-columns.mjs [--src dir] [--migrations dir]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, getArg('--src', 'src'));
const MIGRATIONS_DIR = path.resolve(ROOT, getArg('--migrations', 'supabase/migrations'));

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__pycache__') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
};

// ---------------------------------------------------------------- migrations
const tableColumns = new Map(); // table -> Set<column>
const ensure = (t) => {
  if (!tableColumns.has(t)) tableColumns.set(t, new Set());
  return tableColumns.get(t);
};

const TYPE_RE = /^\s*([a-zA-Z_]\w*)\s+(UUID|TEXT|NUMERIC|INT|INTEGER|BIGINT|SMALLINT|BOOLEAN|BOOL|TIMESTAMPTZ|TIMESTAMP|DATE|TIME\b|JSONB|JSON|REAL|DOUBLE PRECISION|VARCHAR|CHARACTER)/i;

function parseCreateTable(sql, file) {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_]\w*)\s*\(/gi;
  for (const m of sql.matchAll(re)) {
    const table = m[1];
    // take the paren block
    let depth = 0;
    const cols = ensure(table);
    for (let i = m.index + m[0].length - 1; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      } else if (depth >= 1) {
        // detect column definition lines crudely: at depth 1, an identifier
        // starting a line followed by a known type keyword.
      }
    }
    // Simpler: slice the block and scan lines
    const blockEnd = (() => {
      depth = 0;
      for (let i = m.index + m[0].length - 1; i < sql.length; i++) {
        if (sql[i] === '(') depth++;
        else if (sql[i] === ')') {
          depth--;
          if (depth === 0) return i;
        }
      }
      return sql.length;
    })();
    const block = sql.slice(m.index + m[0].length, blockEnd);
    for (const line of block.split('\n')) {
      const cm = line.match(TYPE_RE);
      if (cm) cols.add(cm[1]);
    }
  }
}

function parseAlterAddColumn(sql, file) {
  // ALTER statements may add several columns in one statement
  // (ADD COLUMN a TEXT, ADD COLUMN b TEXT, ...). Attribute every ADD COLUMN
  // to the most recent ALTER TABLE target.
  let currentTable = null;
  const alterRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_]\w*)/gi;
  const addRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_]\w*)/gi;
  for (const line of sql.split('\n')) {
    const am = alterRe.exec(line) || (line.includes('ALTER TABLE') ? null : null);
    if (am) currentTable = am[1];
    if (!currentTable) continue;
    if (/ADD\s+COLUMN/i.test(line)) {
      for (const m of line.matchAll(addRe)) {
        ensure(currentTable).add(m[1]);
      }
    }
    if (/;\s*$/.test(line)) currentTable = null; // statement ends
  }
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error(`migrations dir not found: ${MIGRATIONS_DIR}`);
  process.exit(1);
}
const migFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
for (const f of migFiles) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
  parseCreateTable(sql, f);
  parseAlterAddColumn(sql, f);
}

// ------------------------------------------------------------------- sources
// column list -> top-level column names (drops embeds, casts, aliases)
function topColumns(selectStr) {
  const out = [];
  let depth = 0;
  let cur = '';
  const parts = [];
  for (const ch of selectStr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  for (const raw of parts) {
    let col = raw.trim();
    if (!col || col === '*') continue;
    if (col.includes('(') || col.includes(')')) continue; // computed/embedded
    if (col.includes(':')) continue; // embed alias:table!fk(...)
    col = col.split(/\s+as\s+/i)[0].trim();
    col = col.split('::')[0].trim();
    col = col.replace(/^["'`] | ["'`]$/g, '').trim();
    col = col.replace(/["'`]/g, '').trim();
    if (/^[a-zA-Z_]\w*$/.test(col)) out.push(col);
  }
  return out;
}

// collect per-file `<NAME>_SELECT = '...'` / = `...` string constants —
// scoped PER FILE: several services define the same constant names with
// different column lists.
function collectSelectConstants(src) {
  const perFile = new Map();
  const re = /(?:const|let)\s+([A-Z_0-9]*SELECT[A-Z_0-9]*)\s*(?::\s*string\s*)?=\s*(?:'([^']*)'|`([^`]*)`)/g;
  for (const file of src) {
    const consts = new Map();
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      consts.set(m[1], m[2] ?? m[3] ?? '');
    }
    perFile.set(file, consts);
  }
  return perFile;
}

const errors = [];
const checked = { tables: new Set(), columns: 0 };

function checkSelect(table, selectStr, file, line) {
  if (!tableColumns.has(table)) return; // unknown table or view: skip
  checked.tables.add(table);
  for (const col of topColumns(selectStr)) {
    checked.columns += 1;
    if (!tableColumns.get(table).has(col)) {
      const snippet = selectStr.replace(/\s+/g, ' ').slice(0, 80);
      errors.push(`${table}: service selects '${col}' but no migration defines it (${file}:${line}) [select: "${snippet}…"]`);
    }
  }
}

if (!fs.existsSync(SRC_DIR)) {
  console.error(`src dir not found: ${SRC_DIR}`);
  process.exit(1);
}
const srcFiles = walk(SRC_DIR).filter((f) => !f.includes(`${path.sep}test${path.sep}`) && !f.includes(`${path.sep}fixtures${path.sep}`));
const constantsByFile = collectSelectConstants(srcFiles);

const fromRe = /\.from\(\s*['"`]([a-zA-Z_]\w*)['"`]\s*\)/g;
for (const file of srcFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const froms = [...text.matchAll(fromRe)];
  for (let i = 0; i < froms.length; i++) {
    const m = froms[i];
    const table = m[1];
    // Window ends where the NEXT query builder starts: a neighbouring
    // builder's .select must never be attributed to this .from().
    const windowEnd = i + 1 < froms.length ? froms[i + 1].index : Math.min(text.length, m.index + 2000);
    const after = text.slice(m.index + m[0].length, windowEnd);
    const line = text.slice(0, m.index).split('\n').length;
    const sel = after.match(/\.select\(\s*(`[^`]*`|'[^']*')/);
    if (sel) {
      const raw = sel[1].slice(1, -1);
      checkSelect(table, raw, rel, line);
      continue;
    }
    const varSel = after.match(/\.select\(\s*([A-Z_0-9]*SELECT[A-Z_0-9]*)\s*[,)]/);
    const fileConsts = constantsByFile.get(file);
    if (varSel && fileConsts?.has(varSel[1])) {
      checkSelect(table, fileConsts.get(varSel[1]), rel, line);
    }
  }
}

// ------------------------------------------------------------------- report
if (errors.length > 0) {
  console.error(`service column drift FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `service column drift OK: ${checked.tables.size} tables, ${checked.columns} selected columns verified against ${migFiles.length} migrations.`
);
