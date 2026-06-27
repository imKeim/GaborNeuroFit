/*
 * GaborNeuroFit - Visual UI Screen Renderer Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module manages all direct DOM manipulations for updating visual indicators,
 * scoreboard counters, active status bars, and the local highscores leaderboard panel.
 */

import { drawFusionLockFrame } from '../engine/gabor.js';

// Clean the Gabor canvas back to stable, non-fatiguing foveal neutral gray state
export function drawIdleState(canvas, ctx, isFusionLockEnabled) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Fill with exactly 50% luminance gray to prevent retina adaptation drift
    ctx.fillStyle = '#7f7f7f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Retain visual stabilization frames during pauses
    if (isFusionLockEnabled) {
        drawFusionLockFrame(canvas, ctx);
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
        const resultsText = currentLang === 'ru' 
            ? `Очки: <strong>${item.score}/${item.total}</strong> | Этап: ${item.level} | Контр: ${item.contrast}%`
            : `Score: <strong>${item.score}/${item.total}</strong> | Lvl: ${item.level} | Cont: ${item.contrast}%`;
        
        return `
            <li class="leaderboard-item">
                <span>#${idx + 1} (${item.time || '00:00'})</span>
                <span>${resultsText}</span>
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
        if (state.currentLevel === 1) speedStr = "220 ms";
        else if (state.currentLevel === 2) speedStr = "200 ms";
        else if (state.currentLevel === 3) speedStr = "180 ms";
        else if (state.currentLevel === 4) speedStr = "150 ms";
        else if (state.currentLevel === 5) speedStr = "120 ms";
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