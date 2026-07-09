/*
 * GaborNeuroFit - Visual UI Screen Renderer Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module manages all direct DOM manipulations for updating visual indicators,
 * scoreboard counters, active status bars, and the local highscores leaderboard panel.
 */

import { drawFusionLockFrame } from '../engine/gabor.js';

// Physiological constant: 16 pixels shift equates to 1 Prism Diopter (Δ) at 50-70cm working distance.
const PIXELS_PER_PRISM_DIOPTER = 16.0;

// Procedurally render lightweight, hardware-optimal SVG progress chart without any external dependencies
export function renderProgressChart(sessions, translations) {
    const container = document.getElementById('progress-chart-container');
    if (!container) return;

    // Guard: Verify sample volume before executing rendering algorithms to prevent division-by-zero crashes
    if (!sessions || sessions.length < 2) {
        container.innerHTML = `<span style="font-size: 11px; color: #8e8e93; text-align: center; padding: 0 10px; font-weight: 300; line-height: 1.45;">${translations.chartPlaceholder}</span>`;
        return;
    }

    // Take last 10 trials chronologically (reverse to arrange past -> present / left -> right)
    const chartSessions = sessions.slice(0, 10).reverse();
    const contrasts = chartSessions.map(s => s.contrast);

    const maxVal = Math.max(...contrasts, 40);
    const minVal = Math.min(...contrasts, 5);
    const valRange = (maxVal - minVal) || 1;

    const width = 320;
    const height = 120;
    const leftMargin = 32;
    const rightMargin = 15;
    const topMargin = 15;
    const bottomMargin = 15;

    const W = width - leftMargin - rightMargin;
    const H = height - topMargin - bottomMargin;
    const stepX = W / (chartSessions.length - 1);

    // Build polyline points string and node coordinate sets
    const points = [];
    const circles = [];

    chartSessions.forEach((s, idx) => {
        const x = leftMargin + idx * stepX;
        // Coordinate inversion: lower contrast sits visually at the bottom (high SVG y in chart context)
        const y = topMargin + ((maxVal - s.contrast) / valRange) * H;
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#22c55e" stroke="#1c2331" stroke-width="1.5" />`);
    });

    // Procedural vector layout generation
    container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible; display: block;">
            <defs>
                <linearGradient id="chart-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#3b90ff" />
                    <stop offset="100%" stop-color="#22c55e" />
                </linearGradient>
            </defs>
            
            <!-- Clinical Oscilloscope Grid Guides -->
            <line x1="${leftMargin}" y1="${topMargin}" x2="${width - rightMargin}" y2="${topMargin}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            <line x1="${leftMargin}" y1="${topMargin + H}" x2="${width - rightMargin}" y2="${topMargin + H}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            
            <!-- Subpixel-aligned axis text indicators -->
            <text x="${leftMargin - 6}" y="${topMargin + 4}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">${maxVal}%</text>
            <text x="${leftMargin - 6}" y="${topMargin + H + 3}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">${minVal}%</text>
            
            <!-- Main Gabor trend line vector path -->
            <polyline points="${points.join(' ')}" fill="none" stroke="url(#chart-grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            
            <!-- Visual milestone nodes -->
            ${circles.join('')}
        </svg>
    `;
}

// Clean both Gabor and HUD canvases back to stable, non-fatiguing foveal neutral gray states
export function drawIdleState(gaborCanvas, gaborCtx, overlayCanvas, overlayCtx, isFusionLockEnabled) {
    // 1. Clear and fill bottom GPU canvas with sRGB neutral gray
    if (gaborCanvas.getContext('webgl') || gaborCanvas.getContext('experimental-webgl')) {
        const gl = gaborCanvas.getContext('webgl') || gaborCanvas.getContext('experimental-webgl');
        if (gl) {
            gl.clearColor(0.498, 0.498, 0.498, 1.0); // Exactly sRGB gray value 127 (#7f7f7f)
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    } else {
        const actualGaborCtx = gaborCtx || gaborCanvas.getContext('2d');
        actualGaborCtx.clearRect(0, 0, gaborCanvas.width, gaborCanvas.height);
        actualGaborCtx.fillStyle = '#7f7f7f';
        actualGaborCtx.fillRect(0, 0, gaborCanvas.width, gaborCanvas.height);
    }

    // 2. Clear top transparent HUD canvas
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Retain visual stabilization frames on top transparent overlay layer during pauses
    if (isFusionLockEnabled) {
        const scale = gaborCanvas.width / 256.0;
        drawFusionLockFrame(overlayCanvas, overlayCtx, scale);
    }
}

// Helper to mathematically format seconds into clinical digital clock string
function formatTimerDisplay(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// Update the primary scoring board and quantitative training stats badges
export function updateScoreboard(state, translations) {
    const t = translations;
    const scoreTextEl = document.getElementById('score-text');
    const indicatorsEl = document.getElementById('indicators');
    const synopIndicatorsEl = document.getElementById('synop-indicators');
    const progressContainer = document.getElementById('synop-progress-container');
    const progressBar = document.getElementById('synop-progress-bar');

    if (state.appMode === 'synoptophore') {
        // 1. Set stable foveal alignment title on the main HUD
        if (scoreTextEl) {
            scoreTextEl.innerHTML = t.lblPrismDeviation || 'Deviation Angle (Prism)';
        }
        
        // 2. Hide Gabor status badges, reveal Synoptophore prism diopter widgets
        if (indicatorsEl) indicatorsEl.style.display = 'none';
        if (synopIndicatorsEl) {
            synopIndicatorsEl.style.display = 'flex';
            
            // Calculate precise clinical Prism Diopters
            const pdX = (state.synopTargetX / PIXELS_PER_PRISM_DIOPTER).toFixed(2);
            const pdY = (state.synopTargetY / PIXELS_PER_PRISM_DIOPTER).toFixed(2);
            
            const signX = state.synopTargetX > 0 ? '+' : '';
            const signY = state.synopTargetY > 0 ? '+' : '';
            
            const badgeX = document.getElementById('badge-prism-x');
            const badgeY = document.getElementById('badge-prism-y');
            const badgeScore = document.getElementById('badge-synop-score');
            
            if (badgeX) badgeX.innerHTML = `X: <strong>${signX}${state.synopTargetX}px</strong> (${signX}${pdX}Δ)`;
            if (badgeY) badgeY.innerHTML = `Y: <strong>${signY}${state.synopTargetY}px</strong> (${signY}${pdY}Δ)`;
            if (badgeScore) badgeScore.innerHTML = `🏆 <strong>${state.synopScore}</strong>`;
        }

        // 3. Maintain stable vergence progress bar layout to prevent Cumulative Layout Shifts (CLS)
        if (progressContainer && progressBar) {
            progressContainer.style.display = 'block'; // Always visible in Synoptophore to anchor height
            
            if (state.synopState === 'pulling') {
                const curr = Math.sqrt(state.synopTargetX * state.synopTargetX + state.synopTargetY * state.synopTargetY);
                const start = state.synopStartDistance || 1;
                const percent = Math.max(0, Math.min(100, Math.round(100 * (1 - curr / start))));
                
                progressBar.style.width = percent + '%';
            } else {
                progressBar.style.width = '0%';
            }
        }
    } else {
        // Gabor Mode: Symmetrically restore classic scoreboard panel states
        if (scoreTextEl) {
            scoreTextEl.innerHTML = `${t.correctLabel}: <strong>${state.score}</strong> / ${t.totalLabel}: <strong>${state.total}</strong>`;
        }
        if (indicatorsEl) indicatorsEl.style.display = 'flex';
        if (synopIndicatorsEl) synopIndicatorsEl.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'none';
    }
    
    // Select indicators elements (maintained in DOM to prevent Gabor logic null-reference exceptions)
    const contrastEl = document.getElementById('current-contrast');
    const levelEl = document.getElementById('current-level');
    const streakEl = document.getElementById('current-streak');
    
    // Feed Gabor badges with actual parameters cleanly
    if (contrastEl) contrastEl.innerText = Math.round(state.autoContrast * 100);
    if (levelEl) levelEl.innerText = state.currentLevel;
    if (streakEl) streakEl.innerText = state.correctStreak;

    // Resolve Pomodoro active timer state display mapping
    const timerGabor = document.getElementById('badge-timer-gabor');
    const timerSynop = document.getElementById('badge-timer-synop');
    
    if (state.timerLimitMinutes > 0) {
        const timeStr = formatTimerDisplay(state.timerRemainingSeconds);
        if (timerGabor) { timerGabor.style.display = 'inline-block'; timerGabor.innerHTML = `🍅 ${timeStr}`; }
        if (timerSynop) { timerSynop.style.display = 'inline-block'; timerSynop.innerHTML = `🍅 ${timeStr}`; }
        if (window.twemoji) {
            if (timerGabor) twemoji.parse(timerGabor);
            if (timerSynop) twemoji.parse(timerSynop);
        }
    } else {
        if (timerGabor) timerGabor.style.display = 'none';
        if (timerSynop) timerSynop.style.display = 'none';
    }
}

// Helper to resolve compact mode tags for the leaderboard view
function getCompactPresetLabel(mode, lang) {
    if (lang === 'ru') {
        if (mode === 'occlusion') return 'Повязка';
        if (mode === 'binocular') return '3D Баланс';
        if (mode === 'peripheral') return '3D Перифер.';
        if (mode === 'blitz') return 'Блиц';
        if (mode === 'flicker') return '3D Фликкер';
        return 'Ручной';
    } else {
        if (mode === 'occlusion') return 'Patching';
        if (mode === 'binocular') return '3D Balance';
        if (mode === 'peripheral') return '3D Capture';
        if (mode === 'blitz') return 'Speed Blitz';
        if (mode === 'flicker') return '3D Flicker';
        return 'Custom';
    }
}

// Helper to localize flash speed settings symmetrically
function getSpeedName(speedMode, lang) {
    if (speedMode === '100') return '100мс';
    if (speedMode === '180') return '180мс';
    if (speedMode === '200') return '200мс';
    if (speedMode === '350') return '350мс';
    return lang === 'ru' ? 'Адапт.' : 'Adapt.';
}

// Populate the local highscores leaderboard table with historical session metrics
export function updateLeaderboard(historyList, translations, currentLang) {
    const leaderboardList = document.getElementById('leaderboard-list');
    if (!leaderboardList) return;
    const t = translations;
    
    // Display helpful fallback text if leaderboard storage is empty
    if (historyList.length === 0) {
        leaderboardList.innerHTML = `<li class="leaderboard-item" style="justify-content: center; color: #cbd5e1; text-align: center; padding: 14px 0;">${t.noHistory}</li>`;
        return;
    }
    
    // Build and append list rows dynamically with hardware-optimal strings
    leaderboardList.innerHTML = historyList.map((item, idx) => {
        // Fallbacks support for older session formats
        const protocol = item.protocol || 'custom';
        const speed = item.speed || 'adaptive';
        const isAnaglyph = item.isAnaglyph !== undefined ? item.isAnaglyph : true;
        const balance = item.balance !== undefined ? item.balance : 30;

        // Map timestamp symmetrically to localized clinical calendar string
        const dateStr = item.timestamp 
            ? new Date(item.timestamp).toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '00:00';

        // Row 2: Core Game Results (Score, Level, Contrast)
        const line2Text = currentLang === 'ru' 
            ? `Счет: <strong>${item.score}/${item.total}</strong> | Этап: ${item.level} | Контраст: ${item.contrast}%`
            : `Score: <strong>${item.score}/${item.total}</strong> | Stage: ${item.level} | Contrast: ${item.contrast}%`;
        
        // Row 3: Technical clinical settings (Speed, Attenuation balancer)
        const line3Text = currentLang === 'ru'
            ? `Экспозиция: ${getSpeedName(speed, 'ru')} | Контраст здорового глаза: ${isAnaglyph ? balance + '%' : 'Выкл'}`
            : `Exposure: ${getSpeedName(speed, 'en')} | Strong Eye Contrast: ${isAnaglyph ? balance + '%' : 'Off'}`;

        const localizedMode = getCompactPresetLabel(protocol, currentLang);

        return `
            <li class="leaderboard-item" style="flex-direction: column; align-items: flex-start; gap: 4px; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <!-- Row 1: Session Meta Header -->
                <div style="width: 100%; display: flex; justify-content: space-between; font-weight: bold; color: rgba(255,255,255,0.4); font-size: 11px;">
                    <span>#${idx + 1} (${dateStr})</span>
                    <span>${localizedMode}</span>
                </div>
                <!-- Row 2: Core Game Results -->
                <div style="font-size: 13px; color: #f1f3f9; font-weight: 500; line-height: 1.35; word-wrap: break-word;">
                    ${line2Text}
                </div>
                <!-- Row 3: Technical Clinical Settings -->
                <div style="font-size: 11px; color: #a1a1aa; line-height: 1.35; word-wrap: break-word; width: 100%;">
                    ${line3Text}
                </div>
            </li>
        `;
    }).join('');
}

// Update the bottom-bar presets guide and active flash speed duration indicators
export function updateStatusBar(state, translations) {
    const t = translations;
    let modeStr = t.optPresetOcclusion;
    let speedStr = "Adaptive";

    // Map active protocol localized string
    if (state.presetMode === 'synoptophore' || state.appMode === 'synoptophore') {
        modeStr = t.optPresetSynoptophore || "🧲 Synoptophore";
    } else if (state.presetMode === 'occlusion') {
        modeStr = t.optPresetOcclusion;
    } else if (state.presetMode === 'binocular') {
        modeStr = t.optPresetBinocular;
    } else if (state.presetMode === 'peripheral') {
        modeStr = t.optPresetPeripheral;
    } else if (state.presetMode === 'blitz') {
        modeStr = t.optPresetBlitz;
    } else if (state.presetMode === 'flicker') {
        modeStr = t.optPresetFlicker;
    } else if (state.presetMode === 'custom') {
        modeStr = t.optPresetCustom;
    }

    // Map exposure speed parameters or dynamically calculated values
    if (state.appMode === 'synoptophore') {
        // Translate motor pull delay smoothly to readable physical units
        const seconds = (state.synopPullSpeed / 1000).toFixed(1);
        speedStr = state.currentLang === 'ru' ? `1 пикс / ${seconds}с` : `1 px / ${seconds}s`;
    } else if (state.flashDurationMode === '100') {
        speedStr = "100 ms";
    } else if (state.flashDurationMode === '180') {
        speedStr = "180 ms";
    } else if (state.flashDurationMode === '200') {
        speedStr = "200 ms";
    } else if (state.flashDurationMode === '350') {
        speedStr = "350 ms";
    } else {
        // Adaptive temporal pacing scaling down to prevent saccadic ocular cheats at high stages
        if (state.currentLevel === 1) speedStr = "240 ms";
        else if (state.currentLevel === 2) speedStr = "200 ms";
        else if (state.currentLevel === 3) speedStr = "170 ms";
        else if (state.currentLevel === 4) speedStr = "140 ms";
        else if (state.currentLevel === 5) speedStr = "110 ms";
    }

    const valActiveMode = document.getElementById('val-active-mode');
    const valActiveSpeed = document.getElementById('val-active-speed');
    
    if (valActiveMode) {
        valActiveMode.innerText = modeStr;
        // Hot-parse newly injected unicode characters into flat Twemoji vector assets
        if (window.twemoji) window.twemoji.parse(valActiveMode);
    }
    
    if (valActiveSpeed) valActiveSpeed.innerText = speedStr;
}