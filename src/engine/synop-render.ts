/**
 * @file synop-render.ts
 * @description 2D Synoptophore target rendering subsystem.
 * Implements a digital version of a classic orthoptic device used for diagnosing and 
 * treating strabismus (squint) by training sensory fusion and motor vergence reserves.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { drawFusionLockFrame } from './gabor-render';
import type { AppState } from '../types/clinical';

/**
 * @description Master mathematical renderer for optometric vergence targets.
 *
 * @clinical
 * - Dissociated Target Presentation: Translates the digital strabismus deviation vector 
 *   (synopTargetX / Y) into decoupled color-channel targets (Dichoptic presentation).
 * - Alpha-Resonance stroboscopy: If flicker is active, it runs a counter-phase 10Hz oscillation 
 *   on the lazy eye target, pulsing it against the SSoT Neutral Gray background (127 sRGB). 
 * - Constant Luminance Maintenance: The stroboscopic interpolation ensures that the average 
 *   pixel luminance remains constant, preventing the pupillary light reflex (pupil constriction/dilation) 
 *   which would otherwise lead to rapid ocular fatigue and accommodative micro-fluctuations.
 * 
 * @mathematical
 * - Performs linear interpolation (LERP) of channel intensities using the [factor] parameter.
 * - Symmetrically attenuates the strong eye's color mapping towards neutral gray (127) 
 *   using synopStrongEyeContrastFactor to equalize interocular suppression.
 * 
 * @param {HTMLCanvasElement | null} canvas - Target canvas for rendering.
 * @param {CanvasRenderingContext2D | null} ctx - 2D context of the overlay canvas.
 * @param {AppState} state - Global application state.
 * @param {number} factor - Interpolation factor for flicker animation [-1.0 to 1.0]. Defaults to 1.0.
 */
export function drawSynoptophoreTargets(
    canvas: HTMLCanvasElement | null,
    ctx: CanvasRenderingContext2D | null,
    state: AppState,
    factor: number = 1.0
): void {
    if (!canvas || !ctx) return;

    const scale = canvas.width / 256.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const cx = 128;
    const cy = 128;

    const r = state.synopCalibratorLeftR;
    const g = state.synopCalibratorRightG;
    const b = state.synopCalibratorRightB;

    const isLazyRed = (state.lazyEyeSide === state.redEyeSide);

    // Fade strong eye colors towards neutral gray (127) using the independent Synoptophore contrast factor balancer
    const strongFactor = state.synopStrongEyeContrastFactor;

    // Resolve pure channel attenuations for non-lazy channels
    const r_attenuated = isLazyRed ? r : Math.round(127 + (r - 127) * strongFactor);
    const g_attenuated = isLazyRed ? Math.round(127 + (g - 127) * strongFactor) : g;
    const b_attenuated = isLazyRed ? Math.round(127 + (b - 127) * strongFactor) : b;

    // Clinical: Counter-phase interpolation (resonance flicker) for the lazy eye target
    const flickerFactor = factor;

    const r_lazy = isLazyRed ? Math.max(0, Math.min(255, Math.round(127 + (r - 127) * flickerFactor))) : r_attenuated;
    const g_lazy = isLazyRed ? g_attenuated : Math.max(0, Math.min(255, Math.round(127 + (g - 127) * flickerFactor)));
    const b_lazy = isLazyRed ? b_attenuated : Math.max(0, Math.min(255, Math.round(127 + (b - 127) * flickerFactor)));

    const lazyColor = isLazyRed ? `rgb(${r_lazy}, 127, 127)` : `rgb(127, ${g_lazy}, ${b_lazy})`;
    const strongColor = isLazyRed ? `rgb(127, ${g_attenuated}, ${b_attenuated})` : `rgb(${r_attenuated}, 127, 127)`;

    const tx = state.synopTargetX;
    const ty = state.synopTargetY;

    const lx = cx + tx;
    const ly = cy + ty;

    // Render spatial coordinate guidelines if enabled to assist initial target capture
    if (state.synopShowLazyGrid || state.synopShowStrongGrid) {
        ctx.save();
        ctx.setLineDash([2, 5]);
        ctx.lineWidth = 2.5;

        if (state.synopShowLazyGrid) {
            ctx.strokeStyle = lazyColor;
            ctx.beginPath();
            ctx.moveTo(8, 8); ctx.lineTo(lx, ly);
            ctx.moveTo(248, 8); ctx.lineTo(lx, ly);
            ctx.moveTo(8, 248); ctx.lineTo(lx, ly);
            ctx.moveTo(248, 248); ctx.lineTo(lx, ly);
            ctx.stroke();
        }

        if (state.synopShowStrongGrid) {
            ctx.strokeStyle = strongColor;
            ctx.beginPath();
            ctx.moveTo(8, 8); ctx.lineTo(cx, cy);
            ctx.moveTo(248, 8); ctx.lineTo(cx, cy);
            ctx.moveTo(8, 248); ctx.lineTo(cx, cy);
            ctx.moveTo(248, 248); ctx.lineTo(cx, cy);
            ctx.stroke();
        }

        ctx.restore();
    }

    const size = state.synopTargetSize;
    const lineWidth = Math.max(3, Math.round(size * 0.09));

    const dotRadius = size * 0.12;
    const crossHalf = size * 0.15;

    // Branch rendering based on target geometry preset
    if (state.synopTargetType === 'cross-square') {
        // Clinical 'Cross & Square' dissociation pattern
        ctx.strokeStyle = strongColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - crossHalf, cy);
        ctx.lineTo(cx + crossHalf, cy);
        ctx.moveTo(cx, cy - crossHalf);
        ctx.lineTo(cx, cy + crossHalf);
        ctx.stroke();

        ctx.strokeStyle = lazyColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.rect(lx - size, ly - size, size * 2, size * 2);
        ctx.stroke();

    } else {
        // Clinical 'Ring & Dot' dissociation pattern
        ctx.fillStyle = strongColor;
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = lazyColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(lx, ly, size, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // Render persistent zero-disparity stabilization frame
    drawFusionLockFrame(canvas, ctx, scale);

    ctx.restore();
}