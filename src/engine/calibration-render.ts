/**
 * @file calibration-render.ts
 * @description Dichoptic lens calibration and interocular suppression diagnostic engine.
 * Operates on a dedicated 2D Canvas layer to ensure font rendering stability 
 * and architectural isolation from the high-frequency WebGL Gabor GPU pipeline.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { drawFusionLockFrame } from './gabor-render';
import type { AppState } from '../types/clinical';

/**
 * @description Generates a precise diagnostic calibration card to verify dichoptic channel isolation.
 *
 * @clinical
 * - Interocular Suppression Gating: Patients with amblyopia often exhibit active cortical suppression
 *   of the weaker eye. By displaying dissociated 'L' and 'R' letters, we can identify the suppression threshold.
 * - Contrast Balancing: Reducing the 'Strong eye contrast balancer' dims the dominant eye's imagery
 *   towards neutral gray (127 sRGB), eventually allowing the brain to open the sensory gate for the weak eye.
 * - Pupillary Stability: Using a fixed 127 sRGB neutral gray background prevents the pupillary light reflex,
 *   eliminating fluctuations in retinal illumination during the active calibration phase.
 *
 * @mathematical
 * - Computes linear contrast attenuation using a median-relative delta formula:
 *   Calibrated_Value = 127 + (Raw_Channel - 127) * Attenuation_Factor.
 * - This preserves constant mean luminance regardless of the contrast settings.
 *
 * @architecture
 * - Decoupled Rendering: Uses Canvas 2D API for reliable text-to-subpixel mapping, 
 *   independent of GPU shader state.
 * - Mode Awareness: Symmetrically switches between Gabor/RDS and Synoptophore calibration variables
 *   based on the active AppMode to maintain modality-specific ocular parity.
 *
 * @param {HTMLCanvasElement | null} canvas - Target overlay canvas.
 * @param {CanvasRenderingContext2D | null} ctx - 2D rendering context.
 * @param {AppState} state - Current global application state.
 */
export function drawFusionTestPattern(canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null, state: AppState): void {
    if (!canvas || !ctx) return;

    const scale = canvas.width / 256.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Render the four corner visual anchors to provide global binocular spatial orientation
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

    // Symmetrical Calibration Contrast: Always apply the appropriate clinical contrast balancer 
    // during the active alignment test so the user can visually calibrate their eye balance.
    const strongFactor = state.appMode === 'synoptophore' ? state.synopStrongEyeContrastFactor : state.strongEyeContrastFactor;

    // Apply linear attenuation towards 127 gray median for the dominant eye channel
    const leftR_calibrated = Math.round(127 + (leftR - 127) * (isLeftStrong ? strongFactor : 1.0));
    const rightG_calibrated = Math.round(127 + (rightG - 127) * (isRightStrong ? strongFactor : 1.0));
    const rightB_calibrated = Math.round(127 + (rightB - 127) * (isRightStrong ? strongFactor : 1.0));

    // Render dissociated letters
    ctx.fillStyle = `rgb(${leftR_calibrated}, 127, 127)`;
    ctx.fillText('L', cx - 55, cy + 4);

    ctx.fillStyle = `rgb(127, ${rightG_calibrated}, ${rightB_calibrated})`;
    ctx.fillText('R', cx + 55, cy + 4);

    // Symmetrical Clinical Lock: Always render the zero-disparity fusion lock frame 
    // during active L/R calibration across ALL three modalities to assist foveal eye orientation.
    drawFusionLockFrame(canvas, ctx, scale);

    ctx.restore();
}