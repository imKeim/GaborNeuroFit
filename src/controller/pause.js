/*
 * GaborNeuroFit - Pause & Rest Phase Orchestrator Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module isolates and orchestrates global app pauses, safeguarding active
 * session progress across Gabor, RDS and Synoptophore modalities without visual leakage.
 */

import { Store } from '../store.js';

export class PauseController {
    constructor(trialCtrl, synoptophoreCtrl, rdsCtrl, syncCrossCallback) {
        this.trialCtrl = trialCtrl;
        this.synoptophoreCtrl = synoptophoreCtrl;
        this.rdsCtrl = rdsCtrl;
        this.syncCross = syncCrossCallback;
    }

    togglePause() {
        const s = Store.state;
        const curtain = document.getElementById('calibration-curtain');
        const watermark = document.getElementById('pause-watermark');
        const btnPause = document.getElementById('btn-pause');

        // Clinical guard: Prevent pauses during active Synoptophore motor pulling step to avoid muscular strain
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
                if (window.twemoji) twemoji.parse(btnPause);
            }

            // 3. Delegate cross synchronization to the centralized updater
            if (this.syncCross) this.syncCross();

            // 4. Halt active animation loops without destructive resets
            if (this.trialCtrl) this.trialCtrl.stopUnifiedRenderingLoop();
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
                if (window.twemoji) twemoji.parse(btnPause);
            }

            // 3. Delegate cross synchronization to the centralized updater on resume
            if (this.syncCross) this.syncCross();

            // 4. Symmetrically resume loops only if Gabor or RDS was actively running
            if (s.appMode === 'gabor' && s.isWaitingForAnswer) {
                if (this.trialCtrl) this.trialCtrl.startUnifiedRenderingLoop();
            } else if (s.appMode === 'rds' && (this.rdsCtrl.currentState === 'STIMULUS_ACTIVE' || this.rdsCtrl.currentState === 'AWAITING_INPUT')) {
                if (this.rdsCtrl) this.rdsCtrl.startDynamicRdsLoop();
            }
        }
    }
}