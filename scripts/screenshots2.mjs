import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await mkdir('screenshots', { recursive: true });

const pages = [
  { name: 'landing', url: 'http://localhost:4173/', wait: 3000 },
  { name: 'login', url: 'http://localhost:4173/login', wait: 2000 },
  { name: 'register', url: 'http://localhost:4173/register', wait: 2000 },
  { name: 'acceso', url: 'http://localhost:4173/acceso', wait: 2000 },
  { name: 'menu', url: 'http://localhost:4173/menu', wait: 2000 },
];

for (const p of pages) {
  try {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(p.wait);
    await page.screenshot({ path: `screenshots/${p.name}.png`, fullPage: true });
    console.log(`✅ ${p.name}.png`);
  } catch (e) {
    console.log(`❌ ${p.name}: ${e.message}`);
  }
}

// Mobile landing
await page.setViewportSize({ width: 390, height: 844 });
try {
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/landing-mobile.png', fullPage: true });
  console.log('✅ landing-mobile.png');
} catch (e) {
  console.log(`❌ landing-mobile: ${e.message}`);
}

await browser.close();
console.log('Done');
