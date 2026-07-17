/**
 * @file synoptophore.ts
 * @description Controller subsystem for Synoptophore and Oculomotor Vergence training.
 * Mimics clinical orthoptic devices used to treat strabismus by coordinating 
 * sensory fusion alignment and incremental motor pulling of the extraocular muscles.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import { AsyncResourceTracker } from '../utils/tracker';
import { drawSynoptophoreTargets } from '../engine/synop-render';
import { playCue, playSuccess, playError, playSlip } from '../engine/audio';
import { updateScoreboard } from '../ui/screen';

/**
 * @description Controller managing the lifecycle of vergence training blocks.
 */
export class SynoptophoreController {
    /** @description Centralized resource tracker for safe cleanup of intervals and frames. */
    public tracker: AsyncResourceTracker = new AsyncResourceTracker();
    /** @description Remembers the initial X-axis deviation at the start of vergence pull. */
    public startX: number = 0;
    /** @description Remembers the initial Y-axis deviation at the start of vergence pull. */
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

    /**
     * @description Initiates a 10Hz alpha-resonance flicker loop for the lazy eye target.
     * 
     * @clinical 
     * Stroboscopic stimulation at 10Hz bypasses cortical top-down suppression, 
     * forcing the visual cortex to integrate the weak eye's signal during active fusion.
     * 
     * @mathematical 
     * Oscillation factor = sin(elapsed_ms * 2 * PI / 100) -> ensures exact 10 cycles per second.
     */
    startFlickerLoop(): void {
        this.stopFlickerLoop();
        this.isFlickering = true;
        this.flickerStartTime = performance.now();

        const loop = (timestamp: number) => {
            if (!this.isFlickering || Store.state.appMode !== 'synoptophore') return;

            if (Store.state.synopFlickerActive) {
                const elapsed = timestamp - this.flickerStartTime;
                // 10 Hz Alpha-Resonance oscillation
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

    /** @description Terminates the flicker loop and restores static target visibility. */
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

    /** @description Synchronizes the flicker animation state with the current global settings. */
    syncFlickerState(): void {
        if (Store.state.synopFlickerActive) {
            this.startFlickerLoop();
        } else {
            this.stopFlickerLoop();
        }
    }

    /** @description Resets the controller to the IDLE state and stops all active cycles. */
    abort(): void {
        this.stopFlickerLoop();
        this.tracker.clearAll();
        Store.updateState('synopState', 'idle');
    }

    /** @description Idempotent teardown method for clinical mode switching. */
    deactivate(): void {
        this.stopFlickerLoop();
        this.tracker.clearAll();
        Store.updateState('synopState', 'idle');
    }

    /** @description Routes the primary UI trigger based on the active synoptophore phase. */
    handlePrimaryAction(): void {
        const s = Store.state;
        if (s.synopState === 'align') {
            this.lockAndStartPulling();
        } else {
            this.breakActiveFusion();
        }
    }

    /**
     * @description Transitions from Sensory Fusion (alignment) to Motor Vergence (pulling).
     * 
     * @clinical 
     * Initiates the active muscular load phase. Extraocular muscles must contract 
     * to keep the shifted targets fused as the software pulls them toward center (0,0).
     * 
     * @mathematical
     * - Evaluates initial Euclidean distance of ocular deviation.
     * - Implements an anti-cheat guard: prevents locking if deviation < 3px.
     */
    lockAndStartPulling(): void {
        const s = Store.state;
        const t = this.getTranslations();

        this.startX = s.synopTargetX;
        this.startY = s.synopTargetY;

        const dist = Math.sqrt(this.startX * this.startX + this.startY * this.startY);

        // Clinical Anti-Cheat: Block immediate locks at geometric center
        if (dist < 3) {
            playError(s.isMuted);
            const scoreTextEl = document.getElementById('score-text');
            if (scoreTextEl) {
                scoreTextEl.innerHTML = `<span style="color: #f59e0b; font-weight: bold;">${t.synopWarnAlign || '⚠️ Offset target first!'}</span>`;
            }
            return;
        }

        this.tracker.clearAll();
        this.syncFlickerState();

        Store.startTimerIfNeeded();

        Store.updateState('synopStartDistance', dist);
        Store.updateState('synopState', 'pulling');
        this.btnStart.innerText = t.btnSynopBreak || "SLIPPED / RESET";

        playCue(s.isMuted);
        updateScoreboard(s, t);

        // Initiate vergence pull interval: 1px step closer to zero on every tick
        this.tracker.setInterval(() => {
            this.tickPullingStep();
        }, s.synopPullSpeed);
    }

    /**
     * @description Executes a single incremental vergence pull step.
     * 
     * @clinical 
     * Gently exercises extraocular rectus muscles by shifting visual axes toward true center.
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
     * @description Handles the 'Slipped' outcome when fusion is lost before reaching center.
     * 
     * @clinical 
     * Evaluates muscle contraction progress: Progress % = 100 * (1 - currentDistance / startDistance).
     */
    breakActiveFusion(): void {
        const s = Store.state;
        const t = this.getTranslations();

        this.tracker.clearAll();
        this.syncFlickerState();

        const currentDist = Math.sqrt(s.synopTargetX * s.synopTargetX + s.synopTargetY * s.synopTargetY);
        const startDist = s.synopStartDistance;

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

        // Auto-restore targets back to the subjective squint angle for relaxation
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

        // Notify orchestrator via callback to persist the slipped session
        if (this.onSlip) {
            this.onSlip(targetXBeforeReset, targetYBeforeReset, startDist);
        }
    }

    /**
     * @description Handles the 'Perfect Fusion' outcome when targets reach 0,0 offset.
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

        // Notify orchestrator via callback to persist the successful session
        if (this.onSuccess) {
            this.onSuccess();
        }
    }
}