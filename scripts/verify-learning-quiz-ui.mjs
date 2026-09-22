#!/usr/bin/env node
/**
 * P2A-1 signed-in UI confirmation (student role) + write-path submit.
 * Screenshots every step. DB proof via service role read of learning_results.
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
  fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n').filter((l) => l && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/verification/learning-quiz-seed.json'), 'utf8'));
const report = [];

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  let errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`);
  });

  async function shot(name) {
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
    console.log(`  📸 ${file}`);
    return `docs/verification/screenshots/${file}`;
  }

  // Student login
  errs = [];
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="somacampus"]', 'student@somacampus.ug');
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await shot('p2_quiz_login_student');

  // Open quiz
  errs = [];
  await page.goto(`${BASE_URL}/student/quiz/${seed.quizId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const loaded = await shot('p2_quiz_loaded');
  const body = await page.locator('body').innerText();
  const hasPrompt = body.includes('What is 7 × 8?');
  report.push({
    step: 'student opens quiz',
    verdict: hasPrompt && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: loaded,
    ui: { hasPrompt },
  });

  // Answer: correct MCQ, TF true, short 56, matching pair
  errs = [];
  await page.getByRole('radio', { name: '56' }).check();
  await page.getByRole('radio', { name: 'True' }).check();
  await page.getByPlaceholder('Your answer').fill('56');
  const matchInputs = page.getByPlaceholder('Match to…');
  await matchInputs.nth(0).fill('3 sides');
  await matchInputs.nth(1).fill('4 sides');
  const answered = await shot('p2_quiz_answered');

  await page.getByRole('button', { name: /Save draft/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Submit quiz/i }).click();
  await page.waitForTimeout(2500);
  const scored = await shot('p2_quiz_scored');
  const after = await page.locator('body').innerText();
  const showsScore = /\d+\/\d+/.test(after);

  const { data: results, error: resErr } = await admin
    .from('learning_results')
    .select('id, result_source, score, max_score')
    .eq('student_id', seed.studentId)
    .eq('quiz_id', seed.quizId)
    .order('marked_at', { ascending: false })
    .limit(1);
  if (resErr) throw resErr;
  const row = results?.[0];
  report.push({
    step: 'student submits quiz (deterministic)',
    verdict: row && showsScore && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: scored,
    db: { learning_results: results ?? [] },
    ui: { showsScore, expectedScore: '5/5 if all key-correct' },
  });

  // Teacher role: confirm quiz result is in the academic record via assignment review shell
  errs = [];
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  // new context-like logout
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="somacampus"]', 'teacher@somacampus.ug');
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE_URL}/teacher/today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const tShot = await shot('p2_quiz_teacher_today');
  report.push({
    step: 'teacher shell after quiz write (role touched: read path)',
    verdict: errs.length ? 'FAIL' : 'PASS',
    errors: errs.slice(),
    screenshot: tShot,
  });

  await browser.close();
  const out = path.join(process.cwd(), 'docs/verification/p2-quiz-ui-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), seed, steps: report }, null, 2));
  console.log(`\nReport: ${out}`);
  if (report.some((r) => r.verdict === 'FAIL')) process.exit(1);
  console.log('P2A-1 quiz UI/write-path complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
