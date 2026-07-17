/*
 * GaborNeuroFit - Visual UI Screen Renderer Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs strict interface casting to isolate charting logic.
 * Ensures that visual indicators (badges, SVGs) parse correct numeric limits without NaN fallbacks.
 */

import { drawFusionLockFrame } from '../engine/gabor-render';
import type { AppState, GaborSession, RdsSession, SynoptophoreSession } from '../types/clinical';

// Physiological constant: 16 pixels shift equates to 1 Prism Diopter (Δ) at 50-70cm working distance.
const PIXELS_PER_PRISM_DIOPTER = 16.0;

/**
 * @description Symmetrical string template interpolator. Replaces '{key}' with actual data values.
 * Keeps JS logic completely decoupled from localization strings, maintaining i18n SSoT.
 * @param template The structured string containing {placeholders}.
 * @param data Strongly typed record ensuring object injection doesn't leak into UI space.
 */
export function interpolate(template: string, data: Record<string, string | number>): string {
    if (!template) return '';
    return template.replace(/{(\w+)}/g, (match, key) => {
        return data[key] !== undefined ? String(data[key]) : match;
    });
}

/**
 * @description Procedurally renders a lightweight, hardware-optimal SVG progress chart.
 * Strictly accepts GaborSession objects to guarantee the existence of contrast properties.
 */
