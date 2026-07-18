/**
 * @file rds.ts
 * @description Controller orchestrating Finite State Machine (FSM) for Stereopsis (RDS) trials.
 * Manages chronological sequences of binocular disparity tasks, psychometric staircase scaling, 
 * and dynamic 18Hz boiling noise cycles to isolate depth decoding in the V2 visual cortex.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import { DataRepository } from '../store/repository';
import { AsyncResourceTracker } from '../utils/tracker';
import { drawRandomDotStereogram } from '../engine/rds-render';
import { playCue, playSuccess, playError, playSilverAward, playGoldAward } from '../engine/audio';
import { updateScoreboard, drawIdleState } from '../ui/screen';
import type { EyeSide } from '../types/clinical';

/** @description Valid states for the RDS trial lifecycle. */
export type RdsStateValue = 'IDLE' | 'PRE_CUE' | 'STIMULUS_ACTIVE' | 'AWAITING_INPUT' | 'FEEDBACK';

/** @description Enum-like dictionary of RDS states. */
export const RdsState: Record<RdsStateValue, RdsStateValue> = {
    IDLE: 'IDLE',
    PRE_CUE: 'PRE_CUE',
    STIMULUS_ACTIVE: 'STIMULUS_ACTIVE',
    AWAITING_INPUT: 'AWAITING_INPUT',
    FEEDBACK: 'FEEDBACK'
};

/** @description Strict transition rules preventing asynchronous logic violations. */
const ALLOWED_TRANSITIONS: Record<string, RdsStateValue[]> = {
    'IDLE': ['PRE_CUE'],
    'PRE_CUE': ['STIMULUS_ACTIVE'],
    'STIMULUS_ACTIVE': ['AWAITING_INPUT', 'FEEDBACK'],
    'AWAITING_INPUT': ['FEEDBACK'],
    'FEEDBACK': ['IDLE']
};

/**
 * @description Main controller for Stereogram training blocks.
 */
export class RdsController {
    /** @description Current FSM state. Defaults to IDLE. */
    public currentState: RdsStateValue = RdsState.IDLE;
    /** @description Centralized resource tracker for safe async cleanup. */
    public tracker: AsyncResourceTracker = new AsyncResourceTracker();
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

    /** @description Forcefully resets the controller to IDLE and clears pending timers. */
    abort(): void {
        this.tracker.clearAll();
        this.currentState = RdsState.IDLE;
        if (this.syncCross) this.syncCross();
    }

    /** @description Pauses the controller without resetting the state machine. */
    pause(): void {
        this.tracker.clearAll();
    }

    /** @description Idempotent teardown method for mode switching. */
    deactivate(): void {
        this.tracker.clearAll();
        this.currentState = RdsState.IDLE;
        if (this.syncCross) this.syncCross();
    }

    /**
     * @description Attempts a safe FSM state mutation.
     * @param {RdsStateValue} nextState - Target state.
     * @returns {boolean} Success status.
     */
    transitionTo(nextState: RdsStateValue): boolean {
        const allowed = ALLOWED_TRANSITIONS[this.currentState];
        if (!allowed || !allowed.includes(nextState)) return false;

        this.currentState = nextState;
        if (nextState === RdsState.PRE_CUE || nextState === RdsState.FEEDBACK) {
            this.tracker.clearAll();
        }
        if (this.syncCross) this.syncCross();
        return true;
    }

