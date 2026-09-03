import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/Users/jeffadhaya/.gemini/antigravity/brain/aaa6702a-69f2-4543-b5c9-27fb06c0d805';

async function runPhase4Inspection() {
  console.log('=== Starting Phase 4 Live Inspection ===');

  const activePortFile = `${process.env.HOME}/Library/Application Support/Google/Chrome/DevToolsActivePort`;
  if (!fs.existsSync(activePortFile)) {
    throw new Error(`DevToolsActivePort not found at ${activePortFile}`);
  }

  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();
  const browserPath = lines[1].trim();
  const wsUrl = `ws://127.0.0.1:${port}${browserPath}`;

  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const callbacks = new Map<number, (res: any) => void>();

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
    }
  };

  const targetsRes = await sendCommand('Target.getTargets');
  let target = targetsRes.targetInfos.find((t: any) => t.url.includes('localhost:5173'));

  if (!target) {
    const newTarget = await sendCommand('Target.createTarget', { url: 'http://localhost:5173' });
    target = { targetId: newTarget.targetId };
  }

  const attachRes = await sendCommand('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attachRes.sessionId;

  await sendCommand('Page.enable', {}, sessionId);
  await sendCommand('DOM.enable', {}, sessionId);
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);

  async function takeScreenshot(filename: string) {
    const screenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' }, sessionId);
    const buffer = Buffer.from(screenshotRes.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`📸 Saved screenshot: ${outPath} (${buffer.length} bytes)`);
  }

  async function navigateAndWait(url: string, waitMs = 2500) {
    console.log(`Navigating to ${url}...`);
    await sendCommand('Page.navigate', { url }, sessionId);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  // 1. Assignments list page
  await navigateAndWait('http://localhost:5173/teaching/assignments');
  await takeScreenshot('phase4_assignments_list.png');

  // 2. Diagnostic Review Page
  await navigateAndWait('http://localhost:5173/teaching/assignments/cccccccc-1111-1111-1111-111111111111');
  await takeScreenshot('phase4_diagnostic_review.png');

  // 3. Formal Assessment Review Page
  await navigateAndWait('http://localhost:5173/teaching/assignments/cccccccc-2222-2222-2222-222222222222');
  await takeScreenshot('phase4_formal_review.png');

  // 4. Student Profile with Two-Track Evidence & Observations
  await navigateAndWait('http://localhost:5173/students/22222222-0000-0000-0000-000000000001');
  await takeScreenshot('phase4_student_evidence_profile.png');

  console.log('✅ Phase 4 inspection finished successfully!');
  ws.close();
}

runPhase4Inspection().catch((err) => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
