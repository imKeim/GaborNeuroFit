/*
 * GaborNeuroFit - Perceptual Learning Trial Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs strict Finite State Machine (FSM) type literals
 * to ensure that asynchronous sensory events evaluate in absolute sequence.
 */

import { Store } from '../store';
import { AsyncResourceTracker } from '../utils/tracker';
import { renderGabor, drawFusionLockFrame } from '../engine/gabor-render';
import { playCue, playSuccess, playError } from '../engine/audio';
import { updateScoreboard, updateStatusBar, drawIdleState } from '../ui/screen';
import type { AppState } from '../types/clinical';

export type TrialStateValue = 'IDLE' | 'PRE_CUE' | 'STIMULUS_ACTIVE' | 'AWAITING_INPUT' | 'FEEDBACK';

export const TrialState: Record<TrialStateValue, TrialStateValue> = {
    IDLE: 'IDLE',
    PRE_CUE: 'PRE_CUE',
    STIMULUS_ACTIVE: 'STIMULUS_ACTIVE',
    AWAITING_INPUT: 'AWAITING_INPUT',
    FEEDBACK: 'FEEDBACK'
};

interface FrequencyRange { min: number; max: number; }
interface SigmaRange { min: number; max: number; }

const levelFreqRanges: Record<number, FrequencyRange> = {
    1: { min: 0.03, max: 0.05 },
    2: { min: 0.05, max: 0.08 },
    3: { min: 0.08, max: 0.12 },
    4: { min: 0.12, max: 0.17 },
    5: { min: 0.17, max: 0.24 }
};

const levelSigmaRanges: Record<number, SigmaRange> = {
    1: { min: 40, max: 50 },
    2: { min: 32, max: 40 },
    3: { min: 24, max: 31 },
    4: { min: 18, max: 23 },
    5: { min: 12, max: 17 }
};

const ALLOWED_TRANSITIONS: Record<string, TrialStateValue[]> = {
    'IDLE': ['PRE_CUE'],
    'PRE_CUE': ['STIMULUS_ACTIVE'],
    'STIMULUS_ACTIVE': ['AWAITING_INPUT', 'FEEDBACK'],
    'AWAITING_INPUT': ['PRE_CUE', 'FEEDBACK'],
    'FEEDBACK': ['IDLE']
};

export class GaborController {
    public currentState: TrialStateValue = TrialState.IDLE;
    public tracker: AsyncResourceTracker = new AsyncResourceTracker();
    public isAnaglyphTestActive: boolean = false;

    private currentAngleDeg: number = 0;
    private lastRandomFreq: number = 0.08;
    private lastRandomSigma: number = 40;
    private lastRandomAspectRatio: number = 1.0;
    private lastOffsetX: number = 0;
    private lastOffsetY: number = 0;
    private flankerPhaseOffset: number = 0;
    private autoNextTimeoutId: number | null = null;

    constructor(
        private canvas: HTMLCanvasElement,
        private overlayCanvas: HTMLCanvasElement,
        private overlayCtx: CanvasRenderingContext2D,
        private cross: HTMLElement,
        private container: HTMLElement,
        private flashOverlay: HTMLElement,
        private btnStart: HTMLButtonElement,
        private getTranslations: () => Record<string, string>,
        private showCustomModal: (title: string, text: string) => void
    ) {}

    abort(): void {
        this.tracker.clearAll();
        this.currentState = TrialState.IDLE;
    }

    transitionTo(nextState: TrialStateValue): boolean {
        const allowed = ALLOWED_TRANSITIONS[this.currentState];
        if (!allowed || !allowed.includes(nextState)) {
            return false;
        }
        this.currentState = nextState;
        if (nextState === TrialState.PRE_CUE || nextState === TrialState.FEEDBACK) {
            this.tracker.clearAll();
        }
        return true;
    }

