/*
 * GaborNeuroFit - Pomodoro Timer Utility
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Encapsulates physiological visual fatigue timer loops.
 */

import { Store } from '../store.js';
import type { AppState } from '../types/clinical';

export class PomodoroTimer {
    private onTick: (state: AppState) => void;
    private onComplete: (state: AppState) => void;
    private intervalId: number | null = null;
    private targetEndTime: number = 0;
    private lastRemainingSeconds: number = -1;

    constructor(onTick: (state: AppState) => void, onComplete: (state: AppState) => void) {
        this.onTick = onTick;
        this.onComplete = onComplete;
    }

    /**
     * @description Initializes the 1-second Pomodoro heartbeat.
     *
     * @clinical Forces periodic recovery intervals. Continuous near-point active foveation
     * (especially during cross-eyed stereogram fusion) induces extreme ciliary muscle fatigue
     * (accommodative spasm). The timer forces the patient to look at a distant target (20/20/20 rule)
     * to safely relax parasympathetic innervation.
     */
    init(): void {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
        }

        // Reset the tracking cache state on initialization
        this.lastRemainingSeconds = -1;

        this.intervalId = window.setInterval(() => {
            const s = Store.state;
            if (s.timerLimitMinutes === 0) return;

            // Detect and adapt to any external modifications of the countdown state
            // (e.g. Store.startTimerIfNeeded() resetting it to 300, or settings updates)
            if (s.timerRemainingSeconds !== this.lastRemainingSeconds) {
                this.targetEndTime = Date.now() + (s.timerRemainingSeconds * 1000);
                this.lastRemainingSeconds = s.timerRemainingSeconds;
            }

            // Smart Pause: Halts physiological countdown if any overlay modal is blocking the screen
            const settingsModal = document.getElementById('settings-modal');
            const infoModal = document.getElementById('info-modal');
            const statsModal = document.getElementById('stats-modal');
            const customAlertModal = document.getElementById('custom-alert-modal');
            const customConfirmModal = document.getElementById('custom-confirm-modal');

            const isSettingsOpen = settingsModal?.classList.contains('modal-open') ?? false;
            const isInfoOpen = infoModal?.classList.contains('modal-open') ?? false;
            const isStatsOpen = statsModal?.classList.contains('modal-open') ?? false;
            const isAlertOpen = customAlertModal?.classList.contains('modal-open') ?? false;
            const isConfirmOpen = customConfirmModal?.classList.contains('modal-open') ?? false;

            const isTimerFrozen = s.isPaused || 
                                  !s.timerIsRunning || 
                                  isSettingsOpen || 
                                  isInfoOpen || 
                                  isStatsOpen || 
                                  isAlertOpen || 
                                  isConfirmOpen;

            if (isTimerFrozen) {
                // While the timer is paused or the view is obstructed by a modal,
                // we continuously shift the targetEndTime forward to match the active remaining seconds.
                // This perfectly anchors the countdown target to the exact millisecond the user resumes.
                this.targetEndTime = Date.now() + (s.timerRemainingSeconds * 1000);
                return;
            }

            // High-precision Delta-Time Calculation against absolute system clock SSoT
            const remaining = Math.max(0, Math.round((this.targetEndTime - Date.now()) / 1000));
            this.lastRemainingSeconds = remaining; // Sync our local cache before committing state update
            Store.updateState('timerRemainingSeconds', remaining);
            this.onTick(s);

            // Terminate active operations and enforce a strict clinical break interval on zero
            if (remaining <= 0) {
                Store.updateState('timerIsRunning', false);
                this.onComplete(s);
            }
        }, 1000);
    }
}