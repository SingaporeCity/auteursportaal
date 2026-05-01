/**
 * E2E RLS isolatie test — de belangrijkste security-test.
 *
 * Verifieert dat een ingelogde auteur alleen eigen rijen kan zien:
 *   - Charlotte logt in → SELECT op authors retourneert exact 1 rij (zichzelf)
 *   - Admin logt in → SELECT op authors retourneert N (alle)
 *
 * Doet de check via het in-app dev-debug-panel dat in dev-mode rechtsonder
 * staat en de RLS-test live runt.
 */

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env['TEST_ADMIN_EMAIL'] ?? 'patrickjeeninga7@gmail.com';
const ADMIN_PASSWORD = process.env['TEST_ADMIN_PASSWORD'] ?? 'KiesEenWachtwoord123';
const AUTHOR_EMAIL = process.env['TEST_AUTHOR_EMAIL'] ?? 'cp071021@gmail.com';
const AUTHOR_PASSWORD = process.env['TEST_AUTHOR_PASSWORD'] ?? 'CharlotteTest123';

test.describe('RLS isolatie', () => {
  test('admin ziet ALLE authors-records', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button.auth-submit');

    await expect(page.getByRole('heading', { name: 'Auteursbeheer' })).toBeVisible({
      timeout: 10000,
    });

    // Debug-panel toont in dev-mode: "RLS test: ✅ admin ziet N authors (alle)"
    const debugPanel = page.locator('#dev-debug-panel');
    await expect(debugPanel).toBeVisible();
    await expect(debugPanel).toContainText('admin ziet', { timeout: 5000 });
    await expect(debugPanel).toContainText('(alle)');
  });

  test('auteur ziet ALLEEN eigen authors-record (RLS-isolatie)', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', AUTHOR_EMAIL);
    await page.fill('input[type="password"]', AUTHOR_PASSWORD);
    await page.click('button.auth-submit');

    await expect(page.locator('.tab-btn').first()).toBeVisible({ timeout: 10000 });

    const debugPanel = page.locator('#dev-debug-panel');
    await expect(debugPanel).toBeVisible();

    // Verwacht: "ziet 1 authors-record (alleen eigen — RLS OK)"
    // Als hier "ziet N records — RLS LEK" verschijnt, faalt deze test (zoals het hoort)
    await expect(debugPanel).toContainText('ziet 1 authors-record', { timeout: 5000 });
    await expect(debugPanel).not.toContainText('RLS LEK');
  });

  test('auteur ziet eigen payments + GEEN andermans', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', AUTHOR_EMAIL);
    await page.fill('input[type="password"]', AUTHOR_PASSWORD);
    await page.click('button.auth-submit');

    // Klik op Afrekeningen tab
    await page.click('button.tab-btn:has-text("Afrekeningen")');

    // Charlotte zou 2 payment-rows moeten zien (Jaaropgave + Royalty), niet meer
    const rows = page.locator('.payment-row');
    await expect(rows).toHaveCount(2, { timeout: 10000 });
  });
});
