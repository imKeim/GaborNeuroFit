/*
 * GaborNeuroFit - High-Performance Orchestrator & Entry Point
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This file boots up the application, coordinates events between the Store,
 * the rendering Engines, the UI View layer, and handles asynchronous translation loadings.
 */

// Import core dependencies
import { Store } from './store.js';
import { renderGabor, drawFusionLockFrame, drawFusionTestPattern } from './engine/gabor.js';
import { initAudio, playCue, playSuccess, playError } from './engine/audio.js';
import { updateScoreboard, updateLeaderboard, drawIdleState, updateStatusBar } from './ui/screen.js';
import { initModals } from './ui/modal.js';
import { bindInputControls } from './ui/controls.js'; // FIXED: Added missing input binder import

// Global cache for the active localization dictionary
let activeTranslations = {};

// Ephemeral runtime timer and animation references
let flickerIntervalId = null;
let flankerAnimationId = null;
let flankerPhaseOffset = 0;
let nextFlashTimeoutId = null;
let stimulusHideTimeoutId = null; // Guard to track and cancel pending stimulus hide signals

// Temporary coordinates cache for the active trial stimulus
let currentAngleDeg = 0; 
let lastRandomFreq = 0.08;
let lastRandomSigma = 40;
let lastRandomAspectRatio = 1.0; // Dynamic Gabor aspect ratio cache
let lastOffsetX = 0;
let lastOffsetY = 0;
let isAnaglyphTestActive = false;

// Frequency and sigma ranges calibrated for organic, mathematically smooth progression boundaries
const levelFreqRanges = {
    1: { min: 0.03, max: 0.05 }, // Stage 1 (Introductory): low cpd, fat 2-3 stripe Gabor support
    2: { min: 0.05, max: 0.08 }, // Stage 2 (Early Intermediate): perfect overlapping buffer with Stage 1
    3: { min: 0.08, max: 0.12 }, // Stage 3 (Intermediate): standard therapeutic spatial frequencies
    4: { min: 0.12, max: 0.17 }, // Stage 4 (Late Intermediate): thin line density limits
    5: { min: 0.17, max: 0.24 }  // Stage 5 (Extreme): ultra-fine foveal details targeting V1 simple cells
};

const levelSigmaRanges = {
    1: { min: 40, max: 50 }, // Balanced size targeting large low-frequency receptive fields
    2: { min: 32, max: 40 },
    3: { min: 24, max: 31 },
    4: { min: 18, max: 23 },
    5: { min: 12, max: 17 }  // Small foveal aperture preventing peripheral ocular compensations
};

// DOM Input References
const selectPresetMode = document.getElementById('select-preset-mode');
const selectStartLevel = document.getElementById('select-start-level');
const selectAutonext = document.getElementById('select-autonext');
const selectSessionLimit = document.getElementById('select-session-limit');
const selectFlashDuration = document.getElementById('select-flash-duration');

const chkStageAdvance = document.getElementById('chk-stage-advance');
const chkPeripheral = document.getElementById('chk-peripheral');
const chkCrowding = document.getElementById('chk-crowding');
const chkOrthogonal = document.getElementById('chk-orthogonal-flankers');
const chkDynamic = document.getElementById('chk-dynamic-flankers');
const chkLowContrast = document.getElementById('chk-low-contrast');
const chkWideVariance = document.getElementById('chk-wide-variance');
const chkStatic = document.getElementById('chk-static');
const chkAnaglyph = document.getElementById('chk-anaglyph');
const chkFlicker = document.getElementById('chk-flicker');
const chkFusionLock = document.getElementById('chk-fusion-lock');

const selectRedSide = document.getElementById('select-red-side');
const selectLazySide = document.getElementById('select-lazy-side');
const rangeStrongAttenuation = document.getElementById('range-strong-attenuation');
const valStrongAttenuation = document.getElementById('val-strong-attenuation');
const btnFusionTest = document.getElementById('btn-fusion-test');
const anaglyphSettingsPanel = document.getElementById('anaglyph-settings-panel');

const canvas = document.getElementById('gaborCanvas');
const ctx = canvas.getContext('2d');
const cross = document.getElementById('cross');
const flashOverlay = document.getElementById('flash-overlay');
const container = document.getElementById('container');
const btnStart = document.getElementById('btn-start');

