/**
 * @file app.ts
 * @description Central Orchestrator and Entry Point of GaborNeuroFit.
 * Integrates reactive state management, persistent storage, and specialized clinical controllers. 
 * Manages the high-level application lifecycle, input dispatching, and mode-switching logic.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

// Data & Persistence Layer (Source of Truth)
import { Store } from './store';
import { DataRepository } from './store/repository';

// Controller Layer (Clinical Modality Orchestrators)
import { GaborController } from './controller/gabor';
import { RdsController } from './controller/rds';
import { SynoptophoreController } from './controller/synop';
import { SettingsController } from './controller/settings';
import { DashboardController } from './controller/dashboard';
import { PauseController } from './controller/pause';
import { HudHintController } from './ui/hint';
import { InteractionController } from './controller/interaction';

// Rendering Engine Layer (WebGL, 2D Canvas & Generative Audio)
import { renderGabor, drawFusionLockFrame } from './engine/gabor-render';
import { drawRandomDotStereogram } from './engine/rds-render';
import { drawSynoptophoreTargets } from './engine/synop-render';
import { drawFusionTestPattern } from './engine/calibration-render';
import { playCue, playError, playGoldAward, playReset } from './engine/audio';

// User Interface Layer (Presentation & Physical Inputs)
import { updateScoreboard, drawIdleState, updateStatusBar } from './ui/screen';
import { initModals, showCustomAlert, closeModal } from './ui/modal';

// Utility & Environment Layer (Offline Hydration, Pacing & PWA)
import { resizeCanvasesToDPR } from './utils/bootstrap';
import { PomodoroTimer } from './utils/timer';
import { loadLanguage } from './utils/i18n';

// Import UI View Controller
import { ViewController } from './ui/view-controller';

// Import strict types
import type { Language, AppMode } from './types/clinical';

// Global cache for the active localization dictionary
let activeTranslations: Record<string, string> = {};

/** @description Global registry for modality-specific controller singletons. */
let gaborController: GaborController | null = null;
let settingsController: SettingsController | null = null;
let synoptophoreController: SynoptophoreController | null = null;
let rdsController: RdsController | null = null;
let dashboardController: DashboardController | null = null;
let pauseController: PauseController | null = null;
let hintController: HudHintController | null = null;
let interactionController: InteractionController | null = null;
let viewController: ViewController | null = null;

/** 
 * @description "Dirty-checking" snapshots of critical clinical parameters. 
 * Captured upon opening settings to determine if a hard session reset is mandatory.
 */
let snapAppMode: AppMode | null = null;
let snapLevel: number | null = null;
let snapTimerLimit: number | null = null;
let snapRdsStartDisparity: number | null = null;
let wasPausedBeforeSettings: boolean = false;
let wasPausedBeforeModal: boolean = false;

// Primary DOM References for view rendering (Strict Casting)
const canvas = document.getElementById('gaborCanvas') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement;
// The context is guaranteed to exist if the canvas does in a modern browser context
const overlayCtx = overlayCanvas.getContext('2d') as CanvasRenderingContext2D;

const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnFusionTest = document.getElementById('btn-fusion-test') as HTMLButtonElement;
const container = document.getElementById('container') as HTMLElement;
const cross = document.getElementById('cross') as HTMLElement;
const flashOverlay = document.getElementById('flash-overlay') as HTMLElement;

/**
 * @description Force a real GPU shader pass with 0 contrast to wake up the browser compositor and render foveal frames instantly.
 */
function drawIdleStateGabor(): void {
    renderGabor(canvas, null, Store.state, 0, 0, 0, 0.08, 40, 0, 0, 0, 1.0);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (Store.state.isFusionLockEnabled) {
        const scale = canvas.width / 256.0;
        drawFusionLockFrame(overlayCanvas, overlayCtx, scale);
    }
}

/**
 * @description Centralized visual synchronizer using ViewController.
 */
