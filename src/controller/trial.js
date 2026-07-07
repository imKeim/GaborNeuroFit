/*
 * GaborNeuroFit - Perceptual Learning Trial Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module orchestrates the state machine of individual visual training trials,
 * coupling dynamic stimulations with clean resource cleanup and state transition locks.
 */

import { Store } from '../store.js';
import { AsyncResourceTracker } from '../utils/tracker.js';
import { renderGabor, drawFusionLockFrame } from '../engine/gabor.js';
import { playCue, playSuccess, playError } from '../engine/audio.js';
import { updateScoreboard, updateStatusBar, drawIdleState } from '../ui/screen.js';

/**
 * @typedef {string} TrialStateValue
 */

/**
 * Finite State Machine declarations for strict visual execution tracking.
 * CLINICAL PURPOSE:
 * Enforces a rigid sequence of sensory events to prevent visual fatigue,
 * establish temporal predictability, and protect the patient from saccadic ocular cheats.
 * @type {Object.<string, string>}
 */
export const TrialState = {
    IDLE: 'IDLE',
    PRE_CUE: 'PRE_CUE',
    STIMULUS_ACTIVE: 'STIMULUS_ACTIVE',
    AWAITING_INPUT: 'AWAITING_INPUT',
    FEEDBACK: 'FEEDBACK'
};

/**
 * Optometric spatial frequency bands mapped to individual difficulty stages.
 * CLINICAL PURPOSE:
 * Higher stages represent finer sinusoidal grids (higher cycles per degree),
 * requiring greater visual acuity. This progressively targets smaller, 
 * higher-resolution receptive fields in the primary visual cortex (V1).
 * @type {Object.<number, FrequencyRange>}
 * @private
 */
const levelFreqRanges = {
    1: { min: 0.03, max: 0.05 },
    2: { min: 0.05, max: 0.08 },
    3: { min: 0.08, max: 0.12 },
    4: { min: 0.12, max: 0.17 },
    5: { min: 0.17, max: 0.24 }
};

/**
 * Gaussian envelope standard deviations (Sigma) mapping foveal focus fields.
 * CLINICAL PURPOSE:
 * Smaller sigmas compress the Gabor patch into a tighter space, forcing 
 * the patient to use the absolute center of the fovea (foveation). This counters 
 * eccentric fixation, which is common in deep amblyopia.
 * @type {Object.<number, SigmaRange>}
 * @private
 */
const levelSigmaRanges = {
    1: { min: 40, max: 50 },
    2: { min: 32, max: 40 },
    3: { min: 24, max: 31 },
    4: { min: 18, max: 23 },
    5: { min: 12, max: 17 }
};

/**
 * Strict state transition matrix to enforce safe clinical FSM flow.
 * CLINICAL PURPOSE:
 * Prevents rapid inputs, accidental re-triggering of visual pulses, and 
 * ensures that the auditory pre-cue always precedes the Gabor flash.
 * @type {Object.<TrialStateValue, TrialStateValue[]>}
 * @private
 */
const ALLOWED_TRANSITIONS = {
    [TrialState.IDLE]: [TrialState.PRE_CUE],
    [TrialState.PRE_CUE]: [TrialState.STIMULUS_ACTIVE],
    [TrialState.STIMULUS_ACTIVE]: [TrialState.AWAITING_INPUT, TrialState.FEEDBACK],
    [TrialState.AWAITING_INPUT]: [TrialState.PRE_CUE, TrialState.FEEDBACK],
    [TrialState.FEEDBACK]: [TrialState.IDLE]
};

/**
 * Controller class that manages the lifecycles, state machine, timers, 
 * and animations of active perceptual learning trials.
 */
export class TrialController {
    /**
     * @param {HTMLCanvasElement} canvas - The primary WebGL/2D Gabor stimulus canvas.
     * @param {CanvasRenderingContext2D|WebGLRenderingContext|null} context - The rendering context for the primary canvas.
     * @param {HTMLCanvasElement} overlayCanvas - The transparent HUD and fusion lock canvas.
     * @param {CanvasRenderingContext2D} overlayContext - The rendering context for the overlay canvas.
     * @param {HTMLElement} cross - The central fixation cross DOM element.
     * @param {HTMLElement} container - The wrapper container enclosing the workspaces.
     * @param {HTMLElement} flashOverlay - Fullscreen color overlay for tactile success/error feedback.
     * @param {HTMLButtonElement} btnStart - The primary action/reflash trigger button.
     * @param {function(): Object} translationsGetter - Callback function returning the active localization bundle.
     */
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

        /** 
         * @type {TrialStateValue} 
         * @public
         */
        this.currentState = TrialState.IDLE;
        
        /** 
         * @type {AsyncResourceTracker} 
         * @public
         */
        this.tracker = new AsyncResourceTracker();

        /** @type {number} */
        this.currentAngleDeg = 0;
        /** @type {number} */
        this.lastRandomFreq = 0.08;
        /** @type {number} */
        this.lastRandomSigma = 40;
        /** @type {number} */
        this.lastRandomAspectRatio = 1.0;
        /** @type {number} */
        this.lastOffsetX = 0;
        /** @type {number} */
        this.lastOffsetY = 0;
        /** @type {number} */
        this.flankerPhaseOffset = 0;

