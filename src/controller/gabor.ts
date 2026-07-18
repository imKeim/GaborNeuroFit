/**
 * @file gabor.ts
 * @description Orchestrates the Finite State Machine (FSM) for Gabor perceptual learning trials.
 * Manages chronological trial sequences, orientation randomization, and real-time sensory 
 * feedback loops while ensuring asynchronous safety through strict state transitions.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import { AsyncResourceTracker } from '../utils/tracker';
import { renderGabor, drawFusionLockFrame } from '../engine/gabor-render';
import { playCue, playSuccess, playError, playSilverAward, playGoldAward } from '../engine/audio';
import { updateScoreboard, updateStatusBar, drawIdleState } from '../ui/screen';
import type { AppState } from '../types/clinical';

/** @description Available states for the Gabor trial life-cycle. */
export type TrialStateValue = 'IDLE' | 'PRE_CUE' | 'STIMULUS_ACTIVE' | 'AWAITING_INPUT' | 'FEEDBACK';

/** @description Enum-like dictionary of Gabor states. */
export const TrialState: Record<TrialStateValue, TrialStateValue> = {
    IDLE: 'IDLE',
    PRE_CUE: 'PRE_CUE',
    STIMULUS_ACTIVE: 'STIMULUS_ACTIVE',
    AWAITING_INPUT: 'AWAITING_INPUT',
    FEEDBACK: 'FEEDBACK'
};

/** @description Spatial frequency ranges mapped to difficulty levels. */
interface FrequencyRange { min: number; max: number; }
/** @description Gaussian envelope size ranges mapped to difficulty levels. */
interface SigmaRange { min: number; max: number; }

/** 
 * @clinical
 * Higher stages target higher spatial frequencies. 
 * Level 5 (0.17-0.24) pushes V1 neurons toward their maximum resolution limit.
 */
const levelFreqRanges: Record<number, FrequencyRange> = {
    1: { min: 0.03, max: 0.05 },
    2: { min: 0.05, max: 0.08 },
    3: { min: 0.08, max: 0.12 },
    4: { min: 0.12, max: 0.17 },
    5: { min: 0.17, max: 0.24 }
};

/** 
 * @clinical
 * Smaller sigma (Level 5) forces the brain to resolve orientations 
 * using a smaller foveal retinal area, reducing peripheral cues.
 */
const levelSigmaRanges: Record<number, SigmaRange> = {
    1: { min: 40, max: 50 },
    2: { min: 32, max: 40 },
    3: { min: 24, max: 31 },
    4: { min: 18, max: 23 },
    5: { min: 12, max: 17 }
};

/** @description Strict transition graph preventing illegal state jumps (e.g., IDLE -> FEEDBACK). */
const ALLOWED_TRANSITIONS: Record<string, TrialStateValue[]> = {
    'IDLE': ['PRE_CUE'],
    'PRE_CUE': ['STIMULUS_ACTIVE'],
    'STIMULUS_ACTIVE': ['AWAITING_INPUT', 'FEEDBACK'],
    'AWAITING_INPUT': ['PRE_CUE', 'FEEDBACK'],
    'FEEDBACK': ['IDLE']
};

/**
 * @description Controller managing Gabor trial logic and rendering coordination.
 */
export class GaborController {
    /** @description Current FSM state. Defaults to IDLE. */
    public currentState: TrialStateValue = TrialState.IDLE;
    /** @description Tracks and garbage-collects active timers and animation frames. */
    public tracker: AsyncResourceTracker = new AsyncResourceTracker();

    public currentAngleDeg: number = 0;
    public lastRandomFreq: number = 0.08;
    public lastRandomSigma: number = 40;
    public lastRandomAspectRatio: number = 1.0;
    public lastOffsetX: number = 0;
    public lastOffsetY: number = 0;
    private flankerPhaseOffset: number = 0;
    private autoNextTimeoutId: number | null = null;

    constructor(
        private canvas: HTMLCanvasElement,
        private overlayCanvas: HTMLCanvasElement,
        private overlayCtx: CanvasRenderingContext2D,
        private container: HTMLElement,
        private flashOverlay: HTMLElement,
        private btnStart: HTMLButtonElement,
        private getTranslations: () => Record<string, string>,
        private showCustomModal: (title: string, text: string) => void,
        private syncCross: () => void
    ) {}

    /** @description Aborts current trial by clearing timers and resetting state to IDLE. */
    abort(): void {
        this.tracker.clearAll();
        this.currentState = TrialState.IDLE;
        if (this.syncCross) this.syncCross();
    }

    /** @description Standardized idempotent teardown of the controller resources. */
    deactivate(): void {
        Store.updateState('isAnaglyphTestActive', false);
        this.stopUnifiedRenderingLoop();
        this.currentState = TrialState.IDLE;
        if (this.syncCross) this.syncCross();
    }

