#!/usr/bin/env node
/** P2A-4 signed-in UI confirmation (student + teacher shell). */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.UI_DEMO_PASSWORD || 'SomaCampus2026!';
const SHOTS = path.join(process.cwd(), 'docs/verification/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/verification/learning-assessment-pack-seed.json'), 'utf8'));
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

  console.log('\n=== Student assessment pack ===');
  await login('student@somacampus.ug');
  errs = [];
  await page.goto(`${BASE_URL}/assessments/pack/${seed.packId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  const hasRollup = /Objective rollup|Pack items/i.test(body);
  const hasItem = /Deterministic quiz|Fractions photo/i.test(body);
  const sShot = await shot('p2a4_assessment_pack_student');
  report.push({
    step: 'student assessment pack + objective rollup',
    verdict: hasRollup && hasItem && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: sShot,
    ui: { hasRollup, hasItem },
  });

  console.log('\n=== Teacher shell ===');
  await page.evaluate(() => localStorage.clear());
  await login('teacher@somacampus.ug');
  errs = [];
  await page.goto(`${BASE_URL}/teacher/today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const tShot = await shot('p2a4_teacher_shell');
  report.push({
    step: 'teacher shell after pack write',
    verdict: errs.length ? 'FAIL' : 'PASS',
    errors: errs.slice(),
    screenshot: tShot,
  });

  await browser.close();
  const out = path.join(process.cwd(), 'docs/verification/p2a4-ui-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), seed, steps: report }, null, 2));
  console.log(`\nReport: ${out}`);
  if (report.some((r) => r.verdict === 'FAIL')) process.exit(1);
  console.log('P2A-4 UI complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
