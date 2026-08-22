#!/usr/bin/env node
// Applies lib/schema.sql to the database in DATABASE_URL.
//
// Exists because the schema is written to be re-runnable — every statement is
// `create table if not exists` / `add column if not exists` / guarded DDL — so
// bringing a database up to date is just "run the whole file again". That
// normally means `psql -f lib/schema.sql`, but psql isn't installed by default
// on macOS, whereas Node and the Postgres driver already are (the app depends
// on them), so this does the same job with no extra tooling.
//
// Usage:
//   npx vercel env pull .env.local     # once, to get DATABASE_URL
//   node scripts/migrate.mjs           # apply
//   node scripts/migrate.mjs --dry-run # list what would run, touch nothing
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes('--dry-run');

// Minimal .env reader — avoids a dotenv dependency for one file.
function loadEnv() {
  const p = path.join(root, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

// Splits on semicolons, but only those at the top level: a semicolon inside a
// single-quoted string or a $$-quoted block (schema.sql has one `do $$ ... $$;`
// guard) is part of the statement, not a terminator. Naive splitting corrupts
// that block into fragments that each fail.
function splitStatements(sqlText) {
  const out = [];
  let buf = '';
  let inSingle = false, inDollar = false, inLineComment = false, inBlockComment = false;
  for (let i = 0; i < sqlText.length; i++) {
    const c = sqlText[i], next = sqlText[i + 1];
    if (inLineComment) { buf += c; if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { buf += c; if (c === '*' && next === '/') { buf += next; i++; inBlockComment = false; } continue; }
    if (!inSingle && !inDollar && c === '-' && next === '-') { inLineComment = true; buf += c; continue; }
    if (!inSingle && !inDollar && c === '/' && next === '*') { inBlockComment = true; buf += c; continue; }
    if (!inDollar && c === "'") { inSingle = !inSingle; buf += c; continue; }
    if (!inSingle && c === '$' && next === '$') { inDollar = !inDollar; buf += '$$'; i++; continue; }
    if (c === ';' && !inSingle && !inDollar) { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  // Drop fragments that are only comments/whitespace.
  return out.filter((s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0);
}

function label(stmt) {
  const flat = stmt.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > 96 ? flat.slice(0, 96) + '…' : flat;
}

const statements = splitStatements(fs.readFileSync(path.join(root, 'lib', 'schema.sql'), 'utf8'));
console.log(`${statements.length} statements in lib/schema.sql`);

// Checked before the credential, so --dry-run works with no database access.
if (dryRun) {
  statements.forEach((s, i) => console.log(String(i + 1).padStart(3) + '  ' + label(s)));
  console.log('\nDry run — nothing was executed.');
  process.exit(0);
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('DATABASE_URL is missing or not a postgres:// URL.');
  console.error('Run:  npx vercel env pull .env.local --environment=production');
  process.exit(1);
}

const sql = neon(url);
let ok = 0;
const failures = [];
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  try {
    await sql.query(stmt);
    ok++;
  } catch (err) {
    failures.push({ n: i + 1, stmt: label(stmt), message: err.message });
    console.error(`  ✗ [${i + 1}] ${label(stmt)}\n      ${err.message}`);
  }
}

console.log(`\n${ok}/${statements.length} statements applied.`);
if (failures.length) {
  console.error(`${failures.length} failed (listed above).`);
  process.exit(1);
}
console.log('Schema is up to date.');
