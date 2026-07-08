/*
 * GaborNeuroFit - 2D Synoptophore Target Renderer Subsystem
 * Copyright (C) 2026 Pavel Korotkov
 */

import { drawFusionLockFrame } from './gabor.js';

/**
 * Renders dichoptic alignment targets on the transparent 2D overlay canvas.
 * Keeps foveation coordinates calibrated on a logical 256x256 workspace.
 * 
 * @param {HTMLCanvasElement} canvas - The target canvas.
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
 * @param {Object} state - The global store state representation.
 * @param {number} factor - Dynamic luminance interpolation multiplier for 10Hz resonance flicker (0.0 to 1.0).
 */
export function drawSynoptophoreTargets(canvas, ctx, state, factor = 1.0) {
    if (!canvas || !ctx) return;

    const scale = canvas.width / 256.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const cx = 128;
    const cy = 128;

    const r = state.calibratorLeftR;
    const g = state.calibratorRightG;
    const b = state.calibratorRightB;

    const isLazyRed = (state.lazyEyeSide === state.redEyeSide);

    // CLINICAL LUMINANCE MATCHING INTERPOLATION (RESONANCE FLICKER)
    // Dynamically scales the intensity of the lazy channel to perfectly blend into the sRGB(127) gray background.
    // Strong eye remains 100% solid to hold the foveal lock.
    const r_lazy = Math.round(127 + (r - 127) * factor);
    const g_lazy = Math.round(127 + (g - 127) * factor);
    const b_lazy = Math.round(127 + (b - 127) * factor);

    const pureRedFlicker = `rgb(${r_lazy}, 127, 127)`;
    const pureCyanFlicker = `rgb(127, ${g_lazy}, ${b_lazy})`;

    const pureRedSolid = `rgb(${r}, 127, 127)`;
    const pureCyanSolid = `rgb(127, ${g}, ${b})`;

    // Apply interpolated colors strictly to the lazy eye geometry to smash suppression.
    const lazyColor = isLazyRed ? pureRedFlicker : pureCyanFlicker;
    const strongColor = isLazyRed ? pureCyanSolid : pureRedSolid;

    const tx = state.synopTargetX;
    const ty = state.synopTargetY;

    // Center coordinates for lazy and strong channels
    const lx = cx + tx;
    const ly = cy + ty;

    // LAYER 1: Draw Target Alignment Grid (Visir) FIRST - so it renders BEHIND targets and frame
    if (state.synopShowLazyGrid || state.synopShowStrongGrid) {
        ctx.save();
        ctx.setLineDash([1, 4]); // High-fidelity micro-dotted pattern for subpixel alignments
        ctx.lineWidth = 1.5;

        // Lazy eye diagonal guidelines converging precisely into the center (lx, ly)
        if (state.synopShowLazyGrid) {
            ctx.strokeStyle = lazyColor;
            ctx.beginPath();
            ctx.moveTo(8, 8); ctx.lineTo(lx, ly);
            ctx.moveTo(248, 8); ctx.lineTo(lx, ly);
            ctx.moveTo(8, 248); ctx.lineTo(lx, ly);
            ctx.moveTo(248, 248); ctx.lineTo(lx, ly);
            ctx.stroke();
        }

        // Strong eye diagonal guidelines converging precisely into the static foveal center (cx, cy)
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

    // LAYER 2: Draw Active Targets (Middle layer with Ophthalmic proportional scaling & Concentric Parity Lock)
    const size = state.synopTargetSize || 65;
    const lineWidth = Math.max(3, Math.round(size * 0.09));
    
    // CONCENTRIC PARITY LOCK: Enforce even-integer boundaries on all central elements.
    const dotRadius = 2 * Math.round((size * 0.12) / 2);
    const crossHalf = 2 * Math.round((size * 0.3) / 2);

    if (state.synopTargetType === 'cross-square') {
        // GEOMETRY B: Hollow Square (Lazy) + Thick Cross (Strong)
        
        // 1. Draw Strong Eye Target FIRST
        ctx.strokeStyle = strongColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - crossHalf, cy);
        ctx.lineTo(cx + crossHalf, cy);
        ctx.moveTo(cx, cy - crossHalf);
        ctx.lineTo(cx, cy + crossHalf);
        ctx.stroke();

        // 2. Draw Lazy Eye Target SECOND - wraps around the cross with a clean gap!
        ctx.strokeStyle = lazyColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.rect(lx - size, ly - size, size * 2, size * 2);
        ctx.stroke();

    } else {
        // GEOMETRY A (Default): Massive Hollow Ring (Lazy) + Solid Dot (Strong)
        
        // 1. Draw Strong Eye Target FIRST
        ctx.fillStyle = strongColor;
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius, 0, 2 * Math.PI);
        ctx.fill();

        // 2. Draw Lazy Eye Target SECOND - wraps around the dot with a clean gap!
        ctx.strokeStyle = lazyColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(lx, ly, size, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // LAYER 3: Draw Peripheral Fusion Lock LAST - acts as a stencil mask covering circle/lines edges
    if (state.isFusionLockEnabled) {
        drawFusionLockFrame(canvas, ctx, scale);
    }

    ctx.restore();
}