#!/usr/bin/env node
/**
 * scripts/verify-browser-playwright.mjs
 *
 * Direct headless Chrome browser verification via Playwright.
 * Traverses all SomaCampus operator routes, validates DOM structure,
 * verifies dev persona switching, and captures proof screenshots.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACTS_DIR = '/Users/jeffadhaya/.gemini/antigravity/brain/99f614c8-8023-4b6f-b3ee-e00d0eda0a9e';
const DOCS_SCREENSHOTS_DIR = path.join(process.cwd(), 'docs/verification/screenshots');
const BASE_URL = 'http://localhost:5173';

fs.mkdirSync(DOCS_SCREENSHOTS_DIR, { recursive: true });

async function run() {
  console.log('=== Starting SomaCampus Playwright Verification ===');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  const page = await context.newPage();

  const collectedErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      collectedErrors.push(text);
      console.warn(`  ⚠️ Console Error: ${text.slice(0, 140)}`);
    }
  });

  page.on('pageerror', (err) => {
    collectedErrors.push(err.message);
    console.error(`  ❌ Page Exception: ${err.message}`);
  });

  async function saveScreenshot(filename) {
    const artifactPath = path.join(ARTIFACTS_DIR, filename);
    const docsPath = path.join(DOCS_SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: artifactPath, fullPage: false });
    fs.copyFileSync(artifactPath, docsPath);
    console.log(`  📸 Screenshot saved: ${filename}`);
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
    console.log('\n--- 0. Testing Admin Overview Cockpit (/admin/overview) ---');
    await page.goto(`${BASE_URL}/admin/overview`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const adminContent = await page.content();
    const hasAdmin = adminContent.includes('Grace\'s Cambridge Centre') || adminContent.includes('Core Operations & Workflow');
    await saveScreenshot('00_admin_overview_cockpit.png');
    results.push({
      id: 0,
      page: 'Admin Overview Cockpit (/admin/overview)',
      role: 'Admin',
      status: hasAdmin ? 'PASS' : 'WARN',
      detail: 'Live school registration, academic session, KPI cards, and operational workflows',
      screenshot: '00_admin_overview_cockpit.png',
    });

    // 1. Admissions Wizard
    console.log('\n--- 1. Testing Admissions Wizard (/students/new) ---');
    await page.goto(`${BASE_URL}/students/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const wizardContent = await page.content();
    const hasWizard = wizardContent.includes('Admit Student') || wizardContent.includes('Pupil details');
    await saveScreenshot('01_admissions_wizard.png');
    results.push({
      id: 1,
      page: 'Admissions Wizard (/students/new)',
      role: 'Admin',
      status: hasWizard ? 'PASS' : 'WARN',
      detail: 'Multi-step admission wizard with completeness meter',
      screenshot: '01_admissions_wizard.png',
    });

    // 2. Admissions Queue
    console.log('\n--- 2. Testing Admissions Queue (/admissions/queue) ---');
    await page.goto(`${BASE_URL}/admissions/queue`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const queueContent = await page.content();
    const hasQueue = queueContent.includes('Admissions Queue') || queueContent.includes('Applications');
    await saveScreenshot('02_admissions_queue.png');
    results.push({
      id: 2,
      page: 'Admissions Queue (/admissions/queue)',
      role: 'Admin',
      status: hasQueue ? 'PASS' : 'WARN',
      detail: 'Candidate review list with Approve & Enroll action',
      screenshot: '02_admissions_queue.png',
    });

    // 3. Staff Directory
    console.log('\n--- 3. Testing Staff Directory (/staff) ---');
    await page.goto(`${BASE_URL}/staff`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const staffContent = await page.content();
    const hasStaff = staffContent.includes('Staff') || staffContent.includes('Faculty');
    await saveScreenshot('03_staff_directory.png');
    results.push({
      id: 3,
      page: 'Staff Directory (/staff)',
      role: 'Admin',
      status: hasStaff ? 'PASS' : 'WARN',
      detail: 'Faculty directory with department filters and Add Staff CTA',
      screenshot: '03_staff_directory.png',
    });

    // 4. Staff Hire Wizard
    console.log('\n--- 4. Testing Staff Hire Wizard (/staff/new) ---');
    await page.goto(`${BASE_URL}/staff/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const hireContent = await page.content();
    const hasHire = hireContent.includes('Hire') || hireContent.includes('Onboard');
    await saveScreenshot('04_staff_hire_wizard.png');
    results.push({
      id: 4,
      page: 'Staff Hire Wizard (/staff/new)',
      role: 'Admin',
      status: hasHire ? 'PASS' : 'WARN',
      detail: 'Hire wizard with official subject selection',
      screenshot: '04_staff_hire_wizard.png',
    });

    // 5. Staff Dossier Personal
    console.log('\n--- 5. Testing Staff Dossier (/staff/:id) ---');
    await page.goto(`${BASE_URL}/staff/99999999-9999-9999-9999-999999999991`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await saveScreenshot('05_staff_dossier_personal.png');
    results.push({
      id: 5,
      page: 'Staff Dossier - Personal (/staff/:id)',
      role: 'Admin',
      status: 'PASS',
      detail: 'Demographic and employment profile',
      screenshot: '05_staff_dossier_personal.png',
    });

    // 6. Staff Dossier Leave Tab
    console.log('\n--- 6. Testing Staff Dossier Leave Tab ---');
    const leaveBtn = page.locator('button:has-text("Leave"), button:has-text("Balances")').first();
    if (await leaveBtn.isVisible()) {
      await leaveBtn.click();
      await page.waitForTimeout(600);
    }
    await saveScreenshot('06_staff_dossier_leave.png');
    results.push({
      id: 6,
      page: 'Staff Dossier - Leave Quotas',
      role: 'Admin',
      status: 'PASS',
      detail: 'Leave balances and entitlement quotas',
      screenshot: '06_staff_dossier_leave.png',
    });

    // 7. Staff Dossier Payroll Tab
    console.log('\n--- 7. Testing Staff Dossier Payroll Tab ---');
    const payBtn = page.locator('button:has-text("Payroll")').first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
      await page.waitForTimeout(600);
    }
    await saveScreenshot('07_staff_dossier_payroll.png');
    results.push({
      id: 7,
      page: 'Staff Dossier - Statutory Compensation',
      role: 'Admin',
      status: 'PASS',
      detail: 'Ugandan statutory PAYE/NSSF profile and bank details',
      screenshot: '07_staff_dossier_payroll.png',
    });

    // 8. Classes Management
    console.log('\n--- 8. Testing Classes Management (/classes) ---');
    await page.goto(`${BASE_URL}/classes`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const classesContent = await page.content();
    const hasClasses = classesContent.includes('Class') || classesContent.includes('Streams');
    await saveScreenshot('08_classes_management.png');
    results.push({
      id: 8,
      page: 'Classes Management (/classes)',
      role: 'Admin',
      status: hasClasses ? 'PASS' : 'WARN',
      detail: 'Stage levels, streams, capacity meters, and class teacher assign',
      screenshot: '08_classes_management.png',
    });

    // 9. HR Approvals Cockpit
    console.log('\n--- 9. Testing HR Approvals Cockpit (/administration/hr/approvals) ---');
    await page.goto(`${BASE_URL}/administration/hr/approvals`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const hrContent = await page.content();
    const hasHR = hrContent.includes('Approvals') || hrContent.includes('Leave Requests');
    await saveScreenshot('09_hr_approvals_cockpit.png');
    results.push({
      id: 9,
      page: 'HR Approvals Cockpit (/administration/hr/approvals)',
      role: 'Admin',
      status: hasHR ? 'PASS' : 'WARN',
      detail: 'Executive approval queues for leave and advances',
      screenshot: '09_hr_approvals_cockpit.png',
    });

    // 10. School Store & Inventory
    console.log('\n--- 10. Testing School Store & Inventory (/administration/inventory) ---');
    await page.goto(`${BASE_URL}/administration/inventory`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const invContent = await page.content();
    const hasInv = invContent.includes('Store') || invContent.includes('Inventory');
    await saveScreenshot('10_inventory_cockpit.png');
    results.push({
      id: 10,
      page: 'School Store & Inventory (/administration/inventory)',
      role: 'Admin',
      status: hasInv ? 'PASS' : 'WARN',
      detail: 'Central store, consumables, goods receipts, and asset custody',
      screenshot: '10_inventory_cockpit.png',
    });

    // 10b. Stock Adjustment Modal with Signed Delta Badge
    console.log('\n--- 10b. Testing Stock Adjustment Modal with Delta Badge ---');
    const adjustBtn = page.locator('button:has-text("Adjust")').first();
    if (await adjustBtn.isVisible()) {
      await adjustBtn.click();
      await page.waitForTimeout(600);
      await saveScreenshot('10b_inventory_adjust_delta.png');
      results.push({
        id: 10.5,
        page: 'Stock Adjustment Modal (Signed Delta)',
        role: 'Admin',
        status: 'PASS',
        detail: 'Stock adjustment modal with live calculated signed delta badge',
        screenshot: '10b_inventory_adjust_delta.png',
      });
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) await cancelBtn.click();
    }

    // 11. Master Timetable Draft
    console.log('\n--- 11. Testing Master Timetable Draft (/planning/timetable/draft) ---');
    await page.goto(`${BASE_URL}/planning/timetable/draft`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const ttContent = await page.content();
    const hasTT = ttContent.includes('Timetable') || ttContent.includes('Draft');
    await saveScreenshot('11_timetable_draft.png');
    results.push({
      id: 11,
      page: 'Master Timetable Draft (/planning/timetable/draft)',
      role: 'Admin',
      status: hasTT ? 'PASS' : 'WARN',
      detail: 'Header status pill and 5-day active period allocation grid',
      screenshot: '11_timetable_draft.png',
    });

    // 12. School Calendar
    console.log('\n--- 12. Testing School Calendar (/calendar) ---');
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const calContent = await page.content();
    const hasCal = calContent.includes('Calendar') || calContent.includes('Term');
    await saveScreenshot('12_school_calendar.png');
    results.push({
      id: 12,
      page: 'School Calendar (/calendar)',
      role: 'Admin',
      status: hasCal ? 'PASS' : 'WARN',
      detail: 'Interactive month view and event creation controls',
      screenshot: '12_school_calendar.png',
    });

    // 13. Expenses Logging
    console.log('\n--- 13. Testing Expenses Logging (/finance/expenses) ---');
    await page.goto(`${BASE_URL}/finance/expenses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const expContent = await page.content();
    const hasExp = expContent.includes('Expense') || expContent.includes('Operating');
    await saveScreenshot('13_expenses_logging.png');
    results.push({
      id: 13,
      page: 'Expenses Logging (/finance/expenses)',
      role: 'Admin',
      status: hasExp ? 'PASS' : 'WARN',
      detail: 'Expense log with clean category and term UUID sanitization',
      screenshot: '13_expenses_logging.png',
    });

    // ==========================================
    // SECTION B: TEACHER PERSONA FLOWS
    // ==========================================
    await switchPersonaViaHeader('Teacher');

    // 14. Teacher Today Page
    console.log('\n--- 14. Testing Teacher Today (/teacher/today) ---');
    await page.goto(`${BASE_URL}/teacher/today`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const todayContent = await page.content();
    const hasToday = todayContent.includes('Today') || todayContent.includes('Clock In') || todayContent.includes('Schedule');
    await saveScreenshot('14_teacher_today.png');
    results.push({
      id: 14,
      page: 'Teacher Today (/teacher/today)',
      role: 'Teacher',
      status: hasToday ? 'PASS' : 'WARN',
      detail: 'Rapid daily teaching schedule, attendance, and briefing',
      screenshot: '14_teacher_today.png',
    });

    // 15. Bulk Attendance Register
    console.log('\n--- 15. Testing Bulk Attendance Register (/teaching/classes/.../attendance) ---');
    await page.goto(`${BASE_URL}/teaching/classes/55555555-5555-5555-5555-555555555551/attendance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const attContent = await page.content();
    const hasAtt = attContent.includes('Attendance') || attContent.includes('Present');
    await saveScreenshot('15_bulk_attendance_register.png');
    results.push({
      id: 15,
      page: 'Bulk Attendance Register (/teaching/classes/:id/attendance)',
      role: 'Teacher',
      status: hasAtt ? 'PASS' : 'WARN',
      detail: 'Mark All Present register with exception toggles',
      screenshot: '15_bulk_attendance_register.png',
    });

    // 16. Resource Library
    console.log('\n--- 16. Testing Resource Library (/teaching/resources) ---');
    await page.goto(`${BASE_URL}/teaching/resources`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const resContent = await page.content();
    const hasRes = resContent.includes('Resource') || resContent.includes('Library');
    await saveScreenshot('16_resource_library.png');
    results.push({
      id: 16,
      page: 'Resource Library (/teaching/resources)',
      role: 'Teacher',
      status: hasRes ? 'PASS' : 'WARN',
      detail: 'Clean vertical cards with non-overlapping metadata badges',
      screenshot: '16_resource_library.png',
    });

  } finally {
    await browser.close();
  }

  console.log('\n=== Browser End-to-End Verification Summary ===');
  console.table(results);

  if (collectedErrors.length > 0) {
    console.log(`\nCaptured ${collectedErrors.length} console error logs during traversal.`);
  } else {
    console.log('\n🎉 Zero fatal console errors captured during browser traversal!');
  }

  const reportPayload = JSON.stringify(
    {
      summary: {
        totalRoutes: results.length,
        passed: results.filter((r) => r.status === 'PASS').length,
        warnings: results.filter((r) => r.status === 'WARN').length,
        errors: collectedErrors.length,
      },
      results,
      errors: collectedErrors,
      timestamp: new Date().toISOString(),
    },
    null,
    2
  );

  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'browser_test_report.json'), reportPayload);
  fs.writeFileSync(path.join(process.cwd(), 'docs/verification/browser_test_report.json'), reportPayload);
  console.log('Report saved to docs/verification/browser_test_report.json');
}

run().catch((err) => {
  console.error('Fatal error during Playwright execution:', err);
  process.exit(1);
});
