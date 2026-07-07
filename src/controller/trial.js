/*
 * GaborNeuroFit - Perceptual Learning Trial Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module orchestrates the state machine of individual visual training trials,
 * coupling dynamic stimulations with clean resource cleanup and state transition locks.
 */

import { Store } from '../store.js';
import { AsyncResourceTracker } from '../utils/tracker.js';
import { renderGabor } from '../engine/gabor.js';
import { playCue, playSuccess, playError } from '../engine/audio.js';
import { updateScoreboard, updateStatusBar, drawIdleState } from '../ui/screen.js';

/**
 * Finite State Machine declarations for strict visual execution tracking
 */
export const TrialState = {
    IDLE: 'IDLE',
    PRE_CUE: 'PRE_CUE',
    STIMULUS_ACTIVE: 'STIMULUS_ACTIVE',
    AWAITING_INPUT: 'AWAITING_INPUT',
    FEEDBACK: 'FEEDBACK'
};

/**
 * Optometric spatial frequency bands mapped to individual difficulty stages
 */
const levelFreqRanges = {
    1: { min: 0.03, max: 0.05 },
    2: { min: 0.05, max: 0.08 },
    3: { min: 0.08, max: 0.12 },
    4: { min: 0.12, max: 0.17 },
    5: { min: 0.17, max: 0.24 }
};

/**
 * Gaussian envelope standard deviations (Sigma) mapping foveal focus fields
 */
const levelSigmaRanges = {
    1: { min: 40, max: 50 },
    2: { min: 32, max: 40 },
    3: { min: 24, max: 31 },
    4: { min: 18, max: 23 },
    5: { min: 12, max: 17 }
};

/**
 * Strict state transition matrix to enforce safe clinical FSM flow
 */
const ALLOWED_TRANSITIONS = {
    [TrialState.IDLE]: [TrialState.PRE_CUE],
    [TrialState.PRE_CUE]: [TrialState.STIMULUS_ACTIVE],
    [TrialState.STIMULUS_ACTIVE]: [TrialState.AWAITING_INPUT, TrialState.FEEDBACK],
    [TrialState.AWAITING_INPUT]: [TrialState.PRE_CUE, TrialState.FEEDBACK],
    [TrialState.FEEDBACK]: [TrialState.IDLE]
};

export class TrialController {
    constructor(canvas, context, overlayCanvas, overlayContext, cross, container, flashOverlay, btnStart, translationsGetter) {
        this.canvas = canvas;
        this.ctx = context;
        this.overlayCanvas = overlayCanvas;
        this.overlayCtx = overlayContext;
        this.cross = cross;
        this.container = container;
        this.flashOverlay = flashOverlay;
        this.btnStart = btnStart;
        this.getTranslations = translationsGetter;

        this.currentState = TrialState.IDLE;
        this.tracker = new AsyncResourceTracker();

        // Cached properties for the active trial stimulus
        this.currentAngleDeg = 0;
        this.lastRandomFreq = 0.08;
        this.lastRandomSigma = 40;
        this.lastRandomAspectRatio = 1.0;
        this.lastOffsetX = 0;
        this.lastOffsetY = 0;
        this.flankerPhaseOffset = 0;

        this.isAnaglyphTestActive = false;
        this.isFlickerOffState = false; /* Keeps track of the active 10 Hz flicker cycle to synchronize with 60 FPS animations */
    }

    /**
     * Instantly aborts current session and resets FSM (used cleanly when exiting settings)
     */
    abort() {
        this.tracker.clearAll();
        this.currentState = TrialState.IDLE;
        this.isFlickerOffState = false;
    }

    /**
     * Safely transitions the finite state machine and purges timers from the previous phase
     */
    transitionTo(nextState) {
        const allowed = ALLOWED_TRANSITIONS[this.currentState];
        if (!allowed || !allowed.includes(nextState)) {
            return false; // Prevent illegal state transition (e.g. clicking while active)
        }

        this.currentState = nextState;
        this.isFlickerOffState = false; // Reset flicker state on FSM transition
        
        // Destructively clear active timers ONLY during cue preparation or feedback phases
        if (nextState === TrialState.PRE_CUE || nextState === TrialState.FEEDBACK) {
            this.tracker.clearAll();
        }
        return true;
    }

    /**
     * Handles the acoustic pre-cue warning phase
     */
    triggerTrial() {
        if (!this.transitionTo(TrialState.PRE_CUE)) {
            return; // Guard lock against rapid execution triggers
        }

        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        // Schedule visual flash execution exactly 180ms after the auditory pre-cue click
        this.tracker.setTimeout(() => {
            this._runRenderCycle(true);
        }, 180);
    }

