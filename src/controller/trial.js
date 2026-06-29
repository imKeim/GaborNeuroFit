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
import { updateScoreboard, updateLeaderboard, drawIdleState, updateStatusBar } from '../ui/screen.js';

// Formal finite state definitions for the visual cycle
export const TrialState = {
    IDLE: 'IDLE',
    PRE_CUE: 'PRE_CUE',
    STIMULUS_ACTIVE: 'STIMULUS_ACTIVE',
    AWAITING_INPUT: 'AWAITING_INPUT',
    FEEDBACK: 'FEEDBACK'
};

const levelFreqRanges = {
    1: { min: 0.03, max: 0.05 },
    2: { min: 0.05, max: 0.08 },
    3: { min: 0.08, max: 0.12 },
    4: { min: 0.12, max: 0.17 },
    5: { min: 0.17, max: 0.24 }
};

const levelSigmaRanges = {
    1: { min: 40, max: 50 },
    2: { min: 32, max: 40 },
    3: { min: 24, max: 31 },
    4: { min: 18, max: 23 },
    5: { min: 12, max: 17 }
};

export class TrialController {
    constructor(canvas, context, cross, container, flashOverlay, btnStart, translationsGetter) {
        this.canvas = canvas;
        this.ctx = context;
        this.cross = cross;
        this.container = container;
        this.flashOverlay = flashOverlay;
        this.btnStart = btnStart;
        this.getTranslations = translationsGetter; // Callback targeting active app translations dictionary

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
    }

    // Securely transitions FSM state and guarantees asynchronous cleanup
    transitionTo(nextState) {
        this.currentState = nextState;
        this.tracker.clearAll(); // Clean slate: completely purges the memory of the previous phase
    }

    // Handles the acoustic pre-cue warning phase (PRE_CUE)
    triggerTrial() {
        if (this.currentState === TrialState.PRE_CUE || this.currentState === TrialState.FEEDBACK) {
            return; // Hard lock against rapid double-triggers
        }

        this.transitionTo(TrialState.PRE_CUE);
        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        // Schedule visual flash exactly 180ms after the auditory pre-cue click
        this.tracker.setTimeout(() => {
            this.executeGaborFlash();
        }, 180);
    }

    // Synthesizes the dynamic parameters and renders Gabor stimulus (STIMULUS_ACTIVE)
    executeGaborFlash() {
        const t = this.getTranslations();
        const s = Store.state;

        this.transitionTo(TrialState.STIMULUS_ACTIVE);

        // Calculate visual parameters
        do {
            this.currentAngleDeg = Math.floor(Math.random() * 160) - 80;
        } while (Math.abs(this.currentAngleDeg) < 15);

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

        renderGabor(this.canvas, this.ctx, s, this.currentAngleDeg, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, 0, this.lastRandomAspectRatio);

        let flashDuration = this.getFlashDuration(s);
        updateStatusBar(s, t);

        this.cross.style.display = 'none';
        this.canvas.style.display = 'block';
        Store.state.isWaitingForAnswer = true;

        if (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) {
            this.startFlankerAnimation();
        }

        if (!s.isStaticEnabled) {
            this.tracker.setTimeout(() => {
                this.stopFlankerAnimation();
                drawIdleState(this.canvas, this.ctx, s.isFusionLockEnabled);
                this.cross.style.display = 'block';
                this.btnStart.innerText = t.reflashBtn;
                this.transitionTo(TrialState.AWAITING_INPUT);
            }, flashDuration);
        } else {
            if (s.isFlickerEnabled) {
                let flickerState = true;
                this.tracker.setInterval(() => {
                    flickerState = !flickerState;
                    if (flickerState) {
                        renderGabor(this.canvas, this.ctx, s, this.currentAngleDeg, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, this.flankerPhaseOffset, this.lastRandomAspectRatio);
                    } else {
                        drawIdleState(this.canvas, this.ctx, s.isFusionLockEnabled);
                    }
                }, 50);
            }
            this.btnStart.innerText = t.reflashBtn;
            this.currentState = TrialState.AWAITING_INPUT; // Quietly change state without running clearAll(), keeping flicker running!
        }
    }

