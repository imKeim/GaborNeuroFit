/*
 * GaborNeuroFit - High-Performance Orchestrator & Entry Point
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs strict Dependency Injection (DI) and precise
 * DOM element casting to guarantee that interface bindings and FSM lifecycles
 * initialize flawlessly across all clinical modalities.
 */

// Import core dependencies
import { Store } from './store';
import { DataRepository } from './store/repository';
import { drawFusionTestPattern } from './engine/calibration-render';
import { playCue, playError, playSuccess } from './engine/audio';
import { updateScoreboard, drawIdleState, updateStatusBar } from './ui/screen';
import { initModals, showCustomAlert, closeCustomAlert, closeModal } from './ui/modal';
import { bindInputControls } from './ui/controls';
import { GaborController } from './controller/gabor';
import { SettingsController } from './controller/settings';
import { SynoptophoreController } from './controller/synoptophore';
import { RdsController } from './controller/rds';
import { DashboardController } from './controller/dashboard';
import { PauseController } from './controller/pause';
import { PomodoroTimer } from './utils/timer';
import { drawSynoptophoreTargets } from './engine/synop-render';
import { drawRandomDotStereogram } from './engine/rds-render';
import { resizeCanvasesToDPR } from './utils/bootstrap';
import { loadLanguage } from './utils/i18n';

// Import strict types
import type { Language, AppMode, GaborPreset } from './types/clinical';
import type { InputHandlers } from './ui/controls';

// Global cache for the active localization dictionary
let activeTranslations: Record<string, string> = {};

// References to our OOP controllers instances
let gaborController: GaborController | null = null;
let settingsController: SettingsController | null = null;
let synoptophoreController: SynoptophoreController | null = null;
let rdsController: RdsController | null = null;
let dashboardController: DashboardController | null = null;
let pauseController: PauseController | null = null;

// Settings Snapshot State holds (Protects session progress on non-critical config changes)
let snapAppMode: AppMode | null = null;
let snapPresetMode: GaborPreset | null = null;
let snapLevel: number | null = null;
let snapTimerLimit: number | null = null;

// Abstracted dragging coordinates context holds
let dragStartX: number = 0;
let dragStartY: number = 0;
let dragStartStrongFactor: number = 0.3; // Calibrated contrast factor context holder

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
 * @description Centralized visual synchronizer for fixation cross and mouse pointer state
 */
function syncVisualState(): void {
    const s = Store.state;
    const crossNode = document.getElementById('cross');
    const containerNode = document.getElementById('container');
    if (!crossNode || !containerNode) return;

    // --- 1. Cross Synchronization ---
    if (s.appMode === 'synoptophore') {
        crossNode.style.display = 'none';
    } else if (s.appMode === 'rds') {
        crossNode.style.display = 'block';
        crossNode.style.fontSize = '36px'; // RDS cross must always remain at the standard large Stage 1 size (36px)
        if (s.rdsIsPermanentCrossEnabled) {
            const rdsState = rdsController ? rdsController.currentState : 'IDLE';
            const isStimulusActive = (rdsState === 'STIMULUS_ACTIVE' || rdsState === 'AWAITING_INPUT') && !s.isPaused;

            if (isStimulusActive) {
                crossNode.className = 'cross-white-halo';
            } else {
                crossNode.className = 'cross-hidden';
            }
        } else {
            crossNode.className = 'cross-hidden';
        }
    } else {
        crossNode.style.display = 'block';
            
        // In Gabor mode, calculate cross size dynamically based on currentLevel
        let crossSize = 36;
        if (s.currentLevel === 1) crossSize = 36;
        else if (s.currentLevel === 2) crossSize = 28;
        else if (s.currentLevel === 3) crossSize = 22;
        else if (s.currentLevel === 4) crossSize = 16;
        else if (s.currentLevel === 5) crossSize = 12;
        crossNode.style.fontSize = crossSize + 'px';

        const gaborState = gaborController ? gaborController.currentState : 'IDLE';
        // Tie cross dimming strictly to physical stimulus visibility on canvas
        const isStimulusVisible = 
            (gaborState === 'STIMULUS_ACTIVE') || 
            (gaborState === 'AWAITING_INPUT' && s.isStaticEnabled);

        if (s.isPaused) {
            crossNode.className = 'cross-dimmed';
        } else if (isStimulusVisible) {
            // Symmetrically dim or hide cross only while stimulus remains visible
            if (s.isPermanentCrossEnabled) {
                crossNode.className = 'cross-dimmed';
            } else {
                crossNode.className = 'cross-hidden';
            }
        } else {
            // Instantly restore full opacity (1.0) on blink completion to assist gaze alignment
            crossNode.className = '';
        }
    }

    // --- 2. Container Cursor & Class Synchronization ---
    if (s.isPaused) {
        containerNode.style.cursor = 'pointer';
        containerNode.classList.remove('disabled');
    } else if (s.appMode === 'synoptophore') {
        // Manage Synoptophore cursor states symmetrically depending on physical interaction phase
        if (s.synopState === 'idle' || s.synopState === 'pulling') {
            containerNode.style.cursor = 'pointer'; // Pointing hand invitation during setup/slip phases
        } else if (s.synopState === 'align') {
            containerNode.style.cursor = 'move'; // Crisp OS-native 2D move arrows for high-precision dragging
        } else {
            containerNode.style.cursor = 'default';
        }
        // Container remains interactive during both active dragging and click-to-slip vergence phases
        const isDisabled = (s.synopState !== 'align' && s.synopState !== 'pulling');
        containerNode.classList.toggle('disabled', isDisabled);
    } else {
        // Restore dynamic pointer visibility based on click readiness to preserve button metaphor
        containerNode.style.cursor = btnStart.disabled ? 'default' : 'pointer';
        containerNode.classList.toggle('disabled', btnStart.disabled);
    }
}

