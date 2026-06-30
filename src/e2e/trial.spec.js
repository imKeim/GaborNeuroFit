import { test, expect } from '@playwright/test';

test.describe('GaborNeuroFit - End-to-End Mobile Flow', () => {
    test('should open settings, change language, and successfully trigger a trial flash', async ({ page }) => {
        // 1. Open the local web application using explicit local URL
        await page.goto('http://localhost:5173/');

        // 2. Click the settings gear icon to open configuration panel
        const btnSettings = page.locator('#btn-settings');
        await btnSettings.click();

        // 3. Verify settings modal has successfully opened (display: flex)
        const settingsModal = page.locator('#settings-modal');
        await expect(settingsModal).toBeVisible();

        // 4. Change language dropdown selector to English
        const selectLang = page.locator('#select-lang');
        await selectLang.selectOption('en');

        // 5. Click OK button to close settings and save parameters
        const btnCloseSettings = page.locator('#btn-close-settings');
        await btnCloseSettings.click();
        await expect(settingsModal).toBeHidden();

        // 6. Verify START FLASH button translated to English
        const btnStart = page.locator('#btn-start');
        await expect(btnStart).toHaveText('START FLASH');

        // 7. Click the START FLASH button to trigger the Gabor stimulus
        await btnStart.click();

        // 8. Verify Gabor canvas becomes visible
        const canvas = page.locator('#gaborCanvas');
        await expect(canvas).toBeVisible();
    });
});