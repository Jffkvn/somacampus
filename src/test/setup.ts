import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

/**
 * Fail-fast network guard for the unit suite.
 *
 * CI injects VITE_SUPABASE_URL=https://mock.supabase.co (a non-resolving host).
 * Unmocked supabase.functions.invoke / fetch then hang on DNS until vitest's
 * 5s timeout — that is what produced the Stage 5 timeouts on teaching-ai-grounding.
 *
 * Accidental network calls now reject immediately. Intentional LIVE-GATED tests
 * either skip (no TEST_LIVE_DB) or mock the supabase client themselves.
 */
const originalFetch = globalThis.fetch.bind(globalThis);

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === 'object' && 'url' in input) return String((input as Request).url);
  return String(input);
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = extractUrl(input);
  if (/supabase\.(co|in)/i.test(url) || /127\.0\.0\.1:54321|localhost:54321/i.test(url)) {
    throw new TypeError(
      `Blocked network call in unit tests (fail-fast): ${url}. Mock the supabase client or use the LIVE-GATED suite.`,
    );
  }
  return originalFetch(input, init);
};
