/*
 * GaborNeuroFit - Mathematical Visual Stimulation Engine
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module contains optimized mathematical canvas drawing routines for synthesizing
 * Gabor patches, spatial crowding flankers, zero-disparity stabilization frames, and diagnostic cards.
 */

// Global cache for WebGL context resource manager to prevent memory leaks
let webGLManagerInstance = null;

const VERTEX_SHADER_SOURCE = `
    attribute vec2 a_position;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

const FRAGMENT_SHADER_SOURCE = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform vec4 u_gabor_main; // [angleRad, contrast, freq, sigma]
    uniform vec3 u_gabor_geom; // [offsetX, offsetY, aspectRatio]
    uniform vec4 u_flanker_main; // [flankerAngleRad, contrast, flankerOffset, phaseOffset]
    uniform vec3 u_calib_scale; // [leftScale, rightGScale, rightBScale]
    uniform vec4 u_flags; // [isAnaglyph, isCrowding, isLazyEyeRed, hideCentral]

    void main() {
        vec2 st = gl_FragCoord.xy;
        vec2 center = u_resolution / 2.0;

        float angleRad = u_gabor_main.x;
        float contrast = u_gabor_main.y;
        float freq = u_gabor_main.z;
        float sigma = u_gabor_main.w;

        float offsetX = u_gabor_geom.x;
        float offsetY = u_gabor_geom.y;
        float aspectRatio = u_gabor_geom.z;

        float flankerAngleRad = u_flanker_main.x;
        float flankerContrast = u_flanker_main.y;
        float flankerOffset = u_flanker_main.z;
        float flankerPhaseOffset = u_flanker_main.w;

        bool isAnaglyph = u_flags.x > 0.5;
        bool isCrowding = u_flags.y > 0.5;
        bool isLazyEyeRed = u_flags.z > 0.5;
        bool hideCentral = u_flags.w > 0.5;

        // Coordinates shifted by peripheral eccentricity offset
        vec2 d = st - (center + vec2(offsetX, offsetY));

        // Central Gabor calculations
        float x_theta = d.x * cos(angleRad) + d.y * sin(angleRad);
        float y_theta = -d.x * sin(angleRad) + d.y * cos(angleRad);
        float gaussian = exp(-(x_theta * x_theta + aspectRatio * aspectRatio * y_theta * y_theta) / (2.0 * sigma * sigma));
        float cosine = cos(2.0 * 3.14159265 * x_theta * freq);

        float distFromCanvasCenter = distance(st, center);
        float fade = 1.0;
        if (distFromCanvasCenter > 85.0) {
            fade = 0.5 + 0.5 * cos(3.14159265 * clamp((distFromCanvasCenter - 85.0) / (128.0 - 85.0), 0.0, 1.0));
        }
        if (distFromCanvasCenter >= 128.0) {
            fade = 0.0;
        }

        float centralGaborValue = hideCentral ? 0.0 : (gaussian * cosine * fade);

        // Flankers calculations
        float flankerGaborValue = 0.0;
        if (isCrowding) {
            // Top flanker
            vec2 d1 = st - (center + vec2(offsetX, offsetY - flankerOffset));
            float x_t1 = d1.x * cos(flankerAngleRad) + d1.y * sin(flankerAngleRad);
            float y_t1 = -d1.x * sin(flankerAngleRad) + d1.y * cos(flankerAngleRad);
            float g1 = exp(-(x_t1 * x_t1 + aspectRatio * aspectRatio * y_t1 * y_t1) / (2.0 * sigma * sigma)) * cos(2.0 * 3.14159265 * x_t1 * freq + flankerPhaseOffset);

            // Bottom flanker
            vec2 d2 = st - (center + vec2(offsetX, offsetY + flankerOffset));
            float x_t2 = d2.x * cos(flankerAngleRad) + d2.y * sin(flankerAngleRad);
            float y_t2 = -d2.x * sin(flankerAngleRad) + d2.y * cos(flankerAngleRad);
            float g2 = exp(-(x_t2 * x_t2 + aspectRatio * aspectRatio * y_t2 * y_t2) / (2.0 * sigma * sigma)) * cos(2.0 * 3.14159265 * x_t2 * freq + flankerPhaseOffset);

            flankerGaborValue = (g1 + g2) * 0.55 * fade;
        }

        float L_bg = 0.21763;
        vec3 color = vec3(L_bg);

        if (isAnaglyph) {
            // Apply calibration scales ONLY to dynamic Gabor wave oscillations (deltas)
            float delta_lazy = centralGaborValue * L_bg * contrast;
            float delta_strong = flankerGaborValue * L_bg * flankerContrast;

            if (isLazyEyeRed) {
                color.r = L_bg + (delta_lazy * u_calib_scale.x);
                color.g = L_bg + (delta_strong * u_calib_scale.y);
                color.b = L_bg + (delta_strong * u_calib_scale.z);
            } else {
                color.r = L_bg + (delta_strong * u_calib_scale.x);
                color.g = L_bg + (delta_lazy * u_calib_scale.y);
                color.b = L_bg + (delta_lazy * u_calib_scale.z);
            }
        } else {
            float L_total = L_bg + ((centralGaborValue + flankerGaborValue) * L_bg * contrast);
            color = vec3(L_total);
        }

        // Apply 1/2.2 gamma correction on final pixel output
        vec3 gammaCorrected = pow(max(color, 0.0), vec3(1.0 / 2.2));
        gl_FragColor = vec4(gammaCorrected, 1.0);
    }
`;

class WebGLResourceManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { depth: false, antialias: false, preserveDrawingBuffer: true }) || 
                  canvas.getContext('experimental-webgl', { depth: false, antialias: false, preserveDrawingBuffer: true });
        this.isReady = false;
        if (this.gl) {
            this.init();
        }
    }

    init() {
        const gl = this.gl;
        const program = this.createProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
        if (!program) return;
        this.program = program;

        // Map attribute positions
        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1.0, -1.0,  1.0, -1.0, -1.0,  1.0,
            -1.0,  1.0,  1.0, -1.0,  1.0,  1.0
        ]), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Cache uniform addresses
        this.u_resolution = gl.getUniformLocation(program, 'u_resolution');
        this.u_gabor_main = gl.getUniformLocation(program, 'u_gabor_main');
        this.u_gabor_geom = gl.getUniformLocation(program, 'u_gabor_geom');
        this.u_flanker_main = gl.getUniformLocation(program, 'u_flanker_main');
        this.u_calib_scale = gl.getUniformLocation(program, 'u_calib_scale');
        this.u_flags = gl.getUniformLocation(program, 'u_flags');

        this.isReady = true;
    }

    createProgram(vertexSrc, fragmentSrc) {
        const gl = this.gl;
        const vs = this.compileShader(vertexSrc, gl.VERTEX_SHADER);
        const fs = this.compileShader(fragmentSrc, gl.FRAGMENT_SHADER);
        if (!vs || !fs) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    compileShader(src, type) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    render(state, angleDeg, contrast, freq, sigma, offsetX, offsetY, flankerPhaseOffset, aspectRatio, hideCentral) {
        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);

        const angleRad = (angleDeg * Math.PI) / 180;
        const flankerAngleRad = state.isOrthogonalFlankersEnabled ? (angleRad + Math.PI / 2) : 0;
        const flankerOffset = sigma * 2.0;

        gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform4f(this.u_gabor_main, -angleRad, contrast, freq, sigma);
        gl.uniform3f(this.u_gabor_geom, offsetX, -offsetY, aspectRatio);
        gl.uniform4f(this.u_flanker_main, -flankerAngleRad, contrast * state.strongEyeContrastFactor, flankerOffset, flankerPhaseOffset);
        gl.uniform3f(this.u_calib_scale, state.calibratorLeftR / 255, state.calibratorRightG / 255, state.calibratorRightB / 255);
        gl.uniform4f(this.u_flags, state.isAnaglyphEnabled ? 1.0 : 0.0, state.isCrowdingEnabled ? 1.0 : 0.0, (state.lazyEyeSide === state.redEyeSide) ? 1.0 : 0.0, hideCentral ? 1.0 : 0.0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

// Low-level high-performance procedural rendering fallback for CPU (Canvas 2D)
function renderGaborCPU(canvas, ctx, state, angleDeg, contrast, freq, sigma, offsetX, offsetY, flankerPhaseOffset, aspectRatio, hideCentral) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const angleRad = (angleDeg * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const isCrowding = state.isCrowdingEnabled;
    const flankerAngleRad = state.isOrthogonalFlankersEnabled ? (angleRad + Math.PI / 2) : 0;
    const flankerOffset = sigma * 2.0;
    const L_bg = 0.21763;

    const lazyContrast = contrast;
    const strongContrast = contrast * state.strongEyeContrastFactor;
    const isLazyEyeRed = (state.lazyEyeSide === state.redEyeSide);
    const leftScale = state.calibratorLeftR / 255;
    const rightGScale = state.calibratorRightG / 255;
    const rightBScale = state.calibratorRightB / 255;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - (cx + offsetX);
            const dy = y - (cy + offsetY);

            const x_theta = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
            const y_theta = -dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
            const gaussian = Math.exp(-(x_theta * x_theta + aspectRatio * aspectRatio * y_theta * y_theta) / (2 * sigma * sigma));
            const cosine = Math.cos(2 * Math.PI * x_theta * freq);

            const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
            let fade = 1.0;
            if (dist > 85) {
                const t = Math.min(1.0, (dist - 85) / (128 - 85));
                fade = 0.5 + 0.5 * Math.cos(Math.PI * t);
            }
            if (dist >= 128) fade = 0.0;

            const centralGaborValue = hideCentral ? 0 : (gaussian * cosine * fade);
            let flankerGaborValue = 0;

            if (isCrowding) {
                const dy1 = y - (cy - flankerOffset);
                const x_t1 = dx * Math.cos(flankerAngleRad) + dy1 * Math.sin(flankerAngleRad);
                const y_t1 = -dx * Math.sin(flankerAngleRad) + dy1 * Math.cos(flankerAngleRad);
                const g1 = Math.exp(-(x_t1 * x_t1 + aspectRatio * aspectRatio * y_t1 * y_t1) / (2 * sigma * sigma)) * Math.cos(2 * Math.PI * x_t1 * freq + flankerPhaseOffset);

                const dy2 = y - (cy + flankerOffset);
                const x_t2 = dx * Math.cos(flankerAngleRad) + dy2 * Math.sin(flankerAngleRad);
                const y_t2 = -dx * Math.sin(flankerAngleRad) + dy2 * Math.cos(flankerAngleRad);
                const g2 = Math.exp(-(x_t2 * x_t2 + aspectRatio * aspectRatio * y_t2 * y_t2) / (2 * sigma * sigma)) * Math.cos(2 * Math.PI * x_t2 * freq + flankerPhaseOffset);

                flankerGaborValue = (g1 + g2) * 0.55 * fade;
            }

            let R, G, B;
            if (state.isAnaglyphEnabled) {
                const L_lazy = L_bg + (centralGaborValue * L_bg * lazyContrast);
                const L_strong = L_bg + (flankerGaborValue * L_bg * strongContrast);
                if (isLazyEyeRed) {
                    R = Math.pow(Math.max(0, L_lazy * leftScale), 1 / 2.2) * 255;
                    G = Math.pow(Math.max(0, L_strong * rightGScale), 1 / 2.2) * 255;
                    B = Math.pow(Math.max(0, L_strong * rightBScale), 1 / 2.2) * 255;
                } else {
                    R = Math.pow(Math.max(0, L_strong * leftScale), 1 / 2.2) * 255;
                    G = Math.pow(Math.max(0, L_lazy * rightGScale), 1 / 2.2) * 255;
                    B = Math.pow(Math.max(0, L_lazy * rightBScale), 1 / 2.2) * 255;
                }
            } else {
                const totalGaborValue = centralGaborValue + flankerGaborValue;
                const L_total = L_bg + (totalGaborValue * L_bg * contrast);
                R = G = B = Math.pow(Math.max(0, L_total), 1 / 2.2) * 255;
            }

            const idx = (y * width + x) * 4;
            data[idx] = Math.max(0, Math.min(255, R));
            data[idx + 1] = Math.max(0, Math.min(255, G));
            data[idx + 2] = Math.max(0, Math.min(255, B));
            data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

// Draw persistent zero-disparity visual stabilization lock frame (Executed on top transparent layer)
export function drawFusionLockFrame(canvas, ctx) {
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 2;
    
    // Outer boundary alignment frame
    ctx.beginPath();
    ctx.rect(8, 8, 240, 240);
    ctx.stroke();
    
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

// Generate diagnostic calibration card to verify dichoptic channel isolation (Executed on top transparent layer)
export function drawFusionTestPattern(canvas, ctx, state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Solid high-contrast corner anchor boxes shifted safely inward
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(35, 35, 20, 20);
    ctx.fillRect(canvas.width - 55, 35, 20, 20);
    ctx.fillRect(35, canvas.height - 55, 20, 20);
    ctx.fillRect(canvas.width - 55, canvas.height - 55, 20, 20);
    
    // Configure standard typography rules for balanced, pixel-perfect alignment
    ctx.font = 'bold 42px Overpass';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const leftR = state.calibratorLeftR;
    const rightG = state.calibratorRightG;
    const rightB = state.calibratorRightB;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Render Left (Red channel) target text
    ctx.fillStyle = `rgb(${leftR}, 127, 127)`; 
    ctx.fillText('L', cx - 55, cy + 4);
    
    // Render Right (Cyan channel) target text
    ctx.fillStyle = `rgb(127, ${rightG}, ${rightB})`; 
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

// Modern unified entry point for Gabor rendering with transparent GPU-to-CPU execution routing
export function renderGabor(canvas, ctx, state, angleDeg, contrast, freq, sigma, offsetX = 0, offsetY = 0, flankerPhaseOffset = 0, aspectRatio = 1.0, hideCentral = false) {
    if (!webGLManagerInstance || webGLManagerInstance.canvas !== canvas) {
        webGLManagerInstance = new WebGLResourceManager(canvas);
    }

    if (webGLManagerInstance.isReady) {
        webGLManagerInstance.render(state, angleDeg, contrast, freq, sigma, offsetX, offsetY, flankerPhaseOffset, aspectRatio, hideCentral);
    } else {
        renderGaborCPU(canvas, ctx, state, angleDeg, contrast, freq, sigma, offsetX, offsetY, flankerPhaseOffset, aspectRatio, hideCentral);
    }
}