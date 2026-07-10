/*
 * GaborNeuroFit - Pomodoro Timer Utility
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Encapsulates physiological visual fatigue timer loops.
 */

import { Store } from '../store.js';

export class PomodoroTimer {
    constructor(onTick, onComplete) {
        this.onTick = onTick;
        this.onComplete = onComplete;
    }

    init() {
        setInterval(() => {
            const s = Store.state;
            if (!s.timerIsRunning || s.timerLimitMinutes === 0) return;

            // Smart Pause: Halts physiological countdown if any overlay modal is blocking the screen
            const settingsModal = document.getElementById('settings-modal');
            const infoModal = document.getElementById('info-modal');
            const statsModal = document.getElementById('stats-modal');
            const customAlertModal = document.getElementById('custom-alert-modal');

            const isSettingsOpen = settingsModal && settingsModal.classList.contains('modal-open');
            const isInfoOpen = infoModal && infoModal.classList.contains('modal-open');
            const isStatsOpen = statsModal && statsModal.classList.contains('modal-open');
            const isAlertOpen = customAlertModal && customAlertModal.classList.contains('modal-open');

            if (isSettingsOpen || isInfoOpen || isStatsOpen || isAlertOpen) {
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