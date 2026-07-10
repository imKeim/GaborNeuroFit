/*
 * GaborNeuroFit - 2D Synoptophore Target Renderer Subsystem
 * Copyright (C) 2026 Pavel Korotkov
 */

import { drawFusionLockFrame } from './gabor.js';

export function drawSynoptophoreTargets(canvas, ctx, state, factor = 1.0) {
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

    // CLINICAL COUNTER-PHASE INTERPOLATION (RESONANCE FLICKER) FOR LAZY EYE
    // Oscillates the target from "Bright Calibrated" to "Dark Inverse" through the neutral gray background.
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

    const size = state.synopTargetSize || 65;
    const lineWidth = Math.max(3, Math.round(size * 0.09));
    
    const dotRadius = size * 0.12;
    const crossHalf = size * 0.15; 

    if (state.synopTargetType === 'cross-square') {
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

    drawFusionLockFrame(canvas, ctx, scale);

    ctx.restore();
}