function syncVisualState(): void {
    if (!viewController) return;
    
    viewController.sync(
        Store.state, 
        activeTranslations, 
        rdsController?.currentState, 
        gaborController?.currentState
    );

    // Dynamic interaction state (inherited by InteractionController logic)
    const isDisabled = Store.state.appMode === 'synoptophore' 
        ? (Store.state.synopState !== 'align' && Store.state.synopState !== 'pulling')
        : btnStart.disabled;

    container.classList.toggle('disabled', !Store.state.isPaused && isDisabled);
}

/**
 * @description Atomic router for safe transitions between clinical modalities.
 * 
 * @architecture 
 * - Idempotent Teardown: Forcefully deactivates all active controllers and purges 
 *   asynchronous buffers before re-initializing the workspace.
 * - SSoT Enforcement: Resets session progress and rotates UUIDs to ensure 
 *   database record integrity for the upcoming training block.
 */
function transitionToMode(newMode: AppMode): void {
    const s = Store.state;

    if (interactionController) {
        interactionController.reset();
    }

    // Step: Component teardown
    if (gaborController) gaborController.deactivate();
    if (rdsController) rdsController.deactivate();
    if (synoptophoreController) synoptophoreController.deactivate();

    // Step: State persistence reset
    Store.updateState('appMode', newMode);
    Store.resetSessionProgress();

    btnStart.disabled = false;

    const watermark = document.getElementById('pause-watermark');
    const bPause = document.getElementById('btn-pause');
    const controlsLayout = document.getElementById('controls-layout');
    const settingsModal = document.getElementById('settings-modal');

    if (watermark) watermark.classList.remove('active');
    if (controlsLayout) controlsLayout.classList.remove('paused-state');
    if (container) container.classList.remove('paused-state');
    if (settingsModal) settingsModal.classList.remove('calibration-mode');

    if (bPause) {
        bPause.innerText = '⏸️';
        if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(bPause);
    }

    const isSynop = (newMode === 'synoptophore');
    const isRds = (newMode === 'rds');

    if (container) {
        if (isRds) {
            container.classList.add('mode-rds');
        } else {
            container.classList.remove('mode-rds');
        }
    }

    Store.updateState('isCurtainActive', true);

    drawIdleState(canvas, null, overlayCanvas, overlayCtx, s.appMode === 'synoptophore' || s.isFusionLockEnabled);

    if (isSynop) {
        if (synoptophoreController) synoptophoreController.syncFlickerState();
    } else if (isRds) {
        if (rdsController) rdsController.initSession();
    }

    setLanguage(s.currentLang);
    syncVisualState();
}

/**
 * @description Centralized helper to trigger side-effects during target alignment.
 * Activates Pomodoro timers, forces canvas redraw, and updates the prismatic metrics scoreboard.
 */
function triggerSynopDragEffects(): void {
    Store.startTimerIfNeeded();
    if (!Store.state.synopFlickerActive) {
        drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
    }
    updateScoreboard(Store.state, activeTranslations);
}

/**
 * @description Asynchronously loads translations from external static JSON bundles and updates DOM
 */
