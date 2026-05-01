import { test, expect } from '@playwright/test';

test('app shell laadt', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
});
