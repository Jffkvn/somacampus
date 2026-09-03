import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/Users/jeffadhaya/.gemini/antigravity/brain/aaa6702a-69f2-4543-b5c9-27fb06c0d805';

async function scrollProfile() {
  const activePortFile = `${process.env.HOME}/Library/Application Support/Google/Chrome/DevToolsActivePort`;
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

  const attachRes = await sendCommand('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attachRes.sessionId;

  await sendCommand('Runtime.evaluate', {
    expression: 'window.scrollBy(0, 600);',
  }, sessionId);

  await new Promise((r) => setTimeout(r, 1000));

  const screenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' }, sessionId);
  const buffer = Buffer.from(screenshotRes.data, 'base64');
  const outPath = path.join(ARTIFACTS_DIR, 'phase4_student_evidence_scrolled.png');
  fs.writeFileSync(outPath, buffer);
  console.log('Saved scrolled profile screenshot!');
  ws.close();
}

scrollProfile().catch(console.error);
