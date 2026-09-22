#!/usr/bin/env node
/**
 * P2C-1 signed-in UI confirmation — teacher (can comment) + parent (read-only).
 * Screenshots every step. FAIL on console/page/HTTP errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.UI_DEMO_PASSWORD || 'SomaCampus2026!';
const WHO = process.env.REPORT_WHO || 'student@somacampus.ug';
const SHOTS = path.join(process.cwd(), 'docs/verification/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
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

  // Teacher: report card with comment box
  console.log('\n=== Teacher report card ===');
  await login('teacher@somacampus.ug');
  errs = [];
  await page.goto(`${BASE_URL}/reports/learner?who=${encodeURIComponent(WHO)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(2000);
  const tBody = await page.locator('body').innerText();
  const hasTitle = /Report card/i.test(tBody);
  const hasComment = (await page.locator('textarea').count()) > 0;
  const hasHonestEmpty = /Not enough scored work|Average|evidence/i.test(tBody);
  const tShot = await shot('p2_report_teacher');
  report.push({
    step: 'teacher opens report card',
    verdict: hasTitle && hasComment && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: tShot,
    ui: { hasTitle, hasComment, hasHonestEmpty },
  });

  // Parent: read-only
  console.log('\n=== Parent report card ===');
  await page.evaluate(() => localStorage.clear());
  await login('parent@somacampus.ug');
  errs = [];
  await page.goto(`${BASE_URL}/parent/reports?who=${encodeURIComponent(WHO)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(2000);
  const pBody = await page.locator('body').innerText();
  const parentTitle = /Report card/i.test(pBody);
  const parentNoComment = (await page.locator('textarea').count()) === 0;
  const pShot = await shot('p2_report_parent');
  report.push({
    step: 'parent opens report card (read-only)',
    verdict: parentTitle && parentNoComment && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: pShot,
    ui: { parentTitle, parentNoComment },
  });

  await browser.close();
  const out = path.join(process.cwd(), 'docs/verification/p2-report-ui-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), steps: report }, null, 2));
  console.log(`\nReport: ${out}`);
  if (report.some((r) => r.verdict === 'FAIL')) process.exit(1);
  console.log('P2C-1 report UI complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