// Asynchronously load translations from external static JSON bundles
export async function setLanguage(lang) {
    try {
        const response = await fetch(`./i18n/${lang}.json`);
        activeTranslations = await response.json();
    } catch (e) {
        console.error("Failed to load translation bundle, falling back to English:", e);
        return;
    }

    Store.state.currentLang = lang;
    Store.saveSettings();

    // Toggle language button active states
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
    const activeLangBtn = document.getElementById(`lang-${lang}`);
    if (activeLangBtn) activeLangBtn.classList.add('active');

    const t = activeTranslations;
    
    // Localize scoreboard and labels
    if (document.getElementById('lbl-stage')) document.getElementById('lbl-stage').innerText = t.stage;
    if (document.getElementById('lbl-contrast')) document.getElementById('lbl-contrast').innerText = t.contrast;
    if (document.getElementById('lbl-streak')) document.getElementById('lbl-streak').innerText = t.streak;
    if (document.getElementById('lbl-leaderboard-title')) document.getElementById('lbl-leaderboard-title').innerText = t.leaderboardTitle;
    
    if (!Store.state.isWaitingForAnswer) {
        btnStart.innerText = (Store.state.total > 0 && !Store.state.autoAdvance) ? t.nextBtn : t.startBtn;
    } else {
        btnStart.innerText = t.reflashBtn;
    }
    
    if (document.getElementById('lbl-btn-left')) document.getElementById('lbl-btn-left').innerText = t.leftBtn;
    if (document.getElementById('lbl-btn-right')) document.getElementById('lbl-btn-right').innerText = t.rightBtn;

    // Localize Handbook modal text nodes
    if (document.getElementById('modal-title')) document.getElementById('modal-title').innerText = t.modalTitle;
    if (document.getElementById('sec-about-title')) document.getElementById('sec-about-title').innerText = t.secAboutTitle;
    if (document.getElementById('sec-about-text')) document.getElementById('sec-about-text').innerHTML = t.secAboutText;
    if (document.getElementById('sec-instructions-title')) document.getElementById('sec-instructions-title').innerText = t.secInstructionsTitle;
    if (document.getElementById('sec-instructions-list')) document.getElementById('sec-instructions-list').innerHTML = t.secInstructionsText;
    if (document.getElementById('sec-levels-title')) document.getElementById('sec-levels-title').innerText = t.secLevelsTitle;
    if (document.getElementById('sec-levels-list')) document.getElementById('sec-levels-list').innerHTML = t.secLevelsList;
    if (document.getElementById('sec-presets-title')) document.getElementById('sec-presets-title').innerText = t.secPresetsTitle;
    if (document.getElementById('sec-presets-list')) document.getElementById('sec-presets-list').innerHTML = t.secPresetsText;
    if (document.getElementById('sec-recommendations-title')) document.getElementById('sec-recommendations-title').innerText = t.secRecommendationsTitle;
    if (document.getElementById('sec-recommendations-list')) document.getElementById('sec-recommendations-list').innerHTML = t.secRecommendationsText;

    // Localize Configuration panel text nodes
    if (document.getElementById('settings-title')) document.getElementById('settings-title').innerText = t.settingsTitle;
    if (document.getElementById('lbl-setting-mode')) document.getElementById('lbl-setting-mode').innerText = t.lblSettingPreset;
    if (document.getElementById('lbl-setting-start-level')) document.getElementById('lbl-setting-start-level').innerText = t.lblSettingStartLevel;
    if (document.getElementById('lbl-setting-autonext')) document.getElementById('lbl-setting-autonext').innerText = t.lblSettingAutonext;
    if (document.getElementById('lbl-setting-limit')) document.getElementById('lbl-setting-limit').innerText = t.lblSettingLimit;
    
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('opt-stage-' + i);
        if (el) {
            el.innerText = i === 5 ? t.optStage5 : (lang === 'ru' ? `Этап ${i}` : `Stage ${i}`);
        }
    }
    
    // Localize forms descriptors/tooltips
    const helpSpans = [
        'help-preset-mode', 'help-start-level', 'help-flash-duration',
        'help-stage-advance', 'help-peripheral', 'help-crowding',
        'help-low-contrast', 'help-wide-variance', 'help-static',
        'help-flicker', 'help-anaglyph', 'help-fusion-lock', 'help-orthogonal', 'help-dynamic'
    ];
    const helpKeys = [
        'helpPresetMode', 'helpStartLevel', 'helpFlashDuration',
        'helpStageAdvance', 'helpPeripheral', 'helpCrowding',
        'helpLowContrast', 'helpWideVariance', 'helpStatic',
        'helpFlicker', 'helpAnaglyph', 'helpFusionLock', 'helpOrthogonal', 'helpDynamic'
    ];
    for (let i = 0; i < helpSpans.length; i++) {
        const el = document.getElementById(helpSpans[i]);
        if (el) el.innerText = t[helpKeys[i]];
    }
    
    // Localize preset select option nodes
    if (document.getElementById('opt-preset-occlusion')) document.getElementById('opt-preset-occlusion').innerText = t.optPresetOcclusion;
    if (document.getElementById('opt-preset-binocular')) document.getElementById('opt-preset-binocular').innerText = t.optPresetBinocular;
    if (document.getElementById('opt-preset-peripheral')) document.getElementById('opt-preset-peripheral').innerText = t.optPresetPeripheral;
    if (document.getElementById('opt-preset-blitz')) document.getElementById('opt-preset-blitz').innerText = t.optPresetBlitz;
    if (document.getElementById('opt-preset-flicker')) document.getElementById('opt-preset-flicker').innerText = t.optPresetFlicker;
    if (document.getElementById('opt-preset-custom')) document.getElementById('opt-preset-custom').innerText = t.optPresetCustom;
    
    if (document.getElementById('lbl-setting-flash')) document.getElementById('lbl-setting-flash').innerText = t.lblSettingFlash;
    if (document.getElementById('opt-flash-adaptive')) document.getElementById('opt-flash-adaptive').innerText = t.optFlashAdaptive;
    if (document.getElementById('opt-flash-100')) document.getElementById('opt-flash-100').innerText = t.optFlash100;
    if (document.getElementById('opt-flash-180')) document.getElementById('opt-flash-180').innerText = t.optFlash180;
    if (document.getElementById('opt-flash-200')) document.getElementById('opt-flash-200').innerText = t.optFlash200;
    if (document.getElementById('opt-flash-350')) document.getElementById('opt-flash-350').innerText = t.optFlash350;
    
    if (document.getElementById('lbl-setting-stage-advance')) document.getElementById('lbl-setting-stage-advance').innerText = t.lblSettingStageAdvance;
    if (document.getElementById('lbl-setting-peripheral')) document.getElementById('lbl-setting-peripheral').innerText = t.lblSettingPeripheral;
    if (document.getElementById('lbl-setting-crowding')) document.getElementById('lbl-setting-crowding').innerText = t.lblSettingCrowding;
    if (document.getElementById('lbl-setting-low-contrast')) document.getElementById('lbl-setting-low-contrast').innerText = t.lblSettingLowContrast;
    if (document.getElementById('lbl-setting-wide-variance')) document.getElementById('lbl-setting-wide-variance').innerText = t.lblSettingWideVariance;
    if (document.getElementById('lbl-setting-static')) document.getElementById('lbl-setting-static').innerText = t.lblSettingStatic;
    if (document.getElementById('lbl-setting-anaglyph')) document.getElementById('lbl-setting-anaglyph').innerText = t.lblSettingAnaglyph;
    if (document.getElementById('lbl-setting-red-side')) document.getElementById('lbl-setting-red-side').innerText = t.lblSettingRedSide;
    if (document.getElementById('lbl-setting-lazy-side')) document.getElementById('lbl-setting-lazy-side').innerText = t.lblSettingLazySide;
    if (document.getElementById('lbl-setting-strong-attenuation')) document.getElementById('lbl-setting-strong-attenuation').innerText = t.lblSettingStrongAttenuation;
    if (document.getElementById('lbl-setting-flicker')) document.getElementById('lbl-setting-flicker').innerText = t.lblSettingFlicker;
    if (document.getElementById('lbl-setting-fusion-lock')) document.getElementById('lbl-setting-fusion-lock').innerText = t.lblSettingFusionLock;
    if (document.getElementById('lbl-setting-orthogonal')) document.getElementById('lbl-setting-orthogonal').innerText = t.lblSettingOrthogonal;
    if (document.getElementById('lbl-setting-dynamic')) document.getElementById('lbl-setting-dynamic').innerText = t.lblSettingDynamic;
    if (btnFusionTest) btnFusionTest.innerText = t.btnFusionTestLabel;

    const optRedLeft = document.getElementById('opt-red-left');
    const optRedRight = document.getElementById('opt-red-right');
    const optLazyLeft = document.getElementById('opt-lazy-left');
    const optLazyRight = document.getElementById('opt-lazy-right');
    if (optRedLeft) optRedLeft.innerText = t.optSideLeft;
    if (optRedRight) optRedRight.innerText = t.optSideRight;
    if (optLazyLeft) optLazyLeft.innerText = t.optSideLeft;
    if (optLazyRight) optLazyRight.innerText = t.optSideRight;

    if (document.getElementById('opt-limit-off')) document.getElementById('opt-limit-off').innerText = t.optLimitOff;
    if (document.getElementById('opt-autonext-on')) document.getElementById('opt-autonext-on').innerText = t.optAutonextOn;
    if (document.getElementById('opt-autonext-off')) document.getElementById('opt-autonext-off').innerText = t.optAutonextOff;
    if (document.getElementById('desc-mode-explanation')) document.getElementById('desc-mode-explanation').innerText = t.descModeExplanation;

    if (document.getElementById('lbl-active-mode')) document.getElementById('lbl-active-mode').innerText = t.lblActiveMode;
    if (document.getElementById('lbl-active-speed')) document.getElementById('lbl-active-speed').innerText = t.lblActiveSpeed;

    // Trigger reactive View panel redraws
    updateScoreboard(Store.state, activeTranslations);
    updateStatusBar(Store.state, activeTranslations);
    updateLeaderboard(Store.getHistory(), activeTranslations, lang);
    
    // Parse vector emojis using Twemoji loader
    if (window.twemoji) twemoji.parse(document.body);
}

