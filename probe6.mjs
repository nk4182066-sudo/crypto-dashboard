import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3001';
const out = {};
let browser;

try {
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Simulate a returning user who already finished onboarding but is NOT logged in.
  await context.addInitScript(() => localStorage.setItem('onboarding-complete', 'true'));
  const page = await context.newPage();

  const protectedRoutes = ['/results', '/signals', '/risk', '/trade', '/patterns', '/candlestick', '/chart-patterns', '/chat'];
  for (const p of protectedRoutes) {
    const before = Date.now();
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Wait up to 12s for the client-side redirect to /login.
    const redirected = await page.waitForURL('**/login', { timeout: 12000 }).then(() => true).catch(() => false);
    out[p.replace('/', '')] = {
      finalUrl: page.url(),
      redirectedToLogin: redirected,
      tookMs: Date.now() - before,
      visible: (await page.innerText('body')).slice(0, 80),
    };
  }

  await browser.close();
} catch (e) {
  out.error = e.message;
  if (browser) await browser.close();
}
writeFileSync('c:\\tmp\\probe6-result.txt', JSON.stringify(out, null, 2));
console.log('PROBE6_DONE');
