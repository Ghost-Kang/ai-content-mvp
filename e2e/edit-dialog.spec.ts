import { test, expect } from '@playwright/test';

// Targets the 5 risk points from the 2026-05-06 EditNodeDialog overhaul:
//   1. Portal: dialog covers viewport, not trapped in NodeCard's
//      `backdrop-blur-xl` containing block
//   2. 17 frames render collapsed by default
//   3. Jump-to-N expands that frame
//   4. Expand all / collapse all toggles work
//   5. Esc closes the dialog
//
// Mounts via dev fixture at /dev/edit-dialog-fixture (only public in dev
// builds). Save mutations are NOT exercised — tRPC server side needs auth.

test.describe('EditNodeDialog UX (storyboard, 17 frames)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/edit-dialog-fixture');
    await page.getByTestId('open-dialog').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Portal: dialog overlay covers full viewport', async ({ page }) => {
    const dialog = page.getByRole('dialog');
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    // Outer overlay (role=dialog) is `fixed inset-0`. With Portal it's
    // sized to the viewport (~1280x720 default). Without Portal it's
    // trapped inside the backdrop-blur-xl ancestor (~content width,
    // typically <800px and <300px tall on this fixture page).
    expect(box!.width).toBeGreaterThan(viewport!.width * 0.95);
    expect(box!.height).toBeGreaterThan(viewport!.height * 0.95);
  });

  test('17 frames render collapsed by default', async ({ page }) => {
    await expect(page.locator('text=已展开').first()).toContainText('已展开 0/17');
    // Voiceover input only renders when its parent frame is expanded —
    // count should be 0.
    await expect(page.getByLabel(/^口播 \(voiceover\)$/)).toHaveCount(0);
  });

  test('jump-to-N expands and scrolls to that frame', async ({ page }) => {
    await page.getByPlaceholder('1-17').fill('12');
    await page.getByRole('button', { name: '前往' }).click();
    await expect(page.locator('text=已展开').first()).toContainText('已展开 1/17');
    // Exactly one voiceover input should now be in the DOM (frame 12).
    await expect(page.getByLabel(/^口播 \(voiceover\)$/)).toHaveCount(1);
  });

  test('expand all then collapse all', async ({ page }) => {
    await page.getByRole('button', { name: '全部展开' }).click();
    await expect(page.locator('text=已展开').first()).toContainText('已展开 17/17');
    await expect(page.getByLabel(/^口播 \(voiceover\)$/)).toHaveCount(17);

    await page.getByRole('button', { name: '全部折叠' }).click();
    await expect(page.locator('text=已展开').first()).toContainText('已展开 0/17');
    await expect(page.getByLabel(/^口播 \(voiceover\)$/)).toHaveCount(0);
  });

  test('Esc key closes dialog', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