// Read settings values from the HTML Form inputs and sync them to the Store
function syncStateFromUI() {
    const s = Store.state;
    
    if (chkStageAdvance) s.allowStageAdvance = chkStageAdvance.checked;
    if (selectFlashDuration) s.flashDurationMode = selectFlashDuration.value;
    if (chkPeripheral) s.isPeripheralEnabled = chkPeripheral.checked;
    if (chkCrowding) s.isCrowdingEnabled = chkCrowding.checked;
    if (chkOrthogonal) s.isOrthogonalFlankersEnabled = chkOrthogonal.checked;
    if (chkDynamic) s.isDynamicFlankersEnabled = chkDynamic.checked;
    if (chkLowContrast) s.allowLowContrast = chkLowContrast.checked;
    if (chkWideVariance) s.allowWideVariance = chkWideVariance.checked;
    if (chkStatic) s.isStaticEnabled = chkStatic.checked;
    if (chkAnaglyph) s.isAnaglyphEnabled = chkAnaglyph.checked;
    if (chkFlicker) s.isFlickerEnabled = chkFlicker.checked;
    if (chkFusionLock) s.isFusionLockEnabled = chkFusionLock.checked;

    if (selectRedSide) s.redEyeSide = selectRedSide.value;
    if (selectLazySide) s.lazyEyeSide = selectLazySide.value;
    if (rangeStrongAttenuation) s.strongEyeContrastFactor = parseFloat(rangeStrongAttenuation.value) / 100;
    if (selectStartLevel) s.currentLevel = parseInt(selectStartLevel.value);
    if (selectAutonext) s.autoAdvance = (selectAutonext.value === "true");
    if (selectSessionLimit) s.sessionLimit = parseInt(selectSessionLimit.value);

    // Auto-detect and sync matched macro presets
    s.presetMode = Store.detectMatchingPreset();
    if (selectPresetMode) selectPresetMode.value = s.presetMode;

    if (anaglyphSettingsPanel) {
        anaglyphSettingsPanel.style.display = s.isAnaglyphEnabled ? 'block' : 'none';
    }

    updateStatusBar(s, activeTranslations);
}

