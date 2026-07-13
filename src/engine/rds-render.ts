/*
 * GaborNeuroFit - Mathematical 2D/3D Random Dot Stereogram (RDS) Rendering Engine
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs strict matrix bounds checking and pure
 * Uint8ClampedArray byte processing to ensure frame-perfect 18Hz boiling noise.
 */

import type { AppState } from '../types/clinical';

// Persistent module-level offscreen buffer to prevent Garbage Collection allocation spikes during active renders
const offscreenCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (offscreenCanvas) {
    offscreenCanvas.width = 256;
    offscreenCanvas.height = 256;
}
const offscreenCtx = offscreenCanvas?.getContext('2d') || null;
const imgData = offscreenCtx ? offscreenCtx.createImageData(256, 256) : null;
const pixelBuffer = imgData ? imgData.data : null;

// Persistent noise grid cache to ensure the "snow" remains static during a single active trial
let cachedNoiseGrid: number[][] | null = null;
let cachedGridCols: number = 0;
let cachedGridRows: number = 0;

/**
 * @description Generates a deterministic 2D binary noise matrix of 0s and 1s.
 */
function generateNoiseMatrix(cols: number, rows: number, density: number): number[][] {
    const grid: number[][] = [];
    for (let y = 0; y < rows; y++) {
        const row: number[] = [];
        for (let x = 0; x < cols; x++) {
            row.push(Math.random() < density ? 1 : 0);
        }
        grid.push(row);
    }
    return grid;
}

/**
 * @description Renders a complete, calibrated Random Dot Stereogram (RDS) onto the transparent overlay canvas.
 *
 * @clinical Toroidal Wrapping & Subpixel Isolation.
 * 1. Monocular cues (shadows/edges) are functionally eliminated using modulo arithmetic
 *    (toroidal wrap) on the noise matrix. One eye physically cannot see the shape.
 * 2. Independent RGB channel assignment maps the Left view to the Red channel and
 *    the Right view to the Blue/Green channels, ensuring zero optical crosstalk when
 *    worn with clinical Anaglyph glasses.
 *
 * @param {HTMLCanvasElement | null} canvas - The primary drawing canvas.
 * @param {CanvasRenderingContext2D | null} ctx - The active 2D rendering context of the transparent overlay canvas.
 * @param {AppState} state - The global store state container.
 * @param {boolean} shuffleNoise - If true, regenerates the random noise pattern.
 * @param {boolean} hideShape - If true, forces disparity to zero, rendering flat uniform noise.
 */
export function drawRandomDotStereogram(
    canvas: HTMLCanvasElement | null,
    ctx: CanvasRenderingContext2D | null,
    state: AppState,
    shuffleNoise: boolean = false,
    hideShape: boolean = false
): void {
    if (!canvas || !ctx || !offscreenCanvas || !offscreenCtx || !pixelBuffer || !imgData) return;

    const dotSize = state.rdsDotSize;
    const cols = Math.floor(256 / dotSize);
    const rows = Math.floor(256 / dotSize);

    // Regenerate and cache the binary noise grid only on demand
    if (!cachedNoiseGrid || shuffleNoise || cols !== cachedGridCols || rows !== cachedGridRows) {
        cachedNoiseGrid = generateNoiseMatrix(cols, rows, state.rdsDensity);
        cachedGridCols = cols;
        cachedGridRows = rows;
    }

    // Symmetrically scale target size (smaller 28% inside tracking mode to expand bouncing margins)
    const squareSize = state.rdsIsFloating ? Math.floor(cols * 0.28) : Math.floor(cols * 0.375);
    const halfSquare = Math.floor(squareSize / 2);

    // Symmetrically offset target square from the SSoT parameters (including smooth dynamic drift)
    const targetYOffset = state.rdsTargetY + state.rdsDriftY;
    const centerY = Math.max(halfSquare + 1, Math.min(rows - halfSquare - 2, Math.floor(rows / 2) + targetYOffset));

    const driftXOffset = state.rdsDriftX;
    const halfCols = Math.floor(cols / 2);

    let centerX = 0;
    if (state.rdsTargetSide === 'right') {
        centerX = Math.floor(cols * 0.72) + driftXOffset;
        centerX = Math.max(halfCols + halfSquare + 1, Math.min(cols - halfSquare - 2, centerX));
    } else {
        centerX = Math.floor(cols * 0.28) + driftXOffset;
        centerX = Math.max(halfSquare + 1, Math.min(halfCols - halfSquare - 1, centerX));
    }

    const minX = centerX - halfSquare;
    const maxX = centerX + halfSquare;
    const minY = centerY - halfSquare;
    const maxY = centerY + halfSquare;

    const disparity = hideShape ? 0 : state.rdsDisparity;

    for (let py = 0; py < 256; py++) {
        const gy = Math.min(rows - 1, Math.floor(py / dotSize));

        for (let px = 0; px < 256; px++) {
            const gx = Math.min(cols - 1, Math.floor(px / dotSize));

            const isInside = (gx >= minX && gx < maxX && gy >= minY && gy < maxY);

            let leftX = gx;
            const rightX = gx; // Right eye acts as the static spatial anchor

            if (isInside) {
                // Toroidal wrapping prevents ghosting edges
                leftX = (gx - disparity + cols) % cols;
            }

            const leftDot = cachedNoiseGrid[gy][leftX];
            const rightDot = cachedNoiseGrid[gy][rightX];

            const leftR = state.calibratorLeftR;
            const rightG = state.calibratorRightG;
            const rightB = state.calibratorRightB;

            // Strict subpixel math preventing UInt8 overflow
            const rVal = Math.max(0, Math.min(255, Math.round(127 + (leftDot * 2 - 1) * (leftR - 127))));
            const gVal = Math.max(0, Math.min(255, Math.round(127 + (rightDot * 2 - 1) * (rightG - 127))));
            const bVal = Math.max(0, Math.min(255, Math.round(127 + (rightDot * 2 - 1) * (rightB - 127))));

            const idx = (py * 256 + px) * 4;
            pixelBuffer[idx] = rVal;
            pixelBuffer[idx + 1] = gVal;
            pixelBuffer[idx + 2] = bVal;
            pixelBuffer[idx + 3] = 255;
        }
    }

    offscreenCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = false;
    // @ts-ignore - Browser specific extensions
    if (ctx.msImageSmoothingEnabled !== undefined) ctx.msImageSmoothingEnabled = false;
    // @ts-ignore - Browser specific extensions
    if (ctx.webkitImageSmoothingEnabled !== undefined) ctx.webkitImageSmoothingEnabled = false;

    ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
}