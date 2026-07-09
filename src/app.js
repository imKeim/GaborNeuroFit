/*
 * GaborNeuroFit - High-Performance Orchestrator & Entry Point
 * Copyright (C) 2026 Pavel Korotkov
 */

// Import core dependencies
import { Store } from './store.js';
import { drawFusionTestPattern } from './engine/gabor.js';
import { initAudio, playError, playSuccess } from './engine/audio.js';
import { updateScoreboard, updateLeaderboard, drawIdleState, updateStatusBar } from './ui/screen.js';
import { initModals, showCustomAlert, closeCustomAlert } from './ui/modal.js';
import { bindInputControls } from './ui/controls.js';
import { TrialController, TrialState } from './controller/trial.js';
import { SettingsController } from './controller/settings.js';
import { SynoptophoreController } from './controller/synoptophore.js';
import { drawSynoptophoreTargets } from './engine/synop_render.js';

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

// Primary DOM References for view rendering
const canvas = document.getElementById('gaborCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const cross = document.getElementById('cross');
const flashOverlay = document.getElementById('flash-overlay');
const container = document.getElementById('container');
const btnStart = document.getElementById('btn-start');
const btnFusionTest = document.getElementById('btn-fusion-test');

// Primary DOM selectors for modal check references
const customAlertModal = document.getElementById('custom-alert-modal');

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
        btnStart.innerText = (Store.state.synopState === 'align') ? t.btnSynopLock : t.btnSynopBreak;
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
    
    // Start global Pomodoro tracking on first primary action
    Store.startTimerIfNeeded();

    // Route inputs to Synoptophore controller when in synoptophore mode
    if (s.appMode === 'synoptophore') {
        if (synoptophoreController) {
            synoptophoreController.handlePrimaryAction();
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
    Store.loadSettings();

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

    settingsController = new SettingsController(() => {
        // Callback triggered whenever settings forms are synchronized
        updateStatusBar(Store.state, activeTranslations);
        
        // Instantly redraw the calibration test pattern on the transparent overlay layer
        if (trialController && trialController.isAnaglyphTestActive) {
            drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
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
        onSynopReset: () => {
            playError(Store.state.isMuted);
        },
        onSynopDrag: () => {
            // Track physical manipulation as active ocular therapy time
            Store.startTimerIfNeeded();

            // Prevent static draw conflict if animation loop is active
            if (!Store.state.synopFlickerActive) {
                drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
            }
            updateScoreboard(Store.state, activeTranslations); // Real-time Prismatic Ruler update!
        },
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

            if (customAlertModal && customAlertModal.style.display !== 'none') {
                closeCustomAlert();
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
        
        // Reset session progress variables via centralized Store method (SSoT compliant)
        Store.resetSessionProgress();
    
        // Deactivate active calibration patterns on settings menu save
        trialController.isAnaglyphTestActive = false;
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.classList.remove('calibration-mode');

        // Gracefully abort the trial execution state machine without direct FSM mutations
        trialController.abort();
        if (synoptophoreController) {
            synoptophoreController.abort();
        }

        // Symmetrically toggle display modes of Gabor vs Synoptophore action buttons on menu close
        const btnReset = document.getElementById('btn-reset');
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const isSynop = (Store.state.appMode === 'synoptophore');

        if (btnReset) btnReset.style.display = isSynop ? 'flex' : 'none';
        if (btnLeft) btnLeft.style.display = isSynop ? 'none' : 'flex';
        if (btnRight) btnRight.style.display = isSynop ? 'none' : 'flex';

        if (Store.state.appMode === 'synoptophore') {
            // CLEAR WebGL context and draw 2D Synoptophore targets (prevents Gabor ghosts)
            drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
            if (Store.state.synopFlickerActive) {
                synoptophoreController.startFlickerLoop();
            } else {
                synoptophoreController.stopFlickerLoop();
            }
            cross.style.display = 'none'; // Suppress static HTML central cross
        } else {
            if (!trialController.isAnaglyphTestActive) {
                drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
                cross.style.display = 'block';
            } else {
                drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
                cross.style.display = 'none';
            }
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

                // Dynamically scale canvas backing store to prevent calibration test blur
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const physicalSize = Math.min(1024, Math.round(rect.width * dpr));
                canvas.width = physicalSize;
                canvas.height = physicalSize;
                overlayCanvas.width = physicalSize;
                overlayCanvas.height = physicalSize;
                
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
            } else {
                btnFusionTest.style.background = '#1a233a';
                btnFusionTest.style.color = '#3b90ff';
                
                // Remove calibration bottom sheet layout class
                if (settingsModal) settingsModal.classList.remove('calibration-mode');
                
                // Resume Synoptophore render loop once calibration test is deactivated
                if (Store.state.appMode === 'synoptophore') {
                    if (synoptophoreController) synoptophoreController.syncFlickerState();
                }

                drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
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
    
    // F5 HOT-RELOAD FIX: Ensure correct visual state rendering on page refresh
    if (Store.state.appMode === 'synoptophore') {
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
        if (Store.state.synopFlickerActive) {
            synoptophoreController.startFlickerLoop();
        } else {
            drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
        }
        cross.style.display = 'none';
    } else {
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
        cross.style.display = 'block';
    }

    // Global Pomodoro Timer Heartbeat Loop (SoC: Runs completely isolated on the presentation layer)
    setInterval(() => {
        const s = Store.state;
        if (!s.timerIsRunning || s.timerLimitMinutes === 0) return;

        // Smart Pause: Halts physiological countdown if any overlay modal is blocking the screen
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');
        const statsModal = document.getElementById('stats-modal');
        const customAlertModal = document.getElementById('custom-alert-modal');

        const isSettingsOpen = settingsModal && settingsModal.style.display !== 'none' && settingsModal.style.display !== '';
        const isInfoOpen = infoModal && infoModal.style.display !== 'none' && infoModal.style.display !== '';
        const isStatsOpen = statsModal && statsModal.style.display !== 'none' && statsModal.style.display !== '';
        const isAlertOpen = customAlertModal && customAlertModal.style.display !== 'none' && customAlertModal.style.display !== '';

        if (isSettingsOpen || isInfoOpen || isStatsOpen || isAlertOpen) {
            return; // Maintain state securely while patient reads configurations
        }

        // Deduct interval synchronously utilizing Store validators
        Store.updateState('timerRemainingSeconds', Math.max(0, s.timerRemainingSeconds - 1));
        updateScoreboard(s, activeTranslations);

        // Terminate active operations and enforce a strict clinical break interval on zero
        if (s.timerRemainingSeconds <= 0) {
            Store.updateState('timerIsRunning', false);
            
            // Abort ongoing hardware rendering loops securely
            if (trialController) trialController.abort();
            if (synoptophoreController) synoptophoreController.abort();
            
            drawIdleState(canvas, null, overlayCanvas, overlayCtx, s.isFusionLockEnabled);
            
            const t = activeTranslations;
            if (s.appMode === 'synoptophore') {
                if (s.synopFlickerActive) {
                    synoptophoreController.stopFlickerLoop();
                } else {
                    drawSynoptophoreTargets(overlayCanvas, overlayCtx, s);
                }
                cross.style.display = 'none';
                btnStart.innerText = t.btnSynopLock;
            } else {
                cross.style.display = 'block';
                btnStart.innerText = t.startBtn;
            }

            playSuccess(s.isMuted); // Positive acoustical reinforcement upon completion
            showCustomAlert(t.titlePomodoro || '🍅 Pomodoro', t.sessionTimerCompleted);
        }
    }, 1000);

    // Register Service Worker for offline-capable clinical execution
    if ('serviceWorker' in navigator && !import.meta.env.DEV) {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.warn('PWA service worker registration bypassed:', err));
    }
});