// Write settings values from the Store back to the HTML Form inputs
function updatePresetUI() {
    const s = Store.state;
    
    if (s.presetMode !== 'custom') {
        Store.applyPresetTemplate(s.presetMode);
    }

    if (chkStageAdvance) chkStageAdvance.checked = s.allowStageAdvance;
    if (selectFlashDuration) selectFlashDuration.value = s.flashDurationMode;
    if (chkPeripheral) chkPeripheral.checked = s.isPeripheralEnabled;
    if (chkCrowding) chkCrowding.checked = s.isCrowdingEnabled;
    if (chkStatic) chkStatic.checked = s.isStaticEnabled;
    if (chkAnaglyph) chkAnaglyph.checked = s.isAnaglyphEnabled;
    if (chkWideVariance) chkWideVariance.checked = s.allowWideVariance;
    if (chkFlicker) chkFlicker.checked = s.isFlickerEnabled;
    if (chkFusionLock) chkFusionLock.checked = s.isFusionLockEnabled;
    if (chkOrthogonal) chkOrthogonal.checked = s.isOrthogonalFlankersEnabled;
    if (chkDynamic) chkDynamic.checked = s.isDynamicFlankersEnabled;

    if (selectStartLevel) selectStartLevel.value = s.currentLevel;
    if (selectAutonext) selectAutonext.value = s.autoAdvance ? "true" : "false";
    if (selectSessionLimit) selectSessionLimit.value = s.sessionLimit;
    if (selectRedSide) selectRedSide.value = s.redEyeSide;
    if (selectLazySide) selectLazySide.value = s.lazyEyeSide;
    
    if (rangeStrongAttenuation) {
        rangeStrongAttenuation.value = Math.round(s.strongEyeContrastFactor * 100);
        if (valStrongAttenuation) valStrongAttenuation.innerText = Math.round(s.strongEyeContrastFactor * 100) + '%';
    }

    if (anaglyphSettingsPanel) {
        anaglyphSettingsPanel.style.display = s.isAnaglyphEnabled ? 'block' : 'none';
    }

    updateStatusBar(s, activeTranslations);
}

// Start continuous high-performance phase drifting animation loop for moving flankers
function startFlankerAnimation() {
    if (flankerAnimationId) cancelAnimationFrame(flankerAnimationId);
    
    function animate() {
        flankerPhaseOffset += 0.12; 
        renderGabor(canvas, ctx, Store.state, currentAngleDeg, Store.state.autoContrast, lastRandomFreq, lastRandomSigma, lastOffsetX, lastOffsetY, flankerPhaseOffset, lastRandomAspectRatio);
        flankerAnimationId = requestAnimationFrame(animate);
    }
    
    flankerAnimationId = requestAnimationFrame(animate);
}

// Stop the running phase drift animation and reset phase variables safely
function stopFlankerAnimation() {
    // Forcefully cancel any existing animation frames to prevent "zombie loops"
    if (flankerAnimationId !== null) {
        cancelAnimationFrame(flankerAnimationId);
        flankerAnimationId = null;
    }
    flankerPhaseOffset = 0;
}

