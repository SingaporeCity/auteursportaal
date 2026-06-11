#!/usr/bin/env node
/**
 * Tijdelijk verificatie-script — test de dev quick-login shortcuts en de
 * contracten-tab tegen de lokale Vite dev-server (localhost:5173).
 *
 * Run: node scripts/verify-quick-login.mjs
 */

import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const SHOT_DIR = resolve(process.cwd(), '..', '.screenshots');
const URL = 'http://localhost:5173/';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (msg) => {
  console.log(`   [browser:${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  console.log(`   [browser:error] ${err.message}`);
});

async function shot(name) {
  await page.screenshot({ path: resolve(SHOT_DIR, name), fullPage: false });
  console.log(`📸 ${name}`);
}

async function describeScreen() {
  return page.evaluate(() => {
    const h = document.querySelector('h1, h2');
    const tabs = [...document.querySelectorAll('[class*="tab"]')].length;
    return { heading: h ? h.textContent.trim() : '(geen heading)', tabCount: tabs };
  });
}

console.log('1. Login-scherm laden…');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
console.log('   ✓ login-scherm zichtbaar');

console.log('2. Ctrl+Shift+L (auteur)…');
await page.keyboard.press('Control+Shift+L');
await page.waitForTimeout(4000);
console.log('   scherm:', JSON.stringify(await describeScreen()));
await shot('quick-login-author.png');

console.log('3. Naar Contracten-tab…');
const contractTab = page.locator('button, a', { hasText: /contract/i }).first();
if ((await contractTab.count()) > 0) {
  await contractTab.click();
  await page.waitForTimeout(2500);
  const rows = await page.locator('.contract-row').count();
  const previews = await page.locator('.contract-row .payment-preview').count();
  const downloads = await page.locator('.contract-row .payment-download-icon').count();
  console.log(`   contracten: ${rows}, preview-knoppen: ${previews}, download-knoppen: ${downloads}`);
  await shot('contracts-tab.png');

  if (previews > 0) {
    console.log('4. Preview-modal openen…');
    await page.locator('.contract-row .payment-preview').first().click();
    await page.waitForTimeout(3000);
    const modalOpen = (await page.locator('.pdf-preview-modal').count()) > 0;
    const iframeSrc = await page
      .locator('.pdf-preview-iframe')
      .first()
      .getAttribute('src')
      .catch(() => null);
    console.log(`   modal open: ${modalOpen}, iframe-src bevat 'contracts': ${iframeSrc?.includes('/contracts/') ?? false}`);
    await shot('contract-preview.png');
    await page.keyboard.press('Escape');
  }
} else {
  console.log('   ⚠ geen Contracten-tab gevonden (mogelijk MFA-scherm)');
}

console.log('5. Ctrl+Shift+A (admin)…');
await page.keyboard.press('Control+Shift+A');
await page.waitForTimeout(4000);
console.log('   scherm:', JSON.stringify(await describeScreen()));
await shot('quick-login-admin.png');

await browser.close();
console.log('✅ klaar');
