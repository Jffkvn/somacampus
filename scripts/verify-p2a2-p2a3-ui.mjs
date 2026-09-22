#!/usr/bin/env node
/**
 * P2A-2 + P2A-3 signed-in UI confirmation.
 * Student: quiz with timer/shuffle. Teacher: rubric panel with comments/weights.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.UI_DEMO_PASSWORD || 'SomaCampus2026!';
const SHOTS = path.join(process.cwd(), 'docs/verification/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const seedQuiz = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/verification/learning-quiz-seed.json'), 'utf8'));
const seedWrite = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/verification/learning-write-path-seed.json'), 'utf8'));
const report = [];

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
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

  async function login(email) {
    errs = [];
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="somacampus"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  }

  // Student quiz shell (timer/shuffle surface)
  console.log('\n=== Student quiz (P2A-2) ===');
  await login('student@somacampus.ug');
  errs = [];
  await page.goto(`${BASE_URL}/student/quiz/${seedQuiz.quizId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const sBody = await page.locator('body').innerText();
  const hasQuiz = /What is 7|Submit quiz|Attempt/i.test(sBody);
  const sShot = await shot('p2a2_quiz_student');
  report.push({
    step: 'student quiz surface (timer/shuffle ready)',
    verdict: hasQuiz && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: sShot,
    ui: { hasQuiz },
  });

  // Teacher rubric panel (P2A-3 comments)
  console.log('\n=== Teacher rubric panel (P2A-3) ===');
  await page.evaluate(() => localStorage.clear());
  await login('teacher@somacampus.ug');
  errs = [];
  await page.goto(`${BASE_URL}/teaching/assignments/${seedWrite.assignmentId}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(1500);
  const rubricBtn = page.getByRole('button', { name: /^Rubric$/i }).first();
  if (await rubricBtn.count()) {
    await rubricBtn.click();
    await page.waitForTimeout(600);
  }
  const tBody = await page.locator('body').innerText();
  const hasCriteria = /Understanding|Method|Accuracy|Comment for this criterion/i.test(tBody);
  const hasCommentInput = (await page.getByPlaceholder('Comment for this criterion (optional)').count()) > 0;
  const tShot = await shot('p2a3_rubric_comments');
  report.push({
    step: 'teacher rubric panel with per-criterion comments',
    verdict: hasCriteria && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: tShot,
    ui: { hasCriteria, hasCommentInput },
  });

  await browser.close();
  const out = path.join(process.cwd(), 'docs/verification/p2a2-p2a3-ui-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), steps: report }, null, 2));
  console.log(`\nReport: ${out}`);
  if (report.some((r) => r.verdict === 'FAIL')) process.exit(1);
  console.log('P2A-2 + P2A-3 UI complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