/**
 * @description Centralized router for safe transitions between clinical modes.
 */
function transitionToMode(newMode: AppMode): void {
    const s = Store.state;

    if (gaborController) gaborController.deactivate();
    if (rdsController) rdsController.deactivate();
    if (synoptophoreController) synoptophoreController.deactivate();

    Store.updateState('appMode', newMode);
    Store.resetSessionProgress();

    btnStart.disabled = false;
    btnStart.style.opacity = "1";

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

    const curtain = document.getElementById('calibration-curtain');
    const isSynop = (newMode === 'synoptophore');
    const isRds = (newMode === 'rds');

    if (container) {
        if (isRds) {
            container.classList.add('mode-rds');
        } else {
            container.classList.remove('mode-rds');
        }
    }

    if (isSynop) {
        if (curtain) curtain.classList.add('active');
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, true);
        if (synoptophoreController) synoptophoreController.syncFlickerState();
    } else if (isRds) {
        if (curtain) curtain.classList.remove('active');
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
    } else {
        if (curtain) curtain.classList.remove('active');
        drawIdleState(canvas, null, overlayCanvas, overlayCtx, s.isFusionLockEnabled);
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
            btnStart.style.opacity = '0.4';
            btnStart.innerText = t.rdsNextBtn || "NEXT STEREOGRAM";
        } else {
            btnStart.disabled = false;
            btnStart.style.opacity = '1';
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
    // @ts-ignore
    if (typeof window !== 'undefined' && window.twemoji) {
        // @ts-ignore
        window.twemoji.parse(document.getElementById('top-bar'));
        // @ts-ignore
        window.twemoji.parse(document.getElementById('bottom-dock'));
        // @ts-ignore
        window.twemoji.parse(document.getElementById('settings-modal'));
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

    // Smoothly melt the initial calibration gray curtain on the very first active therapy launch
    const curtain = document.getElementById('calibration-curtain');
    if (curtain && curtain.classList.contains('active')) {
        curtain.classList.remove('active');
    }

    // Route inputs depending on active appMode (Single Source of Truth)
    if (s.appMode === 'rds') {
        if (rdsController && rdsController.currentState === 'IDLE') {
            rdsController.triggerTrial();
        }
        return;
    }

    if (s.appMode === 'synoptophore') {
        if (s.synopState === 'idle') {
            playCue(s.isMuted);

            if (curtain) curtain.classList.remove('active');

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

    // Lock start triggers while the calibration test pattern is active
    if (gaborController && gaborController.isAnaglyphTestActive) return;

    if (s.isWaitingForAnswer) {
        if (gaborController) gaborController.reFlashCurrentGabor();
    } else {
        if (gaborController) gaborController.triggerTrial();
    }
}

/**
 * Orchestrator bootstrap initialization block
 */
window.addEventListener('load', async () => {
    // Instantly scale the canvas backing stores to prevent initial-load blurry upscaling
    resizeCanvasesToDPR();
    
    // Handle viewport resizing and orientation changes to maintain crisp, dpr-scaled visual targets
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

    // 1. Fetch and load translation bundle asynchronously first
    await setLanguage(Store.state.currentLang);

    // 2. Initialize database synchronously using fully loaded translations (retaining zero-hardcode SSoT)
    DataRepository.init(activeTranslations);
    DataRepository.migrateLegacyDatabase();

    // Instantiate core controllers with strictly typed WebGL Canvas and Overlay Context
    gaborController = new GaborController(
        canvas,
        overlayCanvas,
        overlayCtx,
        cross,
        container,
        flashOverlay,
        btnStart,
        () => activeTranslations,
        showCustomAlert,
        () => syncVisualState()
    );

    synoptophoreController = new SynoptophoreController(
        overlayCanvas,
        overlayCtx,
        btnStart,
        () => activeTranslations,
        showCustomAlert,
        () => {
            const startDist = Store.state.synopStartDistance;
            // Save successful vergence sweep conforming strictly to Polymorphic interfaces
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

    // Architectural Interceptor: Safeguards resources and clinical timers when view is obstructed
    function enforceSystemPause(): void {
        if (!Store.state.isPaused && pauseController) {
            pauseController.togglePause();
        }
    }

    // Additive binding for standalone Handbook modal
    const btnInfo = document.getElementById('btn-info');
    if (btnInfo) {
        btnInfo.addEventListener('click', enforceSystemPause);
    }

    initModals(
        () => {
            enforceSystemPause();
            Store.loadSettings();

            // Take snapshot of critical clinical parameters to detect destructive changes later
            snapAppMode = Store.state.appMode;
            snapPresetMode = Store.state.presetMode;
            snapLevel = Store.state.currentLevel;
            snapTimerLimit = Store.state.timerLimitMinutes;

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
        onActionCanvasClick: () => {
            const s = Store.state;
            if (s.isPaused) {
                if (pauseController) pauseController.togglePause();
                return;
            }
            if (btnStart.disabled) return;
            const curtain = document.getElementById('calibration-curtain');
            const isInitialStart = curtain && curtain.classList.contains('active');

            if (isInitialStart) {
                if (s.appMode === 'synoptophore') {
                    runFlash();
                    return;
                }
                curtain.classList.remove('active');

                if (s.appMode === 'rds') {
                    if (rdsController) rdsController.triggerTrial();
                    return;
                }
                if (s.appMode === 'gabor') {
                    runFlash();
                    return;
                }
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
        onDragStart: (event?: Event) => {
            const s = Store.state;
            if (s.isPaused) return;

            // Restrict physical touch/drag operations strictly to the surface of `#container` in Synoptophore
            if (s.appMode === 'synoptophore' && event) {
                const target = event.target as HTMLElement;
                if (!target.closest('#container')) return;
            }

            const curtain = document.getElementById('calibration-curtain');
            if (curtain && curtain.classList.contains('active')) {
                if (s.appMode === 'synoptophore') {
                    runFlash();
                    return;
                }
                curtain.classList.remove('active');
            }

            Store.startTimerIfNeeded();

            // Set active tactile feedback class to preserve neon glow during active drags strictly in Synoptophore mode
            if (container && s.appMode === 'synoptophore') container.classList.add('dragging');

            dragStartX = Store.state.synopTargetX;
            dragStartY = Store.state.synopTargetY;
            dragStartStrongFactor = Store.state.appMode === 'synoptophore'
                ? Store.state.synopStrongEyeContrastFactor
                : Store.state.strongEyeContrastFactor;
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
                Store.updateState('synopTargetX', dragStartX + deltaX);
                Store.updateState('synopTargetY', dragStartY + deltaY);
                triggerSynopDragEffects();
            }
        },
        onDragEnd: (deltaTime: number, deltaXTotal: number, deltaYTotal: number, clientX: number, clientY: number) => {
            const s = Store.state;

            // Remove active tactile feedback class on drag completion
            if (container) container.classList.remove('dragging');

            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    const isTapGesture = deltaTime < 250 && Math.abs(deltaXTotal) < 8 && Math.abs(deltaYTotal) < 8;
                    if (isTapGesture) {
                        const rect = container.getBoundingClientRect();
                        const nx = (clientX - rect.left) / rect.width;
                        const ny = (clientY - rect.top) / rect.height;
                        const edgeZone = 0.25;

                        // Boundary check: Restrict nudge triggers strictly to the physical surface of `#container`
                        const isInsideContainer = (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1);
                        if (isInsideContainer) {
                            let didNudge = false;
                            if (nx < edgeZone) { Store.updateState('synopTargetX', s.synopTargetX - 1); didNudge = true; }
                            else if (nx > 1 - edgeZone) { Store.updateState('synopTargetX', s.synopTargetX + 1); didNudge = true; }

                            if (ny < edgeZone) { Store.updateState('synopTargetY', s.synopTargetY - 1); didNudge = true; }
                            else if (ny > 1 - edgeZone) { Store.updateState('synopTargetY', s.synopTargetY + 1); didNudge = true; }

                            if (didNudge) triggerSynopDragEffects();
                        }
                    }
                }
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
                    if (settingsModal) settingsModal.classList.remove('modal-open');
                }
                if (isInfoOpen && infoModal) infoModal.classList.remove('modal-open');
                if (isStatsOpen && statsModal) statsModal.classList.remove('modal-open');
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

    function saveSettingsFromUI(): void {
        if (settingsController) settingsController.syncStateFromUI();
        Store.saveSettings();

        const isCriticalChange = (
            snapAppMode !== Store.state.appMode ||
            snapPresetMode !== Store.state.presetMode ||
            snapLevel !== Store.state.currentLevel
        );

        const isTimerChanged = (snapTimerLimit !== Store.state.timerLimitMinutes);
        const isSynop = (Store.state.appMode === 'synoptophore');

        if (isCriticalChange) {
            transitionToMode(Store.state.appMode);
        } else {
            if (gaborController) gaborController.isAnaglyphTestActive = false;
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) settingsModal.classList.remove('calibration-mode');

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

            if (!Store.state.isPaused) {
                if (isSynop) {
                    if (Store.state.synopState !== 'idle' && !Store.state.synopFlickerActive) {
                        drawSynoptophoreTargets(overlayCanvas, overlayCtx, Store.state);
                    }
                } else if (Store.state.appMode === 'rds' && rdsController && rdsController.currentState === 'IDLE') {
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, false);
                } else if (Store.state.appMode === 'gabor' && gaborController && gaborController.currentState === 'IDLE') {
                    drawIdleState(canvas, null, overlayCanvas, overlayCtx, Store.state.isFusionLockEnabled);
                }
            }

            setLanguage(Store.state.currentLang);
            syncVisualState();
        }
    }

    function updateMuteBtnUI(): void {
        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
            btnMute.innerText = Store.state.isMuted ? '🔇' : '🔊';
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(btnMute);
        }
    }

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
                
                // Instantly hide the PAUSED watermark on the exact millisecond of click, 
                // preventing it from flashing on top of the gray transition curtain.
                if (pauseController) pauseController.overrideWatermarkVisibility(true);
            }

            setTimeout(() => {
                if (!gaborController) return;
                gaborController.isAnaglyphTestActive = !gaborController.isAnaglyphTestActive;

                    if (gaborController.isAnaglyphTestActive) {
                        btnFusionTest.classList.add('active');
                        container.classList.add('calibration-active');

                        if (scrollBody && settingsModal) {
                            // Safe persistent state anchoring
                            (settingsModal as any)._savedScrollTop = scrollBody.scrollTop;
                        }

                        if (settingsModal) {
                            settingsModal.classList.add('calibration-mode');
                            if (scrollBody) scrollBody.scrollTop = 0;
                        }

                        resizeCanvasesToDPR();

                        if (synoptophoreController) synoptophoreController.stopFlickerLoop();

                        // Symmetrical Calibration Lock: Force draw the spatial reference frame during active calibration for ALL modes (including RDS)
                        drawIdleState(canvas, null, overlayCanvas, overlayCtx, true);
                        drawFusionTestPattern(overlayCanvas, overlayCtx, Store.state);
                        canvas.style.display = 'block';
                        overlayCanvas.style.display = 'block';
                        cross.style.display = 'block'; // Keep the crisp native CSS cross visible during calibration
                                
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

                    // Architectural delegation: Safely restore watermark
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

    const pomodoro = new PomodoroTimer(
        (state) => {
            updateScoreboard(state, activeTranslations);
        },
        (state) => {
            // Safe teardown of all controllers using the standardized deactivate() lifecycle
            if (gaborController) gaborController.deactivate();
            if (synoptophoreController) synoptophoreController.deactivate();
            if (rdsController) rdsController.deactivate();

            // Retrieve modal elements from DOM to cleanly close them upon session completion
            const settingsModalEl = document.getElementById('settings-modal');
            const infoModalEl = document.getElementById('info-modal');
            const statsModalEl = document.getElementById('stats-modal');

            // Symmetrically dismiss all open modals to return DOM to a clean, non-obstructed resting state
            if (settingsModalEl) closeModal(settingsModalEl);
            if (infoModalEl) closeModal(infoModalEl);
            if (statsModalEl) closeModal(statsModalEl);

            // Reset the session progress (scores/totals) to zero
            Store.resetSessionProgress();

            // Sanitize and re-enable start button to prevent visual locking after Pomodoro finishes
            btnStart.disabled = false;
            btnStart.style.opacity = "1";

            // Update the visual scoreboard immediately to show 0/0
            updateScoreboard(Store.state, activeTranslations);

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

            playSuccess(state.isMuted);
            showCustomAlert(t.titlePomodoro || '🍅 Pomodoro', t.sessionTimerCompleted || "Rest.");
        }
    );
    pomodoro.init();

    const appWrapper = document.getElementById('app-wrapper');
    if (appWrapper) appWrapper.classList.add('loaded');
});