    /**
     * @description Initializes a fresh RDS session block.
     * 
     * @clinical 
     * Resets disparity to the starting value and clears streaks to allow 
     * neural adaptation at the configured threshold.
     */
    initSession(): void {
        const s = Store.state;
        const t = this.getTranslations();
        this.abort();
        Store.updateState('rdsDisparity', s.rdsStartDisparity);
        Store.updateState('rdsScore', 0);
        Store.updateState('rdsTotal', 0);
        Store.updateState('rdsStreak', 0);
        Store.updateState('rdsStaircaseStreak', 0);
        Store.updateState('rdsHistory', [] as number[]);

        this.btnStart.disabled = false;
        this.btnStart.innerText = t.rdsStartBtn || "START";

        drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, true, true);
        if (this.syncCross) this.syncCross();
    }

    /**
     * @description Triggers a single RDS trial with auditory priming.
     */
    triggerTrial(): void {
        if (this.autoNextTimeoutId) {
            clearTimeout(this.autoNextTimeoutId);
            this.autoNextTimeoutId = null;
        }

        if (!this.transitionTo(RdsState.PRE_CUE)) return;

        Store.startTimerIfNeeded();

        this.btnStart.disabled = true;
        this.btnStart.innerText = "...";
        if (this.syncCross) this.syncCross();
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this.runRenderCycle();
        }, 180);
    }

    /**
     * @description Core rendering logic for the hidden 3D target.
     * 
     * @mathematical
     * Randomizes target side (Left/Right) and optionally vertical offset (rdsTargetY).
     * Calculates safe bounds to prevent the 3D square from clipping outside the virtual 256px grid.
     */
    runRenderCycle(): void {
        const s = Store.state;
        this.transitionTo(RdsState.STIMULUS_ACTIVE);

        Store.updateState('isWaitingForAnswer', true);

        const targetSide: EyeSide = Math.random() < 0.5 ? 'left' : 'right';
        Store.updateState('rdsTargetSide', targetSide);

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

        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const physicalSize = Math.min(1024, Math.round(rect.width * dpr));
        if (this.canvas.width !== physicalSize) {
            this.canvas.width = physicalSize;
            this.canvas.height = physicalSize;
            this.overlayCanvas.width = physicalSize;
            this.overlayCanvas.height = physicalSize;
        }

        drawIdleState(this.canvas, null, this.overlayCanvas, this.overlayCtx, false);

        if (this.syncCross) this.syncCross();

        this.transitionTo(RdsState.AWAITING_INPUT);

        if (s.rdsIsDynamic) {
            this.startDynamicRdsLoop();
        } else {
            drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, true, false);
        }

        this.btnStart.disabled = true;
        this.btnStart.innerText = "...";
    }

    /**
     * @description Processes user answer and modulates disparity staircase.
     * 
     * @clinical 
     * - Success: Increments staircase streak. 3 correct decodings decrease disparity (harder).
     * - Error: Resets streaks and increases disparity (easier).
     * - Threshold: Achieving 1px disparity demonstrates excellent micro-stereopsis resolution (~20 arcsec).
     * 
     * @param {EyeSide} userChoice - User's perceived target location.
     */
    submitAnswer(userChoice: EyeSide): void {
        if (this.currentState !== RdsState.AWAITING_INPUT) return;

        const s = Store.state;
        const t = this.getTranslations();
        this.transitionTo(RdsState.FEEDBACK);

        Store.updateState('isWaitingForAnswer', false);

        const isCorrect = (userChoice === s.rdsTargetSide);

        this.btnStart.disabled = false;

        this.container.classList.remove('success-pulse', 'error-shake');
        this.flashOverlay.classList.remove('flash-success', 'flash-error');
        void this.container.offsetWidth;
        void this.flashOverlay.offsetWidth;

        let newScore = s.rdsScore;
        let newTotal = s.rdsTotal + 1;
        let newStreak = s.rdsStreak;
        let newStaircaseStreak = s.rdsStaircaseStreak;
        let newDisparity = s.rdsDisparity;

        const activeHistory = s.rdsHistory ? [...s.rdsHistory] : [];

        if (isCorrect) {
            const panValue = s.rdsTargetSide === 'left' ? -0.40 : 0.40;
            playSuccess(s.isMuted, panValue);
            this.flashOverlay.classList.add('flash-success');
            this.container.classList.add('success-pulse');

            newScore++;
            newStreak++;
            newStaircaseStreak++;
            activeHistory.push(1);

            if (newStaircaseStreak >= 3) {
                if (newDisparity > 1) newDisparity--;
                newStaircaseStreak = 0;
            }
        } else {
            playError(s.isMuted);
            this.flashOverlay.classList.add('flash-error');
            this.container.classList.add('error-shake');

            newStreak = 0;
            newStaircaseStreak = 0;
            activeHistory.push(0);

            if (newDisparity < 8) newDisparity++;
        }

        if (activeHistory.length > 20) activeHistory.shift();

        // Map pixel disparity back to the discrete clinical stages 1-5
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
        Store.updateState('rdsHistory', activeHistory as any);

        this.saveRdsSession();

        this.btnStart.disabled = true;
        this.btnStart.innerText = t.rdsNextBtn || "NEXT";
        if (this.syncCross) this.syncCross();

        this.tracker.setTimeout(() => {
            this.flashOverlay.classList.add('fade-out');
            this.container.classList.remove('success-pulse', 'error-shake');

            this.tracker.setTimeout(() => {
                this.flashOverlay.classList.remove('flash-success', 'flash-error', 'fade-out');
            }, 500);

            // Re-render flat noise (hide 3D) after answer for rest phase
            drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, Store.state, false, true);

            if (this.currentState === RdsState.FEEDBACK) {
                this.transitionTo(RdsState.IDLE);
                if (!s.rdsAutoAdvance) {
                    this.btnStart.disabled = false;
                    this.btnStart.innerText = t.rdsNextBtn || "NEXT";
                    if (this.syncCross) this.syncCross();
                }
            }
        }, 300);

        updateScoreboard(Store.state, t);

        // Milestone: 1px disparity mastery with sustained accuracy
        if (newLevel === 5 && newDisparity === 1 && newStreak >= 12) {
            playGoldAward(s.isMuted); // Play majestic D-Major 9th gold chimes
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const title = t.titleGoldRDS || "🥇 Stereopsis Mastered!";
                    const text = t.sessionMasteredRDS || "Excellent progress!";
                    Store.resetSessionProgress();
                    this.btnStart.disabled = false;
                    this.btnStart.innerText = t.rdsStartBtn || "START STEREOGRAM";
                    this.showCustomModal(title, text);
                    this.transitionTo(RdsState.IDLE);
                    if (this.syncCross) this.syncCross();
                });
            }, 400);
            return;
        }

        // Milestone: Session trial limit reached
        if (s.rdsSessionLimit > 0 && newTotal >= s.rdsSessionLimit) {
            playSilverAward(s.isMuted); // Play elegant shimmering silver chimes
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const title = t.titleSilverRDS || "🥈 RDS Session Complete!";
                    const text = (t.sessionCompletedRDS || "Session complete!").replace("{limit}", s.rdsSessionLimit.toString());
                    Store.resetSessionProgress();
                    this.btnStart.disabled = false;
                    this.btnStart.innerText = t.rdsStartBtn || "START STEREOGRAM";
                    this.showCustomModal(title, text);
                    this.transitionTo(RdsState.IDLE);
                    if (this.syncCross) this.syncCross();
                });
            }, 400);
            return;
        }

        if (s.rdsAutoAdvance) {
            this.autoNextTimeoutId = this.tracker.setTimeout(() => {
                this.autoNextTimeoutId = null;
                this.triggerTrial();
            }, 900);
        }
    }

    /** @description CElebratory milestone visual feedback loop. */
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

    /**
     * @description High-frequency loop for dynamic noise and smooth target pursuit.
     * 
     * @clinical 
     * - Boiling static at ~18Hz completely blocks monocular boundary cheats.
     * - Smooth DVD-bouncing drifts hidden shapes in 3D, exercising dynamic vergence reserves.
     * 
     * @mathematical
     * Employs linear interpolation of triangular oscillators to compute driftX/Y bouncing vectors.
     */
    private startDynamicRdsLoop(): void {
        const s = Store.state;
        let lastUpdateTime = 0;
        const frameInterval = 55; // Fixed 18Hz boiling static interval
        const startTime = performance.now();

        const getBounceOffset = (elapsed: number, period: number, amplitude: number): number => {
            const t = (elapsed / period) % 1.0;
            if (t < 0.5) return -amplitude + (t / 0.5) * (2 * amplitude);
            return amplitude - ((t - 0.5) / 0.5) * (2 * amplitude);
        };

        const loop = (timestamp: number) => {
            const isAllowedToAnimate =
                this.currentState === RdsState.STIMULUS_ACTIVE ||
                this.currentState === RdsState.AWAITING_INPUT;

            if (!isAllowedToAnimate) return;

            const elapsed = timestamp - startTime;

            if (s.rdsIsFloating) {
                const dotSize = s.rdsDotSize || 4;
                const rows = Math.floor(256 / dotSize);
                const squareSize = Math.floor(rows * 0.28);
                const halfSquare = Math.floor(squareSize / 2);

                const amplitudeX = Math.max(1, Math.floor(rows * 0.09));
                const amplitudeY = Math.max(1, Math.floor(rows / 2) - halfSquare - 2);

                const speedCoeffs: Record<string, number> = { slow: 1.5, medium: 1.0, fast: 0.6 };
                const coeff = speedCoeffs[s.rdsFloatSpeed] || 1.0;
                const periodX = 4800 * coeff;
                const periodY = 7100 * coeff;

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
                drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, true);
            } else if (s.rdsIsFloating) {
                // Smooth pursuit updates without reshuffling noise grid
                drawRandomDotStereogram(this.overlayCanvas, this.overlayCtx, s, false);
            }

            this.tracker.requestAnimationFrame(loop);
        };

        this.tracker.requestAnimationFrame(loop);
    }

    /** @description Commits RDS session data to the relational database storage. */
    private saveRdsSession(): void {
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