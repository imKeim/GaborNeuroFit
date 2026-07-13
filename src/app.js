/*
 * GaborNeuroFit - High-Performance Orchestrator & Entry Point
 * Copyright (C) 2026 Pavel Korotkov
 */

// Import core dependencies
import { Store } from './store.js';
import { DataRepository } from './store/repository.js';
import { drawFusionTestPattern } from './engine/gabor.js';
import { initAudio, playCue, playError, playSuccess } from './engine/audio.js';
import { updateScoreboard, drawIdleState, updateStatusBar } from './ui/screen.js';
import { initModals, showCustomAlert, closeCustomAlert, showCustomConfirm } from './ui/modal.js';
import { bindInputControls } from './ui/controls.js';
import { TrialController, TrialState } from './controller/trial.js';
import { SettingsController } from './controller/settings.js';
import { SynoptophoreController } from './controller/synoptophore.js';
import { RdsController } from './controller/rds.js';
import { DashboardController } from './controller/dashboard.js';
import { PauseController } from './controller/pause.js';
import { PomodoroTimer } from './utils/timer.js';
import { drawSynoptophoreTargets } from './engine/synop_render.js';
import { drawRandomDotStereogram } from './engine/rds_render.js';

// Global cache for the active localization dictionary
let activeTranslations = {};

// Intercept Twemoji parser globally to enforce absolute offline local path loading
if (window.twemoji) {
    const originalParse = window.twemoji.parse;
    window.twemoji.parse = function (target, options) {
        const localOptions = Object.assign({
            folder: 'emojis',
            ext: '.svg',
            base: './'
        }, options);
        return originalParse.call(window.twemoji, target, localOptions);
    };
}

// References to our core OOP controllers instances
let trialController = null;
let settingsController = null;
let synoptophoreController = null;
let rdsController = null; // Instantiated RDS controller
let dashboardController = null;
let pauseController = null;

// Settings Snapshot State holds (Protects session progress on non-critical config changes)
let snapAppMode = null;
let snapPresetMode = null;
let snapLevel = null;
let snapTimerLimit = null;

// Abstracted dragging coordinates context holds
let dragStartX = 0;
let dragStartY = 0;
let dragStartStrongFactor = 0.3; // Calibrated contrast factor context holder

// Primary DOM References for view rendering
const canvas = document.getElementById('gaborCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const cross = document.getElementById('cross');
const flashOverlay = document.getElementById('flash-overlay');
const container = document.getElementById('container');
const btnStart = document.getElementById('btn-start');
const btnFusionTest = document.getElementById('btn-fusion-test');

const customAlertModal = document.getElementById('custom-alert-modal');

/**
 * @description Dynamically scales the canvas and overlay backing stores to match 
 * the high-DPI (Retina) physical pixel boundaries of the active display device.
 * This prevents browser-side linear upscaling blur, keeping all Gabor and RDS assets perfectly sharp.
 * @private
 */
function resizeCanvasesToDPR() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const physicalSize = Math.min(1024, Math.round(rect.width * dpr));
    if (canvas.width !== physicalSize) {
        canvas.width = physicalSize;
        canvas.height = physicalSize;
        overlayCanvas.width = physicalSize;
        overlayCanvas.height = physicalSize;
    }
}

/**
 * @description Symmetrically synchronizes the HTML central fixation cross 
 * with the global application pause, modality and configuration settings.
 * @public
 */
function syncCrossVisualState() {
    const s = Store.state;
    const crossNode = document.getElementById('cross');
    if (!crossNode) return;

    if (s.appMode === 'synoptophore') {
        crossNode.style.display = 'none';
    } else if (s.appMode === 'rds') {
        crossNode.style.display = 'block';
        if (s.rdsIsPermanentCrossEnabled) {
            const rdsState = rdsController ? rdsController.currentState : 'IDLE';
            const isStimulusActive = (rdsState === 'STIMULUS_ACTIVE' || rdsState === 'AWAITING_INPUT') && !s.isPaused;
            
            if (isStimulusActive) {
                crossNode.className = 'cross-white-halo';
            } else {
                crossNode.className = 'cross-hidden'; // Absolutely no cross anywhere else (idle, feedback, pre-cue, pause)
            }
        } else {
            crossNode.className = 'cross-hidden';
        }
    } else {
        crossNode.style.display = 'block';
        if (s.isPaused) {
            crossNode.className = 'cross-dimmed';
        } else if (s.isPermanentCrossEnabled) {
            crossNode.className = 'cross-dimmed';
        } else {
            crossNode.className = 'cross-hidden';
        }
    }
}