    /**
     * @description Attempts to move the FSM to a new state.
     * @param {TrialStateValue} nextState - The desired destination state.
     * @returns {boolean} True if transition succeeded, false if illegal jump was blocked.
     */
    transitionTo(nextState: TrialStateValue): boolean {
        const allowed = ALLOWED_TRANSITIONS[this.currentState];
        if (!allowed || !allowed.includes(nextState)) {
            return false;
        }
        this.currentState = nextState;
        if (nextState === TrialState.PRE_CUE || nextState === TrialState.FEEDBACK) {
            this.tracker.clearAll();
        }
        if (this.syncCross) this.syncCross();
        return true;
    }

    /**
     * @description Initiates a new training trial.
     * 
     * @clinical
     * Triggers the pre-cue auditory priming 180ms before visual stimulus onset
     * to reduce accommodative micro-fluctuations and prime V1 receptivity.
     */
    triggerTrial(): void {
        if (this.autoNextTimeoutId) {
            clearTimeout(this.autoNextTimeoutId);
            this.autoNextTimeoutId = null;
        }

        if (!this.transitionTo(TrialState.PRE_CUE)) return;

        Store.startTimerIfNeeded();

        this.btnStart.disabled = true;
        this.btnStart.innerText = "...";
        if (this.syncCross) this.syncCross();
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this._runRenderCycle(true);
        }, 180);
    }

    /**
     * @description Re-displays the current stimulus without regenerating randomized parameters.
     */
    reFlashCurrentGabor(): void {
        if (Store.state.isStaticEnabled) return;

        if (!this.transitionTo(TrialState.PRE_CUE)) return;

        this.btnStart.disabled = true;
        this.btnStart.innerText = this.getTranslations().nextBtn || "NEXT";
        if (this.syncCross) this.syncCross();
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this._runRenderCycle(false);
        }, 180);
    }

    /**
     * @description Core rendering orchestrator. Sets up WebGL parameters and initiates exposure.
     * 
     * @clinical
     * - Orientation Selectivity: excludes vertical angles (-15..+15 deg) to force distinct L/R differentiation.
     * - Ricco's Law (Spatial Summation): Automatically increases Gabor sigma when contrast drops below 12%
     *   to facilitate ultra-low threshold detection through area summation.
     */
    private _runRenderCycle(isNewTrial: boolean): void {
        const t = this.getTranslations();
        const s = Store.state;

        this.transitionTo(TrialState.STIMULUS_ACTIVE);

        if (s.isFlickerEnabled) {
            Store.updateState('isStaticEnabled', true);
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
                // Randomize tilt between -80 and +80 degrees
                this.currentAngleDeg = Math.floor(Math.random() * 160) - 80;
            } while (Math.abs(this.currentAngleDeg) < 15); // Disallow ambiguous vertical tilt

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
                // Clinical: Compensate for low visibility using Ricco's area summation logic
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

        const gaborStreakVal = document.getElementById('val-gabor-streak');
        const contrastEl = document.getElementById('current-contrast');
        const levelEl = document.getElementById('current-level');

        if (contrastEl) contrastEl.innerText = Math.round(s.autoContrast * 100).toString();
        if (levelEl) levelEl.innerText = s.currentLevel.toString();
        if (gaborStreakVal) gaborStreakVal.innerText = s.correctStreak.toString();

        renderGabor(this.canvas, null, s, this.currentAngleDeg, s.autoContrast, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, 0, this.lastRandomAspectRatio);

        const flashDuration = this.getFlashDuration(s);
        updateStatusBar(s, t);

        this.canvas.style.display = 'block';
        Store.updateState('isWaitingForAnswer', true);

        const curtain = document.getElementById('calibration-curtain');
        if (curtain) curtain.classList.remove('active');

        const isAnimating = (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) || s.isFlickerEnabled;

        if (isAnimating) {
            this.startUnifiedRenderingLoop(s);
        }

        if (!s.isStaticEnabled) {
            // Transient flash logic
            this.tracker.setTimeout(() => {
                this.stopUnifiedRenderingLoop();
                drawIdleState(this.canvas, null, this.overlayCanvas, this.overlayCtx, s.isFusionLockEnabled);
                this.btnStart.disabled = false;
                this.btnStart.innerText = t.reflashBtn || "RE-FLASH";
                this.transitionTo(TrialState.AWAITING_INPUT);
            }, flashDuration);
        } else {
            // Static/Flicker persistent logic
            this.btnStart.disabled = true;
            this.btnStart.innerText = "...";
            this.transitionTo(TrialState.AWAITING_INPUT);
        }
    }

    /**
     * @description Evaluates the user's orientation choice.
     * @param {'left' | 'right'} userChoice - Selected Gabor tilt.
     */
    submitAnswer(userChoice: 'left' | 'right'): void {
        if (this.currentState !== TrialState.AWAITING_INPUT && this.currentState !== TrialState.STIMULUS_ACTIVE) return;

        const s = Store.state;
        Store.updateState('isWaitingForAnswer', false);

        this.transitionTo(TrialState.FEEDBACK);

        const correctAnswer = this.currentAngleDeg < 0 ? 'left' : 'right';
        const isCorrect = (userChoice === correctAnswer);

        this.container.classList.remove('success-pulse', 'error-shake');
        this.flashOverlay.classList.remove('flash-success', 'flash-error');
        // Force browser reflow to reset CSS animations
        void this.container.offsetWidth;
        void this.flashOverlay.offsetWidth;

        Store.registerResult(isCorrect);

        if (isCorrect) {
            // Spatial Pan: reinforcing neural field mapping via directional auditory rewards
            const panValue = correctAnswer === 'left' ? -0.40 : 0.40;
            playSuccess(s.isMuted, panValue);
            this.flashOverlay.classList.add('flash-success');
            this.container.classList.add('success-pulse');
        } else {
            playError(s.isMuted);
            this.flashOverlay.classList.add('flash-error');
            this.container.classList.add('error-shake');
        }

        drawIdleState(this.canvas, null, this.overlayCanvas, this.overlayCtx, s.isFusionLockEnabled);

        this.btnStart.disabled = true;
        this.btnStart.innerText = this.getTranslations().nextBtn || "NEXT";
        if (this.syncCross) this.syncCross();

        this.tracker.setTimeout(() => {
            this.flashOverlay.classList.add('fade-out');
            this.container.classList.remove('success-pulse', 'error-shake');

            this.tracker.setTimeout(() => {
                this.flashOverlay.classList.remove('flash-success', 'flash-error', 'fade-out');
            }, 500);

            if (this.currentState === 'FEEDBACK') {
                this.transitionTo(TrialState.IDLE);
                if (!s.autoAdvance) {
                    this.btnStart.disabled = false;
                    this.btnStart.innerText = this.getTranslations().nextBtn || "NEXT";
                    if (this.syncCross) this.syncCross();
                }
            }
        }, 300);

        updateScoreboard(s, this.getTranslations());
        Store.saveSession();

        // Milestone Check: Stage 5 Mastery at 1% contrast
        const minContrastLimit = s.allowLowContrast ? 0.01 : 0.05;
        if (s.currentLevel === 5 && s.autoContrast <= minContrastLimit && s.correctStreak >= 12) {
            playGoldAward(s.isMuted); // Play majestic D-Major 9th gold chimes
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const t = this.getTranslations();
                    Store.resetSessionProgress();
                    Store.updateState('isCurtainActive', true);
                    this.btnStart.disabled = false;
                    this.btnStart.innerText = t.startBtn || "START FLASH";
                    this.showCustomModal(t.titleGold || "🥇 GaborNeuroFit", t.sessionMastered || "Mastered!");
                    this.transitionTo(TrialState.IDLE);
                });
            }, 400);
            return;
        }

        // Milestone Check: Daily Session Limit reached
        if (s.sessionLimit > 0 && s.total >= s.sessionLimit) {
            playSilverAward(s.isMuted); // Play elegant shimmering silver chimes
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const t = this.getTranslations();
                    Store.resetSessionProgress();
                    Store.updateState('isCurtainActive', true);
                    this.btnStart.disabled = false;
                    this.btnStart.innerText = t.startBtn || "START FLASH";
                    const text = (t.sessionCompleted || "Completed").replace("{limit}", s.sessionLimit.toString());
                    this.showCustomModal(t.titleSilver || "🥈 GaborNeuroFit", text);
                    this.transitionTo(TrialState.IDLE);
                });
            }, 400);
            return;
        }

        if (s.autoAdvance) {
            this.autoNextTimeoutId = this.tracker.setTimeout(() => {
                this.autoNextTimeoutId = null;
                this.triggerTrial();
            }, 900);
        }
    }

    /**
     * @description Calculates exposure duration mapped to stage difficulty.
     * @param {AppState} state - Global state reference.
     * @returns {number} Duration in milliseconds.
     */
    getFlashDuration(state: AppState): number {
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
     * @description Initiates high-performance animation frames for stroboscopic or phase-shifting stimuli.
     * @param {AppState} s - Global state reference.
     */
    startUnifiedRenderingLoop(s: AppState): void {
        this.flankerPhaseOffset = 0;
        const startTime = performance.now();
        const optimalFrequencyCoeff = 0.062831853; // Fixed 10Hz resonance coefficient

        const loop = (timestamp: number) => {
            const isAllowedToAnimate =
                this.currentState === TrialState.STIMULUS_ACTIVE ||
                (this.currentState === TrialState.AWAITING_INPUT && s.isStaticEnabled);

            if (!isAllowedToAnimate) return;

            if (Store.state.isAnaglyphTestActive) {
                // Clear GL buffer if calibration pattern is active
                const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
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
                // Alpha-resonance modulation at 10Hz
                centralContrast = s.autoContrast * Math.sin(elapsed * optimalFrequencyCoeff);
            }

            renderGabor(
                this.canvas,
                null,
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

    /** @description Stops the animation loop and purges active frames from the tracker. */
    stopUnifiedRenderingLoop(): void {
        this.flankerPhaseOffset = 0;
        this.tracker.clearAll();
    }

    /** @description Triggers visual celebration feedback for milestone achievements. */
    triggerMilestoneFlash(callback?: () => void): void {
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