/*
 * GaborNeuroFit - Mathematical Visual Stimulation Engine
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module contains optimized mathematical canvas drawing routines for synthesizing
 * Gabor patches, spatial crowding flankers, zero-disparity stabilization frames, and diagnostic cards.
 */

// Draw persistent zero-disparity visual stabilization lock frame
export function drawFusionLockFrame(canvas, ctx) {
    // Render using exact neutral gray color matching the central fixation cross
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 2;
    
    // Outer boundary alignment frame
    ctx.beginPath();
    ctx.rect(8, 8, 240, 240);
    ctx.stroke();
    
    // Four corner L-brackets providing high-frequency foveation limits
    ctx.lineWidth = 1.5;
    
    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(28, 14);
    ctx.lineTo(14, 14);
    ctx.lineTo(14, 28);
    ctx.stroke();
    
    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(228, 14);
    ctx.lineTo(242, 14);
    ctx.lineTo(242, 28);
    ctx.stroke();
    
    // Bottom-left corner
    ctx.beginPath();
    ctx.moveTo(14, 228);
    ctx.lineTo(14, 242);
    ctx.lineTo(28, 242);
    ctx.stroke();
    
    // Bottom-right corner
    ctx.beginPath();
    ctx.moveTo(242, 228);
    ctx.lineTo(242, 242);
    ctx.lineTo(228, 242);
    ctx.stroke();
}

// Generate diagnostic calibration card to verify dichoptic channel isolation (Red-Cyan glasses)
export function drawFusionTestPattern(canvas, ctx, state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Fill background with standard non-fatiguing neutral gray
    ctx.fillStyle = '#7f7f7f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    // Draw solid high-contrast corner anchor boxes shifted safely inward to prevent frame overlaps
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(35, 35, 20, 20);
    ctx.fillRect(canvas.width - 55, 35, 20, 20);
    ctx.fillRect(35, canvas.height - 55, 20, 20);
    ctx.fillRect(canvas.width - 55, canvas.height - 55, 20, 20);
    
    // Configure standard typography rules for balanced, pixel-perfect alignment
    ctx.font = 'bold 42px Overpass';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Render Left (Red channel) target text. To make it vanish under the Cyan lens,
    // we lock G and B to exactly match the neutral gray background (127), leaving R fully adjustable via calibratorLeftR.
    ctx.fillStyle = `rgb(${state.calibratorLeftR}, 127, 127)`; 
    ctx.fillText('L', cx - 55, cy + 4);
    
    // Render Right (Cyan channel) target text. To make it vanish under the Red lens,
    // we lock R to exactly match the neutral gray background (127), leaving G and B fully adjustable via calibrators.
    ctx.fillStyle = `rgb(127, ${state.calibratorRightG}, ${state.calibratorRightB})`; 
    ctx.fillText('R', cx + 55, cy + 4);

    // Draw mathematically perfect, pixel-aligned central fixation cross
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // Overlay zero-disparity stabilizers to ensure motor fusion is lockable during calibration
    if (state.isFusionLockEnabled) {
        drawFusionLockFrame(canvas, ctx);
    }
}

