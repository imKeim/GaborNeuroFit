/*
 * GaborNeuroFit - High-Performance Orchestrator & Entry Point
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This file boots up the application, coordinates events between the Store,
 * the rendering Engines, the UI View layer, and handles asynchronous translation loadings.
 */

// Import core dependencies
import { Store } from './store.js';
import { drawFusionTestPattern } from './engine/gabor.js';
import { initAudio } from './engine/audio.js';
import { updateScoreboard, updateLeaderboard, drawIdleState, updateStatusBar } from './ui/screen.js';
import { initModals } from './ui/modal.js';
import { bindInputControls } from './ui/controls.js';
import { TrialController, TrialState } from './controller/trial.js';
import { SettingsController } from './controller/settings.js';

// Global cache for the active localization dictionary
let activeTranslations = {};

// References to our core OOP controllers instances
let trialController = null;
let settingsController = null;

// Primary DOM References for view rendering
const canvas = document.getElementById('gaborCanvas');
const ctx = canvas.getContext('2d');
const cross = document.getElementById('cross');
const flashOverlay = document.getElementById('flash-overlay');
const container = document.getElementById('container');
const btnStart = document.getElementById('btn-start');
const btnFusionTest = document.getElementById('btn-fusion-test');

/**
 * Asynchronously loads translations from external static JSON bundles and updates DOM
 */
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

    // Localize settings accordion group headers dynamically
    if (document.getElementById('lbl-setting-group-1')) document.getElementById('lbl-setting-group-1').innerText = t.lblSettingGroup1;
    if (document.getElementById('lbl-setting-group-2')) document.getElementById('lbl-setting-group-2').innerText = t.lblSettingGroup2;
    if (document.getElementById('lbl-setting-group-3')) document.getElementById('lbl-setting-group-3').innerText = t.lblSettingGroup3;
    if (document.getElementById('lbl-setting-group-4')) document.getElementById('lbl-setting-group-4').innerText = t.lblSettingGroup4;

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
    if (document.getElementById('lbl-setting-lang')) document.getElementById('lbl-setting-lang').innerText = t.lblSettingLang;
    if (document.getElementById('rotation-text')) document.getElementById('rotation-text').innerText = t.lblRotationBlock;

    // Synchronize the language selection dropdown value
    const selectLang = document.getElementById('select-lang');
    if (selectLang) selectLang.value = lang;
    
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
    if (document.getElementById('lbl-setting-left-color')) document.getElementById('lbl-setting-left-color').innerHTML = t.lblSettingLeftColor;
    if (document.getElementById('lbl-setting-right-color')) document.getElementById('lbl-setting-right-color').innerHTML = t.lblSettingRightColor;
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

    // Localize Statistics Title
    if (document.getElementById('stats-title')) {
        document.getElementById('stats-title').innerText = t.statsTitle;
    }

    // Trigger reactive View panel redraws
    updateScoreboard(Store.state, activeTranslations);
    updateStatusBar(Store.state, activeTranslations);
    
    // Parse vector emojis using Twemoji loader strictly on active dynamic panels to eliminate document-wide reflow lag
    if (window.twemoji) {
        twemoji.parse(document.getElementById('top-bar'));
        twemoji.parse(document.getElementById('bottom-dock'));
    }
}

/**
 * Triggers Gabor exposures based on current waiting state
 */
function runFlash() {
    // Lock start triggers while the calibration test pattern is active
    if (trialController.isAnaglyphTestActive) return;

    if (Store.state.isWaitingForAnswer) {
        trialController.reFlashCurrentGabor();
    } else {
        trialController.triggerTrial();
    }
}

/**
 * Connect language dropdown selectors inside the settings panel
 */
function bindLangSelectors() {
    const selectLang = document.getElementById('select-lang');
    if (selectLang) {
        selectLang.addEventListener('change', () => setLanguage(selectLang.value));
    }
}

/**
 * Orchestrator bootstrap initialization block
 */