        /** @type {boolean} */
        this.isAnaglyphTestActive = false;
        /** @type {boolean} */
        this.isFlickerOffState = false;
    }

    /**
     * Instantly aborts the current session, resetting the state machine and clearing active asynchronous operations.
     * CLINICAL PURPOSE:
     * Clears physical GPU/CPU cycles immediately when the user exits to the settings menu, 
     * preventing delayed stimulus presentation from causing accidental visual overstimulation.
     * @returns {void}
     */
    abort() {
        this.tracker.clearAll();
        this.currentState = TrialState.IDLE;
        this.isFlickerOffState = false;
    }

    /**
     * Validates and executes state transitions within the finite state machine.
     * CLINICAL PURPOSE:
     * Destructively clears active timers on transitional boundaries. This guarantees 
     * that a delayed feedback timer cannot trigger after a new trial has already begun,
     * protecting the patient from conflicting visual cues.
     * @param {TrialStateValue} nextState - The target state to transition to.
     * @returns {boolean} True if the transition was successful and committed, false otherwise.
     */
    transitionTo(nextState) {
        const allowed = ALLOWED_TRANSITIONS[this.currentState];
        if (!allowed || !allowed.includes(nextState)) {
            return false;
        }

        this.currentState = nextState;
        this.isFlickerOffState = false;
        
        if (nextState === TrialState.PRE_CUE || nextState === TrialState.FEEDBACK) {
            this.tracker.clearAll();
        }
        return true;
    }

    /**
     * Triggers the auditory cue and schedules the initial render cycle of a new visual trial.
     * CLINICAL PURPOSE:
     * Executes an acoustic pre-cue click exactly 180ms before the visual flash.
     * In neurobiology, this cross-modal sensory pre-activation (auditory-to-visual) 
     * primes the attention networks in the visual cortex, preparing receptive fields 
     * to decode the target, and suppressing ciliary muscle accommodation micro-fluctuations.
     * @returns {void}
     */
    triggerTrial() {
        if (!this.transitionTo(TrialState.PRE_CUE)) {
            return;
        }

        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this._runRenderCycle(true);
        }, 180);
    }

    /**
     * Re-exposes the parameters of the active trial without generating a new Gabor patch configuration.
     * CLINICAL PURPOSE:
     * Allows the amblyopic eye to re-examine the exact same spatial attributes if the patient 
     * missed the transient flash, preventing frustration and stabilizing the adaptive staircase loop.
     * @returns {void}
     */
    reFlashCurrentGabor() {
        if (!this.transitionTo(TrialState.PRE_CUE)) {
            return; 
        }

        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this._runRenderCycle(false);
        }, 180);
    }

    /**
     * Formulates Gabor parameters, resizes backing stores, renders the canvas frame, 
     * and sets up the exposure duration lifecycles.
     * CLINICAL PURPOSE:
     * Performs spatial summation scaling at extremely low contrast values (if contrast is below 12%,
     * the Gaussian sigma is expanded). This recruits wider neural networks in the visual cortex 
     * to help decode faint, sub-threshold signals, maximizing synaptic plasticity.
     * @param {boolean} isNewTrial - If true, randomizes new Gabor parameters. If false, preserves existing parameters.
     * @returns {void}
     * @private
     */
    _runRenderCycle(isNewTrial) {
        const t = this.getTranslations();
        const s = Store.state;

        this.transitionTo(TrialState.STIMULUS_ACTIVE);

        if (s.isFlickerEnabled) {
            s.isStaticEnabled = true;
        }

        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const physicalSize = Math.min(1024, Math.round(rect.width * dpr));

        if (this.canvas.width !== physicalSize) {
            this.canvas.width = physicalSize;
            this.canvas.height = physicalSize;
            this.overlayCanvas.width = physicalSize;
            this.overlayCanvas.height = physicalSize;
        }

        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        if (s.isFusionLockEnabled) {
            const scale = this.canvas.width / 256.0;
            drawFusionLockFrame(this.overlayCanvas, this.overlayCtx, scale);
        }

        if (isNewTrial) {
            do {
                this.currentAngleDeg = Math.floor(Math.random() * 160) - 80;
            } while (Math.abs(this.currentAngleDeg) < 15);

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

            const summationThreshold = 0.12;
            if (s.autoContrast < summationThreshold) {
                const summationMultiplier = 1.0 + (summationThreshold - s.autoContrast) * 3.0;
                this.lastRandomSigma = this.lastRandomSigma * summationMultiplier;
            }

            this.lastOffsetX = 0;
            this.lastOffsetY = 0;
            if (s.isPeripheralEnabled) {
                const angle = Math.random() * 2 * Math.PI;
                const distance = 55;
                this.lastOffsetX = Math.cos(angle) * distance;
                this.lastOffsetY = Math.sin(angle) * distance;
            }
        }

        document.getElementById('current-contrast').innerText = Math.round(s.autoContrast * 100);
        document.getElementById('current-level').innerText = s.currentLevel;
        document.getElementById('current-streak').innerText = s.correctStreak;

        let crossSize = 36;
        if (s.currentLevel === 1) crossSize = 36;
        else if (s.currentLevel === 2) crossSize = 28;
        else if (s.currentLevel === 3) crossSize = 22;
        else if (s.currentLevel === 4) crossSize = 16;
        else if (s.currentLevel === 5) crossSize = 12;
        this.cross.style.fontSize = crossSize + 'px';

        renderGabor(this.canvas, this.ctx, s, this.currentAngleDeg, s.autoContrast, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, 0, this.lastRandomAspectRatio);

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
     * Evaluates user directional choice, registers the outcome, and executes visual/acoustic feedback.
     * CLINICAL PURPOSE:
     * Drives synaptic plasticity through immediate reinforcement learning. 
     * Positive feedback (crystalline major chords) triggers dopaminergic pathways 
     * to consolidate visual memory, while negative feedback (low-frequency sweeps) 
     * alerts attention networks to recalibrate orientation judgment.
     * @param {string} userChoice - The user's input answer direction ('left' or 'right').
     * @returns {void}
     */
    submitAnswer(userChoice) {
        if (this.currentState !== TrialState.AWAITING_INPUT && this.currentState !== TrialState.STIMULUS_ACTIVE) {
            return;
        }

        const s = Store.state;
        Store.state.isWaitingForAnswer = false;

        this.transitionTo(TrialState.FEEDBACK);
        this.cross.style.display = 'block';

        const correctAnswer = this.currentAngleDeg < 0 ? 'left' : 'right';
        const isCorrect = (userChoice === correctAnswer);

        this.container.classList.remove('success-pulse', 'error-shake');
        this.flashOverlay.classList.remove('flash-success', 'flash-error');
        void this.container.offsetWidth; 
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

        this.tracker.setTimeout(() => {
            this.flashOverlay.classList.add('fade-out');
            this.container.classList.remove('success-pulse', 'error-shake');
            
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
            this.currentState = TrialState.IDLE;
        }
    }

    /**
     * Resolves the current target exposure duration mapped to active Stage constraints.
     * CLINICAL PURPOSE:
     * Limits visual exposure to extremely short durations (110ms-240ms). 
     * Since an eye movement (saccade) requires ~200ms to plan and execute, 
     * rapid flashes physically prevent the patient from moving their eye to "cheat" 
     * and align the stimulus with a healthier, non-amblyopic area of the retina.
     * @param {Object} state - The global store state representation.
     * @returns {number} The flash duration in milliseconds.
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
     * Highly optimized, V-Sync synchronized unified loop handling both animations and 10 Hz flicker.
     * Engineered for absolute stability across 60Hz, 120Hz, and 144Hz+ displays.
     * CLINICAL PURPOSE:
     * Modulates Gabor contrast smoothly across a time-independent 10 Hz sine wave.
     * Merging time-locked calculations with the monitor's natural refresh rate prevents
     * spatial-temporal clashing and eye fatigue, while maintaining the steady-state 
     * cortical resonance (SSVEP) necessary to bypass dominant-eye suppression.
     * @returns {void}
     */
    startUnifiedRenderingLoop() {
        const s = Store.state;
        this.flankerPhaseOffset = 0;
        this.isFlickerOffState = false;

        const startTime = performance.now();
        const optimalFrequencyCoeff = 0.062831853; 

        const loop = (timestamp) => {
            if (this.isAnaglyphTestActive) {
                const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
                if (gl) {
                    gl.clearColor(0.498, 0.498, 0.498, 1.0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                }
                return; 
            }

            const elapsed = timestamp - startTime;

            if (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) {
                this.flankerPhaseOffset = (elapsed * 0.0072) % (2.0 * Math.PI);
            }

            let centralContrast = s.autoContrast;
            let flankerContrast = s.autoContrast;

            if (s.isFlickerEnabled) {
                centralContrast = s.autoContrast * Math.sin(elapsed * optimalFrequencyCoeff);
            }

            renderGabor(
                this.canvas, 
                this.ctx, 
                s, 
                this.currentAngleDeg, 
                centralContrast,
                flankerContrast,
                this.lastRandomFreq, 
                this.lastRandomSigma, 
                this.lastOffsetX, 
                this.lastOffsetY, 
                this.flankerPhaseOffset, 
                this.lastRandomAspectRatio, 
                false
            );

            this.tracker.requestAnimationFrame(loop);
        };

        this.tracker.requestAnimationFrame(loop);
    }

    /**
     * Stops the animation rendering loops cleanly and resets cached variables.
     * CLINICAL PURPOSE:
     * Safely halts active GPU cycles when the stimulus exposure ends, 
     * allowing the photoreceptors of the retina to rest during the decision-making phase.
     * @returns {void}
     */
    stopUnifiedRenderingLoop() {
        this.flankerPhaseOffset = 0;
        this.isFlickerOffState = false;
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
}