/**
 * @file playwright.config.ts
 * @description End-to-End (E2E) test automation configuration.
 * Establishes the cross-browser validation matrix to ensure that visual 
 * stimulations, touch gestures, and FSM transitions operate flawlessly 
 * on clinical-grade mobile and desktop environments.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  /* Context: Global test execution policy */
  testDir: './src/e2e',
  /** @architecture Target both TS and JS spec files for maximum flexibility. */
  testMatch: '**/*.spec.{ts,js}',
  fullyParallel: true,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:5173',
    /** @architecture Capture traces on retry to debug subtle asynchronous race conditions. */
    trace: 'on-first-retry',
  },

  /* Context: Integration server orchestration */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },

  /* Context: Device emulation matrix */
  projects: [
    {
      /** 
       * @clinical Mobile Safari Validation: Essential for verifying touch-to-flash 
       * latency and viewport-lock integrity on iOS devices. 
       */
      name: 'Mobile Safari (iPhone 14 Pro)',
      use: { ...devices['iPhone 14 Pro'] },
    },
    {
      /** @clinical Desktop Chrome Validation: Verifies WebGL 1.0 shader performance and keyboard hotkeys. */
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});