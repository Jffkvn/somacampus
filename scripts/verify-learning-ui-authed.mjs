#!/usr/bin/env node
/**
 * scripts/verify-learning-ui-authed.mjs
 *
 * Signed-in P0/P1 UI confirmation (student + teacher).
 * Records screenshots per step. FAIL on console/page/HTTP errors.
 * Credentials: demo personas from LoginPage (same as auth-login tests).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.UI_DEMO_PASSWORD || 'SomaCampus2026!';
const SHOTS = path.join(process.cwd(), 'docs/verification/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const report = [];

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  let routeErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') routeErrors.push(`console: ${msg.text().slice(0, 180)}`);
  });
  page.on('pageerror', (err) => routeErrors.push(`pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) {
      routeErrors.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  async function shot(name) {
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
    console.log(`  📸 ${file}`);
    return `docs/verification/screenshots/${file}`;
  }

  async function record(step, screenshot, extra = {}) {
    const verdict = routeErrors.length ? 'FAIL' : 'PASS';
    report.push({ step, verdict, errors: routeErrors.slice(), screenshot, ...extra });
    console.log(`  => ${verdict}${routeErrors.length ? ` (${routeErrors.length} errors)` : ''}`);
    routeErrors.forEach((e) => console.log(`     ${e}`));
  }

  async function login(email) {
    routeErrors = [];
    console.log(`\n--- Login ${email} ---`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="somacampus"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    const shotPath = await shot(`learn_login_${email.split('@')[0]}`);
    const url = page.url();
    await record(`Login ${email}`, shotPath, { landedOn: url });
  }

  await login('student@somacampus.ug');
  routeErrors = [];
  console.log('\n--- Student home golden path ---');
  await page.goto(`${BASE_URL}/student/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const body = (await page.locator('body').innerText()).slice(0, 2500);
  const hasCockpit = /Progress|Overdue|Due soon|Hand in|Learning/i.test(body);
  const hasCoach = /Learning Coach/i.test(body);
  const hasOffice = /Office hours/i.test(body);
  const hasCatchUp = /catch-up|Catch-up/i.test(body);
  console.log(`  cockpit=${hasCockpit} coach=${hasCoach} office=${hasOffice} catchUp=${hasCatchUp}`);
  const shotPath = await shot('learn_student_home_authed');
  await record('Student home panels', shotPath, {
    assertions: { hasCockpit, hasCoach, hasOffice, hasCatchUp },
  });

  // Try open photo hand-in if a Hand in button exists.
  routeErrors = [];
  const handIn = page.getByRole('button', { name: /Hand in photo|Resubmit photo|Hand in your work/i }).first();
  if (await handIn.count()) {
    await handIn.click();
    await page.waitForTimeout(600);
    const modalShot = await shot('learn_student_photo_submit_modal');
    const hasCamera = (await page.getByRole('button', { name: /Take photo/i }).count()) > 0;
    await record('Photo hand-in modal', modalShot, { assertions: { hasCamera } });
  } else {
    report.push({
      step: 'Photo hand-in modal',
      verdict: 'SKIPPED_NO_OPEN_WORK',
      errors: [],
      screenshot: null,
      note: 'No open assignment row with Hand in button (empty roster is honest).',
    });
    console.log('  => SKIPPED_NO_OPEN_WORK');
  }

  // Fresh context for teacher (clear student session).
  await context.clearCookies();
  await login('teacher@somacampus.ug');
  routeErrors = [];
  console.log('\n--- Teacher today marking / at-risk ---');
  await page.goto(`${BASE_URL}/teacher/today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const tbody = (await page.locator('body').innerText()).slice(0, 2500);
  const hasMarking = /Marking queue|To mark/i.test(tbody);
  const hasRisk = /At-risk|at-risk/i.test(tbody);
  console.log(`  marking=${hasMarking} atRisk=${hasRisk}`);
  const tShot = await shot('learn_teacher_today_authed');
  await record('Teacher marking/at-risk', tShot, {
    assertions: { hasMarking, hasRisk },
  });

  await browser.close();
  const out = path.join(process.cwd(), 'docs/verification/learning-ui-authed-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), steps: report }, null, 2));
  console.log(`\nReport: ${out}`);
  const fails = report.filter((r) => r.verdict === 'FAIL');
  if (fails.length) {
    console.error(`${fails.length} step(s) FAILED`);
    process.exit(1);
  }
  console.log('Signed-in UI confirmation complete.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
