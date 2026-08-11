import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await mkdir('screenshots', { recursive: true });

const pages = [
  { name: 'landing', url: 'http://localhost:5173/', wait: 2000 },
  { name: 'login', url: 'http://localhost:5173/login', wait: 1500 },
  { name: 'register', url: 'http://localhost:5173/register', wait: 1500 },
  { name: 'acceso', url: 'http://localhost:5173/acceso', wait: 1500 },
  { name: 'menu', url: 'http://localhost:5173/menu', wait: 1500 },
];

for (const p of pages) {
  await page.goto(p.url, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(p.wait);
  await page.screenshot({ path: `screenshots/${p.name}.png`, fullPage: true });
  console.log(`✅ ${p.name}.png`);
}

// Mobile landing
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/landing-mobile.png', fullPage: true });
console.log('✅ landing-mobile.png');

await browser.close();
console.log('Done');
