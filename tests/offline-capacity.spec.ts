import { test, expect } from '@playwright/test';

const CREDENTIALS = { email: 'nikko6357@gmail.com', password: '123456' };
const APP_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://ybymcbwnjcgdoqrosqdw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlieW1jYnduamNnZG9xcm9zcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTQxMDcsImV4cCI6MjA4OTQzMDEwN30.JNlytCWFtSkvp0v3t0-Au4X5tmfBEUn4kPwvr5vmORI';

test.describe.configure({ mode: 'serial' });

async function fetchSource(page, path: string): Promise<string> {
  const resp = await page.request.get(APP_URL + path);
  return resp.text();
}

test.describe('Offline capacity limits', () => {
  test('01 - login and stay on dashboard', async ({ page }) => {
    await page.goto(APP_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(async ({ u, a, e, p }) => {
      const resp = await fetch(`${u}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: a, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, password: p })
      });
      const d = await resp.json();
      if (!d.access_token) return { error: d.error_description || d.msg || 'fail', status: resp.status };
      localStorage.setItem('sb-ybymcbwnjcgdoqrosqdw-auth-token', JSON.stringify({
        access_token: d.access_token, refresh_token: d.refresh_token,
        expires_at: Date.now() + d.expires_in * 1000, expires_in: d.expires_in,
        token_type: 'bearer', user: d.user
      }));
      return { ok: true };
    }, { u: SUPABASE_URL, a: SUPABASE_ANON, e: CREDENTIALS.email, p: CREDENTIALS.password });
    expect(r.ok).toBe(true);
    await page.goto(APP_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('  dashboard loaded, URL:', page.url());
  });

  test('02 - MAX_QUEUE_SIZE constant is 4000', async ({ page }) => {
    const text = await fetchSource(page, '/src/lib/dexieDb.ts');
    // Vite transpiles 4000 → 4e3, so match scientific notation
    const m = text.match(/MAX_QUEUE_SIZE\s*=\s*(\d+(?:\.\d+)?(?:e\d+)?)/);
    expect(m).not.toBeNull();
    const value = Number(m![1]);
    expect(value).toBe(4000);
  });

  test('03 - addToSyncQueue rejects at MAX_QUEUE_SIZE limit', async ({ page }) => {
    const src = await fetchSource(page, '/src/lib/dexieDb.ts');
    expect(src).toContain('MAX_QUEUE_SIZE');
    expect(src).toContain('return false');
    expect(src).toContain('return true');
    expect(src).toContain('toast.error');
  });

  test('04 - cleanSyncLog keeps at most 500 entries', async ({ page }) => {
    const src = await fetchSource(page, '/src/lib/dexieDb.ts');
    expect(src).toContain('cleanSyncLog');
    expect(src).toContain('500');
  });

  test('05 - syncEngine calls cleanSyncLog after processQueue', async ({ page }) => {
    const src = await fetchSource(page, '/src/lib/syncEngine.ts');
    expect(src).toContain('cleanSyncLog');
  });
});
