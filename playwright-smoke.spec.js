const { test, expect } = require('playwright/test');

test('populace smoke flow', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

  const startButton = page.getByRole('button', { name: /Start/i });
  await expect(startButton).toBeVisible({ timeout: 15000 });
  await startButton.click();

  const enterButton = page.getByRole('button', { name: /Enter/i });
  await expect(enterButton).toBeVisible({ timeout: 15000 });
  await enterButton.click();

  await expect(page.getByRole('toolbar', { name: /主工具栏/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('region', { name: /小镇地图/i })).toBeVisible({ timeout: 15000 });

  const moreToggle = page.getByTestId('more-toggle');
  if (await moreToggle.count()) {
    await moreToggle.click();
  }

  await page.screenshot({ path: '/tmp/populace-v2-final.png', fullPage: true });
});
