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
    uniform float u_scale;
    uniform vec4 u_gabor_main; // [angleRad, centralContrast, freq, sigma]
    uniform vec3 u_gabor_geom; // [offsetX, offsetY, aspectRatio]
    uniform vec4 u_flanker_main; // [flankerAngleRad, flankerContrast, flankerOffset, phaseOffset]
    uniform vec3 u_calib_scale; // [leftScale, rightGScale, rightBScale]
    uniform vec4 u_flags; // [isAnaglyph, isCrowding, isLazyEyeRed, hideCentral]
    uniform float u_crowding_mode; // 0=vertical, 1=horizontal, 2=all-sides

    void main() {
        vec2 st = gl_FragCoord.xy;
        vec2 center = u_resolution / 2.0;

        float angleRad = u_gabor_main.x;
        float centralContrast = u_gabor_main.y;
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

        // Normalized relative coordinates in the virtual 256x256 space via u_scale
        vec2 d = (st - (center + vec2(offsetX, offsetY) * u_scale)) / u_scale;

        // Central Gabor calculations
        float x_theta = d.x * cos(angleRad) + d.y * sin(angleRad);
        float y_theta = -d.x * sin(angleRad) + d.y * cos(angleRad);
        float gaussian = exp(-(x_theta * x_theta + aspectRatio * aspectRatio * y_theta * y_theta) / (2.0 * sigma * sigma));
        float cosine = cos(2.0 * 3.14159265 * x_theta * freq);

        float distFromCanvasCenter = distance(st, center) / u_scale;
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
            int crowdMode = int(u_crowding_mode + 0.5); // 0=vertical, 1=horizontal, 2=all

            // Helper macro: compute a single flanker Gabor value at given screen-space offset
            // Top flanker (used in vertical and all-sides)
            vec2 d1 = (st - (center + vec2(offsetX, offsetY - flankerOffset) * u_scale)) / u_scale;
            float x_t1 = d1.x * cos(flankerAngleRad) + d1.y * sin(flankerAngleRad);
            float y_t1 = -d1.x * sin(flankerAngleRad) + d1.y * cos(flankerAngleRad);
            float g_top = exp(-(x_t1*x_t1 + aspectRatio*aspectRatio*y_t1*y_t1) / (2.0*sigma*sigma)) * cos(2.0*3.14159265*x_t1*freq + flankerPhaseOffset);

            // Bottom flanker
            vec2 d2 = (st - (center + vec2(offsetX, offsetY + flankerOffset) * u_scale)) / u_scale;
            float x_t2 = d2.x * cos(flankerAngleRad) + d2.y * sin(flankerAngleRad);
            float y_t2 = -d2.x * sin(flankerAngleRad) + d2.y * cos(flankerAngleRad);
            float g_bot = exp(-(x_t2*x_t2 + aspectRatio*aspectRatio*y_t2*y_t2) / (2.0*sigma*sigma)) * cos(2.0*3.14159265*x_t2*freq + flankerPhaseOffset);

            // Left flanker
            vec2 d3 = (st - (center + vec2(offsetX - flankerOffset, offsetY) * u_scale)) / u_scale;
            float x_t3 = d3.x * cos(flankerAngleRad) + d3.y * sin(flankerAngleRad);
            float y_t3 = -d3.x * sin(flankerAngleRad) + d3.y * cos(flankerAngleRad);
            float g_lft = exp(-(x_t3*x_t3 + aspectRatio*aspectRatio*y_t3*y_t3) / (2.0*sigma*sigma)) * cos(2.0*3.14159265*x_t3*freq + flankerPhaseOffset);

            // Right flanker
            vec2 d4 = (st - (center + vec2(offsetX + flankerOffset, offsetY) * u_scale)) / u_scale;
            float x_t4 = d4.x * cos(flankerAngleRad) + d4.y * sin(flankerAngleRad);
            float y_t4 = -d4.x * sin(flankerAngleRad) + d4.y * cos(flankerAngleRad);
            float g_rgt = exp(-(x_t4*x_t4 + aspectRatio*aspectRatio*y_t4*y_t4) / (2.0*sigma*sigma)) * cos(2.0*3.14159265*x_t4*freq + flankerPhaseOffset);

            if (crowdMode == 1) {
                // Horizontal only: left + right
                flankerGaborValue = (g_lft + g_rgt) * 0.55 * fade;
            } else if (crowdMode == 2) {
                // All four sides — scale down to maintain equal perceptual weight per flanker
                flankerGaborValue = (g_top + g_bot + g_lft + g_rgt) * 0.275 * fade;
            } else {
                // Default: vertical only — top + bottom
                flankerGaborValue = (g_top + g_bot) * 0.55 * fade;
            }
        }

        float L_bg = 0.21763;
        vec3 color = vec3(L_bg);

        if (isAnaglyph) {
            // Apply calibration scales ONLY to dynamic Gabor wave oscillations (deltas)
            float delta_lazy = centralGaborValue * L_bg * centralContrast;
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
            float L_total = L_bg + (centralGaborValue * L_bg * centralContrast) + (flankerGaborValue * L_bg * flankerContrast);
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
        // Request deep 24-bit opaque rendering, subpixel anti-aliasing, and force discrete high-performance GPU Swap Chain
        const glOptions = { 
            depth: false, 
            antialias: true, 
            alpha: false,
            premultipliedAlpha: false,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false // Fast hardware buffer page flipping enabled
        };
        this.gl = canvas.getContext('webgl', glOptions) || 
                  canvas.getContext('experimental-webgl', glOptions);
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
        this.u_scale = gl.getUniformLocation(program, 'u_scale');
        this.u_gabor_main = gl.getUniformLocation(program, 'u_gabor_main');
        this.u_gabor_geom = gl.getUniformLocation(program, 'u_gabor_geom');
        this.u_flanker_main = gl.getUniformLocation(program, 'u_flanker_main');
        this.u_calib_scale = gl.getUniformLocation(program, 'u_calib_scale');
        this.u_flags = gl.getUniformLocation(program, 'u_flags');
        this.u_crowding_mode = gl.getUniformLocation(program, 'u_crowding_mode');

        this.isReady = true;
    }

    destroy() {
        const gl = this.gl;
        if (!gl) return;
        if (this.program) {
            gl.deleteProgram(this.program);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.isReady = false;
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

    render(state, angleDeg, centralContrast, flankerContrast, freq, sigma, offsetX, offsetY, flankerPhaseOffset, aspectRatio, hideCentral, scale) {
        const gl = this.gl;
        
        // CRITICAL WebGL Clear: Explicitly clear color buffer with sRGB neutral gray before rendering.
        // This completely prevents GPU frame memory leakage (flicker ghosts/moiré patterns) under rapid temporal modulation.
        gl.clearColor(0.21763, 0.21763, 0.21763, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);

        const angleRad = (angleDeg * Math.PI) / 180;
        const flankerAngleRad = state.isOrthogonalFlankersEnabled ? (angleRad + Math.PI / 2) : 0;
        const flankerOffset = sigma * 2.0;
        const crowdingModeMap = { vertical: 0, horizontal: 1, all: 2 };
        const crowdingModeVal = crowdingModeMap[state.crowdingMode] ?? 0;

        gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.u_scale, scale);
        gl.uniform4f(this.u_gabor_main, -angleRad, centralContrast, freq, sigma);
        gl.uniform3f(this.u_gabor_geom, offsetX, -offsetY, aspectRatio);
        gl.uniform4f(this.u_flanker_main, -flankerAngleRad, flankerContrast * state.strongEyeContrastFactor, flankerOffset, flankerPhaseOffset);
        gl.uniform3f(this.u_calib_scale, state.calibratorLeftR / 255, state.calibratorRightG / 255, state.calibratorRightB / 255);
        gl.uniform4f(this.u_flags, state.isAnaglyphEnabled ? 1.0 : 0.0, state.isCrowdingEnabled ? 1.0 : 0.0, (state.lazyEyeSide === state.redEyeSide) ? 1.0 : 0.0, hideCentral ? 1.0 : 0.0);
        gl.uniform1f(this.u_crowding_mode, crowdingModeVal);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

// Draw persistent zero-disparity visual stabilization lock frame (Executed on top transparent layer)
export function drawFusionLockFrame(canvas, ctx, scale = 1.0) {
    ctx.save();
    // Transform coordinates dynamically to logical 256 boundaries to prevent visual scale drift
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

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

    ctx.restore();
}

// Generate diagnostic calibration card to verify dichoptic channel isolation (Executed on top transparent layer)
export function drawFusionTestPattern(canvas, ctx, state) {
    const scale = canvas.width / 256.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // Unify test card rendering in the logical 256x256 workspace
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    
    // Solid high-contrast corner anchor boxes shifted safely inward
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(35, 35, 20, 20);
    ctx.fillRect(256 - 55, 35, 20, 20);
    ctx.fillRect(35, 256 - 55, 20, 20);
    ctx.fillRect(256 - 55, 256 - 55, 20, 20);
    
    // Configure standard typography rules for balanced, pixel-perfect alignment
    ctx.font = 'bold 42px Overpass';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const isSynop = state.appMode === 'synoptophore';
    const leftR = isSynop ? state.synopCalibratorLeftR : state.calibratorLeftR;
    const rightG = isSynop ? state.synopCalibratorRightG : state.calibratorRightG;
    const rightB = isSynop ? state.synopCalibratorRightB : state.calibratorRightB;

    const cx = 128;
    const cy = 128;

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
    // Symmetrically force the lock frame on during Synoptophore calibration tests
    if (isSynop || state.isFusionLockEnabled) {
        drawFusionLockFrame(canvas, ctx, scale);
    }

    ctx.restore();
}

// Modern unified entry point for Gabor rendering with transparent GPU execution.
export function renderGabor(canvas, ctx, state, angleDeg, centralContrast, flankerContrast, freq, sigma, offsetX = 0, offsetY = 0, flankerPhaseOffset = 0, aspectRatio = 1.0, hideCentral = false) {
    if (webGLManagerInstance && webGLManagerInstance.canvas !== canvas) {
        webGLManagerInstance.destroy();
        webGLManagerInstance = null;
    }

    if (!webGLManagerInstance) {
        webGLManagerInstance = new WebGLResourceManager(canvas);
    }

    const scale = canvas.width / 256.0;

    if (webGLManagerInstance.isReady) {
        webGLManagerInstance.render(state, angleDeg, centralContrast, flankerContrast, freq, sigma, offsetX, offsetY, flankerPhaseOffset, aspectRatio, hideCentral, scale);
    } else {
        // Fallback to error logging if WebGL initialization failed (e.g. hardware acceleration disabled)
        console.error("WebGL 1.0 initialization failed. GaborNeuroFit requires GPU hardware acceleration to maintain clinical 10 Hz visual temporal pacing.");
    }
}