// Hot-reload settings and clean up active loops on re-flash click
function reFlashCurrentGabor() {
    const t = activeTranslations;
    btnStart.innerText = "...";

    // Force dynamic hot-sync and clear older cycles to avoid rendering conflicts
    if (flickerIntervalId) {
        clearInterval(flickerIntervalId);
        flickerIntervalId = null;
    }
    stopFlankerAnimation();
    syncStateFromUI();

    const s = Store.state;

    if (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) {
        startFlankerAnimation();
    } else {
        renderGabor(canvas, ctx, s, currentAngleDeg, s.autoContrast, lastRandomFreq, lastRandomSigma, lastOffsetX, lastOffsetY, flankerPhaseOffset, lastRandomAspectRatio);
    }

    let flashDuration = 200;
    if (s.flashDurationMode === '100') {
        flashDuration = 100;
    } else if (s.flashDurationMode === '180') {
        flashDuration = 180;
    } else if (s.flashDurationMode === '200') {
        flashDuration = 200;
    } else if (s.flashDurationMode === '350') {
        flashDuration = 350;
    } else {
        // Adaptive temporal pacing scaling down to prevent saccadic ocular cheats at high stages
        if (s.currentLevel === 1) flashDuration = 240;
        else if (s.currentLevel === 2) flashDuration = 200;
        else if (s.currentLevel === 3) flashDuration = 170;
        else if (s.currentLevel === 4) flashDuration = 140;
        else if (s.currentLevel === 5) flashDuration = 110;
    }

    cross.style.display = 'none';
    canvas.style.display = 'block';

    if (!s.isStaticEnabled) {
        // Clear any previous pending hide timeout before starting a new one
        if (stimulusHideTimeoutId) clearTimeout(stimulusHideTimeoutId);
        
        stimulusHideTimeoutId = setTimeout(() => {
            stopFlankerAnimation();
            drawIdleState(canvas, ctx, s.isFusionLockEnabled);
            cross.style.display = 'block';
            btnStart.innerText = t.reflashBtn;
            stimulusHideTimeoutId = null;
        }, flashDuration);
    } else {
        if (s.isFlickerEnabled) {
            let flickerState = true;
            flickerIntervalId = setInterval(() => {
                flickerState = !flickerState;
                if (flickerState) {
                    renderGabor(canvas, ctx, s, currentAngleDeg, s.autoContrast, lastRandomFreq, lastRandomSigma, lastOffsetX, lastOffsetY, flankerPhaseOffset, lastRandomAspectRatio);
                } else {
                    drawIdleState(canvas, ctx, s.isFusionLockEnabled);
                }
            }, 50); 
        }
        btnStart.innerText = t.reflashBtn;
    }
}

// Play acoustic pre-cue click and schedule stimulus flash after 180ms
function runFlash() {
    // Automatically deactivate and clear calibration test card when starting a new flash
    if (isAnaglyphTestActive) {
        isAnaglyphTestActive = false;
        if (btnFusionTest) {
            btnFusionTest.style.background = '#1a233a';
            btnFusionTest.style.color = '#3b90ff';
        }
    }

    if (Store.state.isWaitingForAnswer) {
        playCue(Store.state.isMuted);
        setTimeout(reFlashCurrentGabor, 180);
        return;
    }

    if (nextFlashTimeoutId) {
        clearTimeout(nextFlashTimeoutId);
        nextFlashTimeoutId = null;
    }
    
    btnStart.innerText = "...";
    playCue(Store.state.isMuted);
    setTimeout(executeGaborFlash, 180);
}

