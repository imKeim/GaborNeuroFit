import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

// Core configuration for the Vite bundler and Vitest test runner
export default defineConfig({
  base: './',
  test: {
    environment: 'jsdom', // Simulates browser window inside Node.js
    globals: true, // Enables global test functions natively
    exclude: [...configDefaults.exclude, '**/e2e/**'], // Strictly excludes Playwright E2E browser tests from Vitest unit runner
  },
});