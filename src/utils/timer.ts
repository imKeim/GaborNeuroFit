/**
 * @file timer.ts
 * @description Pomodoro-based physiological visual fatigue monitoring utility.
 * Implements absolute system clock synchronization to manage mandatory recovery intervals, 
 * preventing accommodative spasms during intensive foveation exercises.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store.js';
import type { AppState } from '../types/clinical';

/**
 * @description High-precision countdown timer leveraging System Clock SSoT.
 */
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
     * @description Initializes the 1-second physiological heartbeat loop.
     *
     * @clinical 
     * - Fatigue Mitigation: Enforces the 20-20-20 rule (look 20 feet away for 20 seconds). 
     * - Ciliary Muscle Protection: Prevents accommodative spasm caused by prolonged 
     *   near-point binocular fusion during RDS and Synoptophore modes.
     * - Neuroplasticity Consolidation: Mandatory rest intervals facilitate the 
     *   stabilization of newly formed synaptic connections in the visual cortex.
     * 
     * @mathematical
     * - Drift Prevention: Avoids standard setInterval cumulative error by calculating 
     *   remaining time as Delta = (TargetTimestamp - CurrentTimestamp).
     * - Rounding: Utilizes Math.round() to map millisecond deltas to discrete UI seconds.
     * 
     * @architecture
     * - Smart Pause: Halts countdown if UI is obstructed by modals, as reading instructions 
     *   does not constitute the primary visual load being monitored.
     * - Sliding Target: While frozen, the targetEndTime is continuously shifted forward 
     *   by the delta of the pause duration, ensuring perfect continuity upon resumption.
     */
    init(): void {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
        }

        this.lastRemainingSeconds = -1;

        this.intervalId = window.setInterval(() => {
            const s = Store.state;
            if (s.timerLimitMinutes === 0) return;

            // Sync target timestamp if state was modified externally (e.g., settings reset)
            if (s.timerRemainingSeconds !== this.lastRemainingSeconds) {
                this.targetEndTime = Date.now() + (s.timerRemainingSeconds * 1000);
                this.lastRemainingSeconds = s.timerRemainingSeconds;
            }

            const isTimerFrozen = s.isPaused || 
                                  !s.timerIsRunning || 
                                  document.body.classList.contains('modal-is-open');

            if (isTimerFrozen) {
                // Continuous target shifting during pause to maintain remaining seconds integrity
                this.targetEndTime = Date.now() + (s.timerRemainingSeconds * 1000);
                return;
            }

            // Calculate exact discrete seconds remaining
            const remaining = Math.max(0, Math.round((this.targetEndTime - Date.now()) / 1000));
            this.lastRemainingSeconds = remaining; 
            Store.updateState('timerRemainingSeconds', remaining);
            this.onTick(s);

            // Execute clinical break sequence on zero
            if (remaining <= 0) {
                Store.updateState('timerIsRunning', false);
                this.onComplete(s);
            }
        }, 1000);
    }
}