/**
 * @file trial.spec.ts
 * @description End-to-End (E2E) integration test for the primary Gabor trial flow.
 * Validates critical path interactions: settings management, localization hot-swapping, 
 * and visual stimulus triggering across mobile and desktop environments.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { test, expect, Page } from '@playwright/test';

test.describe('GaborNeuroFit - Primary Interaction Lifecycle', () => {

    /** 
     * @architecture Integration Test
     * Verifies the complete loop from environment boot to active therapeutic exposure.
     */
    test('Should handle settings reconfiguration and trial initiation', async ({ page }: { page: Page }) => {
        
        // Step: Environment initialization via local dev server
        await page.goto('http://localhost:5173/');

        // Step: Configuration panel access
        const btnSettings = page.locator('#btn-settings');
        await btnSettings.click();

        // Logic: Verifying modal portal layer activation
        const settingsModal = page.locator('#settings-modal');
        await expect(settingsModal).toBeVisible();

        // Step: Localization hot-swap (simulating tactile Pill Group interaction)
        const btnEn = page.locator('#select-lang .pill-btn[data-value="en"]');
        await btnEn.click();

        // Step: Persistence commit and UI dismissal
        const btnCloseSettings = page.locator('#btn-close-settings');
        await btnCloseSettings.click();
        await expect(settingsModal).toBeHidden();

        // Logic: Verifying reactive UI translation and case-insensitive CSS transformation
        const btnStart = page.locator('#btn-start');
        await expect(btnStart).toHaveText(/START FLASH/i);

        /** 
         * @clinical Stimulus Initiation
         * NOTE: { force: true } is required here because Mobile Safari (WebKit) эмуляция 
         * sometimes flags the parent #bottom-dock padding as an intercepting layer.
         */
        await btnStart.click({ force: true });

        // Logic: Verifying WebGL hardware-accelerated arena visibility
        const canvas = page.locator('#gaborCanvas');
        await expect(canvas).toBeVisible();
    });
});