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

// Rendering Engine Layer (WebGL, 2D Canvas & Generative Audio)
import { renderGabor } from './engine/gabor-render';
import { drawRandomDotStereogram } from './engine/rds-render';
import { drawSynoptophoreTargets } from './engine/synop-render';
import { drawFusionTestPattern } from './engine/calibration-render';
import { playCue, playError, playGoldAward } from './engine/audio';

// User Interface Layer (Presentation & Physical Inputs)
import { updateScoreboard, drawIdleState, updateStatusBar } from './ui/screen';
import { initModals, showCustomAlert, closeCustomAlert, closeModal } from './ui/modal';
import { bindInputControls } from './ui/controls';

// Utility & Environment Layer (Offline Hydration, Pacing & PWA)
import { resizeCanvasesToDPR } from './utils/bootstrap';
import { PomodoroTimer } from './utils/timer';
import { loadLanguage } from './utils/i18n';

// Import strict types
import type { Language, AppMode, GaborPreset } from './types/clinical';
import type { InputHandlers } from './ui/controls';

// Global cache for the active localization dictionary
let activeTranslations: Record<string, string> = {};

/** @description Global registry for modality-specific controller singletons. */
let gaborController: GaborController | null = null;
let settingsController: SettingsController | null = null;
let synoptophoreController: SynoptophoreController | null = null;
let rdsController: RdsController | null = null;
let dashboardController: DashboardController | null = null;
let pauseController: PauseController | null = null;

/** 
 * @description "Dirty-checking" snapshots of critical clinical parameters. 
 * Captured upon opening settings to determine if a hard session reset is mandatory.
 */
let snapAppMode: AppMode | null = null;
let snapPresetMode: GaborPreset | null = null;
let snapLevel: number | null = null;
let snapTimerLimit: number | null = null;
let snapRdsStartDisparity: number | null = null;
let wasPausedBeforeSettings: boolean = false;
let wasPausedBeforeModal: boolean = false;

// Abstracted dragging coordinates context holds
let dragStartX: number = 0;
let dragStartY: number = 0;
let dragStartStrongFactor: number = 0.3; // Calibrated contrast factor context holder

// Context holders for edge-touch auto-repeat hold timers
let edgeTimeoutId: number | null = null;
let edgeIntervalId: number | null = null;
let isEdgeHoldingActive: boolean = false;
let lastTouchTime: number = 0; // Filter simulated ghost mouse events

/** @description Utility to clear edge-touch hold timers and release resources. */
function clearEdgeTimers(): void {
    if (edgeTimeoutId !== null) {
        window.clearTimeout(edgeTimeoutId);
        edgeTimeoutId = null;
    }
    if (edgeIntervalId !== null) {
        window.clearInterval(edgeIntervalId);
        edgeIntervalId = null;
    }
}

// Primary DOM References for view rendering (Strict Casting)
const canvas = document.getElementById('gaborCanvas') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement;
// The context is guaranteed to exist if the canvas does in a modern browser context
const overlayCtx = overlayCanvas.getContext('2d') as CanvasRenderingContext2D;

const cross = document.getElementById('cross') as HTMLElement;
const flashOverlay = document.getElementById('flash-overlay') as HTMLElement;
const container = document.getElementById('container') as HTMLElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnFusionTest = document.getElementById('btn-fusion-test') as HTMLButtonElement;
const customAlertModal = document.getElementById('custom-alert-modal') as HTMLElement;

/**
 * @description Helper to evaluate if the state machine is in a pausable/interactive state.
 */
