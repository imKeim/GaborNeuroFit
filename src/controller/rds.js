/*
 * GaborNeuroFit - Stereopsis (RDS) Perceptual Learning Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module orchestrates the state machine and adaptive staircase of active
 * Random Dot Stereogram (RDS) trials, driving global stereopsis depth rehabilitation.
 */

import { Store } from '../store.js';
import { DataRepository } from '../store/repository.js';
import { AsyncResourceTracker } from '../utils/tracker.js';
import { drawRandomDotStereogram } from '../engine/rds_render.js';
import { playCue, playSuccess, playError } from '../engine/audio.js';
import { updateScoreboard, drawIdleState } from '../ui/screen.js';

/**
 * @typedef {string} RdsStateValue
 */

/**
 * Finite State Machine declarations for RDS binocular stimulation cycles.
 * @type {Object.<string, string>}
 */
export const RdsState = {
    IDLE: 'IDLE',
    PRE_CUE: 'PRE_CUE',
    STIMULUS_ACTIVE: 'STIMULUS_ACTIVE',
    AWAITING_INPUT: 'AWAITING_INPUT',
    FEEDBACK: 'FEEDBACK'
};

/**
 * Strict state transition matrix to enforce safe clinical FSM flow.
 * @type {Object.<RdsStateValue, RdsStateValue[]>}
 * @private
 */
const ALLOWED_TRANSITIONS = {
    [RdsState.IDLE]: [RdsState.PRE_CUE],
    [RdsState.PRE_CUE]: [RdsState.STIMULUS_ACTIVE],
    [RdsState.STIMULUS_ACTIVE]: [RdsState.AWAITING_INPUT, RdsState.FEEDBACK],
    [RdsState.AWAITING_INPUT]: [RdsState.FEEDBACK],
    [RdsState.FEEDBACK]: [RdsState.IDLE]
};

export class RdsController {
    /**
     * @param {HTMLCanvasElement} canvas - The primary WebGL canvas (cleared to gray during RDS).
     * @param {HTMLCanvasElement} overlayCanvas - The transparent 2D canvas (renders the dot stereogram).
     * @param {CanvasRenderingContext2D} overlayCtx - Rendering context for the overlay canvas.
     * @param {HTMLElement} cross - The central fixation cross.
     * @param {HTMLElement} container - The workspace container.
     * @param {HTMLElement} flashOverlay - Fullscreen color overlay for success/error feedback.
     * @param {HTMLButtonElement} btnStart - The primary action/start button.
     * @param {function(): Object} translationsGetter - Callback returning the active localization bundle.
     * @param {function(string, string): void} showCustomModal - Modal alert callback.
     */
    constructor(canvas, overlayCanvas, overlayCtx, cross, container, flashOverlay, btnStart, translationsGetter, showCustomModal, syncCrossCallback) {
        this.canvas = canvas;
        this.overlayCanvas = overlayCanvas;
        this.overlayCtx = overlayCtx;
        this.cross = cross;
        this.container = container;
        this.flashOverlay = flashOverlay;
        this.btnStart = btnStart;
        this.getTranslations = translationsGetter;
        this.showCustomModal = showCustomModal;
        this.syncCross = syncCrossCallback;

        /** @type {RdsStateValue} */
        this.currentState = RdsState.IDLE;

        /** @type {AsyncResourceTracker} */
        this.tracker = new AsyncResourceTracker();
    }

    /**
     * Instantly aborts the active session and clears scheduled timers.
     */
    abort() {
        this.tracker.clearAll();
        this.currentState = RdsState.IDLE;
        if (this.syncCross) this.syncCross();
    }

    /**
     * Safely halts active animation loops without resetting the active trial state
     */
    pause() {
        this.tracker.clearAll();
    }

    /**
     * Validates and executes state transitions within the finite state machine.
     * @param {RdsStateValue} nextState - The target state.
     * @returns {boolean} True if transition succeeded, false otherwise.
     */
    transitionTo(nextState) {
        const allowed = ALLOWED_TRANSITIONS[this.currentState];
        if (!allowed || !allowed.includes(nextState)) {
            return false;
        }

        this.currentState = nextState;
        if (nextState === RdsState.PRE_CUE || nextState === RdsState.FEEDBACK) {
            this.tracker.clearAll();
        }
        if (this.syncCross) this.syncCross();
        return true;
    }

