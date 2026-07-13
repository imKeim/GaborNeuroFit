/*
 * GaborNeuroFit - Mathematical 2D/3D Random Dot Stereogram (RDS) Rendering Engine
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module generates pixel-perfect random dot stereograms on a 2D Canvas context.
 * It uses toroidal wrapping to eliminate monocular boundary cues (crosstalk shadows)
 * and applies active subpixel color cancellation to prevent crosstalk on standard displays.
 */

// Persistent module-level offscreen buffer to prevent Garbage Collection allocation spikes during active renders
const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = 256;
offscreenCanvas.height = 256;
const offscreenCtx = offscreenCanvas.getContext('2d');
const imgData = offscreenCtx.createImageData(256, 256);
const pixelBuffer = imgData.data;

// Persistent noise grid cache to ensure the "snow" remains static during a single active trial
let cachedNoiseGrid = null;
let cachedGridCols = 0;
let cachedGridRows = 0;

/**
 * @description Generates a deterministic 2D binary noise matrix of 0s and 1s.
 * @private
 */
function generateNoiseMatrix(cols, rows, density) {
    const grid = [];
    for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) {
            row.push(Math.random() < density ? 1 : 0);
        }
        grid.push(row);
    }
    return grid;
}

/**
 * @description Renders a complete, calibrated Random Dot Stereogram (RDS) onto the transparent overlay canvas.
 * @param {HTMLCanvasElement} canvas - The primary drawing canvas.
 * @param {CanvasRenderingContext2D} ctx - The active 2D rendering context of the transparent overlay canvas.
 * @param {Object} state - The global store state container.
 * @param {boolean} shuffleNoise - If true, regenerates the random noise pattern (trigger on new trial).
 * @param {boolean} hideShape - If true, forces disparity to zero, rendering flat uniform noise with no hidden shape (used during pauses/idle).
 * @returns {void}
 */
export function drawRandomDotStereogram(canvas, ctx, state, shuffleNoise = false, hideShape = false) {
    if (!canvas || !ctx) return;

    const dotSize = state.rdsDotSize || 4;
    const cols = Math.floor(256 / dotSize);
    const rows = Math.floor(256 / dotSize);

    // Regenerate and cache the binary noise grid only on demand (new trial boundaries)
    if (!cachedNoiseGrid || shuffleNoise || cols !== cachedGridCols || rows !== cachedGridRows) {
        cachedNoiseGrid = generateNoiseMatrix(cols, rows, state.rdsDensity || 0.50);
        cachedGridCols = cols;
        cachedGridRows = rows;
    }

    // Symmetrically scale target size (smaller 28% inside tracking mode to expand bouncing margins)
    const squareSize = state.rdsIsFloating ? Math.floor(cols * 0.28) : Math.floor(cols * 0.375);
    const halfSquare = Math.floor(squareSize / 2);
    
    // Symmetrically offset target square from the SSoT parameters (including smooth dynamic drift)
    const targetYOffset = (state.rdsTargetY || 0) + (state.rdsDriftY || 0);
    const centerY = Math.max(halfSquare + 1, Math.min(rows - halfSquare - 2, Math.floor(rows / 2) + targetYOffset));

    const driftXOffset = state.rdsDriftX || 0;
    const halfCols = Math.floor(cols / 2);
    
    let centerX = 0;
    if (state.rdsTargetSide === 'right') {
        centerX = Math.floor(cols * 0.72) + driftXOffset;
        // Strictly clamp within the right half-screen boundaries to preserve binary answers
        centerX = Math.max(halfCols + halfSquare + 1, Math.min(cols - halfSquare - 2, centerX));
    } else {
        centerX = Math.floor(cols * 0.28) + driftXOffset;
        // Strictly clamp within the left half-screen boundaries to preserve binary answers
        centerX = Math.max(halfSquare + 1, Math.min(halfCols - halfSquare - 1, centerX));
    }

    const minX = centerX - halfSquare;
    const maxX = centerX + halfSquare;
    const minY = centerY - halfSquare;
    const maxY = centerY + halfSquare;

    // Force disparity to zero during calibration tests or intermediate idle/feedback states to prevent visual leaks.
    const disparity = hideShape ? 0 : (state.rdsDisparity || 4);

    // Loop through the 256x256 logical canvas buffer
    for (let py = 0; py < 256; py++) {
        const gy = Math.min(rows - 1, Math.floor(py / dotSize)); // Map physical pixel y to noise cell
        
        for (let px = 0; px < 256; px++) {
            const gx = Math.min(cols - 1, Math.floor(px / dotSize)); // Map physical pixel x to noise cell

            // Verify if the current cell sits inside the hidden 3D target boundaries
            const isInside = (gx >= minX && gx < maxX && gy >= minY && gy < maxY);

            let leftX = gx;
            let rightX = gx;

            if (isInside) {
                // Apply single-eye horizontal displacement to keep the total relative shift
                // strictly within the boundaries of Panum's Fusional Area, preventing diplopia and blur.
                leftX = (gx - disparity + cols) % cols;
                rightX = gx; // Right eye acts as the static spatial anchor
            }

            const leftDot = cachedNoiseGrid[gy][leftX];
            const rightDot = cachedNoiseGrid[gy][rightX];

            // Resolve calibrated subpixel contrast limits from the Store
            const leftR = state.calibratorLeftR;
            const rightG = state.calibratorRightG;
            const rightB = state.calibratorRightB;

            // Apply high-contrast subpixel delta scaling from the 127 neutral gray background.
            // This isolates color channels to prevent crosstalk under cheap plastic filters.
            // (Note: Strong Eye Contrast attenuation is intentionally omitted in RDS to preserve strict binary edge disparity).
            const rVal = Math.max(0, Math.min(255, Math.round(127 + (leftDot * 2 - 1) * (leftR - 127))));
            const gVal = Math.max(0, Math.min(255, Math.round(127 + (rightDot * 2 - 1) * (rightG - 127))));
            const bVal = Math.max(0, Math.min(255, Math.round(127 + (rightDot * 2 - 1) * (rightB - 127))));

            const idx = (py * 256 + px) * 4;
            pixelBuffer[idx] = rVal;     // Red (Left Eye Channel)
            pixelBuffer[idx + 1] = gVal; // Green (Right Eye Channel)
            pixelBuffer[idx + 2] = bVal; // Blue (Right Eye Channel)
            pixelBuffer[idx + 3] = 255;  // Alpha (Fully opaque)
        }
    }

    // Write pixel buffer back to offscreen canvas
    offscreenCtx.putImageData(imgData, 0, 0);

    // Draw the temporary canvas upscaled onto the main high-DPR overlay canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Disable image smoothing to ensure random dots remain pixel-sharp and easily fusible
    ctx.imageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;

    // Draw full screen stretch (will scale 256x256 directly to high-DPR physical boundaries)
    ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
}