    /**
     * Repeats the exposure of the active trial's visual parameters
     */
    reFlashCurrentGabor() {
        if (!this.transitionTo(TrialState.PRE_CUE)) {
            return; // Guard lock during active transitions
        }

        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        // Schedule visual re-flash exactly 180ms after the warning click
        this.tracker.setTimeout(() => {
            this._runRenderCycle(false);
        }, 180);
    }

    /**
     * Unified visual execution pipeline handling parameters configuration, rendering, and lifecycle timers
     * @param {boolean} isNewTrial - If true, randomizes new Gabor parameters. If false, preserves existing parameters.
     */
    _runRenderCycle(isNewTrial) {
        const t = this.getTranslations();
        const s = Store.state;

        this.transitionTo(TrialState.STIMULUS_ACTIVE);

        // Fail-safe fallback: flicker stimulation strictly requires static exposure to loop intervals
        if (s.isFlickerEnabled) {
            s.isStaticEnabled = true;
        }

        // Dynamically scale canvas backing store to prevent interpolation blur on High-DPI screens
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const physicalSize = Math.min(1024, Math.round(rect.width * dpr));

        if (this.canvas.width !== physicalSize) {
            this.canvas.width = physicalSize;
            this.canvas.height = physicalSize;
            this.overlayCanvas.width = physicalSize;
            this.overlayCanvas.height = physicalSize;
        }

        if (isNewTrial) {
            // Generate a secure randomized stimulus angle outside of dead-zones
            do {
                this.currentAngleDeg = Math.floor(Math.random() * 160) - 80;
            } while (Math.abs(this.currentAngleDeg) < 15);

            // Compute randomized spatial frequency and Gaussian envelope sizes for current Stage
            const freqRange = levelFreqRanges[s.currentLevel] || levelFreqRanges[1];
            this.lastRandomFreq = Math.random() * (freqRange.max - freqRange.min) + freqRange.min;

            const sigmaRange = levelSigmaRanges[s.currentLevel] || levelSigmaRanges[1];
            this.lastRandomSigma = Math.random() * (sigmaRange.max - sigmaRange.min) + sigmaRange.min;

            this.lastRandomAspectRatio = 1.0;
            if (s.allowWideVariance) {
                const randType = Math.random();
                if (randType < 0.35) {
                    this.lastRandomFreq = Math.random() * (0.04 - 0.03) + 0.03;
                    this.lastRandomSigma = Math.random() * (45 - 35) + 35;
                } else if (randType < 0.50) {
                    this.lastRandomFreq = Math.random() * (0.16 - 0.12) + 0.12;
                    this.lastRandomSigma = Math.random() * (40 - 32) + 32;
                }
            }

            if (s.allowShapeVariance) {
                this.lastRandomAspectRatio = Math.random() * (2.0 - 0.5) + 0.5;
            }

            // Apply spatial summation adaptation for ultra-low contrast thresholds
            const summationThreshold = 0.12;
            if (s.autoContrast < summationThreshold) {
                const summationMultiplier = 1.0 + (summationThreshold - s.autoContrast) * 3.0;
                this.lastRandomSigma = this.lastRandomSigma * summationMultiplier;
            }

            // Calculate randomized peripheral offsets if eccentric fixation is enabled
            this.lastOffsetX = 0;
            this.lastOffsetY = 0;
            if (s.isPeripheralEnabled) {
                const angle = Math.random() * 2 * Math.PI;
                const distance = 55;
                this.lastOffsetX = Math.cos(angle) * distance;
                this.lastOffsetY = Math.sin(angle) * distance;
            }
        }

        // Synchronize numeric counters on the active user dashboard
        document.getElementById('current-contrast').innerText = Math.round(s.autoContrast * 100);
        document.getElementById('current-level').innerText = s.currentLevel;
        document.getElementById('current-streak').innerText = s.correctStreak;

        // Scale central fixation cross size inversely with spatial Stage difficulty
        let crossSize = 36;
        if (s.currentLevel === 1) crossSize = 36;
        else if (s.currentLevel === 2) crossSize = 28;
        else if (s.currentLevel === 3) crossSize = 22;
        else if (s.currentLevel === 4) crossSize = 16;
        else if (s.currentLevel === 5) crossSize = 12;
        this.cross.style.fontSize = crossSize + 'px';

        // Render Gabor patch using mathematical engine
        renderGabor(this.canvas, this.ctx, s, this.currentAngleDeg, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, 0, this.lastRandomAspectRatio);

        let flashDuration = this.getFlashDuration(s);
        updateStatusBar(s, t);

        this.cross.style.display = 'none';
        this.canvas.style.display = 'block';
        Store.state.isWaitingForAnswer = true;

        const isAnimating = (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) || s.isFlickerEnabled;

        if (isAnimating) {
            this.startUnifiedRenderingLoop();
        }

        if (!s.isStaticEnabled) {
            // Transient exposure (auto-hide after configured duration)
            this.tracker.setTimeout(() => {
                this.stopUnifiedRenderingLoop();
                drawIdleState(this.canvas, this.ctx, this.overlayCanvas, this.overlayCtx, s.isFusionLockEnabled);
                this.cross.style.display = 'block';
                this.btnStart.innerText = t.reflashBtn;
                this.transitionTo(TrialState.AWAITING_INPUT);
            }, flashDuration);
        } else {
            this.btnStart.innerText = t.reflashBtn;
            this.transitionTo(TrialState.AWAITING_INPUT);
        }
    }