export function renderProgressChart(sessions: GaborSession[], translations: Record<string, string>): void {
    const container = document.getElementById('progress-chart-container');
    if (!container) return;

    // Guard: Verify sample volume before executing rendering algorithms to prevent division-by-zero crashes
    if (!sessions || sessions.length < 2) {
        container.innerHTML = `<span style="font-size: 11px; color: #8e8e93; text-align: center; padding: 0 10px; font-weight: 300; line-height: 1.45;">${translations.chartPlaceholder || 'Not enough data'}</span>`;
        return;
    }

    // Take last 10 trials chronologically (reverse to arrange past -> present / left -> right)
    const chartSessions = sessions.slice(0, 10).reverse();
    const contrasts = chartSessions.map(s => s.contrast);

    const datasetMax = Math.max(...contrasts);
    const datasetMin = Math.min(...contrasts);
    const spread = datasetMax - datasetMin;

    // Visual Padding Buffer: Add 15% margin above/below to center flat lines and prevent edge clipping
    const padding = spread > 0 ? spread * 0.15 : 10;
    const maxVal = Math.min(100, Math.round(datasetMax + padding));
    const minVal = Math.max(1, Math.round(datasetMin - padding));
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

    const points: string[] = [];
    const circles: string[] = [];

    chartSessions.forEach((s, idx) => {
        const x = leftMargin + idx * stepX;
        // Cognitive Synthesis: map smaller contrast values (better acuity) higher up (low SVG y)
        // This ensures the trend line slopes upward 📈 as the visual system recovers contrast sensitivity.
        const y = topMargin + ((s.contrast - minVal) / valRange) * H;
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#22c55e" stroke="#1c2331" stroke-width="1.5" />`);
    });

    container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible; display: block;">
            <defs>
                <linearGradient id="chart-grad" x1="${leftMargin}" y1="0" x2="${width - rightMargin}" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#3b90ff" />
                    <stop offset="100%" stop-color="#22c55e" />
                </linearGradient>
            </defs>
            <line x1="${leftMargin}" y1="${topMargin}" x2="${width - rightMargin}" y2="${topMargin}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            <line x1="${leftMargin}" y1="${topMargin + H}" x2="${width - rightMargin}" y2="${topMargin + H}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            <text x="${leftMargin - 6}" y="${topMargin + 4}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">${minVal}%</text>
            <text x="${leftMargin - 6}" y="${topMargin + H + 3}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">${maxVal}%</text>
            <polyline points="${points.join(' ')}" fill="none" stroke="url(#chart-grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            ${circles.join('')}
        </svg>
    `;
}

/**
 * @description Procedurally renders lightweight SVG stereopsis progress chart (RDS).
 */
export function renderRdsProgressChart(sessions: RdsSession[], translations: Record<string, string>): void {
    const container = document.getElementById('rds-chart-container');
    if (!container) return;

    if (!sessions || sessions.length < 2) {
        container.innerHTML = `<span style="font-size: 11px; color: #8e8e93; text-align: center; padding: 0 10px; font-weight: 300; line-height: 1.45;">${translations.chartPlaceholder || 'Not enough data'}</span>`;
        return;
    }

    const chartSessions = sessions.slice(0, 10).reverse();
    const width = 320;
    const height = 120;
    const leftMargin = 32;
    const rightMargin = 15;
    const topMargin = 15;
    const bottomMargin = 15;

    const W = width - leftMargin - rightMargin;
    const H = height - topMargin - bottomMargin;
    const stepX = W / (chartSessions.length - 1);

    const points: string[] = [];
    const circles: string[] = [];

    chartSessions.forEach((s, idx) => {
        const d = s.rdsDisparity !== undefined && s.rdsDisparity !== null ? s.rdsDisparity : 4;
        const x = leftMargin + idx * stepX;

        // Symmetrical progress trajectory: 1px (best resolution) is at topMargin, 8px is at bottom
        const y = topMargin + ((d - 1) / 7.0) * H;
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#eab308" stroke="#1c2331" stroke-width="1.5" />`);
    });

    container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible; display: block;">
            <defs>
                <linearGradient id="rds-grad" x1="${leftMargin}" y1="0" x2="${width - rightMargin}" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#3b90ff" />
                    <stop offset="100%" stop-color="#eab308" />
                </linearGradient>
            </defs>
            <line x1="${leftMargin}" y1="${topMargin}" x2="${width - rightMargin}" y2="${topMargin}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            <line x1="${leftMargin}" y1="${topMargin + H}" x2="${width - rightMargin}" y2="${topMargin + H}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            <text x="${leftMargin - 6}" y="${topMargin + 4}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">1px</text>
            <text x="${leftMargin - 6}" y="${topMargin + H + 3}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">8px</text>
            <polyline points="${points.join(' ')}" fill="none" stroke="url(#rds-grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            ${circles.join('')}
        </svg>
    `;
}

/**
 * @description Procedurally renders lightweight SVG vergence deviation chart (Synoptophore).
 */
export function renderSynopProgressChart(sessions: SynoptophoreSession[], translations: Record<string, string>): void {
    const container = document.getElementById('synop-chart-container');
    if (!container) return;

    if (!sessions || sessions.length < 2) {
        container.innerHTML = `<span style="font-size: 11px; color: #8e8e93; text-align: center; padding: 0 10px; font-weight: 300; line-height: 1.45;">${translations.chartPlaceholder || 'Not enough data'}</span>`;
        return;
    }

    const chartSessions = sessions.slice(0, 10).reverse();
    const deviations = chartSessions.map(s => {
        const tx = s.synopTargetX !== undefined ? s.synopTargetX : 0;
        const ty = s.synopTargetY !== undefined ? s.synopTargetY : 0;
        return Math.sqrt(tx * tx + ty * ty) / PIXELS_PER_PRISM_DIOPTER;
    });

    const datasetMax = Math.max(...deviations);
    const maxVal = Math.max(datasetMax, 5.0); // minimum 5Δ vertical bounds corridor
    const valRange = maxVal;

    const width = 320;
    const height = 120;
    const leftMargin = 32;
    const rightMargin = 15;
    const topMargin = 15;
    const bottomMargin = 15;

    const W = width - leftMargin - rightMargin;
    const H = height - topMargin - bottomMargin;
    const stepX = W / (chartSessions.length - 1);

    const points: string[] = [];
    const circles: string[] = [];

    chartSessions.forEach((s, idx) => {
        const tx = s.synopTargetX !== undefined ? s.synopTargetX : 0;
        const ty = s.synopTargetY !== undefined ? s.synopTargetY : 0;
        const d = Math.sqrt(tx * tx + ty * ty) / PIXELS_PER_PRISM_DIOPTER;

        const x = leftMargin + idx * stepX;
        // Alignment trajectory: 0.0Δ (perfect) is at top margin, worst sits at bottom
        const y = topMargin + (d / valRange) * H;
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#eab308" stroke="#1c2331" stroke-width="1.5" />`);
    });

    container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible; display: block;">
            <defs>
                <linearGradient id="synop-grad" x1="${leftMargin}" y1="0" x2="${width - rightMargin}" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#3b90ff" />
                    <stop offset="100%" stop-color="#eab308" />
                </linearGradient>
            </defs>
            <line x1="${leftMargin}" y1="${topMargin}" x2="${width - rightMargin}" y2="${topMargin}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            <line x1="${leftMargin}" y1="${topMargin + H}" x2="${width - rightMargin}" y2="${topMargin + H}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2" />
            <text x="${leftMargin - 6}" y="${topMargin + 4}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">0.0Δ</text>
            <text x="${leftMargin - 6}" y="${topMargin + H + 3}" fill="rgba(255,255,255,0.3)" font-size="9px" text-anchor="end" font-weight="bold">${maxVal.toFixed(1)}Δ</text>
            <polyline points="${points.join(' ')}" fill="none" stroke="url(#synop-grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            ${circles.join('')}
        </svg>
    `;
}

/**
 * @description Cleans both Gabor and HUD canvases back to stable, non-fatiguing foveal neutral gray states.
 */
export function drawIdleState(
    gaborCanvas: HTMLCanvasElement,
    gaborCtx: CanvasRenderingContext2D | null,
    overlayCanvas: HTMLCanvasElement,
    overlayCtx: CanvasRenderingContext2D,
    isFusionLockEnabled: boolean
): void {
    // 1. Clear and fill bottom GPU canvas with sRGB neutral gray
    const gl = (gaborCanvas.getContext('webgl') || gaborCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
        gl.clearColor(0.498, 0.498, 0.498, 1.0); // Exactly sRGB gray value 127 (#7f7f7f)
        gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
        const actualGaborCtx = gaborCtx || gaborCanvas.getContext('2d');
        if (actualGaborCtx) {
            actualGaborCtx.clearRect(0, 0, gaborCanvas.width, gaborCanvas.height);
            actualGaborCtx.fillStyle = '#7f7f7f';
            actualGaborCtx.fillRect(0, 0, gaborCanvas.width, gaborCanvas.height);
        }
    }

    // 2. Clear top transparent HUD canvas
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Retain visual stabilization frames on top transparent overlay layer during pauses
    if (isFusionLockEnabled) {
        const scale = gaborCanvas.width / 256.0;
        drawFusionLockFrame(overlayCanvas, overlayCtx, scale);
    }
}

/**
 * @description Helper to mathematically format seconds into clinical digital clock string
 */
function formatTimerDisplay(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

/**
 * @description Updates the primary scoring board and quantitative training stats badges.
 */
export function updateScoreboard(state: AppState, translations: Record<string, string>): void {
    const t = translations;
    const scoreTextEl = document.getElementById('score-text');
    const indicatorsEl = document.getElementById('indicators');
    const synopIndicatorsEl = document.getElementById('synop-indicators');
    const rdsIndicatorsEl = document.getElementById('rds-indicators');
    const progressContainer = document.getElementById('synop-progress-container');
    const progressBar = document.getElementById('synop-progress-bar');

    if (state.appMode === 'synoptophore') {
        if (scoreTextEl) {
            scoreTextEl.innerHTML = t.lblPrismDeviation || 'Deviation Angle (Prism)';
        }

        if (indicatorsEl) indicatorsEl.style.display = 'none';
        if (rdsIndicatorsEl) rdsIndicatorsEl.style.display = 'none';
        if (synopIndicatorsEl) {
            synopIndicatorsEl.style.display = 'flex';

            const pdX = (state.synopTargetX / PIXELS_PER_PRISM_DIOPTER).toFixed(2);
            const pdY = (state.synopTargetY / PIXELS_PER_PRISM_DIOPTER).toFixed(2);

            const signX = state.synopTargetX > 0 ? '+' : '';
            const signY = state.synopTargetY > 0 ? '+' : '';

            const badgeX = document.getElementById('badge-prism-x');
            const badgeY = document.getElementById('badge-prism-y');
            const valSynopScore = document.getElementById('val-synop-score');

            if (badgeX) badgeX.innerHTML = `X: <strong>${signX}${state.synopTargetX}px</strong> (${signX}${pdX}Δ)`;
            if (badgeY) badgeY.innerHTML = `Y: <strong>${signY}${state.synopTargetY}px</strong> (${signY}${pdY}Δ)`;
            // Symmetrically write textContent to bypass layout reflows during high-frequency drags
            if (valSynopScore) valSynopScore.textContent = state.synopScore.toString();
        }

        if (progressContainer && progressBar) {
            progressContainer.style.display = 'block';

            if (state.synopState === 'pulling') {
                const curr = Math.sqrt(state.synopTargetX * state.synopTargetX + state.synopTargetY * state.synopTargetY);
                const start = state.synopStartDistance || 1;
                const percent = Math.max(0, Math.min(100, Math.round(100 * (1 - curr / start))));
                progressBar.style.width = percent + '%';
            } else {
                progressBar.style.width = '0%';
            }
        }
    } else if (state.appMode === 'rds') {
        if (scoreTextEl) {
            scoreTextEl.innerHTML = `${t.correctLabel || 'Correct'}: <strong>${state.rdsScore}</strong> / ${t.totalLabel || 'Total'}: <strong>${state.rdsTotal}</strong>`;
        }
        if (indicatorsEl) indicatorsEl.style.display = 'none';
        if (synopIndicatorsEl) synopIndicatorsEl.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'none';
        if (rdsIndicatorsEl) {
            rdsIndicatorsEl.style.display = 'flex';

            const badgeDisparity = document.getElementById('badge-rds-disparity');
            const badgeLevel = document.getElementById('badge-rds-level');
            const rdsStreakVal = document.getElementById('val-rds-streak');

            if (badgeDisparity) badgeDisparity.innerHTML = `${t.lblActiveDepth || 'Depth'}: <strong>${state.rdsDisparity}px</strong>`;
            if (badgeLevel) badgeLevel.innerHTML = `${t.stage || 'Stage'}: <strong>${state.rdsLevel}/5</strong>`;
            if (rdsStreakVal) rdsStreakVal.innerText = state.rdsStreak.toString();
        }
    } else {
        if (scoreTextEl) {
            scoreTextEl.innerHTML = `${t.correctLabel || 'Correct'}: <strong>${state.score}</strong> / ${t.totalLabel || 'Total'}: <strong>${state.total}</strong>`;
        }
        if (indicatorsEl) indicatorsEl.style.display = 'flex';
        if (synopIndicatorsEl) synopIndicatorsEl.style.display = 'none';
        if (rdsIndicatorsEl) rdsIndicatorsEl.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'none';
    }

    const contrastEl = document.getElementById('current-contrast');
    const levelEl = document.getElementById('current-level');
    const gaborStreakVal = document.getElementById('val-gabor-streak');

    if (contrastEl) contrastEl.innerText = Math.round(state.autoContrast * 100).toString();
    if (levelEl) levelEl.innerText = state.currentLevel.toString();
    if (gaborStreakVal) gaborStreakVal.innerText = state.correctStreak.toString();

    const timerGabor = document.getElementById('badge-timer-gabor');
    const timerSynop = document.getElementById('badge-timer-synop');
    const timerRds = document.getElementById('badge-timer-rds');

    const valTimerGabor = document.getElementById('val-timer-gabor');
    const valTimerSynop = document.getElementById('val-timer-synop');
    const valTimerRds = document.getElementById('val-timer-rds');

    if (state.timerLimitMinutes > 0) {
        const timeStr = formatTimerDisplay(state.timerRemainingSeconds);
        if (timerGabor) timerGabor.style.display = 'inline-block';
        if (timerSynop) timerSynop.style.display = 'inline-block';
        if (timerRds) timerRds.style.display = 'inline-block';

        if (valTimerGabor) valTimerGabor.innerText = timeStr;
        if (valTimerSynop) valTimerSynop.innerText = timeStr;
        if (valTimerRds) valTimerRds.innerText = timeStr;
    } else {
        if (timerGabor) timerGabor.style.display = 'none';
        if (timerSynop) timerSynop.style.display = 'none';
        if (timerRds) timerRds.style.display = 'none';
    }
}

/**
 * @description Helper to resolve compact mode tags for the leaderboard view.
 */
export function getCompactPresetLabel(mode: string, translations: Record<string, string>): string {
    const key = 'lblCompactPreset' + mode.charAt(0).toUpperCase() + mode.slice(1);
    return translations[key] || mode;
}

/**
 * @description Helper to localize flash speed settings symmetrically.
 */
function getSpeedName(speedMode: string, translations: Record<string, string>): string {
    if (speedMode === 'adaptive') {
        return translations.unitMsAdaptive || 'Adapt.';
    }
    const unit = translations.unitMs || 'ms';
    return `${speedMode}${unit}`;
}

/**
 * @description Populates the local highscores leaderboard table with historical Gabor session metrics.
 */
export function updateLeaderboard(historyList: GaborSession[], translations: Record<string, string>, currentLang: string): void {
    const leaderboardList = document.getElementById('leaderboard-list');
    if (!leaderboardList) return;
    const t = translations;

    if (historyList.length === 0) {
        leaderboardList.innerHTML = `<li class="leaderboard-item" style="justify-content: center; color: #cbd5e1; text-align: center; padding: 14px 0;">${t.noHistory || 'No history'}</li>`;
        return;
    }

    leaderboardList.innerHTML = historyList.map((item, idx) => {
        const protocol = item.protocol || 'custom';
        const speed = item.speed || 'adaptive';
        const isAnaglyph = item.isAnaglyph !== undefined ? item.isAnaglyph : true;
        const balance = item.balance !== undefined ? item.balance : 30;

        const dateStr = item.timestamp
            ? new Date(item.timestamp).toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '00:00';

        const eyeLabel = item.lazyEyeSide === 'right' ? (currentLang === 'ru' ? 'П' : 'R') : (currentLang === 'ru' ? 'Л' : 'L');

        const line2Text = interpolate(t.gaborLeaderboardStats || "Score: {score}/{total} | Stage: {level} | Contrast: {contrast}% | Eye: {eye}", {
            score: item.score,
            total: item.total,
            level: item.level,
            contrast: item.contrast,
            eye: eyeLabel
        });

        const line3Text = interpolate(t.gaborLeaderboardDetails || "Exposure: {speed} | Balance: {balance}", {
            speed: getSpeedName(speed, t),
            balance: isAnaglyph ? balance + '%' : (t.optAutonextOff ? t.optAutonextOff.split(' ')[0] : 'Off')
        });

        const localizedMode = getCompactPresetLabel(protocol, t);

        return `
            <li class="leaderboard-item" style="flex-direction: column; align-items: flex-start; gap: 4px; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="width: 100%; display: flex; justify-content: space-between; font-weight: bold; color: rgba(255,255,255,0.4); font-size: 11px;">
                    <span>#${idx + 1} (${dateStr})</span>
                    <span>${localizedMode}</span>
                </div>
                <div style="font-size: 13px; color: #f1f3f9; font-weight: 500; line-height: 1.35; word-wrap: break-word;">
                    ${line2Text}
                </div>
                <div style="font-size: 11px; color: #a1a1aa; line-height: 1.35; word-wrap: break-word; width: 100%;">
                    ${line3Text}
                </div>
            </li>
        `;
    }).join('');
}

/**
 * @description Populates local highscores table for motor vergence history (Synoptophore).
 */
export function updateSynopLeaderboard(historyList: SynoptophoreSession[], translations: Record<string, string>, currentLang: string): void {
    const leaderboardList = document.getElementById('leaderboard-list-synop');
    if (!leaderboardList) return;
    const t = translations;

    if (historyList.length === 0) {
        leaderboardList.innerHTML = `<li class="leaderboard-item" style="justify-content: center; color: #cbd5e1; text-align: center; padding: 14px 0;">${t.noHistory || 'No history'}</li>`;
        return;
    }

    leaderboardList.innerHTML = historyList.map((item, idx) => {
        const targetX = item.synopTargetX !== undefined ? item.synopTargetX : 0;
        const targetY = item.synopTargetY !== undefined ? item.synopTargetY : 0;
        const startDist = item.synopStartDistance || 1;
        const outcome = item.synopOutcome || 'slip';

        const pdX = (Math.abs(targetX) / PIXELS_PER_PRISM_DIOPTER).toFixed(2);
        const pdY = (Math.abs(targetY) / PIXELS_PER_PRISM_DIOPTER).toFixed(2);

        const signX = targetX > 0 ? '+' : (targetX < 0 ? '-' : '');
        const signY = targetY > 0 ? '+' : (targetY < 0 ? '-' : '');

        const dateStr = item.timestamp
            ? new Date(item.timestamp).toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '00:00';

        const currentDist = Math.sqrt(targetX * targetX + targetY * targetY);
        const percent = Math.max(0, Math.min(100, Math.round(100 * (1 - currentDist / startDist))));

        const outcomeText = outcome === 'success'
            ? (t.synopSuccessOutcome || "Perfect Fusion 100%! 🏆")
            : interpolate(t.synopSlipOutcome || "Slipped at {current}px ({percent}% hold)", {
                current: Math.round(currentDist),
                percent: percent,
                start: Math.round(startDist)
              });

        const line2Text = interpolate(t.synopLeaderboardStats || "Angle: X: {signX}{x}px ({signX}{pdX}Δ) | Y: {signY}{y}px ({signY}{pdY}Δ)", {
            signX: signX,
            x: Math.abs(targetX),
            pdX: pdX,
            signY: signY,
            y: Math.abs(targetY),
            pdY: pdY
        });

        const modeLabel = getCompactPresetLabel('synoptophore', t);

        return `
            <li class="leaderboard-item" style="flex-direction: column; align-items: flex-start; gap: 4px; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="width: 100%; display: flex; justify-content: space-between; font-weight: bold; color: rgba(255,255,255,0.4); font-size: 11px;">
                    <span>#${idx + 1} (${dateStr})</span>
                    <span>${modeLabel}</span>
                </div>
                <div style="font-size: 13px; color: #f1f3f9; font-weight: 500; line-height: 1.35; word-wrap: break-word;">
                    ${line2Text}
                </div>
                <div style="font-size: 11px; color: #a1a1aa; line-height: 1.35; word-wrap: break-word; width: 100%;">
                    ${outcomeText}
                </div>
            </li>
        `;
    }).join('');
}

/**
 * @description Populates local highscores table for stereoscopic history (RDS).
 */
export function updateRdsLeaderboard(historyList: RdsSession[], translations: Record<string, string>, currentLang: string): void {
    const leaderboardList = document.getElementById('leaderboard-list-rds');
    if (!leaderboardList) return;
    const t = translations;

    if (historyList.length === 0) {
        leaderboardList.innerHTML = `<li class="leaderboard-item" style="justify-content: center; color: #cbd5e1; text-align: center; padding: 14px 0;">${t.noHistory || 'No history'}</li>`;
        return;
    }

    leaderboardList.innerHTML = historyList.map((item, idx) => {
        const rdsDotSize = item.rdsDotSize || 4;
        const rdsDensity = item.rdsDensity ? Math.round(item.rdsDensity * 100) : 50;
        const rdsDisparity = item.rdsDisparity || 4;
        const rdsLevel = item.level || 1;

        const dateStr = item.timestamp
            ? new Date(item.timestamp).toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '00:00';

        const line2Text = interpolate(t.rdsLeaderboardStats || "Score: {score}/{total} | Stage: {level}/5 | Dispar: {disparity}px", {
            score: item.score,
            total: item.total,
            level: rdsLevel,
            disparity: rdsDisparity
        });

        const line3Text = interpolate(t.rdsLeaderboardDetails || "Dot Size: {size}px | Noise: {density}%", {
            size: rdsDotSize,
            density: rdsDensity
        });

        const modeLabel = getCompactPresetLabel('rds', t);

        return `
            <li class="leaderboard-item" style="flex-direction: column; align-items: flex-start; gap: 4px; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="width: 100%; display: flex; justify-content: space-between; font-weight: bold; color: rgba(255,255,255,0.4); font-size: 11px;">
                    <span>#${idx + 1} (${dateStr})</span>
                    <span>${modeLabel}</span>
                </div>
                <div style="font-size: 13px; color: #f1f3f9; font-weight: 500; line-height: 1.35; word-wrap: break-word;">
                    ${line2Text}
                </div>
                <div style="font-size: 11px; color: #a1a1aa; line-height: 1.35; word-wrap: break-word; width: 100%;">
                    ${line3Text}
                </div>
            </li>
        `;
    }).join('');
}

/**
 * @description Updates the bottom-bar presets guide and active flash speed duration indicators.
 */
export function updateStatusBar(state: AppState, translations: Record<string, string>): void {
    const t = translations;
    let speedStr = t.statusBarAdaptive || "Adaptive";

    // High-Performance Declarative Key Mapping
    // Dynamically resolves localization keys (e.g., 'lblCompactPresetOcclusion') without if-else cascades.
    const activePresetKey = state.appMode === 'gabor' ? state.presetMode : state.appMode;
    const capitalizedKey = 'lblCompactPreset' + activePresetKey.charAt(0).toUpperCase() + activePresetKey.slice(1);
    let modeStr = t[capitalizedKey] || activePresetKey;

    if (state.appMode === 'synoptophore') {
        const seconds = (state.synopPullSpeed / 1000).toFixed(1);
        speedStr = interpolate(t.statusBarSynopSpeed || "1 px / {seconds}s", { seconds: seconds });
    } else if (state.appMode === 'rds') {
        const densityPercent = Math.round(state.rdsDensity * 100);
        speedStr = interpolate(t.statusBarRdsSpeed || "Dot: {size}px | Noise: {density}%", { size: state.rdsDotSize, density: densityPercent });
    } else if (state.flashDurationMode === '100') {
        speedStr = interpolate(t.statusBarUnitSeconds || "{seconds} ms", { seconds: 100 });
    } else if (state.flashDurationMode === '180') {
        speedStr = interpolate(t.statusBarUnitSeconds || "{seconds} ms", { seconds: 180 });
    } else if (state.flashDurationMode === '200') {
        speedStr = interpolate(t.statusBarUnitSeconds || "{seconds} ms", { seconds: 200 });
    } else if (state.flashDurationMode === '350') {
        speedStr = interpolate(t.statusBarUnitSeconds || "{seconds} ms", { seconds: 350 });
    } else {
        let adaptiveMs = 110;
        if (state.currentLevel === 1) adaptiveMs = 240;
        else if (state.currentLevel === 2) adaptiveMs = 200;
        else if (state.currentLevel === 3) adaptiveMs = 170;
        else if (state.currentLevel === 4) adaptiveMs = 140;
        speedStr = interpolate(t.statusBarUnitSeconds || "{seconds} ms", { seconds: adaptiveMs });
    }

    const valActiveMode = document.getElementById('val-active-mode');
    const valActiveSpeed = document.getElementById('val-active-speed');

    if (valActiveMode) {
        valActiveMode.innerText = modeStr;
        // @ts-ignore
        if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(valActiveMode);
    }

    if (valActiveSpeed) valActiveSpeed.innerText = speedStr;
}