export async function setLanguage(lang: Language): Promise<void> {
    activeTranslations = await loadLanguage(lang);
    const t = activeTranslations;

    // Symmetrically toggle display modes of Gabor vs Synoptophore action buttons
    const btnReset = document.getElementById('btn-reset');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const isSynop = (Store.state.appMode === 'synoptophore');

    if (btnReset) btnReset.style.display = isSynop ? 'flex' : 'none';
    if (btnLeft) btnLeft.style.display = isSynop ? 'none' : 'flex';
    if (btnRight) btnRight.style.display = isSynop ? 'none' : 'flex';

    // Procedurally assign the dynamic state-dependent Start button text on load
    if (Store.state.isSessionCompleted) {
        btnStart.disabled = false;
        btnStart.innerText = t.btnResetSession || "Reset Session";
    } else if (Store.state.appMode === 'synoptophore') {
        if (Store.state.synopState === 'idle') {
            btnStart.innerText = t.synopStartBtn || "START ALIGNMENT";
        } else if (Store.state.synopState === 'align') {
            btnStart.innerText = t.btnSynopLock || "LOCK FUSION";
        } else {
            btnStart.innerText = t.btnSynopBreak || "SLIPPED / RESET";
        }
    } else if (Store.state.appMode === 'rds') {
        if (rdsController && rdsController.currentState === 'AWAITING_INPUT') {
            btnStart.disabled = true;
            btnStart.innerText = "...";
        } else {
            btnStart.disabled = false;
            btnStart.innerText = (Store.state.rdsTotal > 0 && !Store.state.rdsAutoAdvance) ? (t.rdsNextBtn || "NEXT STEREOGRAM") : (t.rdsStartBtn || "START STEREOGRAM");
        }
    } else {
        if (!Store.state.isWaitingForAnswer) {
            btnStart.innerText = (Store.state.total > 0 && !Store.state.autoAdvance) ? (t.nextBtn || "NEXT FLASH") : (t.startBtn || "START FLASH");
        } else {
            btnStart.innerText = t.reflashBtn || "RE-FLASH";
        }
    }

    // Trigger reactive View panel redraws to initialize HUD on load
    updateScoreboard(Store.state, t);
    updateStatusBar(Store.state, t);

    // Provide soft degradation for global Twemoji parsing across the active HUD and modals
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof window !== 'undefined' && window.twemoji) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.twemoji.parse(document.getElementById('top-bar'));
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.twemoji.parse(document.getElementById('bottom-dock'));
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.twemoji.parse(document.getElementById('settings-modal'));
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.twemoji.parse(document.getElementById('stats-modal'));
    }
}

/**
 * @description Intercepts and routes visual exposure or vergence tracking locks
 */
function runFlash(): void {
    if (btnStart.disabled) return;
    const s = Store.state;

    if (s.isSessionCompleted) {
        playReset(s.isMuted);
        Store.resetSessionProgress();
        Store.updateState('isCurtainActive', false);
        updateScoreboard(s, activeTranslations);
        syncVisualState();
        return;
    }

    const curtain = document.getElementById('calibration-curtain');
    const isInitialStart = curtain && curtain.classList.contains('active');

    // Logic: Clinical modality routing
    if (s.appMode === 'rds') {
        if (rdsController && rdsController.currentState === 'IDLE') {
            rdsController.triggerTrial();
        }
        return;
    }

    if (s.appMode === 'synoptophore') {
        if (s.synopState === 'idle') {
            playCue(s.isMuted);

            Store.updateState('isCurtainActive', false);

            Store.updateState('synopState', 'align');
            Store.startTimerIfNeeded();

            drawSynoptophoreTargets(overlayCanvas, overlayCtx, s);
            btnStart.innerText = activeTranslations.btnSynopLock || "LOCK FUSION";
            updateScoreboard(s, activeTranslations);
            syncVisualState();
        } else {
            if (synoptophoreController) synoptophoreController.handlePrimaryAction();
            syncVisualState();
        }
        return;
    }

    // Gabor: Lock start triggers while the calibration test pattern is active
    if (Store.state.isAnaglyphTestActive) return;

    if (isInitialStart) {
        Store.updateState('isCurtainActive', false);
    }

    if (s.isWaitingForAnswer) {
        if (gaborController) gaborController.reFlashCurrentGabor();
    } else {
        if (gaborController) gaborController.triggerTrial();
    }
}

/**
 * @description Orchestrator bootstrap initialization block
 */