    /**
     * Evaluates answer submissions and executes tactile visual/acoustic feedback animations
     */
    submitAnswer(userChoice) {
        if (this.currentState !== TrialState.AWAITING_INPUT && this.currentState !== TrialState.STIMULUS_ACTIVE) {
            return; // Guard to ignore keyboard/tap inputs outside active response phases
        }

        const s = Store.state;
        Store.state.isWaitingForAnswer = false;

        this.transitionTo(TrialState.FEEDBACK);
        this.cross.style.display = 'block';

        const correctAnswer = this.currentAngleDeg < 0 ? 'left' : 'right';
        const isCorrect = (userChoice === correctAnswer);

        this.container.classList.remove('success-pulse', 'error-shake');
        this.flashOverlay.classList.remove('flash-success', 'flash-error');
        void this.container.offsetWidth; // Force CSS layout reflow to restart kinetic animations cleanly
        void this.flashOverlay.offsetWidth;

        Store.registerResult(isCorrect);

        if (isCorrect) {
            playSuccess(s.isMuted);
            this.flashOverlay.classList.add('flash-success');
            this.container.classList.add('success-pulse');
        } else {
            playError(s.isMuted);
            this.flashOverlay.classList.add('flash-error');
            this.container.classList.add('error-shake');
        }

        drawIdleState(this.canvas, this.ctx, this.overlayCanvas, this.overlayCtx, s.isFusionLockEnabled);

        // Initiate smooth chromatic flash fade-out after 300ms
        this.tracker.setTimeout(() => {
            this.flashOverlay.classList.add('fade-out');
            this.container.classList.remove('success-pulse', 'error-shake');
            
            // Completely purge all color classes once the opacity transition completes
            this.tracker.setTimeout(() => {
                this.flashOverlay.classList.remove('flash-success', 'flash-error', 'fade-out');
            }, 500);

            if (this.currentState === TrialState.FEEDBACK) {
                this.currentState = TrialState.IDLE;
            }
        }, 300);

        updateScoreboard(s, this.getTranslations());
        Store.saveSession();

        const minContrastLimit = s.allowLowContrast ? 0.01 : 0.05;
        if (s.currentLevel === 5 && s.autoContrast <= minContrastLimit && s.correctStreak >= 12) {
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    alert(this.getTranslations().sessionMastered);
                    this.transitionTo(TrialState.IDLE);
                });
            }, 400);
            return;
        }

        if (s.sessionLimit > 0 && s.total >= s.sessionLimit) {
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    alert(this.getTranslations().sessionCompleted.replace("{limit}", s.sessionLimit));
                    this.transitionTo(TrialState.IDLE);
                });
            }, 400);
            return;
        }

        if (s.autoAdvance) {
            this.btnStart.innerText = "...";
            this.tracker.setTimeout(() => {
                this.triggerTrial();
            }, 900);
        } else {
            this.btnStart.innerText = this.getTranslations().nextBtn;
            // Softly change FSM state status without synchronously wiping out active feedback timers
            this.currentState = TrialState.IDLE;
        }
    }

    /**
     * Resolves the current target exposure duration mapped to active Stage constraints
     */
    getFlashDuration(state) {
        if (state.flashDurationMode === '100') return 100;
        if (state.flashDurationMode === '180') return 180;
        if (state.flashDurationMode === '200') return 200;
        if (state.flashDurationMode === '350') return 350;
        
        if (state.currentLevel === 1) return 240;
        if (state.currentLevel === 2) return 200;
        if (state.currentLevel === 3) return 170;
        if (state.currentLevel === 4) return 140;
        return 110;
    }

    /**
     * Highly optimized, V-Sync synchronized unified loop handling both animations and 10 Hz flicker
     */
    startUnifiedRenderingLoop() {
        const s = Store.state;
        this.flankerPhaseOffset = 0;
        this.isFlickerOffState = false;

        let lastFrameTime = performance.now();
        let accumulatedTime = 0;
        let frameCount = 0;
        let optimalFrequencyCoeff = 0.062831853; // Balanced 10Hz coefficient default fallback

        const loop = (timestamp) => {
            // Guard: If calibration alignment test is toggled on, immediately suspend Gabor rendering
            if (this.isAnaglyphTestActive) {
                const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
                if (gl) {
                    gl.clearColor(0.498, 0.498, 0.498, 1.0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                }
                return; // Break the recursive animation frame loop to freeze GPU drawing during calibration
            }

            // Calculate highly stable, low-pass filtered Delta Time to prevent OS-level temporal judder
            let dt = timestamp - lastFrameTime;
            lastFrameTime = timestamp;

            // Clamp delta-time to avoid wild contrast jumps during system garbage collection freezes
            if (dt > 32.0) {
                dt = 16.67; // Fallback to steady 60Hz frame pacing
            }
            accumulatedTime += dt;

            // Dynamically estimate device refresh rate (Hz) over the first 15 frames to adapt the sine wave
            if (frameCount < 15) {
                frameCount++;
                if (frameCount === 15) {
                    const avgFrameDuration = accumulatedTime / 15;
                    const estimatedHz = Math.round(1000 / avgFrameDuration);
                    let detectedHz = 60;

                    if (estimatedHz >= 130) {
                        detectedHz = 144;
                    } else if (estimatedHz >= 90) {
                        detectedHz = 120;
                    } else {
                        detectedHz = 60;
                    }

                    // Perfect temporal alignment (12 frames per cycle rule to eliminate FRC matrix beats)
                    const targetFlickerHz = detectedHz / 12;
                    optimalFrequencyCoeff = (targetFlickerHz * 2.0 * Math.PI) / 1000;
                }
            }

            // 1. Safe phase advance clamped to 2*PI to prevent mobile GPU precision loss
            if (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) {
                this.flankerPhaseOffset = (this.flankerPhaseOffset + 0.12) % (2.0 * Math.PI);
            }

            // 2. High-precision Phase-Reversing Contrast Modulation (Bipolar Sine-Wave) calibrated to device refresh rate
            let activeContrast = s.autoContrast;
            if (s.isFlickerEnabled) {
                activeContrast = s.autoContrast * Math.sin(accumulatedTime * optimalFrequencyCoeff);
            }

            // 3. Render exactly once per frame buffer refresh (V-Sync)
            renderGabor(
                this.canvas, 
                this.ctx, 
                s, 
                this.currentAngleDeg, 
                activeContrast, 
                this.lastRandomFreq, 
                this.lastRandomSigma, 
                this.lastOffsetX, 
                this.lastOffsetY, 
                this.flankerPhaseOffset, 
                this.lastRandomAspectRatio, 
                false // hideCentral is locked to false, contrast modulation handles flicker natively
            );

            this.tracker.requestAnimationFrame(loop);
        };

        this.tracker.requestAnimationFrame(loop);
    }

    stopUnifiedRenderingLoop() {
        this.flankerPhaseOffset = 0;
        this.isFlickerOffState = false;
    }

    /**
     * Triggers repeated flashing sequence during milestone acquisitions or breaks
     */
    triggerMilestoneFlash(callback) {
        let count = 0;
        this.tracker.setInterval(() => {
            const isEven = count % 2 === 0;
            if (isEven) {
                this.flashOverlay.classList.add('flash-success');
                this.container.classList.add('success-pulse');
            } else {
                this.flashOverlay.classList.remove('flash-success');
                this.container.classList.remove('success-pulse');
            }
            count++;
            if (count >= 6) {
                this.tracker.clearAll();
                this.flashOverlay.classList.remove('flash-success');
                this.container.classList.remove('success-pulse');
                if (callback) callback();
            }
        }, 120);
    }
}