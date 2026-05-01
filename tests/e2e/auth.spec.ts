/**
 * E2E auth flows: login form werkt, ongeldige credentials geven nette error,
 * geldige login leidt tot dashboard.
 *
 * Vereist dat de Supabase prod-DB de admin- en auteur-accounts heeft:
 *   - admin (is_admin=true) login via env: TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD
 *   - auteur (is_active=true) via env: TEST_AUTHOR_EMAIL + TEST_AUTHOR_PASSWORD
 *
 * Voor lokale runs: defaults vanuit `.env.test` of fallback hieronder.
 */

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env['TEST_ADMIN_EMAIL'] ?? 'patrickjeeninga7@gmail.com';
const ADMIN_PASSWORD = process.env['TEST_ADMIN_PASSWORD'] ?? 'KiesEenWachtwoord123';
const AUTHOR_EMAIL = process.env['TEST_AUTHOR_EMAIL'] ?? 'cp071021@gmail.com';
const AUTHOR_PASSWORD = process.env['TEST_AUTHOR_PASSWORD'] ?? 'CharlotteTest123';

test.describe('Login flow', () => {
  test('login-pagina toont brand-panel + form', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.auth-brand-panel, .auth-card').first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('ongeldige credentials geven foutmelding', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'fake@example.com');
    await page.fill('input[type="password"]', 'WrongPassword999');
    await page.click('button.auth-submit');
    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 5000 });
  });

  test('admin login leidt naar admin-dashboard', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button.auth-submit');

    // Admin dashboard bevat 'Auteursbeheer' heading
    await expect(page.getByRole('heading', { name: 'Auteursbeheer' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('auteur login leidt naar dashboard met 7 tabs', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', AUTHOR_EMAIL);
    await page.fill('input[type="password"]', AUTHOR_PASSWORD);
    await page.click('button.auth-submit');

    // Dashboard heeft 7 tab-buttons
    await expect(page.locator('.tab-btn')).toHaveCount(7, { timeout: 10000 });
  });

  test('uitloggen brengt terug naar login-pagina', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', AUTHOR_EMAIL);
    await page.fill('input[type="password"]', AUTHOR_PASSWORD);
    await page.click('button.auth-submit');

    await page.click('button.app-header-logout');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
  });
});