// Generate mathematical Gabor coordinates and execute visual flash
function executeGaborFlash() {
    const t = activeTranslations;
    const s = Store.state;

    // Generate non-trivial angle coordinates to ensure clear visual resolution challenges
    do {
        currentAngleDeg = Math.floor(Math.random() * 160) - 80;
    } while (Math.abs(currentAngleDeg) < 15);
    
    // Push settings variables to indicators scoreboard
    document.getElementById('current-contrast').innerText = Math.round(s.autoContrast * 100);
    document.getElementById('current-level').innerText = s.currentLevel;
    document.getElementById('current-streak').innerText = s.correctStreak;
    
    // Scale central fixation cross size dynamically according to active stage depth
    let crossSize = 36;
    if (s.currentLevel === 1) crossSize = 36;
    else if (s.currentLevel === 2) crossSize = 28;
    else if (s.currentLevel === 3) crossSize = 22;
    else if (s.currentLevel === 4) crossSize = 16;
    else if (s.currentLevel === 5) crossSize = 12;
    cross.style.fontSize = crossSize + 'px';
    
    // Load and randomize line density configurations inside safe levels ranges
    const freqRange = levelFreqRanges[s.currentLevel] || levelFreqRanges[1];
    lastRandomFreq = Math.random() * (freqRange.max - freqRange.min) + freqRange.min;
    
    const sigmaRange = levelSigmaRanges[s.currentLevel] || levelSigmaRanges[1];
    lastRandomSigma = Math.random() * (sigmaRange.max - sigmaRange.min) + sigmaRange.min;

    lastRandomAspectRatio = 1.0; // Reset to perfect circular symmetry by default
    if (s.allowWideVariance) {
        const randType = Math.random();
        if (randType < 0.35) {
            lastRandomFreq = Math.random() * (0.04 - 0.03) + 0.03;
            lastRandomSigma = Math.random() * (45 - 35) + 35;
        } else if (randType < 0.50) {
            lastRandomFreq = Math.random() * (0.16 - 0.12) + 0.12;
            lastRandomSigma = Math.random() * (40 - 32) + 32;
        }
        // Synthesize dynamic Gabor aspect ratio on each flash under shape variance protocols
        lastRandomAspectRatio = Math.random() * (2.0 - 0.5) + 0.5;
    }

    // Apply spatial summation contrast-to-size coupling rule
    const summationThreshold = 0.12;
    if (s.autoContrast < summationThreshold) {
        const summationMultiplier = 1.0 + (summationThreshold - s.autoContrast) * 3.0;
        lastRandomSigma = lastRandomSigma * summationMultiplier;
    }
    
    // Apply optional eccentric foveal shift
    lastOffsetX = 0;
    lastOffsetY = 0;
    if (s.isPeripheralEnabled) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = 55; 
        lastOffsetX = Math.cos(angle) * distance;
        lastOffsetY = Math.sin(angle) * distance;
    }

    // Render visual Gabor buffer with dynamic shape variance support
    renderGabor(canvas, ctx, s, currentAngleDeg, s.autoContrast, lastRandomFreq, lastRandomSigma, lastOffsetX, lastOffsetY, flankerPhaseOffset, lastRandomAspectRatio);
    
    let flashDuration = 200;
    if (s.flashDurationMode === '100') {
        flashDuration = 100;
    } else if (s.flashDurationMode === '180') {
        flashDuration = 180;
    } else if (s.flashDurationMode === '200') {
        flashDuration = 200;
    } else if (s.flashDurationMode === '350') {
        flashDuration = 350;
    } else {
        // Adaptive temporal pacing scaling down to prevent saccadic ocular cheats at high stages
        if (s.currentLevel === 1) flashDuration = 240;
        else if (s.currentLevel === 2) flashDuration = 200;
        else if (s.currentLevel === 3) flashDuration = 170;
        else if (s.currentLevel === 4) flashDuration = 140;
        else if (s.currentLevel === 5) flashDuration = 110;
    }

    updateStatusBar(s, activeTranslations);
    
    cross.style.display = 'none';
    canvas.style.display = 'block';
    s.isWaitingForAnswer = true;

    if (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) {
        startFlankerAnimation();
    }

    if (!s.isStaticEnabled) {
        setTimeout(() => {
            stopFlankerAnimation();
            drawIdleState(canvas, ctx, s.isFusionLockEnabled);
            cross.style.display = 'block';
            btnStart.innerText = t.reflashBtn;
        }, flashDuration);
    } else {
        if (flickerIntervalId) {
            clearInterval(flickerIntervalId);
            flickerIntervalId = null;
        }
        if (s.isFlickerEnabled) {
            let flickerState = true;
            flickerIntervalId = setInterval(() => {
                flickerState = !flickerState;
                if (flickerState) {
                    renderGabor(canvas, ctx, s, currentAngleDeg, s.autoContrast, lastRandomFreq, lastRandomSigma, lastOffsetX, lastOffsetY, flankerPhaseOffset, lastRandomAspectRatio);
                } else {
                    drawIdleState(canvas, ctx, s.isFusionLockEnabled);
                }
            }, 50); 
        }
        btnStart.innerText = t.reflashBtn;
    }
}

// Play milestone victory sequence upon session limit completions
function triggerMilestoneFlash(callback) {
    let count = 0;
    const interval = setInterval(() => {
        const isEven = count % 2 === 0;
        if (isEven) {
            flashOverlay.classList.add('flash-success');
            container.classList.add('success-pulse');
        } else {
            flashOverlay.classList.remove('flash-success');
            container.classList.remove('success-pulse');
        }
        count++;
        if (count >= 6) {
            clearInterval(interval);
            flashOverlay.classList.remove('flash-success');
            container.classList.remove('success-pulse');
            if (callback) callback();
        }
    }, 120);
}