    /**
     * Initializes a brand new RDS session block.
     * Resets scoring counters and forces starting disparity.
     */
    initSession() {
        const s = Store.state;
        const t = this.getTranslations();
        this.abort();
        Store.updateState('rdsDisparity', s.rdsStartDisparity);
        Store.updateState('rdsScore', 0);
        Store.updateState('rdsTotal', 0);
        Store.updateState('rdsStreak', 0);
        Store.updateState('rdsStaircaseStreak', 0);
        Store.updateState('rdsHistory', []);
        
        // Restore button states
        this.btnStart.disabled = false;
        this.btnStart.style.opacity = '1';
        this.btnStart.innerText = t.rdsStartBtn || "START";
        
        // Render flat neutral noise with no hidden shape on session start to act as a neutral baseline
        drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, true, true);
        
        if (this.syncCross) this.syncCross();
    }

    /**
     * Triggers the auditory pre-cue and schedules the stereogram generation.
     */
    triggerTrial() {
        // Clear any pending auto-advance timeout to prevent double-firing
        if (this.autoNextTimeoutId) {
            clearTimeout(this.autoNextTimeoutId);
            this.tracker.timeouts.delete(this.autoNextTimeoutId);
            this.autoNextTimeoutId = null;
        }

        if (!this.transitionTo(RdsState.PRE_CUE)) {
            return;
        }

        // Start global Pomodoro tracking as soon as RDS trial is initiated
        Store.startTimerIfNeeded();

        this.btnStart.disabled = true;
        this.btnStart.style.opacity = "0.4";
        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this.runRenderCycle();
        }, 180);
    }

    /**
     * Randomizes the target position, generates 3D disparity, and renders the stereogram.
     */
    runRenderCycle() {
        const s = Store.state;
        const t = this.getTranslations();

        this.transitionTo(RdsState.STIMULUS_ACTIVE);

        // Symmetrically set active trial waiting lock
        Store.updateState('isWaitingForAnswer', true);

        // Pick a random horizontal target half for the hidden 3D square
        const targetSide = Math.random() < 0.5 ? 'left' : 'right';
        Store.updateState('rdsTargetSide', targetSide);

        // Calculate safe vertical displacement boundaries (prevent edge clipping & foveal halo overlaps)
        const dotSize = s.rdsDotSize || 4;
        const rows = Math.floor(256 / dotSize);
        const squareSize = Math.floor(rows * 0.375);
        const halfSquare = Math.floor(squareSize / 2);
        const maxOffset = Math.floor(rows / 2) - halfSquare - 2;

        let targetY = 0;
        if (s.rdsRandomizeVertical && maxOffset > 0) {
            targetY = Math.floor(Math.random() * (2 * maxOffset + 1)) - maxOffset;
        }
        Store.updateState('rdsTargetY', targetY);

        // Ensure canvas backing store matches display constraints cleanly
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const physicalSize = Math.min(1024, Math.round(rect.width * dpr));
        if (this.canvas.width !== physicalSize) {
            this.canvas.width = physicalSize;
            this.canvas.height = physicalSize;
            this.overlayCanvas.width = physicalSize;
            this.overlayCanvas.height = physicalSize;
        }

        // Clear WebGL canvas to neutral gray background, keeping our canvas layout neat
        drawIdleState(this.canvas, null, this.overlayCanvas, this.overlayCtx, false);

        if (this.syncCross) this.syncCross();

        this.transitionTo(RdsState.AWAITING_INPUT);
        
        // Start the Dynamic RDS Loop if enabled, otherwise render a single static frame
        if (s.rdsIsDynamic) {
            this.startDynamicRdsLoop();
        } else {
            drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, true, false);
        }
        
        // Symmetrically force-disable the start button as "..." to prevent manual re-rolling (cheating)
        this.btnStart.disabled = true;
        this.btnStart.style.opacity = '0.4';
        this.btnStart.innerText = "...";
    }

    /**
     * Evaluates user choice, updates adaptive staircase, and logs session blocks.
     * @param {string} userChoice - 'left' or 'right'
     */
    submitAnswer(userChoice) {
        if (this.currentState !== RdsState.AWAITING_INPUT) {
            return;
        }

        const s = Store.state;
        const t = this.getTranslations();
        this.transitionTo(RdsState.FEEDBACK);

        // Reset active trial waiting lock on answer submission
        Store.updateState('isWaitingForAnswer', false);

        const isCorrect = (userChoice === s.rdsTargetSide);

        // Re-enable and restore button states for the feedback phase
        this.btnStart.disabled = false;
        this.btnStart.style.opacity = '1';

        this.container.classList.remove('success-pulse', 'error-shake');
        this.flashOverlay.classList.remove('flash-success', 'flash-error');
        void this.container.offsetWidth; // Force CSS reflow
        void this.flashOverlay.offsetWidth;

        let newScore = s.rdsScore;
        let newTotal = s.rdsTotal + 1;
        let newStreak = s.rdsStreak;
        let newStaircaseStreak = s.rdsStaircaseStreak;
        let newDisparity = s.rdsDisparity;

        const activeHistory = [...s.rdsHistory];

        if (isCorrect) {
            const panValue = s.rdsTargetSide === 'left' ? -0.75 : 0.75;
            playSuccess(s.isMuted, panValue);
            this.flashOverlay.classList.add('flash-success');
            this.container.classList.add('success-pulse');

            newScore++;
            newStreak++;
            newStaircaseStreak++;
            activeHistory.push(1);

            if (newStaircaseStreak >= 3) {
                if (newDisparity > 1) {
                    newDisparity--;
                }
                newStaircaseStreak = 0;
            }
        } else {
            playError(s.isMuted);
            this.flashOverlay.classList.add('flash-error');
            this.container.classList.add('error-shake');

            newStreak = 0;
            newStaircaseStreak = 0;
            activeHistory.push(0);

            if (newDisparity < 8) {
                newDisparity++;
            }
        }

        if (activeHistory.length > 20) activeHistory.shift();

        let newLevel = 1;
        if (newDisparity <= 8 && newDisparity >= 7) newLevel = 1;
        else if (newDisparity <= 6 && newDisparity >= 5) newLevel = 2;
        else if (newDisparity <= 4 && newDisparity >= 3) newLevel = 3;
        else if (newDisparity === 2) newLevel = 4;
        else if (newDisparity === 1) newLevel = 5;

        Store.updateState('rdsScore', newScore);
        Store.updateState('rdsTotal', newTotal);
        Store.updateState('rdsStreak', newStreak);
        Store.updateState('rdsStaircaseStreak', newStaircaseStreak);
        Store.updateState('rdsDisparity', newDisparity);
        Store.updateState('rdsLevel', newLevel);
        Store.updateState('rdsHistory', activeHistory);

        this.saveRdsSession();

        this.btnStart.disabled = true;
        this.btnStart.style.opacity = "0.4";
        this.btnStart.innerText = "...";

        this.tracker.setTimeout(() => {
            this.flashOverlay.classList.add('fade-out');
            this.container.classList.remove('success-pulse', 'error-shake');

            this.tracker.setTimeout(() => {
                this.flashOverlay.classList.remove('flash-success', 'flash-error', 'fade-out');
            }, 500);

            // Symmetrically flatten the 3D target shape (hide it) but retain the background random dots during the rest phase
            drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, false, true);

            if (this.currentState === RdsState.FEEDBACK) {
                this.currentState = RdsState.IDLE;
                
                if (this.syncCross) this.syncCross();
                
                this.btnStart.disabled = false;
                this.btnStart.style.opacity = "1";
                this.btnStart.innerText = t.rdsNextBtn || "NEXT";
            }
        }, 300);

        updateScoreboard(Store.state, t);

        // Gold Medal Validation (Micro-stereopsis limit reached & held)
        if (newLevel === 5 && newDisparity === 1 && newStreak >= 12) {
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const title = t.titleGoldRDS || "🥇 Stereopsis Mastered!";
                    const text = t.sessionMasteredRDS || "Excellent progress!";
                    this.showCustomModal(title, text);
                    this.transitionTo(RdsState.IDLE);
                    if (this.syncCross) this.syncCross(); // Symmetrically reset foveal halo on session completion
                });
            }, 400);
            return;
        }

        // Silver Medal Validation (Session Limit Reached)
        if (s.rdsSessionLimit > 0 && newTotal >= s.rdsSessionLimit) {
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const title = t.titleSilverRDS || "🥈 RDS Session Complete!";
                    const text = (t.sessionCompletedRDS || "Session complete!").replace("{limit}", s.rdsSessionLimit);
                    this.showCustomModal(title, text);
                    this.transitionTo(RdsState.IDLE);
                    if (this.syncCross) this.syncCross(); // Symmetrically reset foveal halo on session completion
                });
            }, 400);
            return;
        }

        if (s.rdsAutoAdvance) {
            this.autoNextTimeoutId = this.tracker.setTimeout(() => {
                this.autoNextTimeoutId = null;
                this.triggerTrial();
            }, 1200);
        }
    }

    /**
     * Triggers a repeated flashing sequence during milestone acquisitions or breaks.
     * CLINICAL PURPOSE:
     * Provides a highly visible, rhythmic visual trigger to indicate block mastery,
     * encouraging patient engagement and reinforcing progress during long training regimens.
     * @param {function(): void} callback - The callback function to execute after the flash sequence is completed.
     * @returns {void}
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

    /**
     * High-Performance Unified Dynamic RDS Animation Loop
     * Generates and renders a "boiling noise" grid continuously at ~18Hz
     * to completely block any stroboscopic monocular cues or cheating.
     * @private
     */
    startDynamicRdsLoop() {
        const s = Store.state;
        let lastUpdateTime = 0;
        const frameInterval = 55; // Update noise every 55ms (~18Hz) to prevent visual fatigue
        const startTime = performance.now();

        // SSoT Stateless Triangular-Wave DVD Screensaver bouncing helper
        const getBounceOffset = (elapsed, period, amplitude) => {
            const t = (elapsed / period) % 1.0;
            if (t < 0.5) {
                return -amplitude + (t / 0.5) * (2 * amplitude);
            } else {
                return amplitude - ((t - 0.5) / 0.5) * (2 * amplitude);
            }
        };

        const loop = (timestamp) => {
            const isAllowedToAnimate = 
                this.currentState === RdsState.STIMULUS_ACTIVE || 
                this.currentState === RdsState.AWAITING_INPUT;

            if (!isAllowedToAnimate) {
                return;
            }

            const elapsed = timestamp - startTime;

            if (s.rdsIsFloating) {
                const dotSize = s.rdsDotSize || 4;
                const rows = Math.floor(256 / dotSize);
                const squareSize = Math.floor(rows * 0.28); // Symmetrically smaller 28% size inside tracking mode
                const halfSquare = Math.floor(squareSize / 2);

                // Max safe amplitudes within half-screen and top/bottom boundaries
                const amplitudeX = Math.max(1, Math.floor(rows * 0.09)); 
                const amplitudeY = Math.max(1, Math.floor(rows / 2) - halfSquare - 2);

                // Dynamically scale period durations based on selected speed setting to alter velocity smoothly
                const speedCoeffs = { slow: 1.5, medium: 1.0, fast: 0.6 };
                const coeff = speedCoeffs[s.rdsFloatSpeed] || 1.0;
                const periodX = 4800 * coeff;
                const periodY = 7100 * coeff;

                // Coprime periodic oscillations prevent trajectory repetitions (satisfying diagonal DVD paths)
                const driftX = Math.round(getBounceOffset(elapsed, periodX, amplitudeX));
                const driftY = Math.round(getBounceOffset(elapsed, periodY, amplitudeY));

                Store.updateState('rdsDriftX', driftX);
                Store.updateState('rdsDriftY', driftY);
            } else {
                Store.updateState('rdsDriftX', 0);
                Store.updateState('rdsDriftY', 0);
            }

            if (timestamp - lastUpdateTime >= frameInterval) {
                lastUpdateTime = timestamp;
                // Force-shuffle the noise grid with each render cycle
                drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, true);
            } else if (s.rdsIsFloating) {
                // Render sub-pixel drift frames smoothly at 60fps without wasteful CPU noise regenerations
                drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, false);
            }

            this.tracker.requestAnimationFrame(loop);
        };

        this.tracker.requestAnimationFrame(loop);
    }

    /**
     * Helper to serialize and save active RDS session to local database.
     * @private
     */
    saveRdsSession() {
        const s = Store.state;
        if (s.rdsTotal === 0) return;
        DataRepository.saveSession({
            sessionId: s.sessionId,
            score: s.rdsScore,
            total: s.rdsTotal,
            level: s.rdsLevel,
            contrast: 0,
            protocol: 'rds',
            speed: 'adaptive',
            isAnaglyph: s.isAnaglyphEnabled,
            balance: s.strongEyeContrastFactor,
            lazyEyeSide: s.lazyEyeSide,
            rdsDotSize: s.rdsDotSize,
            rdsDensity: s.rdsDensity,
            rdsDisparity: s.rdsDisparity
        });
    }
}