window.addEventListener('load', async () => {
    // Instantiate the UI View Controller layer
    viewController = new ViewController();

    // Logic: Canvas backing store scaling
    resizeCanvasesToDPR();
    
    // Logic: Responsive viewport recalibration
    window.addEventListener('resize', () => {
        resizeCanvasesToDPR();
        if (Store.state.appMode === 'synoptophore') {
            if (synoptophoreController && !Store.state.synopFlickerActive) {
                drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
            }
        } else if (Store.state.appMode === 'rds') {
            if (rdsController) {
                const isIdle = rdsController.currentState === 'IDLE' || rdsController.currentState === 'FEEDBACK';
                drawRandomDotStereogram(overlayCanvas, overlayCtx, Store.state, false, isIdle);
            }
        } else {
            drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
        }
    });

    Store.loadSettings();

    // Step: Localization hydration
    await setLanguage(Store.state.currentLang);

    // Step: Persistent storage initialization
    DataRepository.init(activeTranslations);
    DataRepository.migrateLegacyDatabase();

    // Step: Dependency Injection (Controller instances)
    gaborController = new GaborController(
        canvas,
        overlayCanvas,
        overlayCtx,
        container,
        flashOverlay,
        btnStart,
        () => activeTranslations,
        showCustomAlert,
        () => syncVisualState()
    );
    /** 
     * @architecture Inversion of Control (IoC)
     * SynoptophoreController is completely decoupled from the DataRepository. 
     * Orchestrator injects persistence logic via onSuccess and onSlip callbacks.
     */
    synoptophoreController = new SynoptophoreController(
        overlayCanvas,
        overlayCtx,
        btnStart,
        () => activeTranslations,
        showCustomAlert,
        () => {
            const startDist = Store.state.synopStartDistance;
            // Persistence Hook: Save successful 100% motor vergence sweep
            DataRepository.saveSession({
                sessionId: Store.state.sessionId,
                protocol: 'synoptophore',
                speed: Store.state.synopPullSpeed,
                isAnaglyph: Store.state.isAnaglyphEnabled,
                balance: Store.state.synopStrongEyeContrastFactor,
                lazyEyeSide: Store.state.lazyEyeSide,
                isFlicker: Store.state.synopFlickerActive,
                targetX: 0,
                targetY: 0,
                startDistance: startDist,
                outcome: 'success'
            });
            Store.rotateSessionId(); // Symmetrically rotate ID for the subsequent attempt
            syncVisualState();
        },
        (targetX, targetY, startDistance) => {
            // Save slipped vergence sweep conforming strictly to Polymorphic interfaces
            DataRepository.saveSession({
                sessionId: Store.state.sessionId,
                protocol: 'synoptophore',
                speed: Store.state.synopPullSpeed,
                isAnaglyph: Store.state.isAnaglyphEnabled,
                balance: Store.state.synopStrongEyeContrastFactor,
                lazyEyeSide: Store.state.lazyEyeSide,
                isFlicker: Store.state.synopFlickerActive,
                targetX: targetX,
                targetY: targetY,
                startDistance: startDistance,
                outcome: 'slip'
            });
            Store.rotateSessionId(); // Symmetrically rotate ID for the subsequent attempt
            syncVisualState();
        }
    );

    rdsController = new RdsController(
        canvas,
        overlayCanvas,
        overlayCtx,
        container,
        flashOverlay,
        btnStart,
        () => activeTranslations,
        showCustomAlert,
        () => syncVisualState()
    );

    dashboardController = new DashboardController(() => activeTranslations);

    pauseController = new PauseController(
        gaborController,
        synoptophoreController,
        rdsController,
        () => syncVisualState(),
        () => activeTranslations
    );

    hintController = new HudHintController(() => activeTranslations);
    hintController.init();

    // Initialize the decoupled Interaction Controller
    interactionController = new InteractionController(container, {
        onAnswer: (dir) => {
            const s = Store.state;
            if (s.isPaused || s.isSessionCompleted) return;
            if (s.appMode === 'rds' && rdsController) rdsController.submitAnswer(dir);
            else if (gaborController) gaborController.submitAnswer(dir);

            if (hintController) hintController.triggerTemporaryHint(dir === 'left' ? 'hintBtnLeft' : 'hintBtnRight');
        },
        onReset: () => {
            const s = Store.state;
            if (s.isPaused || s.isSessionCompleted) return;
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                Store.updateState('synopTargetX', 0);
                Store.updateState('synopTargetY', 0);
                playError(s.isMuted);
                triggerSynopDragEffects();

                if (hintController) hintController.triggerTemporaryHint('hintBtnReset');
            }
        },
        onPrimary: () => {
            if (Store.state.isPaused) {
                if (pauseController) pauseController.togglePause();
                return;
            }
            runFlash();

            if (hintController && !Store.state.isSessionCompleted) hintController.triggerTemporaryHint('hintBtnStart');
        },
        onMuteToggle: () => {
            Store.updateState('isMuted', !Store.state.isMuted);
            Store.saveSettings();
            updateMuteBtnUI();

            if (hintController) hintController.triggerTemporaryHint('hintBtnMute');
        },
        onPauseToggle: () => {
            if (document.querySelector('.modal.modal-open')) return;
            const btnPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
            if (btnPause && btnPause.disabled) return;
            if (pauseController) pauseController.togglePause();

            if (hintController) hintController.triggerTemporaryHint(Store.state.isPaused ? 'hintBtnPause' : 'hintBtnResume');
        },
        onCanvasClick: () => {
            const s = Store.state;
            if (s.isPaused) {
                if (pauseController) pauseController.togglePause();
                return;
            }
            if (btnStart.disabled && !s.isSessionCompleted) return;
            const curtain = document.getElementById('calibration-curtain');
            if (curtain && curtain.classList.contains('active')) {
                runFlash();
                return;
            }
            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'pulling' && synoptophoreController) synoptophoreController.breakActiveFusion();
                else { Store.startTimerIfNeeded(); updateScoreboard(Store.state, activeTranslations); }
                return;
            }
            if (s.appMode === 'gabor') runFlash();
            else if (s.appMode === 'rds' && rdsController && rdsController.currentState === 'IDLE') rdsController.triggerTrial();
        },
        onEscape: () => {
            const s = Store.state;
            const modals = ['custom-alert-modal', 'custom-confirm-modal', 'settings-modal', 'info-modal', 'stats-modal'];
            for (const id of modals) {
                const m = document.getElementById(id);
                if (m && m.classList.contains('modal-open')) {
                    if (id === 'settings-modal') {
                        if (s.isAnaglyphTestActive) { const b = document.getElementById('btn-fusion-test'); if (b) b.click(); }
                        else { saveSettingsFromUI(); closeModal(m); }
                    } else if (id === 'custom-confirm-modal') { /* keep open */ }
                    else { closeModal(m); restoreSystemPause(); }
                    return;
                }
            }
            if (Store.state.isPaused && pauseController) pauseController.togglePause();
        },
        triggerSynopDragEffects: () => triggerSynopDragEffects()
    });
    interactionController.init();

    settingsController = new SettingsController(() => {
        updateStatusBar(Store.state, activeTranslations);
        if (Store.state.isAnaglyphTestActive) {
            drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
        } else if (Store.state.appMode === 'gabor') {
            if (gaborController) {
                const isStimulusVisible = (gaborController.currentState === 'STIMULUS_ACTIVE') ||
                                          (gaborController.currentState === 'AWAITING_INPUT' && Store.state.isStaticEnabled);
                if (isStimulusVisible) {
                    renderGabor(canvas, null, Store.state, gaborController.currentAngleDeg, Store.state.autoContrast, Store.state.autoContrast, gaborController.lastRandomFreq, gaborController.lastRandomSigma, gaborController.lastOffsetX, gaborController.lastOffsetY, 0, gaborController.lastRandomAspectRatio);
                    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                    if (Store.state.isFusionLockEnabled) {
                        const scale = canvas.width / 256.0;
                        drawFusionLockFrame(overlayCanvas, overlayCtx, scale);
                    }
                } else {
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
                }
            }
        } else if (Store.state.appMode === 'synoptophore') {
            if (Store.state.synopState !== 'idle' && !Store.state.synopFlickerActive) {
                drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
            }
        } else if (Store.state.appMode === 'rds') {
            if (rdsController) {
                const isIdle = rdsController.currentState === 'IDLE' || rdsController.currentState === 'FEEDBACK';
                drawRandomDotStereogram(overlayCanvas, overlayCtx, Store.state, false, isIdle);
            }
        }
        
        // If Pill Tabs change the language, immediately react and reload i18n
        if (Store.state.currentLang !== activeTranslations._currentLangMetadata) {
            activeTranslations._currentLangMetadata = Store.state.currentLang;
            setLanguage(Store.state.currentLang);
        }

        syncVisualState();
    });
    
    // Stamp initial language to metadata for comparison tracking
    activeTranslations._currentLangMetadata = Store.state.currentLang;

    /** 
     * @architecture Interceptor
     * Safeguards resources and clinical timers when foveal workspace is obstructed.
     */
    function enforceSystemPause(): void {
        if (pauseController) {
            wasPausedBeforeModal = Store.state.isPaused;
            if (!Store.state.isPaused) {
                pauseController.togglePause();
            }
        }
    }

    /**
     * @description Restores the previous pause state upon clinical modal obstruction dismissal.
     */
    function restoreSystemPause(): void {
        if (pauseController) {
            if (Store.state.isPaused && !wasPausedBeforeModal) {
                pauseController.togglePause();
            }
        }
    }

    // Logic: Handbook modal binding
    const btnInfo = document.getElementById('btn-info');
    if (btnInfo) {
        btnInfo.addEventListener('click', () => {
            enforceSystemPause();
        });
    }

    initModals(
        () => {
            // Record if the game was already paused by the user before opening settings
            wasPausedBeforeSettings = Store.state.isPaused;

            enforceSystemPause();
            Store.loadSettings();

            // Take snapshot of clinical parameters to detect destructive changes
            snapAppMode = Store.state.appMode;
            snapLevel = Store.state.currentLevel;
            snapTimerLimit = Store.state.timerLimitMinutes;
            snapRdsStartDisparity = Store.state.rdsStartDisparity;

            if (btnFusionTest) {
                if (Store.state.isAnaglyphTestActive) {
                    btnFusionTest.classList.add('active');
                } else {
                    btnFusionTest.classList.remove('active');
                }
            }

            if (settingsController) settingsController.updatePresetUI();
        },
        () => {
            saveSettingsFromUI();
        },
        () => {
            enforceSystemPause();
            if (dashboardController) dashboardController.refreshStatsUI();
        },
        () => {
            restoreSystemPause();
        },
        () => {
            restoreSystemPause();
        }
    );

    const btnPause = document.getElementById('btn-pause');
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            if (pauseController) pauseController.togglePause();
        });
    }

    /** @description Synchronizes state and triggers re-initialization if clinical changes are detected. */
    function saveSettingsFromUI(): void {
        if (settingsController) settingsController.syncStateFromUI();
        Store.saveSettings();

        const isCriticalChange = (
            snapAppMode !== Store.state.appMode ||
            snapLevel !== Store.state.currentLevel ||
            snapRdsStartDisparity !== Store.state.rdsStartDisparity
        );

        const isTimerChanged = (snapTimerLimit !== Store.state.timerLimitMinutes);
        const isSynop = (Store.state.appMode === 'synoptophore');

        Store.updateState('isAnaglyphTestActive', false);
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.classList.remove('calibration-mode');

        if (isCriticalChange) {
            transitionToMode(Store.state.appMode);
        } else {
            if (isTimerChanged) {
                Store.updateState('timerRemainingSeconds', Store.state.timerLimitMinutes * 60);
                Store.updateState('timerIsRunning', false);

                if (isSynop) {
                    if (synoptophoreController) synoptophoreController.stopFlickerLoop();
                    Store.updateState('synopState', 'idle');
                    const curtain = document.getElementById('calibration-curtain');
                    if (curtain) curtain.classList.add('active');
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, true);
                }
            }

            // Restore the original pause state if we didn't perform a critical transition
            if (Store.state.isPaused !== wasPausedBeforeSettings && pauseController) {
                pauseController.togglePause();
            }

            if (isSynop) {
                if (Store.state.synopState !== 'idle' && !Store.state.synopFlickerActive) {
                    drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
                }
            } else if (Store.state.appMode === 'rds') {
                if (rdsController) {
                    const isIdle = rdsController.currentState === 'IDLE' || rdsController.currentState === 'FEEDBACK';
                    drawRandomDotStereogram(overlayCanvas, overlayCtx, Store.state, false, isIdle);
                }
            } else if (Store.state.appMode === 'gabor') {
                if (gaborController) {
                    const isStimulusVisible = (gaborController.currentState === 'STIMULUS_ACTIVE') ||
                                              (gaborController.currentState === 'AWAITING_INPUT' && Store.state.isStaticEnabled);
                    if (isStimulusVisible) {
                        renderGabor(canvas, null, Store.state, gaborController.currentAngleDeg, Store.state.autoContrast, Store.state.autoContrast, gaborController.lastRandomFreq, gaborController.lastRandomSigma, gaborController.lastOffsetX, gaborController.lastOffsetY, 0, gaborController.lastRandomAspectRatio);
                        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                        if (Store.state.isFusionLockEnabled) {
                            const scale = canvas.width / 256.0;
                            drawFusionLockFrame(overlayCanvas, overlayCtx, scale);
                        }
                    } else {
                        drawIdleStateGabor();
                    }
                }
            }

            setLanguage(Store.state.currentLang);
            syncVisualState();
        }
    }

    /** @description Updates the mute/unmute button text and Twemoji assets. */
    function updateMuteBtnUI(): void {
        const btnMute = document.getElementById('btn-mute');
        const t = activeTranslations;
        if (btnMute) {
            btnMute.innerText = Store.state.isMuted ? (t.btnMuteOn || "🔇") : (t.btnMuteOff || "🔊");
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(btnMute);
        }
    }

    // Logic: Fusion calibration test pattern trigger
    if (btnFusionTest) {
        btnFusionTest.addEventListener('click', () => {
            const s = Store.state;
            const settingsModal = document.getElementById('settings-modal');
            const modalContent = settingsModal ? settingsModal.querySelector('.modal-content') : null;
            const scrollBody = settingsModal ? settingsModal.querySelector('.modal-scroll-body') : null;

            if (modalContent) modalContent.classList.add('modal-transitioning');

            if (!s.isAnaglyphTestActive && settingsModal) {
                settingsModal.classList.add('modal-clear-backdrop');
                
                // Clinical: instantly hide watermark to reveal central calibration anchors
                if (pauseController) pauseController.overrideWatermarkVisibility(true);
            }

            setTimeout(() => {
                if (!gaborController) return;
                Store.updateState('isAnaglyphTestActive', !s.isAnaglyphTestActive);

                if (s.isAnaglyphTestActive) {
                    btnFusionTest.classList.add('active');
                    container.classList.add('calibration-active');

                    if (scrollBody && settingsModal) {
                        // Safe persistent state anchoring for modal scrolling
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (settingsModal as any)._savedScrollTop = scrollBody.scrollTop;
                    }

                    if (settingsModal) {
                        settingsModal.classList.add('calibration-mode');
                        if (scrollBody) scrollBody.scrollTop = 0;
                    }

                    resizeCanvasesToDPR();

                    if (synoptophoreController) synoptophoreController.stopFlickerLoop();

                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, true);
                    drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
                    canvas.style.display = 'block';
                    overlayCanvas.style.display = 'block';
                    cross.style.display = 'block'; 
                            
                    if (modalContent) modalContent.classList.remove('modal-transitioning');
                    
                    // Force DOM update to instantly remove the curtain and reveal letters
                    Store.updateState('isCurtainActive', false);
                    syncVisualState();
                } else {
                    btnFusionTest.classList.remove('active');
                    container.classList.remove('calibration-active');

                    if (settingsModal) {
                        settingsModal.classList.remove('calibration-mode');
                        settingsModal.classList.remove('modal-clear-backdrop');
                    }

                    if (scrollBody && settingsModal && (settingsModal as any)._savedScrollTop !== undefined) {
                        scrollBody.scrollTop = (settingsModal as any)._savedScrollTop;
                    }

                    if (pauseController) pauseController.overrideWatermarkVisibility(false);

                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.appMode === 'synoptophore' || Store.state.isFusionLockEnabled);

                    if (Store.state.appMode === 'synoptophore') {
                        if (synoptophoreController) synoptophoreController.syncFlickerState();
                    }
                    cross.style.display = 'block';

                    if (modalContent) modalContent.classList.remove('modal-transitioning');

                    setTimeout(() => {
                        const isInitialState = (s.appMode === 'gabor' && s.total === 0) ||
                                               (s.appMode === 'rds' && s.rdsTotal === 0) ||
                                               (s.appMode === 'synoptophore' && s.synopState === 'idle');
                        
                        // Restore curtain if game hasn't started yet, and force DOM update
                        Store.updateState('isCurtainActive', isInitialState || s.isSessionCompleted);
                        syncVisualState();
                    }, 150);
                }
            }, 250);
        });
    }

    if (btnStart) {
        btnStart.addEventListener('click', runFlash);
    }

    updateMuteBtnUI();
    if (settingsController) settingsController.bindSettingsInteractions();

    transitionToMode(Store.state.appMode);

    /** 
     * @clinical Ophthalmic Fatigue Protocol (Pomodoro)
     * Monitors active foveation time and enforces periodic ciliary muscle relaxation.
     */
    const pomodoro = new PomodoroTimer(
        (state) => {
            updateScoreboard(state, activeTranslations);
        },
        (state) => {
            // Forced Clinical Reset: Instantly halt all active modalities and timers
            if (gaborController) gaborController.deactivate();
            if (synoptophoreController) synoptophoreController.deactivate();
            if (rdsController) rdsController.deactivate();

            const settingsModalEl = document.getElementById('settings-modal');
            const infoModalEl = document.getElementById('info-modal');
            const statsModalEl = document.getElementById('stats-modal');

            // Symmetrically dismiss all open modals to return DOM to a clean resting state
            if (settingsModalEl) closeModal(settingsModalEl);
            if (infoModalEl) closeModal(infoModalEl);
            if (statsModalEl) closeModal(statsModalEl);

            Store.updateState('isSessionCompleted', true);
            Store.updateState('isCurtainActive', true);

            btnStart.disabled = false;

            updateScoreboard(Store.state, activeTranslations);

            drawIdleState(canvas, null, overlayCanvas, overlayCtx, state.appMode === 'synoptophore' || state.isFusionLockEnabled);

            const t = activeTranslations;
            if (state.appMode === 'synoptophore') {
                if (state.synopFlickerActive) {
                    if (synoptophoreController) synoptophoreController.stopFlickerLoop();
                } else {
                    drawSynoptophoreTargets(overlayCanvas, overlayCtx, state);
                }
            } else if (state.appMode === 'rds') {
                drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
            }

            syncVisualState();

            playGoldAward(state.isMuted); // Play majestic PS1-style aura chimes for Pomodoro complete!
            showCustomAlert(t.titlePomodoro || '🍅 Pomodoro', t.sessionTimerCompleted || "Rest.");
        }
    );
    pomodoro.init();

    const appWrapper = document.getElementById('app-wrapper');
    if (appWrapper) appWrapper.classList.add('loaded');
});