/**
 * @description Centralized helper to trigger side-effects during target alignment.
 * Activates Pomodoro timers, forces canvas redraw, and updates the prismatic metrics scoreboard.
 * Ensures strict synchronization of state with the rendering context.
 * @returns {void}
 */
function triggerSynopDragEffects() {
    Store.startTimerIfNeeded();
    if (!Store.state.synopFlickerActive) {
        drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
    }
    updateScoreboard(Store.state, activeTranslations);
}

/**
 * Asynchronously loads translations from external static JSON bundles and updates DOM
 */
export async function setLanguage(lang) {
    try {
        const response = await fetch(`./i18n/${lang}.json`);
        activeTranslations = await response.json();
    } catch (e) {
        console.error("Failed to load translation bundle, falling back to English:", e);
        try {
            const fallbackResponse = await fetch(`./i18n/en.json`);
            activeTranslations = await fallbackResponse.json();
        } catch (fallbackError) {
            console.error("Critical: Failed to load fallback English translation bundle:", fallbackError);
        }
    }

    Store.state.currentLang = lang;
    Store.saveSettings();

    const t = activeTranslations;

    // Declaratively resolve all plain text localization nodes safely via textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key] !== undefined) {
            el.textContent = t[key];
        }
    });

    // Resolve elements containing rich formatting markup safely via innerHTML
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (t[key] !== undefined) {
            el.innerHTML = t[key];
        }
    });

    // Declaratively resolve input placeholders safely
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key] !== undefined) {
            el.placeholder = t[key];
        }
    });

    // Symmetrically handle procedural stage selector options
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('opt-stage-' + i);
        if (el) {
            el.textContent = i === 5 ? t.optStage5 : (lang === 'ru' ? `Этап ${i}` : `Stage ${i}`);
        }
    }

    // Synchronize the language selection dropdown value
    const selectLang = document.getElementById('select-lang');
    if (selectLang) selectLang.value = lang;

    // Symmetrically toggle display modes of Gabor vs Synoptophore action buttons
    const btnReset = document.getElementById('btn-reset');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const isSynop = (Store.state.appMode === 'synoptophore');

    if (btnReset) btnReset.style.display = isSynop ? 'flex' : 'none';
    if (btnLeft) btnLeft.style.display = isSynop ? 'none' : 'flex';
    if (btnRight) btnRight.style.display = isSynop ? 'none' : 'flex';

    // Procedurally assign the dynamic state-dependent Start button text on load
    if (Store.state.appMode === 'synoptophore') {
        if (Store.state.synopState === 'idle') {
            btnStart.innerText = t.synopStartBtn || "START";
        } else if (Store.state.synopState === 'align') {
            btnStart.innerText = t.btnSynopLock;
        } else {
            btnStart.innerText = t.btnSynopBreak;
        }
    } else if (Store.state.appMode === 'rds') {
        // Symmetrically clear standard exposure labels in RDS to prevent clinical confusion
        if (rdsController && rdsController.currentState === 'AWAITING_INPUT') {
            btnStart.disabled = true;
            btnStart.style.opacity = '0.4';
            btnStart.innerText = "...";
        } else {
            btnStart.disabled = false;
            btnStart.style.opacity = '1';
            btnStart.innerText = (Store.state.rdsTotal > 0 && !Store.state.autoAdvance) ? (t.rdsNextBtn || "NEXT") : (t.rdsStartBtn || "START");
        }
    } else {
        if (!Store.state.isWaitingForAnswer) {
            btnStart.innerText = (Store.state.total > 0 && !Store.state.autoAdvance) ? t.nextBtn : t.startBtn;
        } else {
            btnStart.innerText = t.reflashBtn;
        }
    }

    // Trigger reactive View panel redraws to initialize HUD on load
    updateScoreboard(Store.state, activeTranslations);
    updateStatusBar(Store.state, activeTranslations);
    
    // Parse vector emojis using Twemoji loader strictly on active dynamic panels to eliminate document-wide reflow lag
    if (window.twemoji) {
        twemoji.parse(document.getElementById('top-bar'));
        twemoji.parse(document.getElementById('bottom-dock'));
    }
}

/**
 * Intercepts and routes visual exposure or vergence tracking locks
 */
