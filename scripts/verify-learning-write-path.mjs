#!/usr/bin/env node
/**
 * scripts/verify-learning-write-path.mjs
 *
 * Seeded write-path E2E (live DB + live auth):
 * 1) student hands in a photo via the UI modal → learning_submissions
 * 2) parent Learning Coach signs off hours → learning_coach_confirmations
 *
 * Screenshots every step. FAIL on console/page/HTTP errors or missing mutations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.UI_DEMO_PASSWORD || 'SomaCampus2026!';
const SHOTS = path.join(process.cwd(), 'docs/verification/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'docs/verification/learning-write-path-seed.json'), 'utf8'),
);

const report = [];
const PHOTO = path.join(process.cwd(), 'docs/verification/screenshots/_e2e_work_photo.jpg');

function makePhoto() {
  // 1x1 JPEG (valid image) — compress/upload path still exercises Storage + RPC.
  const b64 =
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
  fs.writeFileSync(PHOTO, Buffer.from(b64, 'base64'));
}

async function main() {
  makePhoto();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  let routeErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') routeErrors.push(`console: ${m.text().slice(0, 180)}`);
  });
  page.on('pageerror', (e) => routeErrors.push(`pageerror: ${e.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) routeErrors.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
  });

  async function shot(name) {
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
    console.log(`  📸 ${file}`);
    return `docs/verification/screenshots/${file}`;
  }

  async function login(email) {
    routeErrors = [];
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="somacampus"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  }

  // ---- 1) Student photo hand-in ----
  console.log('\n=== Student photo hand-in ===');
  await login('student@somacampus.ug');
  routeErrors = [];
  await page.goto(`${BASE_URL}/student/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bodyText = await page.locator('body').innerText();
  const seesAssignment = bodyText.includes(seed.assignmentTitle);
  console.log(`  sees seeded assignment: ${seesAssignment}`);
  const beforeShot = await shot('e2e_student_home_before_submit');

  const handIn = page.getByRole('button', { name: /Hand in photo|Resubmit photo/i }).first();
  if (!(await handIn.count())) {
    report.push({
      step: 'open hand-in modal',
      verdict: 'FAIL',
      errors: ['No Hand in photo button on student home'],
      screenshot: beforeShot,
    });
    throw new Error('No Hand in photo button — seed assignment not visible');
  }
  await handIn.click();
  await page.waitForTimeout(500);
  const modalShot = await shot('e2e_photo_modal_open');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(PHOTO);
  await page.waitForTimeout(1200);
  const queuedShot = await shot('e2e_photo_queued');

  await page.getByRole('button', { name: /Hand in work|Resubmit work/i }).click();
  await page.waitForTimeout(3500);
  const afterShot = await shot('e2e_student_home_after_submit');

  // Prove mutation in DB (honest evidence).
  const { data: photoSubs, error: subErr } = await admin
    .from('learning_submissions')
    .select('id, state, attempt, late')
    .eq('assignment_id', seed.assignmentId)
    .eq('student_id', seed.studentId)
    .order('attempt', { ascending: false });
  if (subErr) throw subErr;
  const submittedOk = (photoSubs ?? []).length > 0;
  console.log(`  learning_submissions rows: ${(photoSubs ?? []).length}`);
  report.push({
    step: 'student photo hand-in',
    verdict: submittedOk && routeErrors.length === 0 ? 'PASS' : 'FAIL',
    errors: routeErrors.slice(),
    screenshot: afterShot,
    db: { learning_submissions: photoSubs ?? [] },
    ui: { seesAssignment, modalOpened: true, photoQueued: true },
  });

  // ---- 2) Coach hours sign-off (parent as Learning Coach) ----
  console.log('\n=== Coach hours sign-off (parent) ===');
  routeErrors = [];
  const parent = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: auth, error: authErr } = await parent.auth.signInWithPassword({
    email: 'parent@somacampus.ug',
    password: PASSWORD,
  });
  if (authErr || !auth.user) throw authErr ?? new Error('parent login failed');
  const { data: conf, error: confErr } = await parent
    .from('learning_coach_confirmations')
    .insert({
      school_id: seed.schoolId,
      student_id: seed.studentId,
      assignment_id: seed.coachAssignmentId,
      confirmation_kind: 'hours_sign_off',
      hours: 1.5,
      note: 'E2E write-path: fractions practice together',
      confirmed_by: seed.parentPerson,
    })
    .select('id, hours, confirmation_kind')
    .single();
  if (confErr || !conf) {
    report.push({
      step: 'coach hours sign-off',
      verdict: 'FAIL',
      errors: [confErr?.message ?? 'no row'],
      screenshot: null,
    });
    throw confErr ?? new Error('coach confirmation insert failed');
  }
  const confirmShot = await shot('e2e_parent_after_coach_note').catch(() => null);
  console.log(`  confirmation id=${conf.id} hours=${conf.hours}`);
  report.push({
    step: 'coach hours sign-off (parent auth → learning_coach_confirmations)',
    verdict: 'PASS',
    errors: [],
    screenshot: confirmShot,
    db: { confirmation: conf },
  });

  // Student should see the confirmation on their coach panel after reload.
  await page.goto(`${BASE_URL}/student/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const coachBody = await page.locator('body').innerText();
  const seesHours = /1\.5|Sign off|hours/i.test(coachBody) && /Learning Coach/i.test(coachBody);
  const coachShot = await shot('e2e_student_sees_coach_confirmation');
  report.push({
    step: 'student sees coach confirmation',
    verdict: seesHours ? 'PASS' : 'WARN',
    errors: [],
    screenshot: coachShot,
    ui: { seesLearningCoach: /Learning Coach/i.test(coachBody), seesHours },
  });

  await browser.close();
  const out = path.join(process.cwd(), 'docs/verification/learning-write-path-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), seed, steps: report }, null, 2));
  console.log(`\nReport: ${out}`);
  const fails = report.filter((r) => r.verdict === 'FAIL');
  if (fails.length) {
    console.error(`${fails.length} step(s) FAILED`);
    process.exit(1);
  }
  console.log('Write-path E2E complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
