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

// Primary DOM References for view rendering
const canvas = document.getElementById('gaborCanvas');
const ctx = null; // Do not lock the canvas into 2D context here to allow WebGL!
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
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

    // Procedurally assign the dynamic state-dependent Start button text on load
    if (!Store.state.isWaitingForAnswer) {
        btnStart.innerText = (Store.state.total > 0 && !Store.state.autoAdvance) ? t.nextBtn : t.startBtn;
    } else {
        btnStart.innerText = t.reflashBtn;
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

    // Instantiate core controllers with both GPU and Overlay Contexts
    trialController = new TrialController(
        canvas, 
        ctx, 
        overlayCanvas,
        overlayCtx,
        cross, 
        container, 
        flashOverlay, 
        btnStart, 
        () => activeTranslations
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

        // Gracefully abort the trial execution state machine without direct FSM mutations
        trialController.abort();

        if (!trialController.isAnaglyphTestActive) {
            drawIdleState(canvas, ctx, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
        } else {
            drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
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
                
                // Clear the lower WebGL canvas to stable neutral gray first, then draw vector letters on top
                drawIdleState(canvas, ctx, overlayCanvas, overlayCtx, false);
                drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
                canvas.style.display = 'block';
                overlayCanvas.style.display = 'block';
                cross.style.display = 'none';
            } else {
                btnFusionTest.style.background = '#1a233a';
                btnFusionTest.style.color = '#3b90ff';
                
                // Remove calibration bottom sheet layout class
                if (settingsModal) settingsModal.classList.remove('calibration-mode');
                
                drawIdleState(canvas, ctx, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
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
    drawIdleState(canvas, ctx, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);

    // Register Service Worker for offline-capable clinical execution
    if ('serviceWorker' in navigator && !import.meta.env.DEV) {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.warn('PWA service worker registration bypassed:', err));
    }
});