    // Handles the response assessment and visual feedback animation trigger (FEEDBACK)
    submitAnswer(userChoice) {
        if (this.currentState !== TrialState.AWAITING_INPUT && this.currentState !== TrialState.STIMULUS_ACTIVE) {
            return; // Guard to completely ignore keyboard/touch inputs outside active answer phases
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

        drawIdleState(this.canvas, this.ctx, s.isFusionLockEnabled);

        this.tracker.setTimeout(() => {
            this.flashOverlay.classList.remove('flash-success', 'flash-error');
            this.container.classList.remove('success-pulse', 'error-shake');
            
            // Softly reset the state to IDLE upon feedback completion 
            // without destroying the active 900ms auto-advance timeouts inside the tracker
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
            this.transitionTo(TrialState.IDLE);
        }
    }

    // Implements user manual trigger to show the exact same visual target again
    reFlashCurrentGabor() {
        if (this.currentState === TrialState.PRE_CUE || this.currentState === TrialState.FEEDBACK) {
            return; // Guard lock during active transitions
        }

        this.transitionTo(TrialState.PRE_CUE);
        this.btnStart.innerText = "...";
        playCue(Store.state.isMuted);

        // Schedule visual re-flash exactly 180ms after the warning click
        this.tracker.setTimeout(() => {
            this.executeGaborReFlash();
        }, 180);
    }

    // Handles the actual rendering of the repeated stimulus after the pre-cue delay
    executeGaborReFlash() {
        const t = this.getTranslations();
        const s = Store.state;
        this.transitionTo(TrialState.STIMULUS_ACTIVE);

        if (s.isDynamicFlankersEnabled && s.isCrowdingEnabled) {
            this.startFlankerAnimation();
        } else {
            renderGabor(this.canvas, this.ctx, s, this.currentAngleDeg, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, 0, this.lastRandomAspectRatio);
        }

        let flashDuration = this.getFlashDuration(s);
        this.cross.style.display = 'none';
        this.canvas.style.display = 'block';

        if (!s.isStaticEnabled) {
            this.tracker.setTimeout(() => {
                this.stopFlankerAnimation();
                drawIdleState(this.canvas, this.ctx, s.isFusionLockEnabled);
                this.cross.style.display = 'block';
                this.btnStart.innerText = t.reflashBtn;
                this.transitionTo(TrialState.AWAITING_INPUT);
            }, flashDuration);
        } else {
            if (s.isFlickerEnabled) {
                let flickerState = true;
                this.tracker.setInterval(() => {
                    flickerState = !flickerState;
                    if (flickerState) {
                        renderGabor(this.canvas, this.ctx, s, this.currentAngleDeg, s.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, this.flankerPhaseOffset, this.lastRandomAspectRatio);
                    } else {
                        drawIdleState(this.canvas, this.ctx, s.isFusionLockEnabled);
                    }
                }, 50);
            }
            this.btnStart.innerText = t.reflashBtn;
            this.currentState = TrialState.AWAITING_INPUT; // Quietly change state without running clearAll(), keeping flicker running!
        }
    }

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

    startFlankerAnimation() {
        this.flankerPhaseOffset = 0;
        const animate = () => {
            this.flankerPhaseOffset += 0.12;
            renderGabor(this.canvas, this.ctx, Store.state, this.currentAngleDeg, Store.state.autoContrast, this.lastRandomFreq, this.lastRandomSigma, this.lastOffsetX, this.lastOffsetY, this.flankerPhaseOffset, this.lastRandomAspectRatio);
            this.tracker.requestAnimationFrame(animate);
        };
        this.tracker.requestAnimationFrame(animate);
    }

    stopFlankerAnimation() {
        this.flankerPhaseOffset = 0;
    }

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