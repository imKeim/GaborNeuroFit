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

        this.intervalId = window.setInterval(() => {
            const s = Store.state;
            if (!s.timerIsRunning || s.timerLimitMinutes === 0) return;

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

            if (isSettingsOpen || isInfoOpen || isStatsOpen || isAlertOpen || isConfirmOpen) {
                return; // Maintain state securely while patient interacts with UI
            }

            // Deduct interval synchronously utilizing Store validators
            Store.updateState('timerRemainingSeconds', Math.max(0, s.timerRemainingSeconds - 1));
            this.onTick(s);

            // Terminate active operations and enforce a strict clinical break interval on zero
            if (s.timerRemainingSeconds <= 0) {
                Store.updateState('timerIsRunning', false);
                this.onComplete(s);
            }
        }, 1000);
    }
}