function canPause(): boolean {
    const s = Store.state;
    if (s.isPaused) return true;

    if (s.appMode === 'gabor' && gaborController) {
        const gState = gaborController.currentState;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isAutoPending = (gaborController as any).autoNextTimeoutId !== null;
        if (gState === 'PRE_CUE' || gState === 'STIMULUS_ACTIVE' || gState === 'FEEDBACK' || isAutoPending) {
            return false;
        }
    }
    if (s.appMode === 'rds' && rdsController) {
        const rState = rdsController.currentState;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isAutoPending = (rdsController as any).autoNextTimeoutId !== null;
        if (rState === 'PRE_CUE' || rState === 'FEEDBACK' || isAutoPending) {
            return false;
        }
    }
    if (s.appMode === 'synoptophore' && s.synopState === 'pulling') {
        return false;
    }
    return true;
}

/**
 * @description Centralized visual synchronizer for fixation cross and mouse pointer state.
 * 
 * @clinical 
 * - Cross Scaling: Stage 1 (36px) down to Stage 5 (12px). Smaller anchors increase 
 *   foveal fixation accuracy requirements during high-frequency Gabor stimulation.
 * - Dynamic Visibility: Restores 100% opacity precisely when the stimulus is hidden 
 *   to assist the brain in re-centering focus before the next trial.
 */
