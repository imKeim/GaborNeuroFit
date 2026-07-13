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
        const curtain = document.getElementById('calibration-curtain');
        const watermark = document.getElementById('pause-watermark');
        const btnPause = document.getElementById('btn-pause');

        // Clinical guard: Protect muscles during active Synoptophore pulling step
        if (s.appMode === 'synoptophore' && s.synopState === 'pulling') {
            if (this.synoptophoreCtrl) this.synoptophoreCtrl.breakActiveFusion();
            return;
        }

        const nextPausedState = !s.isPaused;
        Store.updateState('isPaused', nextPausedState);

        if (nextPausedState) {
            // 1. Freeze Pomodoro countdown timer
            Store.updateState('savedTimerRunningState', s.timerIsRunning);
            Store.updateState('timerIsRunning', false);

            // 2. Shut curtain and raise highly salient paused watermark
            if (curtain) curtain.classList.add('active');
            if (watermark) watermark.style.display = 'block';
            if (btnPause) {
                btnPause.innerText = '▶️';
                // @ts-ignore - Ignore missing Twemoji global typings strictly for DOM injection
                if (window.twemoji) window.twemoji.parse(btnPause);
            }

            // 3. Delegate cross synchronization to the centralized updater
            if (this.syncCross) this.syncCross();

            // 4. Halt active animation loops without destructive resets
            if (this.gaborCtrl) this.gaborCtrl.stopUnifiedRenderingLoop();
            if (this.synoptophoreCtrl) this.synoptophoreCtrl.stopFlickerLoop();
            if (this.rdsCtrl) this.rdsCtrl.pause(); // Clean pause preserves FSM state
        } else {
            // 1. Restore Pomodoro countdown timer state
            Store.updateState('timerIsRunning', s.savedTimerRunningState);

            // 2. Symmetrically dissolve rest shutter curtain
            if (curtain) {
                const isSynopRest = (s.appMode === 'synoptophore' && s.synopState === 'idle');
                if (!isSynopRest) {
                    curtain.classList.remove('active');
                }
            }
            if (watermark) watermark.style.display = 'none';
            if (btnPause) {
                btnPause.innerText = '⏸️';
                // @ts-ignore
                if (window.twemoji) window.twemoji.parse(btnPause);
            }

            // 3. Delegate cross synchronization on resume
            if (this.syncCross) this.syncCross();

            // 4. Symmetrically resume loops only if Gabor or RDS was actively running
            if (s.appMode === 'gabor' && s.isWaitingForAnswer) {
                if (this.gaborCtrl) this.gaborCtrl.startUnifiedRenderingLoop(Store.state);
            } else if (s.appMode === 'rds' && this.rdsCtrl) {
                if (this.rdsCtrl.currentState === 'STIMULUS_ACTIVE' || this.rdsCtrl.currentState === 'AWAITING_INPUT') {
                    // Start unified RDS loop symmetrically on resume using an ugly but safe private method bypass for FSM
                    (this.rdsCtrl as any).startDynamicRdsLoop();
                }
            }
        }
    }
}