/*
 * GaborNeuroFit - Offline Assets Compiler & Image Processor
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This script automates high-performance PNG icon generation from SVG source using Sharp
 * and downloads specific clinical Twemoji assets to eliminate CDN network dependencies.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import sharp from 'sharp';

const SVG_SOURCE = path.resolve('favicon.svg');
const PUBLIC_DIR = path.resolve('public');
const EMOJIS_DIR = path.resolve('public/emojis');

// Strict inventory of unicode emojis leveraged across clinical UI modules, translations, and guides
const CLINICAL_EMOJIS = [
  '🎯', '📱', '⚡', '🩹', '🕶️', '🌀', '⚙️', '🥈', '🥇', '🧠', '⚠️', '🔊', '🔇', 'ℹ️', '📊', '🛠️', '🇬🇧', '🇷🇺', '🧿', '◀', '▶', '🔄', '🧲', '🏆', '🍅', '🧹', '👤', '❌'
];

/**
 * Normalizes unicode character sequence into a compliant Twemoji hexadecimal codepoint
 */
function getCodePoint(emoji) {
  return Array.from(emoji)
    .map(char => char.codePointAt(0).toString(16))
    .filter(hex => hex !== 'fe0f') // Strip standard variation selectors to match Twemoji distribution rules
    .join('-');
}

/**
 * Downloads Twemoji vector asset from secure open-source CDN endpoint
 */
function downloadSvg(codePoint, targetPath) {
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@v14.0.2/assets/svg/${codePoint}.svg`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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

async function run() {
  try {
    console.log('🧿 [Assets Engine] Commencing assets generation cycle...');

    // 1. Compile high-resolution responsive icons from master vector SVG
    if (!fs.existsSync(SVG_SOURCE)) {
      throw new Error(`Master SVG source file not found at ${SVG_SOURCE}`);
    }

    console.log('[Assets Engine] Processing responsive application icons via Sharp...');
    await sharp(SVG_SOURCE).resize(192, 192).png().toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
    await sharp(SVG_SOURCE).resize(512, 512).png().toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
    console.log('[Assets Engine] Standard icons generated successfully.');

    // 2. Fetch required vector emojis to build robust offline runtime
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