// Low-level high-performance procedural rendering of Gabor patches & crowd flankers
export function renderGabor(canvas, ctx, state, angleDeg, contrast, freq, sigma, offsetX = 0, offsetY = 0, flankerPhaseOffset = 0, aspectRatio = 1.0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    
    // Create direct backing image data allocation buffer
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    
    const angleRad = (angleDeg * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;

    const isCrowding = state.isCrowdingEnabled;
    const flankerAngleRad = state.isOrthogonalFlankersEnabled ? (angleRad + Math.PI / 2) : 0; 
    const flankerOffset = sigma * 2.0; 

    // Render spatial pixels loop
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - (cx + offsetX);
            const dy = y - (cy + offsetY);

            // Compute standard central Gabor sinusoidal grating with anisotropic Gaussian envelope
            const x_theta = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
            const y_theta = -dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
            const gaussian = Math.exp(-(x_theta * x_theta + aspectRatio * aspectRatio * y_theta * y_theta) / (2 * sigma * sigma));
            const cosine = Math.cos(2 * Math.PI * x_theta * freq);
            
            // Apply cosine radial fade at the margins of the canvas
            const distFromCanvasCenter = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
            let fade = 1.0;
            if (distFromCanvasCenter > 85) {
                const t = Math.min(1.0, (distFromCanvasCenter - 85) / (128 - 85));
                fade = 0.5 + 0.5 * Math.cos(Math.PI * t);
            }
            if (distFromCanvasCenter >= 128) {
                fade = 0.0;
            }

            const centralGaborValue = gaussian * cosine * fade;

            // Compute flanking distractors (crowding flankers)
            let flankerGaborValue = 0;
            if (isCrowding) {
                // Top flanker with cumulative running phase-drift
                const dy1 = y - (cy - flankerOffset);
                const x_t1 = dx * Math.cos(flankerAngleRad) + dy1 * Math.sin(flankerAngleRad);
                const y_t1 = -dx * Math.sin(flankerAngleRad) + dy1 * Math.cos(flankerAngleRad);
                const g1 = Math.exp(-(x_t1 * x_t1 + aspectRatio * aspectRatio * y_t1 * y_t1) / (2 * sigma * sigma)) * Math.cos(2 * Math.PI * x_t1 * freq + flankerPhaseOffset);

                // Bottom flanker with cumulative running phase-drift
                const dy2 = y - (cy + flankerOffset);
                const x_t2 = dx * Math.cos(flankerAngleRad) + dy2 * Math.sin(flankerAngleRad);
                const y_t2 = -dx * Math.sin(flankerAngleRad) + dy2 * Math.cos(flankerAngleRad);
                const g2 = Math.exp(-(x_t2 * x_t2 + aspectRatio * aspectRatio * y_t2 * y_t2) / (2 * sigma * sigma)) * Math.cos(2 * Math.PI * x_t2 * freq + flankerPhaseOffset);

                flankerGaborValue = (g1 + g2) * 0.55 * fade;
            }

            let R = 127;
            let G = 127;
            let B = 127;

            if (state.isAnaglyphEnabled) {
                // Execute dynamic subpixel-split blending
                const lazyContrast = contrast;
                const strongContrast = contrast * state.strongEyeContrastFactor;
                const isLazyEyeRed = (state.lazyEyeSide === state.redEyeSide);

                const lazyVal = centralGaborValue * 127 * lazyContrast;
                const strongVal = flankerGaborValue * 127 * strongContrast;

                // Hardware-level absolute subpixel scaling: non-active channels are locked to 0 for modulation!
                const leftScale = state.calibratorLeftR / 255;
                const rightGScale = state.calibratorRightG / 255;
                const rightBScale = state.calibratorRightB / 255;

                if (isLazyEyeRed) {
                    R = 127 + lazyVal * leftScale;
                    G = 127 + strongVal * rightGScale;
                    B = 127 + strongVal * rightBScale;
                } else {
                    R = 127 + strongVal * leftScale;
                    G = 127 + lazyVal * rightGScale;
                    B = 127 + lazyVal * rightBScale;
                }
            } else {
                // Execute standard monocular greyscale render
                const totalGaborValue = centralGaborValue + flankerGaborValue;
                const intensity = 127 + totalGaborValue * 127 * contrast;
                R = G = B = intensity;
            }

            // Secure safe luminance ceilings to prevent clamping artifacts
            R = Math.max(0, Math.min(255, R)); 
            G = Math.max(0, Math.min(255, G)); 
            B = Math.max(0, Math.min(255, B)); 
            
            const idx = (y * width + x) * 4;
            data[idx] = R;     
            data[idx + 1] = G; 
            data[idx + 2] = B; 
            data[idx + 3] = 255;       
        }
    }
    
    // Commit calculated pixels array to canvas device buffer
    ctx.putImageData(imgData, 0, 0);

    // Overlay visual zero-disparity locks over Gabor stimulations
    if (state.isFusionLockEnabled) {
        drawFusionLockFrame(canvas, ctx);
    }
}