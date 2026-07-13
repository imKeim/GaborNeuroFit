/*
 * GaborNeuroFit - Offline Assets Compiler & Image Processor
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Strongly typed filesystem and network buffers
 * to prevent corrupted PWA icons generation during CD/CI pipelines.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { IncomingMessage } from 'http';
import sharp from 'sharp';

const SVG_SOURCE: string = path.resolve('favicon.svg');
const PUBLIC_DIR: string = path.resolve('public');
const EMOJIS_DIR: string = path.resolve('public/emojis');

// Strict inventory of unicode emojis leveraged across clinical UI modules, translations, and guides
const CLINICAL_EMOJIS: string[] = [
  // Brand & Neurological Core
  '🧿', '🧠', '📱',
  // Clinical Treatment Presets
  '🩹', '🕶️', '⚡', '🌀', '🎯', '🧲', '⚙️', '🧊',
  // System HUD Controls
  '🔊', '🔇', '⏸️', 'ℹ️', '📊', '📥', '🛠️', '🇬🇧', '🇷🇺', '◀', '▶', '🔄',
  // Patient Dashboard & Analytics
  '👤', '📈', '🧹', '🍅', '🔥',
  // Milestones & Trophies
  '🏆', '🥇', '🥈',
  // System Warnings & Validations
  '⚠️', '❌'
];

/**
 * Normalizes unicode character sequence into a compliant Twemoji hexadecimal codepoint
 */
function getCodePoint(emoji: string): string {
  return Array.from(emoji)
    .map(char => char.codePointAt(0)?.toString(16) || '')
    .filter(hex => hex !== 'fe0f' && hex !== '') // Strip standard variation selectors
    .join('-');
}

/**
 * Downloads Twemoji vector asset from secure open-source CDN endpoint
 */
function downloadSvg(codePoint: string, targetPath: string): Promise<void> {
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@v14.0.2/assets/svg/${codePoint}.svg`;

  return new Promise((resolve, reject) => {
    https.get(url, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        reject(new Error(`CDN responded with status code ${res.statusCode} for ${codePoint}`));
        return;
      }
      const fileStream = fs.createWriteStream(targetPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', reject);
  });
}

/**
 * Generates a padded maskable icon over a solid white background (W3C PWA standard)
 */
async function createMaskableIcon(svgSource: string, size: number, outputPath: string): Promise<void> {
    const padding = Math.round(size * 0.12); // Safe 12% padding zone
    const innerSize = size - padding * 2;

    const resizedLogo = await sharp(svgSource)
        .resize(innerSize, innerSize)
        .toBuffer();

    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 } // Solid white background
        }
    })
    .composite([{ input: resizedLogo, gravity: 'center' }])
    .png()
    .toFile(outputPath);
}

async function run(): Promise<void> {
  try {
    console.log('🧿 [Assets Engine] Commencing assets generation cycle...');

    if (!fs.existsSync(SVG_SOURCE)) {
      throw new Error(`Master SVG source file not found at ${SVG_SOURCE}`);
    }

    console.log('[Assets Engine] Processing responsive application icons via Sharp...');
    await sharp(SVG_SOURCE).resize(192, 192).png().toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
    await sharp(SVG_SOURCE).resize(512, 512).png().toFile(path.join(PUBLIC_DIR, 'icon-512.png'));

    await createMaskableIcon(SVG_SOURCE, 192, path.join(PUBLIC_DIR, 'icon-192-maskable.png'));
    await createMaskableIcon(SVG_SOURCE, 512, path.join(PUBLIC_DIR, 'icon-512-maskable.png'));
    console.log('[Assets Engine] Standard and maskable icons generated successfully.');

    if (!fs.existsSync(EMOJIS_DIR)) {
      fs.mkdirSync(EMOJIS_DIR, { recursive: true });
    }

    console.log('[Assets Engine] Fetching required vector Twemoji assets...');
    for (const emoji of CLINICAL_EMOJIS) {
      const codePoint = getCodePoint(emoji);
      const targetPath = path.join(EMOJIS_DIR, `${codePoint}.svg`);

      if (!fs.existsSync(targetPath)) {
        await downloadSvg(codePoint, targetPath);
        console.log(`[Assets Engine] Downloaded local asset: ${emoji} (${codePoint}.svg)`);
      }
    }

    console.log('%c🧿 [Assets Engine] All offline assets generated successfully!', 'color: #22c55e; font-weight: bold;');
  } catch (err) {
    console.error('❌ [Assets Engine] Critical build interruption:', err);
    process.exit(1);
  }
}

run();