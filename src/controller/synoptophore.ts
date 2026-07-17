/*
 * GaborNeuroFit - Synoptophore & Vergence Training Controller Subsystem
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs exact math typing to prevent Euclidean distance
 * NaN exceptions during intensive motor vergence strabismus training calculations.
 */

import { Store } from '../store';
import { AsyncResourceTracker } from '../utils/tracker';
import { drawSynoptophoreTargets } from '../engine/synop-render';
import { playCue, playSuccess, playError, playSlip } from '../engine/audio';
import { updateScoreboard } from '../ui/screen';

export class SynoptophoreController {
    public tracker: AsyncResourceTracker = new AsyncResourceTracker();
    public startX: number = 0;
    public startY: number = 0;
    private isFlickering: boolean = false;
    private flickerStartTime: number = 0;
    private flickerFrameId: number | null = null;

    constructor(
        private overlayCanvas: HTMLCanvasElement,
        private overlayCtx: CanvasRenderingContext2D,
        private btnStart: HTMLButtonElement,
        private getTranslations: () => Record<string, string>,
        private showCustomModal: (title: string, text: string) => void,
        private onSuccess?: () => void,
        private onSlip?: (targetX: number, targetY: number, startDistance: number) => void
    ) {}

    startFlickerLoop(): void {
        this.stopFlickerLoop();
        this.isFlickering = true;
        this.flickerStartTime = performance.now();

        const loop = (timestamp: number) => {
            if (!this.isFlickering || Store.state.appMode !== 'synoptophore') return;

            if (Store.state.synopFlickerActive) {
                const elapsed = timestamp - this.flickerStartTime;
                // 10 Hz Alpha-Resonance Counter-Phase oscillation (-1.0 to 1.0)
                // Keeps average luminance constant (127 sRGB) to prevent ocular fatigue.
                const factor = Math.sin(elapsed * 0.062831853);
                drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state, factor);
                this.flickerFrameId = this.tracker.requestAnimationFrame(loop);
            } else {
                this.isFlickering = false;
                drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state, 1.0);
            }
        };
        this.flickerFrameId = this.tracker.requestAnimationFrame(loop);
    }

    stopFlickerLoop(): void {
        this.isFlickering = false;
        if (this.flickerFrameId) {
            cancelAnimationFrame(this.flickerFrameId);
            this.tracker.clearAll();
            this.flickerFrameId = null;
        }
        if (Store.state.appMode === 'synoptophore') {
            drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state, 1.0);
        }
    }

    syncFlickerState(): void {
        if (Store.state.synopFlickerActive) {
            this.startFlickerLoop();
        } else {
            this.stopFlickerLoop();
        }
    }

    abort(): void {
        this.stopFlickerLoop();
        this.tracker.clearAll();
        Store.updateState('synopState', 'idle');
    }

    deactivate(): void {
        this.stopFlickerLoop();
        this.tracker.clearAll();
        Store.updateState('synopState', 'idle');
    }

    handlePrimaryAction(): void {
        const s = Store.state;
        if (s.synopState === 'align') {
            this.lockAndStartPulling();
        } else {
            this.breakActiveFusion();
        }
    }

    lockAndStartPulling(): void {
        const s = Store.state;
        const t = this.getTranslations();

        // Save starting offsets as reference coordinates
        this.startX = s.synopTargetX;
        this.startY = s.synopTargetY;

        // Calculate baseline Euclidean distance of ocular deviation
        const dist = Math.sqrt(this.startX * this.startX + this.startY * this.startY);

        // CLINICAL ANTI-CHEAT SAFEGUARD: Block immediate locks at 0,0 (prevents farming free victory cups)
        if (dist < 3) {
            playError(s.isMuted); // Emit non-intrusive warning buzz

            // Render brief instructional feedback on the scoreboard
            const scoreTextEl = document.getElementById('score-text');
            if (scoreTextEl) {
                scoreTextEl.innerHTML = `<span style="color: #f59e0b; font-weight: bold;">${t.synopWarnAlign || '⚠️ Offset target first!'}</span>`;
            }
            return;
        }

        this.tracker.clearAll();
        this.syncFlickerState();

        // Start global Pomodoro tracking as soon as Synoptophore vergence starts pulling
        Store.startTimerIfNeeded();

        Store.updateState('synopStartDistance', dist);
        Store.updateState('synopState', 'pulling');
        this.btnStart.innerText = t.btnSynopBreak || "SLIPPED / RESET";

        playCue(s.isMuted);
        updateScoreboard(s, t);

        // Core Vergence Pull Timer: Shifting 1px closer to zero on every interval tick
        this.tracker.setInterval(() => {
            this.tickPullingStep();
        }, s.synopPullSpeed);
    }

    /**
     * @description Executes a single stepping action of the motor vergence pull.
     * @clinical Simulates the slow, controlled effort of the extraocular muscles
     * as they pull the visual axes towards the true geometric center (0,0).
     */
    private tickPullingStep(): void {
        const s = Store.state;
        const t = this.getTranslations();

        let newTargetX = s.synopTargetX;
        let newTargetY = s.synopTargetY;

        if (newTargetX > 0) newTargetX -= 1;
        else if (newTargetX < 0) newTargetX += 1;

        if (newTargetY > 0) newTargetY -= 1;
        else if (newTargetY < 0) newTargetY += 1;

        Store.updateState('synopTargetX', newTargetX);
        Store.updateState('synopTargetY', newTargetY);

        if (!this.isFlickering) {
            drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state);
        }

        updateScoreboard(Store.state, t);
        playCue(s.isMuted);

        if (Store.state.synopTargetX === 0 && Store.state.synopTargetY === 0) {
            this.completeSuccess();
        }
    }

    /**
     * @description Phase 2 -> Slipped Transition: Triggered when eye muscles give up before reaching 0,0
     */
    breakActiveFusion(): void {
        const s = Store.state;
        const t = this.getTranslations();

        this.tracker.clearAll();
        this.syncFlickerState();

        const currentDist = Math.sqrt(s.synopTargetX * s.synopTargetX + s.synopTargetY * s.synopTargetY);
        const startDist = s.synopStartDistance;

        // Cache active coordinates before state-reset occurs
        const targetXBeforeReset = s.synopTargetX;
        const targetYBeforeReset = s.synopTargetY;

        let percent = 0;
        if (startDist > 0) {
            percent = Math.max(0, Math.min(100, Math.round(100 * (1 - currentDist / startDist))));
        }

        const title = t.synopBreakTitle || "Training Result";
        const textStr = t.synopBreakText || "Slipped. Remainder: {current}px. Corrected: {percent}%";
        const text = textStr
            .replace('{current}', Math.round(currentDist).toString())
            .replace('{start}', Math.round(startDist).toString())
            .replace('{percent}', percent.toString());

        playSlip(s.isMuted);

        // Auto-restore coordinates to calibration origin
        Store.updateState('synopTargetX', this.startX);
        Store.updateState('synopTargetY', this.startY);

        Store.updateState('synopState', 'idle');
        this.btnStart.innerText = t.synopStartBtn || "START";

        const curtain = document.getElementById('calibration-curtain');
        if (curtain) curtain.classList.add('active');

        if (!this.isFlickering) {
            drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state);
        }
        updateScoreboard(Store.state, t);

        this.showCustomModal(title, text);

        // Trigger the onSlip callback dynamically if configured
        if (this.onSlip) {
            this.onSlip(targetXBeforeReset, targetYBeforeReset, startDist);
        }
    }

    /**
     * @description Phase 2 -> Completion Transition: Perfect 100% motor fusion success
     */
    completeSuccess(): void {
        const s = Store.state;
        const t = this.getTranslations();

        this.tracker.clearAll();
        this.syncFlickerState();

        playSuccess(s.isMuted);

        Store.updateState('synopScore', s.synopScore + 1);
        Store.saveSettings();

        Store.updateState('synopTargetX', 0);
        Store.updateState('synopTargetY', 0);

        Store.updateState('synopState', 'idle');
        this.btnStart.innerText = t.synopStartBtn || "START";

        const curtain = document.getElementById('calibration-curtain');
        if (curtain) curtain.classList.add('active');

        drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state);
        updateScoreboard(Store.state, t);

        this.showCustomModal(t.synopSuccessTitle || "Success", t.synopSuccessText || "Perfect fusions.");

        // Trigger the onSuccess callback statically if configured
        if (this.onSuccess) {
            this.onSuccess();
        }
    }
}