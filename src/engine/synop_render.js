/*
 * GaborNeuroFit - 2D Synoptophore Target Renderer Subsystem
 * Copyright (C) 2026 Pavel Korotkov
 */

import { drawFusionLockFrame } from './gabor.js';

export function drawSynoptophoreTargets(canvas, ctx, state) {
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

    // CLINICAL LUMINANCE MATCHING (GHOST ELIMINATION)
    const pureRed = `rgb(${r}, 127, 127)`;
    const pureCyan = `rgb(127, ${g}, ${b})`;

    const lazyColor = isLazyRed ? pureRed : pureCyan;
    const strongColor = isLazyRed ? pureCyan : pureRed;

    const tx = state.synopTargetX;
    const ty = state.synopTargetY;

    // Center coordinates for lazy and strong channels
    const lx = cx + tx;
    const ly = cy + ty;

    // LAYER 1: Draw Target Alignment Grid (Visir) FIRST - so it renders BEHIND targets and frame
    if (state.synopShowLazyGrid || state.synopShowStrongGrid) {
        ctx.save();
        ctx.setLineDash([4, 8]);
        ctx.lineWidth = 1.5;

        // Lazy eye diagonal guidelines converging on the displaced target center
        if (state.synopShowLazyGrid) {
            ctx.strokeStyle = lazyColor;
            ctx.beginPath();
            ctx.moveTo(8, 8); ctx.lineTo(lx, ly);
            ctx.moveTo(248, 8); ctx.lineTo(lx, ly);
            ctx.moveTo(8, 248); ctx.lineTo(lx, ly);
            ctx.moveTo(248, 248); ctx.lineTo(lx, ly);
            ctx.stroke();
        }

        // Strong eye diagonal guidelines converging on the static foveal center
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

    // LAYER 2: Draw Active Targets (Middle layer)
    if (state.synopTargetType === 'cross-square') {
        // GEOMETRY B: Massive Hollow Square (Lazy) + Thick Cross (Strong)
        ctx.strokeStyle = lazyColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.rect(lx - 65, ly - 65, 130, 130);
        ctx.stroke();

        ctx.strokeStyle = strongColor;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy);
        ctx.lineTo(cx + 20, cy);
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx, cy + 20);
        ctx.stroke();
    } else {
        // GEOMETRY A (Default): Massive Hollow Ring (Lazy) + Solid Dot (Strong)
        ctx.strokeStyle = lazyColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(lx, ly, 65, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = strongColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
        ctx.fill();
    }

    // LAYER 3: Draw Peripheral Fusion Lock LAST - acts as a stencil mask covering circle/lines edges
    if (state.isFusionLockEnabled) {
        drawFusionLockFrame(canvas, ctx, 1.0);
    }

    ctx.restore();
}