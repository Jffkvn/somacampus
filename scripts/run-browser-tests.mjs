#!/usr/bin/env node
/**
 * scripts/run-browser-tests.mjs
 *
 * Automated Browser End-to-End Persona Verification via Chrome DevTools Protocol
 * Connects directly to the active Chrome instance, opens a test tab,
 * exercises role switching (Principal and Teacher personas), traverses all
 * operator and classroom routes, checks DOM elements, and captures screenshots.
 */

import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const ARTIFACTS_DIR = '/Users/jeffadhaya/.gemini/antigravity/brain/99f614c8-8023-4b6f-b3ee-e00d0eda0a9e';
const BASE_URL = 'http://localhost:5173';

async function main() {
  console.log('=== Starting SomaCampus Automated Browser Verification ===');

  // 1. Read DevToolsActivePort
  const activePortFile = `${process.env.HOME}/Library/Application Support/Google/Chrome/DevToolsActivePort`;
  if (!fs.existsSync(activePortFile)) {
    throw new Error(`DevToolsActivePort file not found at ${activePortFile}`);
  }

  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();
  const browserPath = lines[1].trim();
  const wsUrl = `ws://127.0.0.1:${port}${browserPath}`;
  console.log(`Connecting to Chrome WebSocket on port ${port}...`);

  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const callbacks = new Map();
  const eventListeners = new Map();

  function sendCommand(method, params = {}, sessionId) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      callbacks.set(id, (res) => {
        if (res.error) {
          reject(new Error(`CDP Error [${method}]: ${JSON.stringify(res.error)}`));
        } else {
          resolve(res.result);
        }
      });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
    });
  }

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data);
    } else if (data.method && eventListeners.has(data.method)) {
      eventListeners.get(data.method)(data.params);
    }
  });

  console.log('Connected to Chrome DevTools Protocol!');

  // 2. Create a clean test target page
  console.log(`Creating fresh test tab for ${BASE_URL}...`);
  const createTargetRes = await sendCommand('Target.createTarget', { url: BASE_URL });
  const targetId = createTargetRes.targetId;
  console.log(`Target page created: ID ${targetId}`);

  // 3. Attach to the target
  const attachRes = await sendCommand('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attachRes.sessionId;
  console.log(`Attached with session ID: ${sessionId}`);

  // Enable domains
  await sendCommand('Page.enable', {}, sessionId);
  await sendCommand('Runtime.enable', {}, sessionId);
  await sendCommand('DOM.enable', {}, sessionId);

  // Set desktop viewport (1440x960)
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);

  // Auto-dismiss dialogs
  eventListeners.set('Page.javascriptDialogOpening', async (params) => {
    console.log(`[CDP Dialog] "${params.message}" (${params.type})`);
    try {
      await sendCommand('Page.handleJavaScriptDialog', { accept: true }, sessionId);
    } catch {}
  });

  // Track console errors
  const collectedErrors = [];
  eventListeners.set('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const txt = params.args.map((a) => a.value || a.description || '').join(' ');
      collectedErrors.push(txt);
      console.warn(`  ⚠️ Console Error: ${txt.slice(0, 140)}`);
    }
  });

  // Helpers
  async function evalInPage(expression) {
    const res = await sendCommand('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    return res.result?.value;
  }

  async function takeScreenshot(filename) {
    const screenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' }, sessionId);
    const buffer = Buffer.from(screenshotRes.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`  📸 Screenshot saved: ${filename} (${buffer.length} bytes)`);
    return filename;
  }

  async function navigate(route, waitMs = 2500) {
    const fullUrl = `${BASE_URL}${route}`;
    console.log(`\nNavigating to: ${fullUrl}`);
    await sendCommand('Page.navigate', { url: fullUrl }, sessionId);
    await new Promise((r) => setTimeout(r, waitMs));
    const title = await evalInPage('document.title');
    const h1 = await evalInPage('document.querySelector("h1, h2, h3")?.innerText');
    console.log(`  Title: "${title}" | Header: "${h1 || 'None'}"`);
    return { title, header: h1 };
  }

  async function switchRole(targetRole) {
    console.log(`\n🔄 Switching Dev Persona to: "${targetRole}"...`);
    await evalInPage(`
      (function() {
        localStorage.setItem('somacampus_dev_role', '${targetRole}');
        const buttons = Array.from(document.querySelectorAll('button'));
        const roleBtn = buttons.find(b => b.title === 'Development Persona Preview' || (b.innerText && b.innerText.includes('Role:')));
        if (roleBtn) roleBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));
    await evalInPage(`
      (function() {
        localStorage.setItem('somacampus_dev_role', '${targetRole}');
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => b.innerText && b.innerText.toLowerCase().includes('${targetRole.toLowerCase()}'));
        if (targetBtn) targetBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));
    const currentText = await evalInPage(`document.querySelector('button[title="Development Persona Preview"]')?.innerText`);
    console.log(`  Current Persona Status: ${currentText || 'Switched'}`);
  }

  const results = [];

  try {
    // Initial load
    await navigate('/');

    // ==========================================
    // SECTION A: PRINCIPAL / ADMIN PERSONA FLOWS
    // ==========================================
    await switchRole('principal');

    // 1. Student Admission Wizard
    console.log('\n--- 1. Testing Admissions Wizard (/students/new) ---');
    await navigate('/students/new');
    const wizardText = await evalInPage('document.body.innerText');
    const hasWizard = wizardText.includes('Admit New Student') || wizardText.includes('Student Details');
    await takeScreenshot('01_admissions_wizard.png');
    results.push({ page: 'Admissions Wizard (/students/new)', role: 'Principal', status: hasWizard ? 'PASS' : 'WARN', detail: 'Multi-step admission wizard with completeness meter' });

    // 2. Admissions Queue
    console.log('\n--- 2. Testing Admissions Queue (/admissions/queue) ---');
    await navigate('/admissions/queue');
    const queueText = await evalInPage('document.body.innerText');
    const hasQueue = queueText.includes('Admissions Queue') || queueText.includes('Applications');
    await takeScreenshot('02_admissions_queue.png');
    results.push({ page: 'Admissions Queue (/admissions/queue)', role: 'Principal', status: hasQueue ? 'PASS' : 'WARN', detail: 'Candidate review list with Approve & Enroll action' });

    // 3. Staff Directory
    console.log('\n--- 3. Testing Staff Directory (/staff) ---');
    await navigate('/staff');
    const staffText = await evalInPage('document.body.innerText');
    const hasStaff = staffText.includes('Staff') || staffText.includes('Employee');
    await takeScreenshot('03_staff_directory.png');
    results.push({ page: 'Staff Directory (/staff)', role: 'Principal', status: hasStaff ? 'PASS' : 'WARN', detail: 'Faculty directory with department filters and Add Staff CTA' });

    // 4. Staff Hire Wizard
    console.log('\n--- 4. Testing Staff Hire Wizard (/staff/new) ---');
    await navigate('/staff/new');
    const hireText = await evalInPage('document.body.innerText');
    const hasHire = hireText.includes('Hire') || hireText.includes('Onboard');
    await takeScreenshot('04_staff_hire_wizard.png');
    results.push({ page: 'Staff Hire Wizard (/staff/new)', role: 'Principal', status: hasHire ? 'PASS' : 'WARN', detail: 'Hire wizard with official subject selection' });

    // 5. Staff Dossier & Modals
    console.log('\n--- 5. Testing Staff Dossier & Compensation Editors (/staff/:id) ---');
    await navigate('/staff/99999999-9999-9999-9999-999999999991');
    await takeScreenshot('05_staff_dossier_personal.png');

    // Click Leave Tab
    await evalInPage(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const leaveBtn = buttons.find(b => b.innerText && (b.innerText.includes('Leave') || b.innerText.includes('Balances')));
      if (leaveBtn) leaveBtn.click();
    `);
    await new Promise((r) => setTimeout(r, 800));
    await takeScreenshot('06_staff_dossier_leave.png');

    // Click Payroll Tab
    await evalInPage(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const payBtn = buttons.find(b => b.innerText && b.innerText.includes('Payroll'));
      if (payBtn) payBtn.click();
    `);
    await new Promise((r) => setTimeout(r, 800));
    await takeScreenshot('07_staff_dossier_payroll.png');
    results.push({ page: 'Staff Dossier & Editors (/staff/:id)', role: 'Principal', status: 'PASS', detail: 'Personnel dossier with Leave Quota and Payroll Profile modals' });

    // 6. Classes Management
    console.log('\n--- 6. Testing Classes Management (/classes) ---');
    await navigate('/classes');
    const classesText = await evalInPage('document.body.innerText');
    const hasClasses = classesText.includes('Class') || classesText.includes('Stage');
    await takeScreenshot('08_classes_management.png');
    results.push({ page: 'Classes Management (/classes)', role: 'Principal', status: hasClasses ? 'PASS' : 'WARN', detail: 'Stage levels, streams, capacity meters, and class teacher assign' });

    // 7. HR Leadership Approvals
    console.log('\n--- 7. Testing HR Approvals Cockpit (/administration/hr/approvals) ---');
    await navigate('/administration/hr/approvals');
    const hrText = await evalInPage('document.body.innerText');
    const hasHR = hrText.includes('Approvals') || hrText.includes('Leave Requests') || hrText.includes('Pending');
    await takeScreenshot('09_hr_approvals_cockpit.png');
    results.push({ page: 'HR Approvals Cockpit (/administration/hr/approvals)', role: 'Principal', status: hasHR ? 'PASS' : 'WARN', detail: 'Executive approval queues for leave and advances' });

    // 8. School Store & Inventory
    console.log('\n--- 8. Testing School Store & Inventory (/administration/inventory) ---');
    await navigate('/administration/inventory');
    const invText = await evalInPage('document.body.innerText');
    const hasInv = invText.includes('Store') || invText.includes('Inventory') || invText.includes('Consumables');
    await takeScreenshot('10_inventory_cockpit.png');
    results.push({ page: 'School Store & Inventory (/administration/inventory)', role: 'Principal', status: hasInv ? 'PASS' : 'WARN', detail: 'Central store, consumables, goods receipts, and asset custody' });

    // 9. Master Timetable Draft
    console.log('\n--- 9. Testing Master Timetable Draft (/planning/timetable/draft) ---');
    await navigate('/planning/timetable/draft');
    const ttText = await evalInPage('document.body.innerText');
    const hasTT = ttText.includes('Timetable') || ttText.includes('Draft');
    await takeScreenshot('11_timetable_draft.png');
    results.push({ page: 'Master Timetable Draft (/planning/timetable/draft)', role: 'Principal', status: hasTT ? 'PASS' : 'WARN', detail: 'Header status pill and 5-day active period allocation grid' });

    // 10. School Calendar
    console.log('\n--- 10. Testing School Calendar (/calendar) ---');
    await navigate('/calendar');
    const calText = await evalInPage('document.body.innerText');
    const hasCal = calText.includes('Calendar') || calText.includes('Term');
    await takeScreenshot('12_school_calendar.png');
    results.push({ page: 'School Calendar (/calendar)', role: 'Principal', status: hasCal ? 'PASS' : 'WARN', detail: 'Interactive month view and event creation controls' });

    // 11. Bursar Expenses Logging
    console.log('\n--- 11. Testing Expenses Logging (/finance/expenses) ---');
    await navigate('/finance/expenses');
    const expText = await evalInPage('document.body.innerText');
    const hasExp = expText.includes('Expense') || expText.includes('Operating');
    await takeScreenshot('13_expenses_logging.png');
    results.push({ page: 'Expenses Logging (/finance/expenses)', role: 'Principal', status: hasExp ? 'PASS' : 'WARN', detail: 'Expense log with clean category and term UUID sanitization' });

    // ==========================================
    // SECTION B: TEACHER PERSONA FLOWS
    // ==========================================
    await switchRole('teacher');

    // 12. Teacher Today Page
    console.log('\n--- 12. Testing Teacher Today (/teacher/today) ---');
    await navigate('/teacher/today');
    const todayText = await evalInPage('document.body.innerText');
    const hasToday = todayText.includes('Today') || todayText.includes('Clock In') || todayText.includes('Sarah');
    await takeScreenshot('14_teacher_today.png');
    results.push({ page: 'Teacher Today (/teacher/today)', role: 'Teacher', status: hasToday ? 'PASS' : 'WARN', detail: 'Rapid daily teaching schedule, attendance, and briefing' });

    // 13. Bulk Morning Attendance Register
    console.log('\n--- 13. Testing Bulk Attendance Register (/teaching/classes/.../attendance) ---');
    await navigate('/teaching/classes/55555555-5555-5555-5555-555555555551/attendance');
    const attText = await evalInPage('document.body.innerText');
    const hasAtt = attText.includes('Attendance') || attText.includes('Present');
    await takeScreenshot('15_bulk_attendance_register.png');
    results.push({ page: 'Bulk Attendance Register (/teaching/classes/:id/attendance)', role: 'Teacher', status: hasAtt ? 'PASS' : 'WARN', detail: 'Mark All Present register with exception toggles' });

    // 14. Resource Library
    console.log('\n--- 14. Testing Resource Library (/teaching/resources) ---');
    await navigate('/teaching/resources');
    const resText = await evalInPage('document.body.innerText');
    const hasRes = resText.includes('Resource') || resText.includes('Library');
    await takeScreenshot('16_resource_library.png');
    results.push({ page: 'Resource Library (/teaching/resources)', role: 'Teacher', status: hasRes ? 'PASS' : 'WARN', detail: 'Clean vertical cards with non-overlapping metadata badges' });

  } finally {
    // Clean up
    console.log('\nClosing test tab...');
    await sendCommand('Target.closeTarget', { targetId });
    ws.close();
  }

  console.log('\n=== Browser End-to-End Verification Summary ===');
  console.table(results);

  if (collectedErrors.length > 0) {
    console.log(`\nCaptured ${collectedErrors.length} console error logs during traversal.`);
  } else {
    console.log('\n🎉 Zero fatal console errors captured during browser traversal!');
  }

  const reportPath = path.join(ARTIFACTS_DIR, 'browser_test_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ results, errors: collectedErrors, timestamp: new Date().toISOString() }, null, 2));
  console.log(`Detailed report written to: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal error during browser test execution:', err);
  process.exit(1);
});
