import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { execSync, spawn } from 'child_process';

await mkdir('screenshots', { recursive: true });

// Start vite preview as a detached process
const vite = spawn('npx', ['vite', 'preview', '--port', '4174'], {
  cwd: 'D:\\SALVA INVENTARIOY NO BORRAR\\inventarioy_mejorado',
  detached: true,
  stdio: 'ignore',
  shell: true,
});
vite.unref();

// Wait for server to be ready
let ready = false;
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch('http://localhost:4174/');
    if (res.ok) { ready = true; break; }
  } catch {}
  await new Promise(r => setTimeout(r, 1000));
}
if (!ready) { console.error('Server never started'); process.exit(1); }
console.log('Server ready on :4174');

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const pages = [
  { name: 'landing', url: 'http://localhost:4174/', wait: 3000 },
  { name: 'login', url: 'http://localhost:4174/login', wait: 2000 },
  { name: 'register', url: 'http://localhost:4174/register', wait: 2000 },
  { name: 'acceso', url: 'http://localhost:4174/acceso', wait: 2000 },
  { name: 'menu', url: 'http://localhost:4174/menu?b=test', wait: 2000 },
];

for (const p of pages) {
  try {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(p.wait);
    await page.screenshot({ path: `screenshots/${p.name}.png`, fullPage: true });
    console.log(`✅ ${p.name}.png`);
  } catch (e) {
    console.log(`❌ ${p.name}: ${e.message.split('\n')[0]}`);
  }
}

// Mobile landing
await page.setViewportSize({ width: 390, height: 844 });
try {
  await page.goto('http://localhost:4174/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/landing-mobile.png', fullPage: true });
  console.log('✅ landing-mobile.png');
} catch (e) {
  console.log(`❌ landing-mobile: ${e.message.split('\n')[0]}`);
}

await browser.close();
// Kill the vite process
try { process.kill(-vite.pid, 'SIGTERM'); } catch {}
try { execSync('taskkill /F /IM node.exe /T 2>NUL'); } catch {}
console.log('Done');
