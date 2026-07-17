/**
 * @file bootstrap.ts
 * @description System bootstrapper and environment coordinator.
 * Manages global API augmentations, hardware-specific visual scaling (DPR), 
 * and ensures 100% offline asset availability for PWA environments.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { initAudio } from '../engine/audio.js';

/** 
 * @description Global Augmentation block.
 * @architecture Informs the TS compiler about external CDN-loaded libraries and 
 * legacy prefixed browser APIs (e.g., Safari's webkitAudioContext).
 */
declare global {
    interface Window {
        /** @description Twemoji parsing engine for vector emoji rendering. */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        twemoji?: any;
        /** @description Legacy WebKit AudioContext support for older iOS devices. */
        webkitAudioContext?: typeof AudioContext;
    }
}

/**
 * @description Twemoji CDN Interceptor Proxy.
 * 
 * @architecture 
 * Forcefully redirects Twemoji vector requests to the local /public/emojis directory. 
 * This guarantees privacy and full offline functionality in PWA mode, preventing 
 * layout shifts caused by external asset latency.
 */
if (typeof window !== 'undefined' && window.twemoji) {
    const originalParse = window.twemoji.parse;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.twemoji.parse = function (target: any, options: any) {
        const localOptions = Object.assign({
            folder: 'emojis',
            ext: '.svg',
            base: './'
        }, options);
        return originalParse.call(window.twemoji, target, localOptions);
    };
}

/**
 * @description Dynamically scales the canvas backing store to match physical display pixels.
 *
 * @clinical 
 * - Retina/High-DPI Alignment: Visual acuity (VA) training utilizes high-frequency Gabor 
 *   gratings (Stage 5) with 1-2 pixel thickness. 
 * - Anti-Aliasing Prevention: Standard CSS scaling introduces bilinear interpolation 
 *   artifacts (blurring). Matching the backing store to the physical devicePixelRatio 
 *   ensures sub-pixel sharpness, preserving strictly controlled spatial frequencies.
 * 
 * @mathematical
 * Sets internal dimensions as Physical_Size = CSS_Bounding_Rect * devicePixelRatio.
 * Hard-capped at 1024px to prevent VRAM exhaustion on 4K+ displays.
 */
export function resizeCanvasesToDPR(): void {
    const canvas = document.getElementById('gaborCanvas') as HTMLCanvasElement | null;
    const overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement | null;

    if (!canvas || !overlayCanvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const physicalSize = Math.min(1024, Math.round(rect.width * dpr));

    if (canvas.width !== physicalSize) {
        canvas.width = physicalSize;
        canvas.height = physicalSize;
        overlayCanvas.width = physicalSize;
        overlayCanvas.height = physicalSize;
    }
}

/** 
 * @description Audio Unlocking Pipeline.
 * @architecture
 * Registers one-time listeners to resume the AudioContext upon the first physical 
 * user gesture, satisfying modern browser autoplay security policies.
 */
if (typeof window !== 'undefined') {
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true, passive: true });
    window.addEventListener('keydown', initAudio, { once: true });
}