/*
 * GaborNeuroFit - Visual UI Screen Renderer Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module manages all direct DOM manipulations for updating visual indicators,
 * scoreboard counters, active status bars, and the local highscores leaderboard panel.
 */

import { drawFusionLockFrame } from '../engine/gabor.js';

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

// Update the primary scoring board and quantitative training stats badges
export function updateScoreboard(state, translations) {
    const t = translations;
    const scoreTextEl = document.getElementById('score-text');
    if (scoreTextEl) {
        scoreTextEl.innerHTML = `${t.correctLabel}: <strong>${state.score}</strong> / ${t.totalLabel}: <strong>${state.total}</strong>`;
    }
    
    // Select indicators elements
    const contrastEl = document.getElementById('current-contrast');
    const levelEl = document.getElementById('current-level');
    const streakEl = document.getElementById('current-streak');
    
    // Feed indicators with actual store parameters
    if (contrastEl) contrastEl.innerText = Math.round(state.autoContrast * 100);
    if (levelEl) levelEl.innerText = state.currentLevel;
    if (streakEl) streakEl.innerText = state.correctStreak;
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
        leaderboardList.innerHTML = `<li class="leaderboard-item" style="justify-content: center; color: #cbd5e1;">${t.noHistory}</li>`;
        return;
    }
    
    // Build and append list rows dynamically with hardware-optimal strings
    leaderboardList.innerHTML = historyList.map((item, idx) => {
        // Fallbacks support for older session formats
        const protocol = item.protocol || 'custom';
        const speed = item.speed || 'adaptive';
        const isAnaglyph = item.isAnaglyph !== undefined ? item.isAnaglyph : true;
        const balance = item.balance !== undefined ? item.balance : 30;

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
                    <span>#${idx + 1} (${item.time || '00:00'})</span>
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
    if (state.presetMode === 'occlusion') {
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
    if (state.flashDurationMode === '100') {
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