// Evaluate user answer and update Model & View states accordingly
function checkAnswer(userChoice) {
    const s = Store.state;
    if (!s.isWaitingForAnswer) return;
    s.isWaitingForAnswer = false; 
    
    // Safety: Instantly kill any pending stimulus hide or flicker intervals
    if (stimulusHideTimeoutId) {
        clearTimeout(stimulusHideTimeoutId);
        stimulusHideTimeoutId = null;
    }
    if (flickerIntervalId) {
        clearInterval(flickerIntervalId);
        flickerIntervalId = null;
    }
    
    stopFlankerAnimation();
    cross.style.display = 'block';

    if (nextFlashTimeoutId) {
        clearTimeout(nextFlashTimeoutId);
        nextFlashTimeoutId = null;
    }

    const correctAnswer = currentAngleDeg < 0 ? 'left' : 'right';
    const isCorrect = (userChoice === correctAnswer);
    
    // Cancel active hardware animations and force reflow
    container.classList.remove('success-pulse', 'error-shake');
    flashOverlay.classList.remove('flash-success', 'flash-error');
    void container.offsetWidth;
    void flashOverlay.offsetWidth;

    // Mutate state inside Store Model
    Store.registerResult(isCorrect);

    if (isCorrect) {
        playSuccess(s.isMuted);
        
        // Trigger hardware-accelerated dopamine success feedback (Teal chromatic wave + expansion)
        flashOverlay.classList.add('flash-success');
        container.classList.add('success-pulse');
    } else {
        playError(s.isMuted);
        
        // Trigger hardware-accelerated tactile friction error feedback (Burgundy chromatic wave + vibration)
        flashOverlay.classList.add('flash-error');
        container.classList.add('error-shake');
    }

    // Instantly clear Gabor stimulus post-decision to preserve foveal gray state
    drawIdleState(canvas, ctx, s.isFusionLockEnabled);

    // Revert hardware flash overlays back to neutral alpha
    setTimeout(() => { 
        flashOverlay.classList.remove('flash-success', 'flash-error');
        container.classList.remove('success-pulse', 'error-shake');
    }, 300);
    
    // Update scoreboards and write to local leaderboard history
    updateScoreboard(s, activeTranslations);
    Store.saveSession();
    updateLeaderboard(Store.getHistory(), activeTranslations, s.currentLang);

    // Check for elite cortical saturation milestone (Stage 5 mastery at minimum contrast limit)
    const minContrastLimit = s.allowLowContrast ? 0.01 : 0.05;
    if (s.currentLevel === 5 && s.autoContrast <= minContrastLimit && s.correctStreak >= 12) {
        setTimeout(() => {
            triggerMilestoneFlash(() => {
                alert(activeTranslations.sessionMastered);
            });
        }, 400);
        return; // Intercept further gameplay and prevent auto-advance
    }

    // Check session limit thresholds
    if (s.sessionLimit > 0 && s.total >= s.sessionLimit) {
        setTimeout(() => {
            triggerMilestoneFlash(() => {
                alert(activeTranslations.sessionCompleted.replace("{limit}", s.sessionLimit));
            });
        }, 400);
        return;
    }

    if (s.autoAdvance) {
        btnStart.innerText = "...";
        nextFlashTimeoutId = setTimeout(runFlash, 900);
    } else {
        btnStart.innerText = activeTranslations.nextBtn;
    }
}

// Map settings panel form inputs to the DOM events
function bindSettingsInteractions() {
    if (selectPresetMode) {
        selectPresetMode.addEventListener('change', () => {
            Store.state.presetMode = selectPresetMode.value;
            updatePresetUI();
        });
    }

    if (chkPeripheral) {
        chkPeripheral.addEventListener('change', () => {
            if (chkPeripheral.checked) {
                if (chkCrowding) chkCrowding.checked = false;
                if (chkOrthogonal) chkOrthogonal.checked = false;
                if (chkDynamic) chkDynamic.checked = false;
            }
            syncStateFromUI();
        });
    }

    if (chkCrowding) {
        chkCrowding.addEventListener('change', () => {
            if (chkCrowding.checked) {
                if (chkPeripheral) chkPeripheral.checked = false;
            } else {
                if (chkOrthogonal) chkOrthogonal.checked = false;
                if (chkDynamic) chkDynamic.checked = false;
            }
            syncStateFromUI();
        });
    }

    if (chkOrthogonal) {
        chkOrthogonal.addEventListener('change', () => {
            if (chkOrthogonal.checked) {
                if (chkCrowding) chkCrowding.checked = true;
                if (chkPeripheral) chkPeripheral.checked = false;
            }
            syncStateFromUI();
        });
    }

    if (chkDynamic) {
        chkDynamic.addEventListener('change', () => {
            if (chkDynamic.checked) {
                if (chkCrowding) chkCrowding.checked = true;
                if (chkPeripheral) chkPeripheral.checked = false;
            }
            syncStateFromUI();
        });
    }

    if (chkAnaglyph) {
        chkAnaglyph.addEventListener('change', () => {
            Store.state.isAnaglyphEnabled = chkAnaglyph.checked;
            syncStateFromUI();
        });
    }

    if (rangeStrongAttenuation) {
        rangeStrongAttenuation.addEventListener('input', () => {
            if (valStrongAttenuation) {
                valStrongAttenuation.innerText = rangeStrongAttenuation.value + '%';
            }
            syncStateFromUI();
        });
    }

    if (chkStatic) {
        chkStatic.addEventListener('change', () => {
            Store.state.isStaticEnabled = chkStatic.checked;
            if (!Store.state.isStaticEnabled) {
                if (chkFlicker) chkFlicker.checked = false;
            }
            syncStateFromUI();
        });
    }

    if (chkFlicker) {
        chkFlicker.addEventListener('change', () => {
            if (chkFlicker.checked) {
                if (chkStatic) chkStatic.checked = true;
            }
            syncStateFromUI();
        });
    }

    // Connect global form elements change listeners
    const inputsToSync = [
        chkStageAdvance, selectFlashDuration, chkLowContrast,
        chkWideVariance, chkAnaglyph, selectRedSide, selectLazySide,
        rangeStrongAttenuation, selectStartLevel, selectAutonext, selectSessionLimit, 
        chkFusionLock
    ];
    inputsToSync.forEach(input => {
        if (input) input.addEventListener('change', syncStateFromUI);
    });

    // Diagnostic calibration test pattern toggle
    if (btnFusionTest) {
        btnFusionTest.addEventListener('click', () => {
            isAnaglyphTestActive = !isAnaglyphTestActive;
            if (isAnaglyphTestActive) {
                btnFusionTest.style.background = '#3b90ff';
                btnFusionTest.style.color = '#131a26';
                
                if (selectRedSide) Store.state.redEyeSide = selectRedSide.value;
                if (selectLazySide) Store.state.lazyEyeSide = selectLazySide.value;
                
                drawFusionTestPattern(canvas, ctx, Store.state);
                canvas.style.display = 'block';
                cross.style.display = 'none'; // Hide HTML cross to prevent double-rendering and CSS alignment offsets
            } else {
                btnFusionTest.style.background = '#1a233a';
                btnFusionTest.style.color = '#3b90ff';
                drawIdleState(canvas, ctx, Store.state.isFusionLockEnabled);
                cross.style.display = 'block'; // Restore the static HTML foveation cross
            }
        });
    }
}