    triggerTrial(): void {
        if (this.autoNextTimeoutId) {
            clearTimeout(this.autoNextTimeoutId);
            this.tracker.clearAll();
            this.autoNextTimeoutId = null;
        }

        if (!this.transitionTo(TrialState.PRE_CUE)) return;

        Store.startTimerIfNeeded();

        this.btnStart.disabled = true;
        this.btnStart.style.opacity = "0.4";
        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this._runRenderCycle(true);
        }, 180);
    }

    reFlashCurrentGabor(): void {
        if (!this.transitionTo(TrialState.PRE_CUE)) return;

        this.btnStart.disabled = true;
        this.btnStart.style.opacity = "0.4";
        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        this.tracker.setTimeout(() => {
            this._runRenderCycle(false);
        }, 180);
    }

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

        const gaborStreakEl = document.getElementById('badge-gabor-streak');
        const contrastEl = document.getElementById('current-contrast');
        const levelEl = document.getElementById('current-level');

        if (contrastEl) contrastEl.innerText = Math.round(s.autoContrast * 100).toString();
        if (levelEl) levelEl.innerText = s.currentLevel.toString();
        if (gaborStreakEl) gaborStreakEl.innerHTML = `🔥 <strong>${s.correctStreak}</strong>`;

        let crossSize = 36;
        if (s.currentLevel === 1) crossSize = 36;
        else if (s.currentLevel === 2) crossSize = 28;
        else if (s.currentLevel === 3) crossSize = 22;
        else if (s.currentLevel === 4) crossSize = 16;
        else if (s.currentLevel === 5) crossSize = 12;
        this.cross.style.fontSize = crossSize + 'px';

        renderGabor(this.canvas, null, s, this.currentAngleDeg, s.autoContrast, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, 0, this.lastRandomAspectRatio);

        const flashDuration = this.getFlashDuration(s);
        updateStatusBar(s, t);

        this.cross.classList.remove('cross-dimmed', 'cross-hidden');
        if (s.isPermanentCrossEnabled) {
            this.cross.classList.add('cross-dimmed');
        } else {
            this.cross.classList.add('cross-hidden');
        }

        this.canvas.style.display = 'block';
        Store.updateState('isWaitingForAnswer', true);

        const isAnimating = (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) || s.isFlickerEnabled;

        if (isAnimating) {
            this.startUnifiedRenderingLoop(s);
        }

        if (!s.isStaticEnabled) {
            this.tracker.setTimeout(() => {
                this.stopUnifiedRenderingLoop();
                drawIdleState(this.canvas, null, this.overlayCanvas, this.overlayCtx, s.isFusionLockEnabled);
                this.cross.classList.remove('cross-dimmed', 'cross-hidden');
                this.btnStart.disabled = false;
                this.btnStart.style.opacity = "1";
                this.btnStart.innerText = t.reflashBtn || "RE-FLASH";
                this.transitionTo(TrialState.AWAITING_INPUT);
            }, flashDuration);
        } else {
            this.btnStart.disabled = false;
            this.btnStart.style.opacity = "1";
            this.btnStart.innerText = t.reflashBtn || "RE-FLASH";
            this.transitionTo(TrialState.AWAITING_INPUT);
        }
    }

    submitAnswer(userChoice: 'left' | 'right'): void {
        if (this.currentState !== TrialState.AWAITING_INPUT && this.currentState !== TrialState.STIMULUS_ACTIVE) return;

        const s = Store.state;
        Store.updateState('isWaitingForAnswer', false);

        this.transitionTo(TrialState.FEEDBACK);
        this.cross.classList.remove('cross-dimmed', 'cross-hidden');

        const correctAnswer = this.currentAngleDeg < 0 ? 'left' : 'right';
        const isCorrect = (userChoice === correctAnswer);

        this.container.classList.remove('success-pulse', 'error-shake');
        this.flashOverlay.classList.remove('flash-success', 'flash-error');
        // Force reflow
        void this.container.offsetWidth;
        void this.flashOverlay.offsetWidth;

        Store.registerResult(isCorrect);

        if (isCorrect) {
            // Deep spatial cross-modality reinforcement for Visual Cortex mapping
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
        this.btnStart.style.opacity = "0.4";
        this.btnStart.innerText = "...";

        this.tracker.setTimeout(() => {
            this.flashOverlay.classList.add('fade-out');
            this.container.classList.remove('success-pulse', 'error-shake');

            this.tracker.setTimeout(() => {
                this.flashOverlay.classList.remove('flash-success', 'flash-error', 'fade-out');
            }, 500);

            if (this.currentState === TrialState.FEEDBACK) {
                this.currentState = TrialState.IDLE;
                this.btnStart.disabled = false;
                this.btnStart.style.opacity = "1";
                this.btnStart.innerText = this.getTranslations().nextBtn || "NEXT";
            }
        }, 300);

        updateScoreboard(s, this.getTranslations());
        Store.saveSession();

        const minContrastLimit = s.allowLowContrast ? 0.01 : 0.05;
        if (s.currentLevel === 5 && s.autoContrast <= minContrastLimit && s.correctStreak >= 12) {
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const t = this.getTranslations();
                    this.showCustomModal(t.titleGold || "🥇 GaborNeuroFit", t.sessionMastered || "Mastered!");
                    this.transitionTo(TrialState.IDLE);
                });
            }, 400);
            return;
        }

        if (s.sessionLimit > 0 && s.total >= s.sessionLimit) {
            this.tracker.setTimeout(() => {
                this.triggerMilestoneFlash(() => {
                    const t = this.getTranslations();
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
            }, 1200);
        } else {
            this.btnStart.disabled = false;
            this.btnStart.style.opacity = "1";
            this.btnStart.innerText = this.getTranslations().nextBtn || "NEXT";
            this.currentState = TrialState.IDLE;
        }
    }

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

    startUnifiedRenderingLoop(s: AppState): void {
        this.flankerPhaseOffset = 0;
        const startTime = performance.now();
        const optimalFrequencyCoeff = 0.062831853;

        const loop = (timestamp: number) => {
            const isAllowedToAnimate =
                this.currentState === TrialState.STIMULUS_ACTIVE ||
                (this.currentState === TrialState.AWAITING_INPUT && s.isStaticEnabled);

            if (!isAllowedToAnimate) return;

            if (this.isAnaglyphTestActive) {
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

    stopUnifiedRenderingLoop(): void {
        this.flankerPhaseOffset = 0;
    }

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