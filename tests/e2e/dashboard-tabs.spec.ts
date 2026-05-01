/**
 * E2E navigatie tussen dashboard-tabs.
 *
 * Verifieert dat alle 7 tabs renderen zonder errors voor een geactiveerde auteur.
 */

import { test, expect } from '@playwright/test';

const AUTHOR_EMAIL = process.env['TEST_AUTHOR_EMAIL'] ?? 'cp071021@gmail.com';
const AUTHOR_PASSWORD = process.env['TEST_AUTHOR_PASSWORD'] ?? 'CharlotteTest123';

test.describe('Dashboard tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', AUTHOR_EMAIL);
    await page.fill('input[type="password"]', AUTHOR_PASSWORD);
    await page.click('button.auth-submit');
    await expect(page.locator('.tab-btn').first()).toBeVisible({ timeout: 10000 });
  });

  test('Start tab toont Year-in-Review hero', async ({ page }) => {
    await page.click('button.tab-btn[data-tab="start"]');
    // Year-in-Review card + (eventueel) royalty chart
    await expect(page.locator('.yr-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.yr-hero-value')).toBeVisible();
  });

  test('Profiel tab toont ID-banner + grid', async ({ page }) => {
    await page.click('button.tab-btn[data-tab="profile"]');
    await expect(page.locator('.id-banner')).toBeVisible();
    await expect(page.locator('.profile-grid')).toBeVisible();
  });

  test('Afrekeningen tab toont payment-list', async ({ page }) => {
    await page.click('button.tab-btn[data-tab="payments"]');
    await expect(page.locator('.payments-list')).toBeVisible();
  });

  test('Contracten tab toont empty-state of contracten', async ({ page }) => {
    await page.click('button.tab-btn[data-tab="contracts"]');
    await expect(page.locator('.contracts-list, .empty-state').first()).toBeVisible();
  });

  test('Prognose tab laadt zonder errors', async ({ page }) => {
    await page.click('button.tab-btn[data-tab="forecast"]');
    await expect(page.locator('.forecast-slot, .empty-state').first()).toBeVisible();
  });

  test('Declaraties tab toont indien-form', async ({ page }) => {
    await page.click('button.tab-btn[data-tab="expenses"]');
    await expect(page.locator('.expenses-form-card')).toBeVisible();
  });

  test('FAQ tab toont accordion items in categorieën', async ({ page }) => {
    await page.click('button.tab-btn[data-tab="faq"]');
    // 14 vragen verdeeld over 4 categorieën
    await expect(page.locator('.faq-category')).toHaveCount(4, { timeout: 5000 });
    await expect(page.locator('.faq-item')).toHaveCount(14);
  });
});
