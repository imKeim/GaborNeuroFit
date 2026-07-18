/**
 * @file pause.ts
 * @description Cross-domain orchestration controller managing application-wide rest phases.
 * Coordinates the freezing and symmetrical resumption of high-frequency rendering loops, 
 * stroboscopic animations, and clinical countdown timers across all visual modalities.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import type { GaborController } from './gabor';
import type { SynoptophoreController } from './synop';
import type { RdsController } from './rds';

/**
 * @description Controller responsible for global pause state logic and resource preservation.
 */
export class PauseController {
    constructor(
        private gaborCtrl: GaborController | null,
        private synoptophoreCtrl: SynoptophoreController | null,
        private rdsCtrl: RdsController | null,
        private syncCross: () => void
    ) {}

    /**
     * @description Master toggle for global application pause states.
     *
     * @clinical
     * - Extraocular Muscle Protection: Attempting to pause while the Synoptophore 
     *   is actively pulling muscles to center could induce acute diplopia. This method 
     *   intercepts the pause command and triggers a controlled 'Fusion Slip' instead 
     *   to safely relax the muscles.
     * - FSM Integrity: Pausing is structurally blocked during transitional trial states 
     *   (PRE_CUE, STIMULUS_ACTIVE, FEEDBACK, auto-advance countdowns) to prevent 
     *   asynchronous soft-locks and data corruption.
     * 
     * @architecture
     * - Freezes Pomodoro countdowns by caching the 'running' state.
     * - Suspends requestAnimationFrame loops to reduce GPU/CPU thermal load during idle.
     * - Symmetrically toggles DOM accessibility classes (.paused-state) to dim the arena.
     */
    togglePause(): void {
        const s = Store.state;

        // FSM Transition Guard: Prevent pausing during time-critical visual exposures
        if (!s.isPaused) {
            if (s.appMode === 'gabor' && this.gaborCtrl) {
                const gState = this.gaborCtrl.currentState;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const isAutoPending = (this.gaborCtrl as any).autoNextTimeoutId !== null;
                if (gState === 'PRE_CUE' || gState === 'STIMULUS_ACTIVE' || gState === 'FEEDBACK' || isAutoPending) {
                    return;
                }
            }
            if (s.appMode === 'rds' && this.rdsCtrl) {
                const rState = this.rdsCtrl.currentState;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const isAutoPending = (this.rdsCtrl as any).autoNextTimeoutId !== null;
                if (rState === 'PRE_CUE' || rState === 'FEEDBACK' || isAutoPending) {
                    return;
                }
            }
            // Clinical Safety: Redirect pause command to breakActiveFusion during active vergence pulling
            if (s.appMode === 'synoptophore' && s.synopState === 'pulling') {
                if (this.synoptophoreCtrl) this.synoptophoreCtrl.breakActiveFusion();
                return;
            }
        }

        const container = document.getElementById('container');
        const watermark = document.getElementById('pause-watermark');
        const btnPause = document.getElementById('btn-pause');
        const controlsLayout = document.getElementById('controls-layout');

        const nextPausedState = !s.isPaused;
        Store.updateState('isPaused', nextPausedState);

        // UI Hygiene: Disable primary interaction buttons during pause to secure focus ring
        const btnLeft = document.getElementById('btn-left') as HTMLButtonElement | null;
        const btnRight = document.getElementById('btn-right') as HTMLButtonElement | null;
        const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;

        if (btnLeft) btnLeft.disabled = nextPausedState;
        if (btnRight) btnRight.disabled = nextPausedState;
        if (btnReset) btnReset.disabled = nextPausedState;

        if (nextPausedState) {
            // Entrance: Halt visual processing
            if (this.gaborCtrl && this.gaborCtrl.currentState === 'PRE_CUE') {
                this.gaborCtrl.abort();
                const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;
                if (btnStart) {
                    btnStart.disabled = false;
                }
            }
            if (this.rdsCtrl && this.rdsCtrl.currentState === 'PRE_CUE') {
                this.rdsCtrl.abort();
                const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;
                if (btnStart) {
                    btnStart.disabled = false;
                }
            }

            Store.updateState('savedTimerRunningState', s.timerIsRunning);
            Store.updateState('timerIsRunning', false);

            if (container) container.classList.add('paused-state');
            if (watermark) watermark.classList.add('active');
            if (controlsLayout) controlsLayout.classList.add('paused-state');
            if (btnPause) {
                btnPause.innerText = '▶️';
                // @ts-ignore
                if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(btnPause);
            }

            if (this.syncCross) this.syncCross();

            if (this.gaborCtrl) this.gaborCtrl.stopUnifiedRenderingLoop();
            if (this.synoptophoreCtrl) this.synoptophoreCtrl.stopFlickerLoop();
            if (this.rdsCtrl) this.rdsCtrl.pause();
        } else {
            // Resumption: Restore clinical processing
            Store.updateState('timerIsRunning', s.savedTimerRunningState);

            if (container) container.classList.remove('paused-state');
            if (watermark) watermark.classList.remove('active');
            if (controlsLayout) controlsLayout.classList.remove('paused-state');
            if (btnPause) {
                btnPause.innerText = '⏸️';
                // @ts-ignore
                if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(btnPause);
            }

            if (this.syncCross) this.syncCross();

            if (s.appMode === 'gabor' && s.isWaitingForAnswer) {
                if (this.gaborCtrl) this.gaborCtrl.startUnifiedRenderingLoop(Store.state);
            } else if (s.appMode === 'rds' && this.rdsCtrl) {
                if (this.rdsCtrl.currentState === 'STIMULUS_ACTIVE' || this.rdsCtrl.currentState === 'AWAITING_INPUT') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (this.rdsCtrl as any).startDynamicRdsLoop();
                }
            } else if (s.appMode === 'synoptophore' && this.synoptophoreCtrl) {
                this.synoptophoreCtrl.syncFlickerState();
            }
        }
    }

    /**
     * @description Surgical override to temporarily hide the pause watermark.
     * 
     * @clinical Mandatory during Anaglyph Lens Calibration. The calibration anchors (L/R) 
     * are located at the geometric center, which would otherwise be obscured by the 
     * large "PAUSED" text overlay.
     * 
     * @param {boolean} hide - If true, forcefully dismisses the watermark.
     */
    overrideWatermarkVisibility(hide: boolean): void {
        const watermark = document.getElementById('pause-watermark');
        if (!watermark) return;

        if (hide) {
            watermark.classList.remove('active');
        } else {
            if (Store.state.isPaused) {
                watermark.classList.add('active');
            }
        }
    }
}