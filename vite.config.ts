/**
 * @file vite.config.ts
 * @description Bundler and PWA optimization configuration for GaborNeuroFit.
 * Orchestrates the compilation pipeline, static asset packaging, and Workbox 
 * service-worker strategies to ensure 100% offline clinical capability.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  /** @description Force relative base paths to enable standalone local deployments. */
  base: './',

  plugins: [
    vue(),
    /**
     * @block PWA Orchestration
     * @clinical Offline Continuity: Guarantees that vision therapy remains accessible 
     * in clinical environments with restricted connectivity or shielded rooms.
     */
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: [
        'favicon.svg',
        'icon-192.png',
        'icon-192-maskable.png',
        'icon-512.png',
        'icon-512-maskable.png',
        'i18n/en.json',
        'i18n/ru.json'
      ],
      manifest: {
        name: 'GaborNeuroFit Training Suite',
        short_name: 'GaborNeuroFit',
        description: 'High-Performance Dichoptic & Perceptual Learning Vision Therapy Suite',
        theme_color: '#131a26',
        background_color: '#7f7f7f',
        display: 'standalone',
        /** @clinical Enforces portrait orientation to preserve ergonomic working distance. */
        orientation: 'portrait',
        start_url: './index.html',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        /** @description Pre-caches all essential logic and styles for sub-second offline launch. */
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        runtimeCaching: [
          {
            /** 
             * @performance Typography Stability: Cache Google Fonts to prevent 
             * layout shifts and ensure consistent visual acuity scaling.
             */
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 31536000 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],

  /**
   * @block Unit Testing Architecture
   * @architecture Employs Vitest with JSDoc environment for lightweight DOM simulation.
   */
  test: {
    /** @description Simulates a browser-like global environment inside Node.js. */
    environment: 'jsdom',
    globals: true,
    /** @description Strictly isolates unit tests from Playwright E2E browser automation. */
    exclude: [...configDefaults.exclude, '**/e2e/**'],
  },
});