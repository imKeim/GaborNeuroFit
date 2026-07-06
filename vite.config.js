/*
 * GaborNeuroFit - Bundler & PWA Optimization Configuration
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This configuration manages compilation pipelines, static assets packaging,
 * and sets up Workbox service-worker rules for offline clinical capability.
 */

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: [
        'favicon.svg',
        'icon-192.png',
        'icon-512.png',
        'i18n/en.json',
        'i18n/ru.json',
        'emojis/*.svg'
      ],
      manifest: {
        name: 'GaborNeuroFit Training Suite',
        short_name: 'GaborNeuroFit',
        description: 'High-Performance Dichoptic & Perceptual Learning Vision Therapy Suite',
        theme_color: '#131a26',
        background_color: '#7f7f7f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './index.html',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        runtimeCaching: [
          {
            // Cache Google Web Fonts resources for complete offline runtime
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
  test: {
    environment: 'jsdom', // Simulates browser window inside Node.js
    globals: true, // Enables global test functions natively
    exclude: [...configDefaults.exclude, '**/e2e/**'], // Strictly excludes Playwright E2E browser tests from Vitest unit runner
  },
});