function syncVisualState(): void {
    const s = Store.state;
    const crossNode = document.getElementById('cross');
    const containerNode = document.getElementById('container');
    if (!crossNode || !containerNode) return;

    const curtain = document.getElementById('calibration-curtain');
    if (curtain) {
        curtain.classList.toggle('active', s.isCurtainActive);
    }

    containerNode.dataset.appMode = s.appMode;
    containerNode.dataset.paused = String(s.isPaused);
    containerNode.dataset.curtainActive = String(s.isCurtainActive);
    containerNode.dataset.level = String(s.currentLevel);
    containerNode.dataset.synopState = s.synopState;
    containerNode.dataset.startDisabled = String(btnStart.disabled);

    let crossState = 'hidden';

    // Logic: Fixation cross-scaling and visibility orchestration
    if (s.appMode === 'synoptophore') {
        crossState = 'hidden';
    } else if (s.appMode === 'rds') {
        if (s.rdsIsPermanentCrossEnabled) {
            const rdsState = rdsController ? rdsController.currentState : 'IDLE';
            const isStimulusActive = (rdsState === 'STIMULUS_ACTIVE' || rdsState === 'AWAITING_INPUT') && !s.isPaused;
            crossState = isStimulusActive ? 'white-halo' : 'hidden';
        } else {
            crossState = 'hidden';
        }
    } else {
        const gaborState = gaborController ? gaborController.currentState : 'IDLE';
        const isCalibration = gaborController ? gaborController.isAnaglyphTestActive : false;
        const isStimulusVisible = (gaborState === 'STIMULUS_ACTIVE') || (gaborState === 'AWAITING_INPUT' && s.isStaticEnabled);

        if (isCalibration) {
            crossState = 'visible';
        } else if (s.isPaused) {
            crossState = 'dimmed';
        } else if (isStimulusVisible) {
            crossState = s.isPermanentCrossEnabled ? 'dimmed' : 'hidden';
        } else {
            crossState = 'visible';
        }
    }

    containerNode.dataset.crossState = s.isCurtainActive ? 'hidden' : crossState;

    // Logic: Interactive arena cursor and state synchronization
    if (s.isPaused) {
        containerNode.classList.remove('disabled');
    } else if (s.appMode === 'synoptophore') {
        // Container remains interactive during both active dragging and click-to-slip vergence phases
        const isDisabled = (s.synopState !== 'align' && s.synopState !== 'pulling');
        containerNode.classList.toggle('disabled', isDisabled);
    } else {
        containerNode.classList.toggle('disabled', btnStart.disabled);
    }

    // Logic: Synchronize Synoptophore Reset button state
    const btnResetNode = document.getElementById('btn-reset') as HTMLButtonElement | null;
    if (btnResetNode) {
        btnResetNode.disabled = s.appMode === 'synoptophore' ? (s.synopState !== 'align') : false;
    }

    // Logic: Synchronize Left and Right buttons disabled states based on active pause
    const btnLeftNode = document.getElementById('btn-left') as HTMLButtonElement | null;
    const btnRightNode = document.getElementById('btn-right') as HTMLButtonElement | null;
    if (btnLeftNode) btnLeftNode.disabled = s.isPaused;
    if (btnRightNode) btnRightNode.disabled = s.isPaused;

    // Sync modal buttons accessibility based on FSM state
    const btnSettingsNode = document.getElementById('btn-settings') as HTMLButtonElement | null;
    const btnStatsNode = document.getElementById('btn-stats') as HTMLButtonElement | null;
    const btnInfoNode = document.getElementById('btn-info') as HTMLButtonElement | null;

    const disableModals = !canPause();
    if (btnSettingsNode) btnSettingsNode.disabled = disableModals;
    if (btnStatsNode) btnStatsNode.disabled = disableModals;
    if (btnInfoNode) btnInfoNode.disabled = disableModals;
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

    clearEdgeTimers();
    isEdgeHoldingActive = false;

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
    if (Store.state.appMode === 'synoptophore') {
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

    const isInitialStart = s.isCurtainActive;

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
    if (gaborController && gaborController.isAnaglyphTestActive) return;

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
        () => syncVisualState()
    );

    settingsController = new SettingsController(() => {
        updateStatusBar(Store.state, activeTranslations);
        if (gaborController && gaborController.isAnaglyphTestActive) {
            drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
        }
        
        // If Pill Tabs change the language, immediately react and reload i18n
        if (Store.state.currentLang !== activeTranslations._currentLangMetadata) {
            activeTranslations._currentLangMetadata = Store.state.currentLang;
            setLanguage(Store.state.currentLang);
        }
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
            snapPresetMode = Store.state.presetMode;
            snapLevel = Store.state.currentLevel;
            snapTimerLimit = Store.state.timerLimitMinutes;
            snapRdsStartDisparity = Store.state.rdsStartDisparity;

            if (btnFusionTest) {
                if (gaborController && gaborController.isAnaglyphTestActive) {
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

    // Initializing the architectural Input Dispatcher Switchboard
    const handlers: InputHandlers = {
        onActionLeft: () => {
            const s = Store.state;
            if (s.isPaused) return;
            if (gaborController && gaborController.isAnaglyphTestActive) return;

            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    Store.updateState('synopTargetX', s.synopTargetX - 1);
                    triggerSynopDragEffects();
                }
            } else if (s.appMode === 'rds') {
                if (rdsController) rdsController.submitAnswer('left');
            } else {
                if (gaborController) gaborController.submitAnswer('left');
            }
        },
        onActionRight: () => {
            const s = Store.state;
            if (s.isPaused) return;
            if (gaborController && gaborController.isAnaglyphTestActive) return;

            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    Store.updateState('synopTargetX', s.synopTargetX + 1);
                    triggerSynopDragEffects();
                }
            } else if (s.appMode === 'rds') {
                if (rdsController) rdsController.submitAnswer('right');
            } else {
                if (gaborController) gaborController.submitAnswer('right');
            }
        },
        onActionReset: () => {
            const s = Store.state;
            if (s.isPaused) return;
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                Store.updateState('synopTargetX', 0);
                Store.updateState('synopTargetY', 0);
                playError(s.isMuted);
                triggerSynopDragEffects();
            }
        },
        onActionPrimary: () => {
            if (Store.state.isPaused) {
                if (pauseController) pauseController.togglePause();
                return;
            }
            runFlash();
        },
        onActionMuteToggle: () => {
            Store.updateState('isMuted', !Store.state.isMuted);
            Store.saveSettings();
            updateMuteBtnUI();
        },
        /** 
         * @description Primary interaction trigger for the visual arena.
         * @clinical Implements the "Canvas-as-Trigger" metaphor. 
         */
        onActionCanvasClick: () => {
            const s = Store.state;
            if (s.isPaused) {
                if (pauseController) pauseController.togglePause();
                return;
            }
            if (btnStart.disabled) return;

            const curtain = document.getElementById('calibration-curtain');
            const isInitialStart = curtain && curtain.classList.contains('active');

            // Route all initial starts cleanly through runFlash
            if (isInitialStart) {
                runFlash();
                return;
            }

            if (s.appMode === 'synoptophore') {
                // Trigger vergence slip/reset if patient taps the canvas during active vergence pulling
                if (s.synopState === 'pulling' && synoptophoreController) {
                    synoptophoreController.breakActiveFusion();
                    return;
                }
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
        /** @description Handles tactile engagement start for vergence and swipes. */
        onDragStart: (event?: Event) => {
            const s = Store.state;
            if (s.isPaused) return;

            // Filter out simulated ghost mouse events immediately after actual touch gestures
            if (event) {
                if (event.type === 'touchstart') {
                    lastTouchTime = Date.now();
                } else if (event.type === 'mousedown') {
                    if (Date.now() - lastTouchTime < 500) {
                        return; // Ignore duplicated browser mouse emulation
                    }
                }
            }

            // Ignore any interaction started outside the gray foveal arena
            if (s.appMode === 'synoptophore' && event) {
                const target = event.target as HTMLElement;
                if (!target.closest('#container')) return;
            }

            if (s.isCurtainActive) {
                return;
            }

            Store.startTimerIfNeeded();

            // Set active tactile feedback class to preserve neon glow during active drags strictly in Synoptophore mode
            if (container && s.appMode === 'synoptophore') container.classList.add('dragging');

            dragStartX = Store.state.synopTargetX;
            dragStartY = Store.state.synopTargetY;
            dragStartStrongFactor = Store.state.appMode === 'synoptophore'
                ? Store.state.synopStrongEyeContrastFactor
                : Store.state.strongEyeContrastFactor;

            clearEdgeTimers();

            if (s.appMode === 'synoptophore' && s.synopState === 'align' && event) {
                let clientX = 0;
                let clientY = 0;
                if (event instanceof MouseEvent) {
                    clientX = event.clientX;
                    clientY = event.clientY;
                } else if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
                    if (event.touches && event.touches.length > 0) {
                        clientX = event.touches[0].clientX;
                        clientY = event.touches[0].clientY;
                    }
                }

                if (clientX > 0 && clientY > 0) {
                    const rect = container.getBoundingClientRect();
                    const nx = (clientX - rect.left) / rect.width;
                    const ny = (clientY - rect.top) / rect.height;
                    const edgeZone = 0.25;

                    const isEdgeTouch = (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) && 
                                        (nx < edgeZone || nx > 1 - edgeZone || ny < edgeZone || ny > 1 - edgeZone);

                    if (isEdgeTouch) {
                        let dx = 0;
                        let dy = 0;
                        if (nx < edgeZone) dx = -1;
                        else if (nx > 1 - edgeZone) dx = 1;

                        if (ny < edgeZone) dy = -1;
                        else if (ny > 1 - edgeZone) dy = 1;

                        isEdgeHoldingActive = true;

                        const performEdgeNudge = () => {
                            const curState = Store.state;
                            if (curState.isPaused) return;
                            if (dx !== 0) Store.updateState('synopTargetX', curState.synopTargetX + dx);
                            if (dy !== 0) Store.updateState('synopTargetY', curState.synopTargetY + dy);
                            triggerSynopDragEffects();
                        };
                        performEdgeNudge();

                        // Snappy native hold timers matching keyboard delays (250ms delay, 50ms interval)
                        edgeTimeoutId = window.setTimeout(() => {
                            edgeIntervalId = window.setInterval(performEdgeNudge, 50);
                        }, 250);
                    }
                }
            }
        },
        onDragUpdate: (deltaX: number, deltaY: number) => {
            const s = Store.state;
            if (s.isPaused) return;
            if (gaborController && gaborController.isAnaglyphTestActive) {
                const slider = document.getElementById('range-strong-attenuation') as HTMLInputElement | null;
                if (slider) {
                    const delta = -deltaY * 0.4;
                    const startVal = dragStartStrongFactor * 100;
                    slider.value = Math.max(10, Math.min(100, Math.round(startVal + delta))).toString();
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                if (isEdgeHoldingActive) {
                    const totalDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    if (totalDist > 8) {
                        // Smoothly transition from hold-to-repeat step mode into standard drag mode
                        clearEdgeTimers();
                        isEdgeHoldingActive = false;
                    } else {
                        return; // Suppress micro-movement coordinate updates while holding edge still
                    }
                }
                Store.updateState('synopTargetX', dragStartX + deltaX);
                Store.updateState('synopTargetY', dragStartY + deltaY);
                triggerSynopDragEffects();
            }
        },
        onDragEnd: (deltaTime: number, deltaXTotal: number, deltaYTotal: number) => {
            const s = Store.state;

            // Remove active tactile feedback class on drag completion
            if (container) container.classList.remove('dragging');

            clearEdgeTimers();
            isEdgeHoldingActive = false;

            if (s.appMode === 'synoptophore') {
                return;
            }

            const minSwipeDistance = 45;
            const maxVerticalDeviation = 45;
            const maxSwipeTime = 300;

            if (deltaTime <= maxSwipeTime && Math.abs(deltaXTotal) >= minSwipeDistance && Math.abs(deltaYTotal) <= maxVerticalDeviation) {
                const direction = deltaXTotal < 0 ? 'left' : 'right';
                if (s.appMode === 'rds') {
                    if (rdsController) rdsController.submitAnswer(direction);
                } else {
                    if (gaborController) gaborController.submitAnswer(direction);
                }
            }
        },
        onDragMovePreventDefault: () => {
            return (Store.state.appMode === 'synoptophore');
        },
        isDirectionalHoldActive: () => {
            const s = Store.state;
            if (gaborController && gaborController.isAnaglyphTestActive) {
                return true;
            }
            return (s.appMode === 'synoptophore' && s.synopState === 'align');
        },
        onDirectionalShift: (dx: number, dy: number) => {
            const s = Store.state;
            if (gaborController && gaborController.isAnaglyphTestActive) {
                if (dy !== 0) {
                    const slider = document.getElementById('range-strong-attenuation') as HTMLInputElement | null;
                    if (slider) {
                        const step = parseInt(slider.step, 10) || 5;
                        const current = parseInt(slider.value, 10) || 30;
                        const dir = -dy;
                        slider.value = Math.max(10, Math.min(100, current + dir * step)).toString();
                        slider.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                return;
            }
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                Store.updateState('synopTargetX', s.synopTargetX + dx);
                Store.updateState('synopTargetY', s.synopTargetY + dy);
                triggerSynopDragEffects();
            }
        },
        onActionPauseToggle: () => {
            // Block manual pause toggling via keyboard/shortcuts if any modal is active
            if (document.querySelector('.modal.modal-open')) return;

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

            if (isConfirmOpen || isSettingsOpen || isInfoOpen || isStatsOpen || (gaborController && gaborController.isAnaglyphTestActive)) {
                if (gaborController && gaborController.isAnaglyphTestActive) {
                    const bTest = document.getElementById('btn-fusion-test');
                    if (bTest) bTest.click();
                    return;
                }
                if (isConfirmOpen) return;
                if (customAlertModal && customAlertModal.classList.contains('modal-open')) {
                    closeCustomAlert();
                    return;
                }
                if (isSettingsOpen) {
                    saveSettingsFromUI();
                    closeModal(settingsModal);
                }
                if (isInfoOpen) {
                    closeModal(infoModal);
                    restoreSystemPause();
                }
                if (isStatsOpen) {
                    closeModal(statsModal);
                    restoreSystemPause();
                }
                return;
            }

            if (Store.state.isPaused && pauseController) {
                pauseController.togglePause();
                return;
            }
        }
    };

    bindInputControls(handlers);

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
            snapPresetMode !== Store.state.presetMode ||
            snapLevel !== Store.state.currentLevel ||
            snapRdsStartDisparity !== Store.state.rdsStartDisparity
        );

        const isTimerChanged = (snapTimerLimit !== Store.state.timerLimitMinutes);
        const isSynop = (Store.state.appMode === 'synoptophore');

        if (gaborController) gaborController.isAnaglyphTestActive = false;
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

            if (!Store.state.isPaused) {
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
                    if (gaborController && gaborController.currentState === 'IDLE') {
                        drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
                    } else if (gaborController && gaborController.currentState === 'AWAITING_INPUT' && Store.state.isStaticEnabled) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const gc = gaborController as any;
                        renderGabor(canvas, null, Store.state, gc.currentAngleDeg, Store.state.autoContrast, Store.state.autoContrast, gc.lastRandomFreq, gc.lastRandomSigma, gc.lastOffsetX, gc.lastOffsetY, 0, gc.lastRandomAspectRatio);
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
        if (btnMute) {
            btnMute.innerText = Store.state.isMuted ? '🔇' : '🔊';
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(btnMute);
        }
    }

    // Logic: Fusion calibration test pattern trigger
    if (btnFusionTest) {
        btnFusionTest.addEventListener('click', () => {
            const settingsModal = document.getElementById('settings-modal');
            const modalContent = settingsModal ? settingsModal.querySelector('.modal-content') : null;
            const scrollBody = settingsModal ? settingsModal.querySelector('.modal-scroll-body') : null;
            const calibrationCurtain = document.getElementById('calibration-curtain');

            if (modalContent) modalContent.classList.add('modal-transitioning');
            if (calibrationCurtain) calibrationCurtain.classList.add('active');

            if (gaborController && !gaborController.isAnaglyphTestActive && settingsModal) {
                settingsModal.classList.add('modal-clear-backdrop');
                
                // Clinical: instantly hide watermark to reveal central calibration anchors
                if (pauseController) pauseController.overrideWatermarkVisibility(true);
            }

            setTimeout(() => {
                if (!gaborController) return;
                gaborController.isAnaglyphTestActive = !gaborController.isAnaglyphTestActive;

                    if (gaborController.isAnaglyphTestActive) {
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
                        if (calibrationCurtain) calibrationCurtain.classList.remove('active');
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
                        if (calibrationCurtain) calibrationCurtain.classList.remove('active');
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

            Store.resetSessionProgress();

            btnStart.disabled = false;

            updateScoreboard(Store.state, activeTranslations);

            Store.updateState('isCurtainActive', true);

            drawIdleState(canvas, null, overlayCanvas, overlayCtx, state.appMode === 'synoptophore' || state.isFusionLockEnabled);

            const t = activeTranslations;
            if (state.appMode === 'synoptophore') {
                if (state.synopFlickerActive) {
                    if (synoptophoreController) synoptophoreController.stopFlickerLoop();
                } else {
                    drawSynoptophoreTargets(overlayCanvas, overlayCtx, state);
                }
                cross.style.display = 'none';
                btnStart.innerText = t.btnSynopLock || "LOCK FUSION";
            } else if (state.appMode === 'rds') {
                cross.style.display = 'block';
                btnStart.innerText = t.rdsStartBtn || "START STEREOGRAM";
                drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
            } else {
                cross.style.display = 'block';
                btnStart.innerText = t.startBtn || "START FLASH";
            }

            playGoldAward(state.isMuted); // Play majestic PS1-style aura chimes for Pomodoro complete!
            showCustomAlert(t.titlePomodoro || '🍅 Pomodoro', t.sessionTimerCompleted || "Rest.");
        }
    );
    pomodoro.init();

    const appWrapper = document.getElementById('app-wrapper');
    if (appWrapper) appWrapper.classList.add('loaded');
});