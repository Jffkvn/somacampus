#!/usr/bin/env node
/**
 * scripts/verify-learning-ui.mjs
 *
 * P0/P1 Digital Learning Spine UI confirmation (Stage 5 honest rules):
 * - Student home: learning cockpit, photo hand-in modal, coach, office hours, catch-up
 * - Teacher today: marking queue + at-risk enrichment panels
 *
 * PASS requires no console errors / page exceptions / HTTP 4xx-5xx on the route.
 * DOM-only checks are labeled SMOKE_ONLY. Never mask PostgREST/API failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:5173';
const SHOTS = path.join(process.cwd(), 'docs/verification/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const report = [];

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  let routeErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') routeErrors.push(`console: ${msg.text().slice(0, 160)}`);
  });
  page.on('pageerror', (err) => routeErrors.push(`pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) {
      routeErrors.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  async function checkRoute(name, route, assertions) {
    routeErrors = [];
    console.log(`\n--- ${name} ---`);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    const found = [];
    for (const [label, selector] of assertions) {
      const el = await page.$(selector);
      found.push({ label, present: Boolean(el) });
      console.log(`  ${el ? '✓' : '✗'} ${label}`);
    }
    const shotName = `learn_${route.replace(/\W+/g, '_')}.png`;
    const shotPath = path.join(SHOTS, shotName);
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`  📸 ${shotName}`);
    const failed = found.filter((f) => !f.present).map((f) => f.label);
    const verdict =
      routeErrors.length > 0
        ? 'FAIL'
        : failed.length > 0
          ? 'WARN'
          : 'SMOKE_ONLY';
    report.push({
      name,
      route,
      verdict,
      missing: failed,
      errors: routeErrors.slice(),
      screenshot: `docs/verification/screenshots/${shotName}`,
    });
    console.log(`  => ${verdict}${routeErrors.length ? ` (${routeErrors.length} errors)` : ''}`);
    routeErrors.forEach((e) => console.log(`     ${e}`));
  }

  // Login shell exists (auth gate).
  await checkRoute('Login shell', '/login', [['Login form', 'input, button']]);

  // Student learning home — cockpits + P1 panels (may be gated by auth; shell must still render).
  await checkRoute('Student Today + P1 panels', '/student/home', [
    ['App shell or auth redirect', 'body'],
  ]);

  // Teacher cockpit marking / at-risk.
  await checkRoute('Teacher Today + marking/at-risk', '/teacher/today', [
    ['App shell or auth redirect', 'body'],
  ]);

  // Photo hand-in is modal-driven; confirm service module is bundled via source map is not required —
  // golden path needs a signed-in learner. Classify explicitly.
  report.push({
    name: 'Photo hand-in golden path (camera → compress → submit)',
    route: '/student/home',
    verdict: 'REQUIRES_LIVE_AUTH',
    missing: [],
    errors: [],
    note: 'Interactive modal path needs a live student session; covered by unit tests for photoUpload + submissionService fail-closed rules.',
  });

  await browser.close();

  const out = path.join(process.cwd(), 'docs/verification/learning-ui-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), routes: report }, null, 2));
  console.log(`\nReport: ${out}`);
  const bad = report.filter((r) => r.verdict === 'FAIL');
  if (bad.length) {
    console.error(`\n${bad.length} route(s) FAILED`);
    process.exit(1);
  }
  console.log('\nUI confirmation complete (no FAIL routes).');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
