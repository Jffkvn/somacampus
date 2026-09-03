import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/Users/jeffadhaya/.gemini/antigravity/brain/aaa6702a-69f2-4543-b5c9-27fb06c0d805';

async function runLiveBrowserInspection() {
  console.log('=== Starting Live Chrome CDP Inspection ===');

  // 1. Read DevToolsActivePort
  const activePortFile = `${process.env.HOME}/Library/Application Support/Google/Chrome/DevToolsActivePort`;
  if (!fs.existsSync(activePortFile)) {
    throw new Error(`DevToolsActivePort not found at ${activePortFile}`);
  }

  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();
  const browserPath = lines[1].trim();
  const wsUrl = `ws://127.0.0.1:${port}${browserPath}`;
  console.log(`Connecting to Chrome WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const callbacks = new Map<number, (res: any) => void>();
  const eventListeners = new Map<string, (params: any) => void>();

  function sendCommand(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      callbacks.set(id, (response) => {
        if (response.error) {
          reject(new Error(`CDP Error in ${method}: ${JSON.stringify(response.error)}`));
        } else {
          resolve(response.result);
        }
      });
      const msg: any = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      ws.send(JSON.stringify(msg));
    });
  }

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (err) => reject(err);
  });

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data.toString());
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id)!;
      callbacks.delete(data.id);
      cb(data);
    } else if (data.method && eventListeners.has(data.method)) {
      eventListeners.get(data.method)!(data.params);
    }
  };

  console.log('Connected to Chrome DevTools Protocol!');

  // 2. Find the SomaCampus tab
  const targetsRes = await sendCommand('Target.getTargets');
  const targets = targetsRes.targetInfos || [];
  const target = targets.find((t: any) => t.type === 'page' && (t.url.includes('localhost:5173') || t.title.includes('SomaCampus')));

  if (!target) {
    throw new Error(`SomaCampus tab not found. Available tabs: ${JSON.stringify(targets.map((t: any) => ({ url: t.url, title: t.title })))}`);
  }

  console.log(`Found target page: ${target.title} (${target.url}) - ID: ${target.targetId}`);

  // 3. Attach to the page
  const attachRes = await sendCommand('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sessionId = attachRes.sessionId;
  console.log(`Attached with session ID: ${sessionId}`);

  // Enable Page, Runtime, and Console
  eventListeners.set('Page.javascriptDialogOpening', async (params) => {
    console.log(`[CDP] Handling JavaScript Dialog: "${params.message}" (${params.type})`);
    try {
      await sendCommand('Page.handleJavaScriptDialog', { accept: true }, sessionId);
    } catch {}
  });

  await sendCommand('Page.enable', {}, sessionId);
  await sendCommand('Runtime.enable', {}, sessionId);
  await sendCommand('DOM.enable', {}, sessionId);

  try {
    await sendCommand('Page.handleJavaScriptDialog', { accept: true }, sessionId);
  } catch {}

  // Helper to capture screenshot
  async function takeScreenshot(filename: string) {
    const screenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' }, sessionId);
    const buffer = Buffer.from(screenshotRes.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`📸 Saved screenshot: ${outPath} (${buffer.length} bytes)`);
    return outPath;
  }

  // Helper to evaluate script
  async function evalInPage(expression: string) {
    const res = await sendCommand('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    return res.result?.value;
  }

  // 4. Initial Inspection of /teacher/today
  console.log('\n--- Step 1: Inspect Initial /teacher/today State ---');
  const pageTitle = await evalInPage('document.title');
  const currentUrl = await evalInPage('window.location.href');
  console.log(`Current page title: "${pageTitle}" on ${currentUrl}`);

  // Check console errors
  const errors = await evalInPage(`
    window.__consoleErrors || []
  `);
  console.log(`Console errors on page: ${JSON.stringify(errors)}`);

  await takeScreenshot('teacher_today_initial.png');

  // Inspect page elements
  const greeting = await evalInPage(`document.querySelector('h1')?.innerText`);
  const arrivalText = await evalInPage(`document.body.innerText.includes('Clock In For School Day')`);
  console.log(`Greeting: "${greeting}"`);
  console.log(`Clock In button present: ${arrivalText}`);

  // 5. Execute Clock-In Interaction (Customer Journey)
  console.log('\n--- Step 2: Customer Journey - Teacher Clock In ---');
  const clickResult = await evalInPage(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const clockInBtn = buttons.find(b => b.innerText.includes('Clock In For School Day'));
      if (clockInBtn) {
        clockInBtn.click();
        return 'Clock in button clicked';
      }
      return 'Button not found';
    })()
  `);
  console.log(`Clock In Action: ${clickResult}`);

  // Wait 1 second for state update
  await new Promise(r => setTimeout(r, 1000));
  await takeScreenshot('teacher_today_clocked_in.png');

  const clockedInBadge = await evalInPage(`
    (() => {
      const el = document.body.innerText;
      return el.includes('Clocked In at') && el.includes('GPS Verified');
    })()
  `);
  console.log(`Clocked in state verified in DOM: ${clockedInBadge}`);

  // 6. Inspect Active Scheduled Class & Curriculum Objective
  console.log('\n--- Step 3: Inspect Active Class & Timetable ---');
  const activeClassDetails = await evalInPage(`
    (() => {
      const cards = Array.from(document.querySelectorAll('h2'));
      const classHeading = cards.find(h => h.innerText.includes('Stage 5 Blue') || h.innerText.includes('Mathematics'));
      const topic = document.body.innerText.includes('Fractions & Decimals');
      return {
        classHeading: classHeading?.innerText || 'Not found',
        curriculumTopicPresent: topic
      };
    })()
  `);
  console.log(`Active class card:`, activeClassDetails);

  // 7. Click "Open Lesson & Take Attendance"
  console.log('\n--- Step 4: Navigate to Active Lesson Cockpit ---');
  await evalInPage(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const openLessonBtn = buttons.find(b => b.innerText.includes('Open Lesson & Take Attendance'));
      if (openLessonBtn) openLessonBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot('lesson_cockpit.png');
  const lessonUrl = await evalInPage('window.location.href');
  console.log(`Navigated to: ${lessonUrl}`);

  // 8. Inspect Leadership Dashboard
  console.log('\n--- Step 5: Inspect School Leadership Cockpit ---');
  await sendCommand('Page.navigate', { url: 'http://localhost:5173/dashboard/school' }, sessionId);
  await new Promise(r => setTimeout(r, 1200));
  await takeScreenshot('leadership_dashboard.png');
  const leadershipSchoolName = await evalInPage(`document.querySelector('h1')?.innerText`);
  console.log(`Leadership Dashboard School: "${leadershipSchoolName}"`);

  // 9. Inspect Fees Overview
  console.log('\n--- Step 6: Inspect Fees & Clearance Cockpit ---');
  await sendCommand('Page.navigate', { url: 'http://localhost:5173/fees' }, sessionId);
  await new Promise(r => setTimeout(r, 1200));
  await takeScreenshot('fees_overview.png');
  const feesHeading = await evalInPage(`document.querySelector('h1')?.innerText`);
  console.log(`Fees Screen Heading: "${feesHeading}"`);

  // 10. Return browser to /teacher/today as requested
  console.log('\n--- Step 7: Return User Tab to /teacher/today ---');
  await sendCommand('Page.navigate', { url: 'http://localhost:5173/teacher/today' }, sessionId);
  await new Promise(r => setTimeout(r, 1000));
  const finalUrl = await evalInPage('window.location.href');
  console.log(`Final tab URL restored to: ${finalUrl}`);

  ws.close();
  console.log('\n=== Live Browser Inspection Completed Successfully! ===');
}

runLiveBrowserInspection().catch((err) => {
  console.error('Fatal error in live browser inspection:', err);
  process.exit(1);
});
