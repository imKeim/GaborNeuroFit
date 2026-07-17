/*
 * GaborNeuroFit - Pause & Rest Phase Orchestrator Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Implements strictly typed Dependency Injection (DI).
 * Ensures safe orchestration of pauses across all FSM clinical domains without visual leakage.
 */

import { Store } from '../store';
import type { GaborController } from './gabor';
import type { SynoptophoreController } from './synoptophore';
import type { RdsController } from './rds';

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
     * @clinical Enforces a strict protection protocol for the extraocular muscles.
     * Attempting to pause the system while the Synoptophore is actively pulling
     * muscles to center could cause sudden strabismic diplopia. This orchestrator
     * safely converts a 'Pause' command into a 'Fusion Slip' to organically relax the muscles instead.
     */
    togglePause(): void {
        const s = Store.state;

        // Pause execution is structurally forbidden unless all clinical subsystems
        // are in a completely stable, non-active IDLE state.
        const isGaborActive = s.appMode === 'gabor' && this.gaborCtrl && this.gaborCtrl.currentState !== 'IDLE';
        const isRdsActive = s.appMode === 'rds' && this.rdsCtrl && this.rdsCtrl.currentState !== 'IDLE';
        const isSynopActive = s.appMode === 'synoptophore' && s.synopState !== 'idle';

        if (isGaborActive || isRdsActive || isSynopActive) {
            return; // Symmetrically and silently ignore any pause requests during active therapy loops
        }

        const container = document.getElementById('container');
        const watermark = document.getElementById('pause-watermark');
        const btnPause = document.getElementById('btn-pause');
        const controlsLayout = document.getElementById('controls-layout');

        const nextPausedState = !s.isPaused;
        Store.updateState('isPaused', nextPausedState);

        // Symmetrically disable/enable action buttons during pause to secure the Tab-focus ring
        const btnLeft = document.getElementById('btn-left') as HTMLButtonElement | null;
        const btnRight = document.getElementById('btn-right') as HTMLButtonElement | null;
        const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;

        if (btnLeft) btnLeft.disabled = nextPausedState;
        if (btnRight) btnRight.disabled = nextPausedState;
        if (btnReset) btnReset.disabled = nextPausedState;

        if (nextPausedState) {
            // Abort any pending trials in PRE_CUE state to prevent them from rendering under the paused mask
            if (this.gaborCtrl && this.gaborCtrl.currentState === 'PRE_CUE') {
                this.gaborCtrl.abort();
                const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;
                if (btnStart) {
                    btnStart.disabled = false;
                    btnStart.style.opacity = "1";
                }
            }
            if (this.rdsCtrl && this.rdsCtrl.currentState === 'PRE_CUE') {
                this.rdsCtrl.abort();
                const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;
                if (btnStart) {
                    btnStart.disabled = false;
                    btnStart.style.opacity = "1";
                }
            }

            // 1. Freeze Pomodoro countdown timer
            Store.updateState('savedTimerRunningState', s.timerIsRunning);
            Store.updateState('timerIsRunning', false);

            // 2. Dim the visual arena and raise highly salient paused watermark
            if (container) container.classList.add('paused-state');
            if (watermark) watermark.classList.add('active');
            if (controlsLayout) controlsLayout.classList.add('paused-state');
            if (btnPause) {
                btnPause.innerText = '▶️';
                // @ts-ignore
                if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(btnPause);
            }

            // 3. Delegate cross synchronization to the centralized updater
            if (this.syncCross) this.syncCross();

            // 4. Halt active animation loops without destructive resets
            if (this.gaborCtrl) this.gaborCtrl.stopUnifiedRenderingLoop();
            if (this.synoptophoreCtrl) this.synoptophoreCtrl.stopFlickerLoop();
            if (this.rdsCtrl) this.rdsCtrl.pause();
        } else {
            // 1. Restore Pomodoro countdown timer state
            Store.updateState('timerIsRunning', s.savedTimerRunningState);

            // 2. Symmetrically restore arena brightness (Curtain logic untouched to preserve Synoptophore Idle rest state)
            if (container) container.classList.remove('paused-state');
            if (watermark) watermark.classList.remove('active');
            if (controlsLayout) controlsLayout.classList.remove('paused-state');
            if (btnPause) {
                btnPause.innerText = '⏸️';
                // @ts-ignore
                if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(btnPause);
            }

            // 3. Delegate cross synchronization on resume
            if (this.syncCross) this.syncCross();

            // 4. Symmetrically resume loops depending on the active modality
            if (s.appMode === 'gabor' && s.isWaitingForAnswer) {
                if (this.gaborCtrl) this.gaborCtrl.startUnifiedRenderingLoop(Store.state);
            } else if (s.appMode === 'rds' && this.rdsCtrl) {
                if (this.rdsCtrl.currentState === 'STIMULUS_ACTIVE' || this.rdsCtrl.currentState === 'AWAITING_INPUT') {
                    // Start unified RDS loop symmetrically on resume
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (this.rdsCtrl as any).startDynamicRdsLoop();
                }
            } else if (s.appMode === 'synoptophore' && this.synoptophoreCtrl) {
                // Restore 10Hz Alpha-resonance flicker on resume
                this.synoptophoreCtrl.syncFlickerState();
            }
        }
    }

    /**
     * @description Surgical override to temporarily hide the pause watermark.
     * @clinical Mandatory during Anaglyph Lens Calibration. The test pattern 'L/R'
     * is rendered precisely in the center, which would otherwise be obscured by the large "PAUSED" text.
     */
    overrideWatermarkVisibility(hide: boolean): void {
        const watermark = document.getElementById('pause-watermark');
        if (!watermark) return;

        if (hide) {
            watermark.classList.remove('active');
        } else {
            // Restore visibility strictly if the system is currently paused
            if (Store.state.isPaused) {
                watermark.classList.add('active');
            }
        }
    }
}
