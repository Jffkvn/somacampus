#!/usr/bin/env node
/**
 * scripts/verify-browser-playwright.mjs
 *
 * Direct headless Chrome browser verification via Playwright.
 * Traverses SomaCampus operator routes, checks DOM elements, tracks
 * console errors per route, and generates an HONEST verification report.
 *
 * Production Trust Standard:
 * - Traversal checks that only verify element presence without mutating or asserting
 *   DB state are explicitly classified as SMOKE_ONLY.
 * - Any route triggering PostgREST errors (PGRST*), unhandled JS exceptions, or
 *   API 4xx/5xx responses will be marked FAIL/WARN, never masked as PASS.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACTS_DIR = '/Users/jeffadhaya/.gemini/antigravity/brain/99f614c8-8023-4b6f-b3ee-e00d0eda0a9e';
const DOCS_SCREENSHOTS_DIR = path.join(process.cwd(), 'docs/verification/screenshots');
const BASE_URL = 'http://localhost:5173';

fs.mkdirSync(DOCS_SCREENSHOTS_DIR, { recursive: true });

async function run() {
  console.log('=== Starting SomaCampus Playwright Verification (Production Trust Mode) ===');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  const page = await context.newPage();

  const allCollectedErrors = [];
  const allNetworkErrors = [];
  let currentRouteErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      allCollectedErrors.push(text);
      currentRouteErrors.push(text);
      console.warn(`  ⚠️ Console Error: ${text.slice(0, 140)}`);
    }
  });

  page.on('pageerror', (err) => {
    allCollectedErrors.push(err.message);
    currentRouteErrors.push(err.message);
    console.error(`  ❌ Page Exception: ${err.message}`);
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      const url = res.url();
      const status = res.status();
      const method = res.request().method();
      const entry = `HTTP ${status} [${method}] ${url}`;
      allNetworkErrors.push({ status, method, url });
      allCollectedErrors.push(entry);
      currentRouteErrors.push(entry);
      console.warn(`  ⚠️ HTTP Error: ${status} ${method} ${url}`);
    }
  });

  async function saveScreenshot(filename) {
    const artifactPath = path.join(ARTIFACTS_DIR, filename);
    const docsPath = path.join(DOCS_SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: artifactPath, fullPage: false });
    fs.copyFileSync(artifactPath, docsPath);
    console.log(`  📸 Screenshot saved: ${filename}`);
  }

  function startRoute(routeName) {
    console.log(`\n--- Testing: ${routeName} ---`);
    currentRouteErrors = [];
  }

  function evaluateRouteStatus(conditionMet, assertsMutation = false) {
    if (currentRouteErrors.length > 0) {
      return {
        status: 'FAIL (console/runtime errors)',
        errors: [...currentRouteErrors],
      };
    }
    if (!conditionMet) {
      return {
        status: 'FAIL (required DOM element missing)',
        errors: ['Expected DOM content was not found'],
      };
    }
    if (!assertsMutation) {
      return {
        status: 'SMOKE_ONLY',
        detail_note: 'DOM rendered shell successfully; underlying DB data mutation not asserted.',
        errors: [],
      };
    }
    return {
      status: 'PASS',
      detail_note: 'DOM and underlying data mutation verified.',
      errors: [],
    };
  }

  async function switchPersonaViaHeader(roleLabel) {
    console.log(`\n🔄 Switching Dev Persona via TopHeader to "${roleLabel}"...`);
    const previewBtn = page.locator('button[title="Development Persona Preview"]');
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
      await page.waitForTimeout(300);
      const roleBtn = page.locator(`button:has-text("${roleLabel}")`).first();
      if (await roleBtn.isVisible()) {
        await roleBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  }

  const results = [];

  try {
    // 1. Log in via 1-click School Admin demo account
    console.log('\n--- Authenticating as School Admin ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const adminLoginBtn = page.locator('button:has-text("School Admin")').first();
    await adminLoginBtn.click();
    await page.waitForTimeout(3000);
    console.log(`Logged in as School Admin. Current URL: ${page.url()}`);

    // ==========================================
    // SECTION A: ADMIN / PRINCIPAL PERSONA
    // ==========================================

    // 0. Admin Overview Cockpit
    startRoute('0. Admin Overview Cockpit (/admin/overview)');
    await page.goto(`${BASE_URL}/admin/overview`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const adminContent = await page.content();
    const hasAdmin = adminContent.includes('Grace\'s Cambridge Centre') || adminContent.includes('Core Operations & Workflow');
    await saveScreenshot('00_admin_overview_cockpit.png');
    const eval0 = evaluateRouteStatus(hasAdmin);
    results.push({
      id: 0,
      page: 'Admin Overview Cockpit (/admin/overview)',
      role: 'Admin',
      status: eval0.status,
      detail: 'Live school registration, academic session, KPI cards, and operational workflows',
      screenshot: '00_admin_overview_cockpit.png',
      errors: eval0.errors,
    });

    // 1. Admissions Wizard
    startRoute('1. Admissions Wizard (/students/new)');
    await page.goto(`${BASE_URL}/students/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const wizardContent = await page.content();
    const hasWizard = wizardContent.includes('Admit Student') || wizardContent.includes('Pupil details');
    await saveScreenshot('01_admissions_wizard.png');
    const eval1 = evaluateRouteStatus(hasWizard);
    results.push({
      id: 1,
      page: 'Admissions Wizard (/students/new)',
      role: 'Admin',
      status: eval1.status,
      detail: 'Multi-step admission wizard with completeness meter',
      screenshot: '01_admissions_wizard.png',
      errors: eval1.errors,
    });

    // 2. Admissions Queue
    startRoute('2. Admissions Queue (/admissions/queue)');
    await page.goto(`${BASE_URL}/admissions/queue`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const queueContent = await page.content();
    const hasQueue = queueContent.includes('Admissions Queue') || queueContent.includes('Applications');
    await saveScreenshot('02_admissions_queue.png');
    const eval2 = evaluateRouteStatus(hasQueue);
    results.push({
      id: 2,
      page: 'Admissions Queue (/admissions/queue)',
      role: 'Admin',
      status: eval2.status,
      detail: 'Candidate review list with Approve & Enroll action',
      screenshot: '02_admissions_queue.png',
      errors: eval2.errors,
    });

    // 3. Staff Directory
    startRoute('3. Staff Directory (/staff)');
    await page.goto(`${BASE_URL}/staff`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const staffContent = await page.content();
    const hasStaff = staffContent.includes('Staff') || staffContent.includes('Faculty');
    await saveScreenshot('03_staff_directory.png');
    const eval3 = evaluateRouteStatus(hasStaff);
    results.push({
      id: 3,
      page: 'Staff Directory (/staff)',
      role: 'Admin',
      status: eval3.status,
      detail: 'Faculty directory with department filters and Add Staff CTA',
      screenshot: '03_staff_directory.png',
      errors: eval3.errors,
    });

    // 4. Staff Hire Wizard
    startRoute('4. Staff Hire Wizard (/staff/new)');
    await page.goto(`${BASE_URL}/staff/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const hireContent = await page.content();
    const hasHire = hireContent.includes('Hire') || hireContent.includes('Onboard');
    await saveScreenshot('04_staff_hire_wizard.png');
    const eval4 = evaluateRouteStatus(hasHire);
    results.push({
      id: 4,
      page: 'Staff Hire Wizard (/staff/new)',
      role: 'Admin',
      status: eval4.status,
      detail: 'Hire wizard with official subject selection',
      screenshot: '04_staff_hire_wizard.png',
      errors: eval4.errors,
    });

    // 5. Staff Dossier Personal
    startRoute('5. Staff Dossier Personal (/staff/:id)');
    await page.goto(`${BASE_URL}/staff/99999999-9999-9999-9999-999999999991`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const dossierContent = await page.content();
    const hasDossier = dossierContent.includes('Personal') || dossierContent.includes('Profile');
    await saveScreenshot('05_staff_dossier_personal.png');
    const eval5 = evaluateRouteStatus(hasDossier);
    results.push({
      id: 5,
      page: 'Staff Dossier - Personal (/staff/:id)',
      role: 'Admin',
      status: eval5.status,
      detail: 'Demographic and employment profile',
      screenshot: '05_staff_dossier_personal.png',
      errors: eval5.errors,
    });

    // 6. Staff Dossier Leave Tab
    startRoute('6. Staff Dossier Leave Tab');
    const leaveBtn = page.locator('button:has-text("Leave"), button:has-text("Balances")').first();
    let leaveClicked = false;
    if (await leaveBtn.isVisible()) {
      await leaveBtn.click();
      await page.waitForTimeout(600);
      leaveClicked = true;
    }
    await saveScreenshot('06_staff_dossier_leave.png');
    const eval6 = evaluateRouteStatus(leaveClicked);
    results.push({
      id: 6,
      page: 'Staff Dossier - Leave Quotas',
      role: 'Admin',
      status: eval6.status,
      detail: 'Leave balances and entitlement quotas',
      screenshot: '06_staff_dossier_leave.png',
      errors: eval6.errors,
    });

    // 7. Staff Dossier Payroll Tab
    startRoute('7. Staff Dossier Payroll Tab');
    const payBtn = page.locator('button:has-text("Payroll")').first();
    let payClicked = false;
    if (await payBtn.isVisible()) {
      await payBtn.click();
      await page.waitForTimeout(600);
      payClicked = true;
    }
    await saveScreenshot('07_staff_dossier_payroll.png');
    const eval7 = evaluateRouteStatus(payClicked);
    results.push({
      id: 7,
      page: 'Staff Dossier - Statutory Compensation',
      role: 'Admin',
      status: eval7.status,
      detail: 'Ugandan statutory PAYE/NSSF profile and bank details',
      screenshot: '07_staff_dossier_payroll.png',
      errors: eval7.errors,
    });

    // 8. Classes Management
    startRoute('8. Classes Management (/classes)');
    await page.goto(`${BASE_URL}/classes`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const classesContent = await page.content();
    const hasClasses = classesContent.includes('Class') || classesContent.includes('Streams');
    await saveScreenshot('08_classes_management.png');
    const eval8 = evaluateRouteStatus(hasClasses);
    results.push({
      id: 8,
      page: 'Classes Management (/classes)',
      role: 'Admin',
      status: eval8.status,
      detail: 'Stage levels, streams, capacity meters, and class teacher assign',
      screenshot: '08_classes_management.png',
      errors: eval8.errors,
    });

    // 9. HR Approvals Cockpit
    startRoute('9. HR Approvals Cockpit (/administration/hr/approvals)');
    await page.goto(`${BASE_URL}/administration/hr/approvals`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const hrContent = await page.content();
    const hasHR = hrContent.includes('Approvals') || hrContent.includes('Leave Requests');
    await saveScreenshot('09_hr_approvals_cockpit.png');
    const eval9 = evaluateRouteStatus(hasHR);
    results.push({
      id: 9,
      page: 'HR Approvals Cockpit (/administration/hr/approvals)',
      role: 'Admin',
      status: eval9.status,
      detail: 'Executive approval queues for leave and advances',
      screenshot: '09_hr_approvals_cockpit.png',
      errors: eval9.errors,
    });

    // 10. School Store & Inventory
    startRoute('10. School Store & Inventory (/administration/inventory)');
    await page.goto(`${BASE_URL}/administration/inventory`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const invContent = await page.content();
    const hasInv = invContent.includes('Store') || invContent.includes('Inventory');
    await saveScreenshot('10_inventory_cockpit.png');
    const eval10 = evaluateRouteStatus(hasInv);
    results.push({
      id: 10,
      page: 'School Store & Inventory (/administration/inventory)',
      role: 'Admin',
      status: eval10.status,
      detail: 'Central store, consumables, goods receipts, and asset custody',
      screenshot: '10_inventory_cockpit.png',
      errors: eval10.errors,
    });

    // 10b. Stock Adjustment Modal with Signed Delta Badge
    startRoute('10b. Stock Adjustment Modal');
    const adjustBtn = page.locator('button:has-text("Adjust")').first();
    let adjustOpened = false;
    try {
      await adjustBtn.waitFor({ state: 'visible', timeout: 4000 });
      await adjustBtn.click();
      await page.waitForTimeout(600);
      adjustOpened = true;
      await saveScreenshot('10b_inventory_adjust_delta.png');
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) await cancelBtn.click();
    } catch (e) {
      console.warn('Adjust button not visible within timeout:', e.message);
    }
    const eval10b = evaluateRouteStatus(adjustOpened);
    results.push({
      id: 10.5,
      page: 'Stock Adjustment Modal (Signed Delta)',
      role: 'Admin',
      status: eval10b.status,
      detail: 'Stock adjustment modal with live calculated signed delta badge',
      screenshot: '10b_inventory_adjust_delta.png',
      errors: eval10b.errors,
    });

    // 11. Master Timetable Draft
    startRoute('11. Master Timetable Draft (/planning/timetable/draft)');
    await page.goto(`${BASE_URL}/planning/timetable/draft`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const ttContent = await page.content();
    const hasTT = ttContent.includes('Timetable') || ttContent.includes('Draft');
    await saveScreenshot('11_timetable_draft.png');
    const eval11 = evaluateRouteStatus(hasTT);
    results.push({
      id: 11,
      page: 'Master Timetable Draft (/planning/timetable/draft)',
      role: 'Admin',
      status: eval11.status,
      detail: 'Header status pill and 5-day active period allocation grid',
      screenshot: '11_timetable_draft.png',
      errors: eval11.errors,
    });

    // 12. School Calendar
    startRoute('12. School Calendar (/calendar)');
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const calContent = await page.content();
    const hasCal = calContent.includes('Calendar') || calContent.includes('Term');
    await saveScreenshot('12_school_calendar.png');
    const eval12 = evaluateRouteStatus(hasCal);
    results.push({
      id: 12,
      page: 'School Calendar (/calendar)',
      role: 'Admin',
      status: eval12.status,
      detail: 'Interactive month view and event creation controls',
      screenshot: '12_school_calendar.png',
      errors: eval12.errors,
    });

    // 13. Expenses Logging
    startRoute('13. Expenses Logging (/finance/expenses)');
    await page.goto(`${BASE_URL}/finance/expenses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const expContent = await page.content();
    const hasExp = expContent.includes('Expense') || expContent.includes('Operating');
    await saveScreenshot('13_expenses_logging.png');
    const eval13 = evaluateRouteStatus(hasExp);
    results.push({
      id: 13,
      page: 'Expenses Logging (/finance/expenses)',
      role: 'Admin',
      status: eval13.status,
      detail: 'Expense log with clean category and term UUID sanitization',
      screenshot: '13_expenses_logging.png',
      errors: eval13.errors,
    });

    // ==========================================
    // SECTION B: TEACHER PERSONA FLOWS
    // ==========================================
    await switchPersonaViaHeader('Teacher');

    // 14. Teacher Today Page
    startRoute('14. Teacher Today (/teacher/today)');
    await page.goto(`${BASE_URL}/teacher/today`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const todayContent = await page.content();
    const hasToday = todayContent.includes('Today') || todayContent.includes('Clock In') || todayContent.includes('Schedule');
    await saveScreenshot('14_teacher_today.png');
    const eval14 = evaluateRouteStatus(hasToday);
    results.push({
      id: 14,
      page: 'Teacher Today (/teacher/today)',
      role: 'Teacher',
      status: eval14.status,
      detail: 'Rapid daily teaching schedule, attendance, and briefing',
      screenshot: '14_teacher_today.png',
      errors: eval14.errors,
    });

    // 15. Bulk Attendance Register
    startRoute('15. Bulk Attendance Register (/teaching/classes/.../attendance)');
    await page.goto(`${BASE_URL}/teaching/classes/55555555-5555-5555-5555-555555555551/attendance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const attContent = await page.content();
    const hasAtt = attContent.includes('Attendance') || attContent.includes('Present');
    await saveScreenshot('15_bulk_attendance_register.png');
    const eval15 = evaluateRouteStatus(hasAtt);
    results.push({
      id: 15,
      page: 'Bulk Attendance Register (/teaching/classes/:id/attendance)',
      role: 'Teacher',
      status: eval15.status,
      detail: 'Mark All Present register with exception toggles',
      screenshot: '15_bulk_attendance_register.png',
      errors: eval15.errors,
    });

    // 16. Resource Library
    startRoute('16. Resource Library (/teaching/resources)');
    await page.goto(`${BASE_URL}/teaching/resources`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const resContent = await page.content();
    const hasRes = resContent.includes('Resource') || resContent.includes('Library');
    await saveScreenshot('16_resource_library.png');
    const eval16 = evaluateRouteStatus(hasRes);
    results.push({
      id: 16,
      page: 'Resource Library (/teaching/resources)',
      role: 'Teacher',
      status: eval16.status,
      detail: 'Clean vertical cards with non-overlapping metadata badges',
      screenshot: '16_resource_library.png',
      errors: eval16.errors,
    });

    // 17. Cambridge AI Teaching Assignment Studio
    startRoute('17. Cambridge Primary AI Assignment Studio (/teaching/assignments/new)');
    await page.goto(`${BASE_URL}/teaching/assignments/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Open AI Cambridge Assist Modal
    const aiAssistBtn = page.locator('button:has-text("AI Cambridge Assist")');
    if ((await aiAssistBtn.count()) > 0) {
      await aiAssistBtn.click();
      await page.waitForTimeout(500);

      // Click Generate Grounded Draft
      const generateBtn = page.locator('button:has-text("Generate Grounded Draft")');
      if ((await generateBtn.count()) > 0) {
        await generateBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    const studioContent = await page.content();
    const hasStudio = studioContent.includes('AI Generated Draft — Human Review Required') && studioContent.includes('Cambridge Goal');
    await saveScreenshot('17_ai_teaching_assignment_studio.png');
    const eval17 = evaluateRouteStatus(hasStudio);
    results.push({
      id: 17,
      page: 'Cambridge AI Assignment Studio (/teaching/assignments/new)',
      role: 'Teacher',
      status: eval17.status,
      detail: '5-Layer curriculum grounding draft with mandatory human-in-the-loop review alert',
      screenshot: '17_ai_teaching_assignment_studio.png',
      errors: eval17.errors,
    });

  } finally {
    await browser.close();
  }

  console.log('\n=== Browser Verification Summary (Honest Trust Gate) ===');
  console.table(
    results.map((r) => ({
      ID: r.id,
      Page: r.page,
      Role: r.role,
      Status: r.status,
      Errors: r.errors?.length || 0,
    })),
  );

  const smokeCount = results.filter((r) => r.status === 'SMOKE_ONLY').length;
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status.startsWith('FAIL')).length;

  console.log(`\nResults Breakdown:`);
  console.log(`  - Verified Full Pass: ${passCount}`);
  console.log(`  - Smoke Only (DOM rendered, unmutated): ${smokeCount}`);
  console.log(`  - Failures (missing DOM or runtime errors): ${failCount}`);
  console.log(`  - Total Console / Runtime Errors: ${allCollectedErrors.length}`);

  const reportPayload = JSON.stringify(
    {
      reportClassification: 'SMOKE_ONLY_TRAVERSAL',
      honestyDeclaration:
        'This run verified DOM rendering of 17 operator routes. It did NOT assert database persistence mutations. Routes without errors are labeled SMOKE_ONLY.',
      summary: {
        totalRoutes: results.length,
        verifiedPass: passCount,
        smokeOnly: smokeCount,
        failures: failCount,
        totalErrors: allCollectedErrors.length,
      },
      results,
      allErrors: allCollectedErrors,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  );

  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'browser_test_report.json'), reportPayload);
  fs.writeFileSync(path.join(process.cwd(), 'docs/verification/browser_test_report.json'), reportPayload);
  console.log('Report saved to docs/verification/browser_test_report.json');

  if (failCount > 0) {
    console.error(`\n❌ Verification suite completed with ${failCount} failing routes.`);
    process.exit(1);
  } else {
    console.log(`\n✅ Browser smoke traversal finished without fatal errors.`);
  }
}

run().catch((err) => {
  console.error('Fatal error during Playwright execution:', err);
  process.exit(1);
});