// Connect language selections inside top bar
function bindLangSelectors() {
    const langEnBtn = document.getElementById('lang-en');
    const langRuBtn = document.getElementById('lang-ru');
    if (langEnBtn) langEnBtn.addEventListener('click', () => setLanguage('en'));
    if (langRuBtn) langRuBtn.addEventListener('click', () => setLanguage('ru'));
}

// Orchestrator initialization block
window.addEventListener('load', async () => {
    Store.loadSettings(); // Load Model from localStorage
    
    // Connect top bar manual triggers, bindings and Settings dialog
    initModals(
        () => {
            // Settings Open Callback: sync HTML form settings with active Store values
            Store.loadSettings();
            
            // Synchronize the test button's visual styling dynamically with the active engine state
            if (btnFusionTest) {
                if (isAnaglyphTestActive) {
                    btnFusionTest.style.background = '#3b90ff';
                    btnFusionTest.style.color = '#131a26';
                } else {
                    btnFusionTest.style.background = '#1a233a';
                    btnFusionTest.style.color = '#3b90ff';
                }
            }
            
            updatePresetUI();
        },
        () => {
            // Settings Close Callback: save HTML forms variables to Store and persistent memory
            saveSettingsFromUI();
        }
    );

    // Bind physical input devices, click events, and Safari double-click blockers
    bindInputControls({
        onAnswer: (choice) => checkAnswer(choice),
        onStartFlash: () => runFlash(),
        onMuteToggle: () => {
            Store.state.isMuted = !Store.state.isMuted;
            Store.saveSettings();
            updateMuteBtnUI();
        },
        onEscape: () => {
            // Close Settings modal if opened and save variables safely
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal && settingsModal.style.display === 'block') {
                saveSettingsFromUI();
                settingsModal.style.display = 'none';
            }
            const infoModal = document.getElementById('info-modal');
            if (infoModal && infoModal.style.display === 'block') {
                infoModal.style.display = 'none';
            }
        }
    });

    // Helper functions for settings panel triggers
    function saveSettingsFromUI() {
        syncStateFromUI();
        Store.saveSettings();
        
        // Reset adaptive progress when training rules are altered
        Store.state.autoContrast = 0.40;
        Store.state.correctStreak = 0;
        Store.state.staircaseStreak = 0;

        if (nextFlashTimeoutId) {
            clearTimeout(nextFlashTimeoutId);
            nextFlashTimeoutId = null;
        }

        // Only reset canvas to blank gray if the calibration test pattern is not actively running
        if (!isAnaglyphTestActive) {
            drawIdleState(canvas, ctx, Store.state.isFusionLockEnabled);
        } else {
            // Re-render calibration card upon saving to apply updated Red/Cyan eye configurations instantly
            drawFusionTestPattern(canvas, ctx, Store.state);
        }
        setLanguage(Store.state.currentLang); // Re-render translated texts
    }

    function updateMuteBtnUI() {
        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
            btnMute.innerText = Store.state.isMuted ? '🔇' : '🔊';
            if (window.twemoji) twemoji.parse(btnMute);
        }
    }

    // Set mute visual state on startup
    updateMuteBtnUI();

    // Bind other settings forms behaviors
    bindSettingsInteractions();
    bindLangSelectors();

    // Secure procedural Web Audio init triggers on first gesture
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true, passive: true });
    window.addEventListener('keydown', initAudio, { once: true });

    // Boot app language and clear canvas to default idle gray state
    await setLanguage(Store.state.currentLang);
    drawIdleState(canvas, ctx, Store.state.isFusionLockEnabled);
});

// Bind primary START FLASH button listener
if (btnStart) {
    btnStart.addEventListener('click', runFlash);
}