function runFlash() {
    const s = Store.state;
    
    // Smoothly melt the initial calibration gray curtain on the very first active therapy launch
    const curtain = document.getElementById('calibration-curtain');
    if (curtain && curtain.classList.contains('active')) {
        curtain.classList.remove('active');
    }

    // Route inputs depending on active appMode (Single Source of Truth)
    if (s.appMode === 'rds') {
        // Enforce FSM state check: block spacebar/trigger clicks during active trials
        if (rdsController && rdsController.currentState === 'IDLE') {
            rdsController.triggerTrial(); // Symmetrically trigger new randomized trial (no re-shows allowed)
        }
        return;
    }

    if (s.appMode === 'synoptophore') {
        if (s.synopState === 'idle') {
            // Play auditory start notification
            playCue(s.isMuted);

            // Melt the shutter rest curtain
            const curtain = document.getElementById('calibration-curtain');
            if (curtain) curtain.classList.remove('active');

            // Transition state and trigger Pomodoro countdown
            Store.updateState('synopState', 'align');
            Store.startTimerIfNeeded();

            // Draw targets and sync UI
            drawSynoptophoreTargets(overlayCanvas, overlayCtx, s);
            btnStart.innerText = activeTranslations.btnSynopLock;
            updateScoreboard(s, activeTranslations);
        } else {
            if (synoptophoreController) {
                synoptophoreController.handlePrimaryAction();
            }
        }
        return;
    }

    // Lock start triggers while the calibration test pattern is active
    if (trialController.isAnaglyphTestActive) return;

    if (s.isWaitingForAnswer) {
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
    // Instantly scale the canvas backing stores to prevent initial-load blurry upscaling
    resizeCanvasesToDPR();

    Store.loadSettings();

    // 1. Fetch and load translation bundle asynchronously first
    await setLanguage(Store.state.currentLang);

    // 2. Initialize database synchronously using fully loaded translations (retaining zero-hardcode SSoT)
    DataRepository.init(activeTranslations);
    DataRepository.migrateLegacyDatabase();

    // Instantiate core controllers with WebGL Canvas and Overlay Context
    trialController = new TrialController(
        canvas, 
        overlayCanvas,
        overlayCtx,
        cross, 
        container, 
        flashOverlay, 
        btnStart, 
        () => activeTranslations,
        showCustomAlert
    );

    synoptophoreController = new SynoptophoreController(
        canvas,
        overlayCanvas,
        overlayCtx,
        btnStart,
        () => activeTranslations,
        showCustomAlert
    );

    rdsController = new RdsController(
        canvas,
        overlayCanvas,
        overlayCtx,
        cross,
        container,
        flashOverlay,
        btnStart,
        () => activeTranslations,
        showCustomAlert,
        () => syncCrossVisualState()
    );

    // Instantiate newly decoupled single-responsibility modules
    dashboardController = new DashboardController(() => activeTranslations);

    // Instantiate PauseController in strict dependency injection manner
    pauseController = new PauseController(
        trialController, 
        synoptophoreController, 
        rdsController,
        () => syncCrossVisualState()
    );

    // Instantiate newly decoupled single-responsibility modules
    dashboardController = new DashboardController(() => activeTranslations);

    // Instantiate PauseController in strict dependency injection manner
    pauseController = new PauseController(trialController, synoptophoreController, rdsController);

    // Symmetrical Monkey-Patching (Decorator Pattern) to capture motor kinematics without bloating physical loops
    const originalSuccess = synoptophoreController.completeSuccess;
    synoptophoreController.completeSuccess = function() {
        const startDist = Store.state.synopStartDistance;
        originalSuccess.call(synoptophoreController);
        
        // Save successful vergence sweep
        DataRepository.saveSession({
            sessionId: Store.state.sessionId,
            score: 0,
            total: 0,
            level: 0,
            contrast: 0,
            protocol: 'synoptophore', 
            speed: Store.state.synopPullSpeed, 
            isAnaglyph: Store.state.isAnaglyphEnabled, 
            balance: Store.state.synopStrongEyeContrastFactor, // Use proper Synoptophore balance parameter
            lazyEyeSide: Store.state.lazyEyeSide,
            isFlicker: Store.state.synopFlickerActive,
            targetX: 0,
            targetY: 0,
            startDistance: startDist,
            outcome: 'success'
        });
        Store.rotateSessionId(); // Symmetrically rotate ID for the subsequent attempt
    };

    const originalBreak = synoptophoreController.breakActiveFusion;
    synoptophoreController.breakActiveFusion = function() {
        const targetX = Store.state.synopTargetX;
        const targetY = Store.state.synopTargetY;
        const startDist = Store.state.synopStartDistance;
        
        originalBreak.call(synoptophoreController);
        
        // Save slipped vergence sweep
        DataRepository.saveSession({
            sessionId: Store.state.sessionId,
            score: 0,
            total: 0,
            level: 0,
            contrast: 0,
            protocol: 'synoptophore', 
            speed: Store.state.synopPullSpeed, 
            isAnaglyph: Store.state.isAnaglyphEnabled, 
            balance: Store.state.synopStrongEyeContrastFactor, // Use proper Synoptophore balance parameter
            lazyEyeSide: Store.state.lazyEyeSide,
            isFlicker: Store.state.synopFlickerActive,
            targetX: targetX,
            targetY: targetY,
            startDistance: startDist,
            outcome: 'slip'
        });
        Store.rotateSessionId();
    };

    settingsController = new SettingsController(() => {
        // Callback triggered whenever settings forms are synchronized
        updateStatusBar(Store.state, activeTranslations);
        
        // Instantly redraw the calibration test pattern on the transparent overlay layer
        if (trialController && trialController.isAnaglyphTestActive) {
            drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
        }
    }, () => activeTranslations);
    
    initModals(
        () => {
            Store.loadSettings();
            
            // Take snapshot of critical clinical parameters to detect destructive changes later
            snapAppMode = Store.state.appMode;
            snapPresetMode = Store.state.presetMode;
            snapLevel = Store.state.currentLevel;
            snapTimerLimit = Store.state.timerLimitMinutes;
                    
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
            dashboardController.refreshStatsUI();
        }
    );

    // Initializing the architectural Input Dispatcher Switchboard
    bindInputControls({
        onActionLeft: () => {
            const s = Store.state;
            if (s.isPaused) return; // Enforce strict input blocking during pause
            if (trialController && trialController.isAnaglyphTestActive) return; // Prevent gameplay inputs during calibration
            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    Store.updateState('synopTargetX', s.synopTargetX - 1);
                    triggerSynopDragEffects();
                }
            } else if (s.appMode === 'rds') {
                rdsController.submitAnswer('left'); // Route stereoscopic choice
            } else {
                trialController.submitAnswer('left');
            }
        },
        onActionRight: () => {
            const s = Store.state;
            if (s.isPaused) return; // Enforce strict input blocking during pause
            if (trialController && trialController.isAnaglyphTestActive) return; // Prevent gameplay inputs during calibration
            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    Store.updateState('synopTargetX', s.synopTargetX + 1);
                    triggerSynopDragEffects();
                }
            } else if (s.appMode === 'rds') {
                rdsController.submitAnswer('right'); // Route stereoscopic choice
            } else {
                trialController.submitAnswer('right');
            }
        },
        onActionReset: () => {
            const s = Store.state;
            if (s.isPaused) return; // Enforce strict input blocking during pause
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                Store.updateState('synopTargetX', 0);
                Store.updateState('synopTargetY', 0);
                playError(s.isMuted); // Sound effect on reset
                triggerSynopDragEffects();
            }
        },
        onActionPrimary: () => {
            if (Store.state.isPaused) {
                if (pauseController) pauseController.togglePause(); // Space removes from Pause!
                return;
            }
            runFlash();
        },
        onActionMuteToggle: () => {
            Store.updateState('isMuted', !Store.state.isMuted);
            Store.saveSettings();
            updateMuteBtnUI();
        },
        onActionCanvasClick: () => {
            const s = Store.state;
            if (s.isPaused) return; // Enforce strict input blocking during pause
            const curtain = document.getElementById('calibration-curtain');
            const isInitialStart = curtain && curtain.classList.contains('active');

            // If the solid gray curtain is active on first load, any canvas click/tap 
            // acts as a unified "First Start" command across all three modalities.
            if (isInitialStart) {
                if (s.appMode === 'synoptophore') {
                    runFlash(); // Correctly route starting transition via main orchestrator
                    return;
                }
                
                // Symmetrically melt the initial curtain
                curtain.classList.remove('active');

                if (s.appMode === 'rds') {
                    // In RDS, first click melts curtain and starts the very first active trial
                    if (rdsController) {
                        rdsController.triggerTrial();
                    }
                    return;
                }
                if (s.appMode === 'gabor') {
                    runFlash(); // In Gabor, first click melts curtain and triggers first flash
                    return;
                }
            }

            // Standard gameplay canvas clicks (when curtain is already melted):
            if (s.appMode === 'synoptophore') {
                Store.startTimerIfNeeded(); 
                updateScoreboard(Store.state, activeTranslations); 
                return;
            }

            if (s.appMode === 'gabor') {
                runFlash(); 
            } else if (s.appMode === 'rds') {
                if (rdsController && rdsController.currentState === 'IDLE') {
                    rdsController.triggerTrial();
                }
            }
        },
        onDragStart: () => {
            const s = Store.state;
            if (s.isPaused) return; // Enforce strict input blocking during pause
            // Symmetrically melt the initial gray curtain instantly on first physical press-down (MouseDown / TouchStart)
            const curtain = document.getElementById('calibration-curtain');
            if (curtain && curtain.classList.contains('active')) {
                if (s.appMode === 'synoptophore') {
                    runFlash(); // Correctly route starting transition via main orchestrator
                    return;
                }
                curtain.classList.remove('active');
            }

            // Automatically start Pomodoro timer on drag start for active muscle training
            Store.startTimerIfNeeded();

            dragStartX = Store.state.synopTargetX;
            dragStartY = Store.state.synopTargetY;
            dragStartStrongFactor = Store.state.appMode === 'synoptophore' ? Store.state.synopStrongEyeContrastFactor : Store.state.strongEyeContrastFactor;
        },
        onDragUpdate: (deltaX, deltaY) => {
            const s = Store.state;
            if (s.isPaused) return; // Enforce strict input blocking during pause
            if (trialController && trialController.isAnaglyphTestActive) {
                // Calibration touchscreen vertical swipe nudge: adjust contrast factor and redraw test card
                const isSynop = s.appMode === 'synoptophore';
                const key = isSynop ? 'synopStrongEyeContrastFactor' : 'strongEyeContrastFactor';
                const delta = -deltaY * 0.004; // Swipe Up (negative deltaY) increases contrast
                const newFactor = Math.max(0.1, Math.min(1.0, dragStartStrongFactor + delta));
                Store.updateState(key, newFactor);
                
                const slider = document.getElementById('range-strong-attenuation');
                const label = document.getElementById('val-strong-attenuation');
                if (slider) {
                    slider.value = Math.round(newFactor * 100);
                    if (label) label.innerText = slider.value + '%';
                    settingsController.updateSliderTrackGradient(slider);
                }
                drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
                return; // Block touchscreen drag from shifting Synoptophore targets underneath during active tests
            }
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                Store.updateState('synopTargetX', dragStartX + deltaX);
                Store.updateState('synopTargetY', dragStartY + deltaY);
                triggerSynopDragEffects();
            }
        },
        onDragEnd: (deltaTime, deltaXTotal, deltaYTotal, clientX, clientY) => {
            const s = Store.state;
            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    const isTapGesture = deltaTime < 250 && Math.abs(deltaXTotal) < 8 && Math.abs(deltaYTotal) < 8;
                    if (isTapGesture) {
                        const rect = container.getBoundingClientRect();
                        const nx = (clientX - rect.left) / rect.width;
                        const ny = (clientY - rect.top) / rect.height;
                        const edgeZone = 0.25;

                        let didNudge = false;
                        if (nx < edgeZone) { Store.updateState('synopTargetX', s.synopTargetX - 1); didNudge = true; }
                        else if (nx > 1 - edgeZone) { Store.updateState('synopTargetX', s.synopTargetX + 1); didNudge = true; }

                        if (ny < edgeZone) { Store.updateState('synopTargetY', s.synopTargetY - 1); didNudge = true; }
                        else if (ny > 1 - edgeZone) { Store.updateState('synopTargetY', s.synopTargetY + 1); didNudge = true; }

                        if (didNudge) {
                            triggerSynopDragEffects();
                        }
                    }
                }
                return;
            }

            // Gabor and RDS mode swiping gesture calculations
            const minSwipeDistance = 45;
            const maxVerticalDeviation = 45;
            const maxSwipeTime = 300;

            if (deltaTime <= maxSwipeTime && Math.abs(deltaXTotal) >= minSwipeDistance && Math.abs(deltaYTotal) <= maxVerticalDeviation) {
                const direction = deltaXTotal < 0 ? 'left' : 'right';
                if (s.appMode === 'rds') {
                    rdsController.submitAnswer(direction); // Support mobile swipes in RDS!
                } else {
                    trialController.submitAnswer(direction);
                }
            }
        },
        onDragMovePreventDefault: () => {
            // Prevent scrolling on mobile strictly during Synoptophore target tracking
            return (Store.state.appMode === 'synoptophore');
        },
        isDirectionalHoldActive: () => {
            // Symmetrically allow continuous holding loops when calibration is active (enabling hold-to-tune)
            const s = Store.state;
            if (trialController && trialController.isAnaglyphTestActive) {
                return true;
            }
            return (s.appMode === 'synoptophore' && s.synopState === 'align');
        },
        onDirectionalShift: (dx, dy) => {
            const s = Store.state;
            if (trialController && trialController.isAnaglyphTestActive) {
                // Calibration directional key nudge: adjust contrast factor with a strict 5% (0.05) step
                if (dy !== 0) {
                    const isSynop = s.appMode === 'synoptophore';
                    const key = isSynop ? 'synopStrongEyeContrastFactor' : 'strongEyeContrastFactor';
                    const delta = -dy * 0.05; // Up key (negative dy) increases contrast by exactly 5%
                    const newFactor = Math.max(0.1, Math.min(1.0, s[key] + delta));
                    Store.updateState(key, newFactor);
                    
                    const slider = document.getElementById('range-strong-attenuation');
                    const label = document.getElementById('val-strong-attenuation');
                    if (slider) {
                        slider.value = Math.round(newFactor * 100);
                        if (label) label.innerText = slider.value + '%';
                        settingsController.updateSliderTrackGradient(slider);
                    }
                    drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
                }
                return; // Block movement keys from drifting Synoptophore targets underneath during active tests
            }
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                Store.updateState('synopTargetX', s.synopTargetX + dx);
                Store.updateState('synopTargetY', s.synopTargetY + dy);
                triggerSynopDragEffects();
            }
        },
        onActionPauseToggle: () => {
            if (pauseController) pauseController.togglePause();
        },
        onEscape: () => {
            const confirmModal = document.getElementById('custom-confirm-modal');
            const settingsModal = document.getElementById('settings-modal');
            const infoModal = document.getElementById('info-modal');
            const statsModal = document.getElementById('stats-modal');

            const isConfirmOpen = confirmModal && confirmModal.classList.contains('modal-open');
            const isSettingsOpen = settingsModal && settingsModal.classList.contains('modal-open');
            const isInfoOpen = infoModal && infoModal.classList.contains('modal-open');
            const isStatsOpen = statsModal && statsModal.classList.contains('modal-open');

            // 1. Modals Priority: Escape closes active overlays before taking action on Pause
            if (isConfirmOpen || isSettingsOpen || isInfoOpen || isStatsOpen || (trialController && trialController.isAnaglyphTestActive)) {
                if (trialController && trialController.isAnaglyphTestActive) {
                    const btnFusionTest = document.getElementById('btn-fusion-test');
                    if (btnFusionTest) btnFusionTest.click();
                    return;
                }
                if (isConfirmOpen) return;
                if (customAlertModal && customAlertModal.classList.contains('modal-open')) {
                    closeCustomAlert();
                    return;
                }
                if (isSettingsOpen) {
                    saveSettingsFromUI();
                    settingsModal.classList.remove('modal-open');
                }
                if (isInfoOpen) {
                    infoModal.classList.remove('modal-open');
                }
                if (isStatsOpen) {
                    statsModal.classList.remove('modal-open');
                }
                return;
            }

            // 2. Pause Priority: If no modals are active and the game is paused, Escape resumes the session!
            if (Store.state.isPaused) {
                if (pauseController) pauseController.togglePause();
                return;
            }
        }
    });

    // Connect global pause session action listener
    const btnPause = document.getElementById('btn-pause');
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            if (pauseController) pauseController.togglePause();
        });
    }

    function saveSettingsFromUI() {
        settingsController.syncStateFromUI();
        Store.saveSettings();
        
        // Detect if critical therapeutic parameters changed
        const isCriticalChange = (
            snapAppMode !== Store.state.appMode ||
            snapPresetMode !== Store.state.presetMode ||
            snapLevel !== Store.state.currentLevel
        );

        const isTimerChanged = (snapTimerLimit !== Store.state.timerLimitMinutes);

        const btnReset = document.getElementById('btn-reset');
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const isSynop = (Store.state.appMode === 'synoptophore');
        const isRds = (Store.state.appMode === 'rds');
        
        // Symmetrically toggle display modes of action buttons on menu close
        if (btnReset) btnReset.style.display = isSynop ? 'flex' : 'none';
        if (btnLeft) btnLeft.style.display = isSynop ? 'none' : 'flex';
        if (btnRight) btnRight.style.display = isSynop ? 'none' : 'flex';

        if (isRds) {
            container.classList.add('mode-rds');
        } else {
            container.classList.remove('mode-rds');
        }

        if (isCriticalChange) {
            // --- PATH 1: DESTRUCTIVE CHANGE (Wipe session, abort controllers) ---
            
            // Hard reset sets isPaused = false internally
            Store.resetSessionProgress(); 

            if (trialController) trialController.stopUnifiedRenderingLoop();
            if (synoptophoreController) synoptophoreController.stopFlickerLoop();

            // Clear Pause UI residue safely
            const watermark = document.getElementById('pause-watermark');
            const btnPause = document.getElementById('btn-pause');
            if (watermark) watermark.style.display = 'none';
            if (btnPause) {
                btnPause.innerText = '⏸️';
                if (window.twemoji) twemoji.parse(btnPause);
            }

            trialController.isAnaglyphTestActive = false;
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) settingsModal.classList.remove('calibration-mode');

            if (trialController) trialController.abort();
            if (synoptophoreController) synoptophoreController.abort();
            if (rdsController) rdsController.abort();

            if (isSynop) {
                const curtain = document.getElementById('calibration-curtain');
                if (curtain) curtain.classList.add('active'); // Rest curtain
                Store.updateState('synopState', 'idle');
                drawIdleState(canvas, null, overlayCanvas, overlayCtx, true); 
                cross.style.display = 'none'; 
            } else if (isRds) {
                drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
                cross.style.display = 'block';
            } else {
                drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
                cross.style.display = 'block';
            }
        } else {
            // --- PATH 2: NON-DESTRUCTIVE CHANGE (Preserve streaks and pause state) ---
            
            // Clear test pattern state
            trialController.isAnaglyphTestActive = false;
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) settingsModal.classList.remove('calibration-mode');

            // Symmetrical Pomodoro Sync: If the timer limit was changed, reset the remaining clock
            if (isTimerChanged) {
                Store.updateState('timerRemainingSeconds', Store.state.timerLimitMinutes * 60);
                Store.updateState('timerIsRunning', false);
                
                // If in Synoptophore, change of Pomodoro requires returning to idle Rest Curtain to start timed block
                if (isSynop) {
                    if (synoptophoreController) synoptophoreController.stopFlickerLoop();
                    Store.updateState('synopState', 'idle');
                    const curtain = document.getElementById('calibration-curtain');
                    if (curtain) curtain.classList.add('active');
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, true);
                    cross.style.display = 'none';
                }
            }

            // If game is NOT paused, forcefully re-render idle canvases to apply any subpixel color tweaks immediately
            if (!Store.state.isPaused) {
                if (isSynop) {
                    // Only draw synop targets if we didn't just force it back to idle rest state
                    if (Store.state.synopState !== 'idle' && !Store.state.synopFlickerActive) {
                        drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
                    }
                } else if (isRds && rdsController && rdsController.currentState === 'IDLE') {
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
                } else if (!isSynop && !isRds && trialController && trialController.currentState === 'IDLE') {
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
                }
            }
        }
        
        setLanguage(Store.state.currentLang);
        syncCrossVisualState(); // Instant cross updates on settings close
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
            const modalContent = settingsModal ? settingsModal.querySelector('.modal-content') : null;
            const scrollBody = settingsModal ? settingsModal.querySelector('.modal-scroll-body') : null;
            const calibrationCurtain = document.getElementById('calibration-curtain');

            // Step 1: Smoothly fade-out settings menu content AND fade-out backdrop AND pull up local curtain (0ms)
            if (modalContent) {
                modalContent.classList.add('modal-transitioning');
            }
            if (calibrationCurtain) {
                calibrationCurtain.classList.add('active');
            }
            
            // If entering calibration, trigger smooth fade-out of the dark glassmorphism backdrop immediately (0ms)
            if (!trialController.isAnaglyphTestActive && settingsModal) {
                settingsModal.classList.add('modal-clear-backdrop');
            }

            // Step 2: Swap layout and trigger drawings during the stable 50ms opaque plateau (Timer set to 250ms)
            setTimeout(() => {
                trialController.isAnaglyphTestActive = !trialController.isAnaglyphTestActive;
                
                if (trialController.isAnaglyphTestActive) {
                    btnFusionTest.style.background = '#3b90ff';
                    btnFusionTest.style.color = '#131a26';
                    
                    // Snapshot & Save current scroll position before entering compact calibration sheet
                    if (scrollBody && settingsModal) {
                        settingsModal._savedScrollTop = scrollBody.scrollTop;
                    }
                    
                    // Toggle calibration bottom sheet layout class
                    if (settingsModal) {
                        settingsModal.classList.add('calibration-mode');
                        if (scrollBody) scrollBody.scrollTop = 0; // Set to top for compact sliders view
                    }
                    
                    const selectRedSide = document.getElementById('select-red-side');
                    const selectLazySide = document.getElementById('select-lazy-side');
                    if (selectRedSide) Store.state.redEyeSide = selectRedSide.value;
                    if (selectLazySide) Store.state.lazyEyeSide = selectLazySide.value;

                    // Symmetrically scale canvas backing store using the centralized helper to prevent calibration test blur
                    resizeCanvasesToDPR();
                    
                    // Stop Synoptophore animation rendering during calibration test to avoid screen buffer overwrites
                    if (synoptophoreController) {
                        synoptophoreController.stopFlickerLoop();
                    }

                    // Clear the lower WebGL canvas to stable neutral gray first, then draw vector letters on top
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
                    drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
                    canvas.style.display = 'block';
                    overlayCanvas.style.display = 'block';
                    cross.style.display = 'none';

                    // Step 3 (IN): Smoothly fade content and backdrop back, and melt the local curtain immediately
                    if (modalContent) {
                        modalContent.classList.remove('modal-transitioning');
                    }
                    if (calibrationCurtain) {
                        calibrationCurtain.classList.remove('active');
                    }
                } else {
                    btnFusionTest.style.background = '#1a233a';
                    btnFusionTest.style.color = '#3b90ff';
                    
                    // Remove calibration bottom sheet layout class and restore normal settings view
                    if (settingsModal) {
                        settingsModal.classList.remove('calibration-mode');
                        // Smoothly fade-in the dark glassmorphism backdrop (150ms to 300ms)
                        settingsModal.classList.remove('modal-clear-backdrop');
                    }
                    
                    // Symmetrically restore saved scroll position
                    if (scrollBody && settingsModal && settingsModal._savedScrollTop !== undefined) {
                        scrollBody.scrollTop = settingsModal._savedScrollTop;
                    }
                    
                    // Draw idle background (and optional fusion lock) first to ensure clean baseline
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.appMode === 'synoptophore' || Store.state.isFusionLockEnabled);
                    
                    // Resume Synoptophore render loop or redraw static targets on top of the clean canvas
                    if (Store.state.appMode === 'synoptophore') {
                        if (synoptophoreController) synoptophoreController.syncFlickerState();
                    }
                    cross.style.display = 'block';

                    // Step 3 (OUT): Smoothly fade-in the settings menu content (Duration: 300ms)
                    if (modalContent) {
                        modalContent.classList.remove('modal-transitioning');
                    }

                    // Step 4 (OUT): Delay the curtain melt by 150ms to let the large menu fully cover the canvas
                    setTimeout(() => {
                        if (calibrationCurtain) {
                            calibrationCurtain.classList.remove('active');
                        }
                    }, 150);
                }
            }, 250); // Matches our optimized 250ms/200ms timing with the 50ms plateau!
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

    syncCrossVisualState(); // Sync cross states with newly loaded translations
        
    // F5 HOT-RELOAD FIX: Ensure correct visual state rendering on page refresh
    if (Store.state.appMode === 'synoptophore') {
        const curtain = document.getElementById('calibration-curtain');
        if (curtain) curtain.classList.add('active'); // Set rest shutter curtain on load for Synoptophore
        
        Store.updateState('synopState', 'idle');

        container.classList.remove('mode-rds');
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, true); // Always draw fusion lock in Synoptophore
        if (Store.state.synopFlickerActive) {
            synoptophoreController.startFlickerLoop();
        } else {
            drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
        }
        cross.style.display = 'none';
    } else if (Store.state.appMode === 'rds') {
        // Clear WebGL context to neutral gray on reload, keeping the screen gray until start
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
        cross.style.display = 'block';
    } else {
        container.classList.remove('mode-rds');
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
        cross.style.display = 'block';
    }

    // Global Pomodoro Timer Heartbeat Loop (SoC: Runs completely isolated via Timer utility)
    const pomodoro = new PomodoroTimer(
        (state) => {
            updateScoreboard(state, activeTranslations);
        },
        (state) => {
            if (trialController) trialController.abort();
            if (synoptophoreController) synoptophoreController.abort();
            if (rdsController) rdsController.abort();
                    
            drawIdleState(canvas, null, overlayCanvas, overlayCtx, state.appMode === 'synoptophore' || state.isFusionLockEnabled);
                    
            const t = activeTranslations;
            if (state.appMode === 'synoptophore') {
                if (state.synopFlickerActive) {
                    synoptophoreController.stopFlickerLoop();
                } else {
                    drawSynoptophoreTargets(overlayCanvas, overlayCtx, state);
                }
                cross.style.display = 'none';
                btnStart.innerText = t.btnSynopLock;
            } else if (state.appMode === 'rds') {
                cross.style.display = 'block';
                btnStart.innerText = t.startBtn;
                drawIdleState(canvas, null, overlayCanvas, overlayCtx, false); // Symmetrically clear to flat relaxing gray on Pomodoro pause
            } else {
                cross.style.display = 'block';
                btnStart.innerText = t.startBtn;
            }

            playSuccess(state.isMuted);
            showCustomAlert(t.titlePomodoro || '🍅 Pomodoro', t.sessionTimerCompleted);
        }
    );
    pomodoro.init();

    // Smoothly fade in the fully translated, stable UI layout (FOUC prevention)
    document.getElementById('app-wrapper').classList.add('loaded');
});