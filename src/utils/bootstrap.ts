/*
 * GaborNeuroFit - Bootstrapper & Environment Overrides
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Global environment augmentations and strict DOM casting.
 */

import { initAudio } from '../engine/audio.js';

// Global Augmentation to prevent TS compiler errors when accessing non-standard browser APIs
declare global {
    interface Window {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        twemoji?: any;
        webkitAudioContext?: typeof AudioContext;
    }
}

// Intercept Twemoji parser globally to enforce absolute offline local path loading
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
 * @description Dynamically scales the canvas and overlay backing stores to match
 * the high-DPI (Retina) physical pixel boundaries of the active display device.
 *
 * @clinical Retina-display alignment is crucial. Visual acuity (VA) training uses
 * high-frequency Gabor gratings (Stage 5). If the canvas uses logical CSS scaling instead of
 * physical DPR backing, the sub-pixel arrays will blur (interpolation artifacts), destroying
 * the strictly controlled physiological contrast thresholds.
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

// Register audio activation listeners globally to unlock AudioContext
if (typeof window !== 'undefined') {
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true, passive: true });
    window.addEventListener('keydown', initAudio, { once: true });
}