/*
 * GaborNeuroFit - Dichoptic Lens Calibration Test Pattern Renderer
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Decoupled module (Separation of Concerns). Handles flat 2D Canvas L/R letters 
 * hardware-to-lens calibration, completely isolated from WebGL Gabor GPU pipelines.
 */

import { drawFusionLockFrame } from './gabor-render';
import type { AppState } from '../types/clinical';

/**
 * @description Generates diagnostic calibration card to verify dichoptic channel isolation.
 *
 * @clinical By displaying a deeply colored 'L' and 'R' on an exact sRGB neutral gray background,
 * the patient can physically verify ocular dominance and fine-tune contrast attenuation
 * until the suppressed eye is granted cortical access (breaking the interocular suppression barrier).
 */
export function drawFusionTestPattern(canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null, state: AppState): void {
    if (!canvas || !ctx) return;

    const scale = canvas.width / 256.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Render the four corner visual anchors
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(35, 35, 20, 20);
    ctx.fillRect(256 - 55, 35, 20, 20);
    ctx.fillRect(35, 256 - 55, 20, 20);
    ctx.fillRect(256 - 55, 256 - 55, 20, 20);

    ctx.font = 'bold 42px Overpass';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const isSynop = state.appMode === 'synoptophore';
    const leftR = isSynop ? state.synopCalibratorLeftR : state.calibratorLeftR;
    const rightG = isSynop ? state.synopCalibratorRightG : state.calibratorRightG;
    const rightB = isSynop ? state.synopCalibratorRightB : state.calibratorRightB;

    const cx = 128;
    const cy = 128;

    const isLeftStrong = state.lazyEyeSide === 'right';
    const isRightStrong = state.lazyEyeSide === 'left';

    // Apply contrast balancer in Gabor and Synoptophore modes so the user can calibrate it,
    // but keep pure 100% contrast (1.0) in RDS mode to prevent crosstalk.
    let strongFactor = 1.0;
    if (state.appMode === 'synoptophore') {
        strongFactor = state.synopStrongEyeContrastFactor;
    } else if (state.appMode === 'gabor') {
        strongFactor = state.strongEyeContrastFactor;
    }

    const leftR_calibrated = Math.round(127 + (leftR - 127) * (isLeftStrong ? strongFactor : 1.0));
    const rightG_calibrated = Math.round(127 + (rightG - 127) * (isRightStrong ? strongFactor : 1.0));
    const rightB_calibrated = Math.round(127 + (rightB - 127) * (isRightStrong ? strongFactor : 1.0));

    ctx.fillStyle = `rgb(${leftR_calibrated}, 127, 127)`;
    ctx.fillText('L', cx - 55, cy + 4);

    ctx.fillStyle = `rgb(127, ${rightG_calibrated}, ${rightB_calibrated})`;
    ctx.fillText('R', cx + 55, cy + 4);

    // Symmetrical Clinical Lock: Always render the zero-disparity fusion lock frame 
    // during active L/R calibration across ALL three modalities to assist foveal eye orientation.
    drawFusionLockFrame(canvas, ctx, scale);

    ctx.restore();
}