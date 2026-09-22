#!/usr/bin/env node
/** P2B-1 signed-in UI confirmation (teacher role). */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.UI_DEMO_PASSWORD || 'SomaCampus2026!';
const WHO = process.env.ANALYTICS_WHO || 'student@somacampus.ug';
const SHOTS = path.join(process.cwd(), 'docs/verification/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const report = [];

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="somacampus"]', 'teacher@somacampus.ug');
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${BASE_URL}/intelligence/learner?who=${encodeURIComponent(WHO)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  const hasClaims = /Claims with evidence|Not enough evidence|Average score|Scored work/i.test(body);
  const hasEvidenceList = /learning_result/i.test(body);
  const shotName = 'p2b1_analytics_teacher.png';
  await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: true });
  console.log(`  📸 ${shotName}`);

  report.push({
    step: 'teacher evidence-cited analytics',
    verdict: hasClaims && !errs.length ? 'PASS' : 'FAIL',
    errors: errs.slice(),
    screenshot: `docs/verification/screenshots/${shotName}`,
    ui: { hasClaims, hasEvidenceList },
  });

  await browser.close();
  const out = path.join(process.cwd(), 'docs/verification/p2b1-ui-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), steps: report }, null, 2));
  console.log(`\nReport: ${out}`);
  if (report.some((r) => r.verdict === 'FAIL')) process.exit(1);
  console.log('P2B-1 UI complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