window.addEventListener('load', async () => {
    Store.loadSettings();

    // Instantiate core controllers
    trialController = new TrialController(
        canvas, 
        ctx, 
        cross, 
        container, 
        flashOverlay, 
        btnStart, 
        () => activeTranslations
    );

    settingsController = new SettingsController(() => {
        // Callback triggered whenever settings forms are synchronized
        updateStatusBar(Store.state, activeTranslations);
        
        // Instantly redraw the calibration test pattern to reflect real-time slider value shifts
        if (trialController && trialController.isAnaglyphTestActive) {
            drawFusionTestPattern(canvas, ctx, Store.state);
        }
    });
    
    initModals(
        () => {
            Store.loadSettings();
            
            if (btnFusionTest) {
                if (trialController.isAnaglyphTestActive) {
                    btnFusionTest.style.background = '#3b90ff';
                    btnFusionTest.style.color = '#131a26';
                } else {
                    btnFusionTest.style.background = '#1a233a';
                    btnFusionTest.style.color = '#3b90ff';
                }
            }
            
            settingsController.updatePresetUI();
        },
        () => {
            saveSettingsFromUI();
        },
        () => {
            updateLeaderboard(Store.getHistory(), activeTranslations, Store.state.currentLang);
        }
    );

    bindInputControls({
        onAnswer: (choice) => trialController.submitAnswer(choice),
        onStartFlash: () => runFlash(),
        onMuteToggle: () => {
            Store.state.isMuted = !Store.state.isMuted;
            Store.saveSettings();
            updateMuteBtnUI();
        },
        onEscape: () => {
            const settingsModal = document.getElementById('settings-modal');
            const infoModal = document.getElementById('info-modal');
            const statsModal = document.getElementById('stats-modal');

            // Block Escape key closing strictly when 3D calibration mode is active to prevent accidental window loss
            if (trialController && trialController.isAnaglyphTestActive) {
                return;
            }

            // Universally detects active modals regardless of 'block' or 'flex' layout engines
            if (settingsModal && settingsModal.style.display !== 'none' && settingsModal.style.display !== '') {
                saveSettingsFromUI();
                settingsModal.style.display = 'none';
            }
            if (infoModal && infoModal.style.display !== 'none' && infoModal.style.display !== '') {
                infoModal.style.display = 'none';
            }
            if (statsModal && statsModal.style.display !== 'none' && statsModal.style.display !== '') {
                statsModal.style.display = 'none';
            }
        }
    });

    function saveSettingsFromUI() {
        settingsController.syncStateFromUI();
        Store.saveSettings();
        
        // Reset session progress variables
        Store.state.autoContrast = 0.40;
        Store.state.correctStreak = 0;
        Store.state.staircaseStreak = 0;
        Store.state.isWaitingForAnswer = false;

        // Reset the trial execution state machine to idle
        trialController.tracker.clearAll();
        trialController.currentState = TrialState.IDLE;

        if (!trialController.isAnaglyphTestActive) {
            drawIdleState(canvas, ctx, Store.state.isFusionLockEnabled);
        } else {
            drawFusionTestPattern(canvas, ctx, Store.state);
        }
        setLanguage(Store.state.currentLang);
    }

    function updateMuteBtnUI() {
        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
            btnMute.innerText = Store.state.isMuted ? '🔇' : '🔊';
            if (window.twemoji) twemoji.parse(btnMute);
        }
    }

    // Connect alignment test pattern toggle listener
    if (btnFusionTest) {
        btnFusionTest.addEventListener('click', () => {
            const settingsModal = document.getElementById('settings-modal');
            trialController.isAnaglyphTestActive = !trialController.isAnaglyphTestActive;
            
            if (trialController.isAnaglyphTestActive) {
                btnFusionTest.style.background = '#3b90ff';
                btnFusionTest.style.color = '#131a26';
                
                // Toggle calibration bottom sheet layout class
                if (settingsModal) {
                    settingsModal.classList.add('calibration-mode');
                    // Reset scroll body position to the top to align calibration sliders perfectly
                    const scrollBody = settingsModal.querySelector('.modal-scroll-body');
                    if (scrollBody) scrollBody.scrollTop = 0;
                }
                
                const selectRedSide = document.getElementById('select-red-side');
                const selectLazySide = document.getElementById('select-lazy-side');
                if (selectRedSide) Store.state.redEyeSide = selectRedSide.value;
                if (selectLazySide) Store.state.lazyEyeSide = selectLazySide.value;
                
                drawFusionTestPattern(canvas, ctx, Store.state);
                canvas.style.display = 'block';
                cross.style.display = 'none';
            } else {
                btnFusionTest.style.background = '#1a233a';
                btnFusionTest.style.color = '#3b90ff';
                
                // Remove calibration bottom sheet layout class
                if (settingsModal) settingsModal.classList.remove('calibration-mode');
                
                drawIdleState(canvas, ctx, Store.state.isFusionLockEnabled);
                cross.style.display = 'block';
            }
        });
    }

    // Connect primary exposure triggers click listener
    if (btnStart) {
        btnStart.addEventListener('click', runFlash);
    }

    updateMuteBtnUI();
    settingsController.bindSettingsInteractions();
    bindLangSelectors();

    // Register audio activation listeners
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true, passive: true });
    window.addEventListener('keydown', initAudio, { once: true });

    await setLanguage(Store.state.currentLang);
    drawIdleState(canvas, ctx, Store.state.isFusionLockEnabled);
});