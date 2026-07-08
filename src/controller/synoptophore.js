/*
 * GaborNeuroFit - Synoptophore & Vergence Training Controller Subsystem
 * Copyright (C) 2026 Pavel Korotkov
 */

import { Store } from '../store.js';
import { AsyncResourceTracker } from '../utils/tracker.js';
import { drawSynoptophoreTargets } from '../engine/synop_render.js';
import { playCue, playSuccess, playError } from '../engine/audio.js';
import { updateScoreboard } from '../ui/screen.js';

export class SynoptophoreController {
    constructor(canvas, overlayCanvas, overlayCtx, btnStart, translationsGetter, showCustomModal) {
        this.canvas = canvas;
        this.overlayCanvas = overlayCanvas;
        this.overlayCtx = overlayCtx;
        this.btnStart = btnStart;
        this.getTranslations = translationsGetter;
        this.showCustomModal = showCustomModal;
        this.tracker = new AsyncResourceTracker();
        this.startX = 0;
        this.startY = 0;
        this.isFlickering = false;
        this.flickerStartTime = 0;
    }

    startFlickerLoop() {
        this.stopFlickerLoop();
        this.isFlickering = true;
        this.flickerStartTime = performance.now();
        
        const loop = (timestamp) => {
            if (!this.isFlickering || Store.state.appMode !== 'synoptophore') return;
            
            if (Store.state.synopFlickerActive) {
                const elapsed = timestamp - this.flickerStartTime;
                // 10 Hz Alpha-Resonance mathematical oscillation (0.0 to 1.0)
                const factor = 0.5 - 0.5 * Math.cos(elapsed * 0.062831853);
                drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state, factor);
                this.tracker.requestAnimationFrame(loop);
            } else {
                this.isFlickering = false;
                drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state, 1.0);
            }
        };
        this.tracker.requestAnimationFrame(loop);
    }

    stopFlickerLoop() {
        this.isFlickering = false;
        drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, Store.state, 1.0);
    }

    abort() {
        this.stopFlickerLoop();
        this.tracker.clearAll();
        Store.updateState('synopState', 'align');
    }

    handlePrimaryAction() {
        const s = Store.state;
        if (s.synopState === 'align') {
            this.lockAndStartPulling();
        } else {
            this.breakActiveFusion();
        }
    }

    lockAndStartPulling() {
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
        
        // CRITICAL FIX: Restart the flicker animation loop if it was killed by clearAll()
        if (s.synopFlickerActive) {
            this.startFlickerLoop();
        }

        Store.updateState('synopStartDistance', dist);
        Store.updateState('synopState', 'pulling');
        this.btnStart.innerText = t.btnSynopBreak;

        // Play auditory start notification
        playCue(s.isMuted);

        // Reactively activate the dynamic UI progress bar
        updateScoreboard(s, t);

        // Core Vergence Pull Timer: Shifting 1px closer to zero on every interval tick
        this.tracker.setInterval(() => {
            this.tickPullingStep();
        }, s.synopPullSpeed);
    }

    /**
     * Single stepping action of the motor vergence pull
     */
    tickPullingStep() {
        const s = Store.state;
        const t = this.getTranslations();

        // Pull X coordinate towards geometric center
        if (s.synopTargetX > 0) s.synopTargetX -= 1;
        else if (s.synopTargetX < 0) s.synopTargetX += 1;

        // Pull Y coordinate towards geometric center
        if (s.synopTargetY > 0) s.synopTargetY -= 1;
        else if (s.synopTargetY < 0) s.synopTargetY += 1;

        // Skip static draw call if animation loop is already yielding dynamic luminance frames
        if (!this.isFlickering) {
            drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, s);
        }
        
        // Update live vergence progress metrics on the scoreboard in real-time
        updateScoreboard(s, t);

        // Play quiet acoustic click (sonar effect) to coordinate pacing
        playCue(s.isMuted);

        // Check if targets successfully merged at coordinate zero
        if (s.synopTargetX === 0 && s.synopTargetY === 0) {
            this.completeSuccess();
        }
    }

    /**
     * Phase 2 -> Slipped Transition: Triggered when eye muscles give up before reaching 0,0
     */
    breakActiveFusion() {
        const s = Store.state;
        const t = this.getTranslations();

        this.tracker.clearAll();

        // CRITICAL FIX: Restart the flicker animation loop if it was killed by clearAll()
        if (s.synopFlickerActive) {
            this.startFlickerLoop();
        }

        // Calculate remaining deviation
        const currentDist = Math.sqrt(s.synopTargetX * s.synopTargetX + s.synopTargetY * s.synopTargetY);
        const startDist = s.synopStartDistance;

        // Calculate quantitative extraocular muscle contraction progress
        let percent = 0;
        if (startDist > 0) {
            percent = Math.max(0, Math.min(100, Math.round(100 * (1 - currentDist / startDist))));
        }

        // Format progress results strings dynamically
        const title = t.synopBreakTitle;
        const text = t.synopBreakText
            .replace('{current}', Math.round(currentDist).toString())
            .replace('{start}', Math.round(startDist).toString())
            .replace('{percent}', percent.toString());

        // Play negative acoustic feedback
        playError(s.isMuted);

        // UX Master Polish: Automatically restore Gabor circle offsets to starting calibration coordinates
        s.synopTargetX = this.startX;
        s.synopTargetY = this.startY;

        Store.updateState('synopState', 'align');
        this.btnStart.innerText = t.btnSynopLock;

        // Synchronize view layers safely
        if (!this.isFlickering) {
            drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, s);
        }
        updateScoreboard(s, t); // Hide progress bar on slip
        
        // Show clinical report modal
        this.showCustomModal(title, text);
    }

    /**
     * Phase 2 -> Completion Transition: Perfect 100% motor fusion success
     */
    completeSuccess() {
        const s = Store.state;
        const t = this.getTranslations();

        this.tracker.clearAll();

        // CRITICAL FIX: Restart the flicker animation loop if it was killed by clearAll()
        if (s.synopFlickerActive) {
            this.startFlickerLoop();
        }

        // Play major chime arpeggio
        playSuccess(s.isMuted);

        // Symmetrically increment vergence success score and commit to persistence
        Store.updateState('synopScore', s.synopScore + 1);
        Store.saveSettings();

        // Reset coords completely
        s.synopTargetX = 0;
        s.synopTargetY = 0;

        Store.updateState('synopState', 'align');
        this.btnStart.innerText = t.btnSynopLock;

        drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, s);
        updateScoreboard(s, t); // Hide progress bar on success

        this.showCustomModal(t.synopSuccessTitle, t.synopSuccessText);
    }
}