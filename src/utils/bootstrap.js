/*
 * GaborNeuroFit - Bootstrapper & Environment Overrides
 * Copyright (C) 2026 Pavel Korotkov
 */

import { initAudio } from '../engine/audio.js';

// Intercept Twemoji parser globally to enforce absolute offline local path loading
if (window.twemoji) {
    const originalParse = window.twemoji.parse;
    window.twemoji.parse = function (target, options) {
        const localOptions = Object.assign({
            folder: 'emojis',
            ext: '.svg',
            base: './'
        }, options);
        return originalParse.call(window.twemoji, target, localOptions);
    };
}

/**
 * Dynamically scales the canvas and overlay backing stores to match 
 * the high-DPI (Retina) physical pixel boundaries of the active display device.
 */
export function resizeCanvasesToDPR() {
    const canvas = document.getElementById('gaborCanvas');
    const overlayCanvas = document.getElementById('overlayCanvas');
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
window.addEventListener('click', initAudio, { once: true });
window.addEventListener('touchstart', initAudio, { once: true, passive: true });
window.addEventListener('keydown', initAudio, { once: true });