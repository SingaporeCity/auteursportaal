/**
 * E2E onboarding-flow tests.
 *
 * Verifieert UI-elementen voor de drie statussen. Vereist een auteur-account in
 * de gewenste status (zie README sectie 6 + onboarding-csv-import.md).
 *
 * Test-strategy: deze tests verwachten dat een auteur in `pending_data` of
 * `pending_admin_review` is. In CI zou dit via een test-fixture (admin maakt
 * een tijdelijke auteur aan, runt invite, test, ruimt op) gebeuren. Voor lokaal
 * runnen kun je via Supabase SQL Editor handmatig een test-auteur in een
 * specifieke status zetten.
 *
 * Skip-modus: als TEST_ONBOARDING_EMAIL niet is gezet, worden tests overgeslagen.
 */

import { test, expect } from '@playwright/test';

const ONBOARDING_EMAIL = process.env['TEST_ONBOARDING_EMAIL'] ?? '';
const ONBOARDING_PASSWORD = process.env['TEST_ONBOARDING_PASSWORD'] ?? '';
const SHOULD_RUN = ONBOARDING_EMAIL.length > 0 && ONBOARDING_PASSWORD.length > 0;

test.describe('Onboarding flow — pending_data', () => {
  test.skip(
    !SHOULD_RUN,
    'TEST_ONBOARDING_EMAIL/PASSWORD niet gezet — onboarding-tests overgeslagen'
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', ONBOARDING_EMAIL);
    await page.fill('input[type="password"]', ONBOARDING_PASSWORD);
    await page.click('button.auth-submit');
    await expect(page.locator('.welcome-section')).toBeVisible({ timeout: 10000 });
  });

  test('toont onboarding-banner met pending_data of pending_admin_review variant', async ({
    page,
  }) => {
    const banner = page.locator('.onboarding-banner');
    await expect(banner).toBeVisible();
    // Een van beide varianten moet aanwezig zijn
    const dataVariant = page.locator('.onboarding-banner-pending_data');
    const reviewVariant = page.locator('.onboarding-banner-pending_admin_review');
    const count = (await dataVariant.count()) + (await reviewVariant.count());
    expect(count).toBe(1);
  });

  test('alle tabs behalve profile zijn disabled', async ({ page }) => {
    const profileTab = page.locator('.tab-btn[data-tab="profile"]');
    await expect(profileTab).toBeVisible();
    await expect(profileTab).not.toBeDisabled();

    for (const tabId of ['start', 'payments', 'contracts', 'forecast', 'expenses', 'faq']) {
      const tab = page.locator(`.tab-btn[data-tab="${tabId}"]`);
      await expect(tab).toBeVisible();
      await expect(tab).toBeDisabled();
      await expect(tab).toHaveClass(/tab-btn-locked/);
    }
  });

  test('profile-tab is de standaard actieve tab', async ({ page }) => {
    const activeTab = page.locator('.tab-btn.active');
    await expect(activeTab).toHaveAttribute('data-tab', 'profile');
  });
});

test.describe('Onboarding flow — pending_data alleen', () => {
  test.skip(!SHOULD_RUN, 'TEST_ONBOARDING_EMAIL niet gezet');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', ONBOARDING_EMAIL);
    await page.fill('input[type="password"]', ONBOARDING_PASSWORD);
    await page.click('button.auth-submit');
    await expect(page.locator('.welcome-section')).toBeVisible({ timeout: 10000 });
  });

  test('profile-tab toont onboarding-form met activeer-knop (alleen in pending_data)', async ({
    page,
  }) => {
    const dataVariant = page.locator('.onboarding-banner-pending_data');
    test.skip((await dataVariant.count()) === 0, 'Account is niet in pending_data — test n.v.t.');

    await expect(page.locator('.profile-onboarding-form')).toBeVisible();
    await expect(page.locator('.profile-onboarding-actions .auth-submit')).toHaveCount(2);
    // Tussentijds opslaan + Activeer mijn account = twee submit-knoppen
  });

  test('readonly-disclaimer in pending_admin_review (alleen in die status)', async ({ page }) => {
    const reviewVariant = page.locator('.onboarding-banner-pending_admin_review');
    test.skip(
      (await reviewVariant.count()) === 0,
      'Account is niet in pending_admin_review — test n.v.t.'
    );

    await expect(page.locator('.profile-readonly-disclaimer')).toBeVisible();
    // Geen onboarding-form, alleen read-only grid
    await expect(page.locator('.profile-onboarding-form')).toHaveCount(0);
    await expect(page.locator('.profile-grid')).toBeVisible();
  });
});
