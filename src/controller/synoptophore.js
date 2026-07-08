/*
 * GaborNeuroFit - Synoptophore & Vergence Training Controller Subsystem
 * Copyright (C) 2026 Pavel Korotkov
 */

import { Store } from '../store.js';
import { AsyncResourceTracker } from '../utils/tracker.js';
import { drawSynoptophoreTargets } from '../engine/synop_render.js';
import { playCue, playSuccess, playError } from '../engine/audio.js';

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
    }

    abort() {
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

        this.tracker.clearAll();

        this.startX = s.synopTargetX;
        this.startY = s.synopTargetY;

        const dist = Math.sqrt(this.startX * this.startX + this.startY * this.startY);
        Store.updateState('synopStartDistance', dist);

        if (dist === 0) {
            this.completeSuccess();
            return;
        }

        Store.updateState('synopState', 'pulling');
        this.btnStart.innerText = t.btnSynopBreak;
        playCue(s.isMuted);

        this.tracker.setInterval(() => {
            this.tickPullingStep();
        }, s.synopPullSpeed);
    }

    tickPullingStep() {
        const s = Store.state;

        if (s.synopTargetX > 0) s.synopTargetX -= 1;
        else if (s.synopTargetX < 0) s.synopTargetX += 1;

        if (s.synopTargetY > 0) s.synopTargetY -= 1;
        else if (s.synopTargetY < 0) s.synopTargetY += 1;

        drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, s);
        playCue(s.isMuted);

        if (s.synopTargetX === 0 && s.synopTargetY === 0) {
            this.completeSuccess();
        }
    }

    breakActiveFusion() {
        const s = Store.state;
        const t = this.getTranslations();

        this.tracker.clearAll();

        const currentDist = Math.sqrt(s.synopTargetX * s.synopTargetX + s.synopTargetY * s.synopTargetY);
        const startDist = s.synopStartDistance;

        let percent = 0;
        if (startDist > 0) {
            percent = Math.max(0, Math.min(100, Math.round(100 * (1 - currentDist / startDist))));
        }

        const title = t.synopBreakTitle;
        const text = t.synopBreakText
            .replace('{current}', Math.round(currentDist).toString())
            .replace('{start}', Math.round(startDist).toString())
            .replace('{percent}', percent.toString());

        playError(s.isMuted);

        s.synopTargetX = this.startX;
        s.synopTargetY = this.startY;
        Store.updateState('synopState', 'align');
        this.btnStart.innerText = t.btnSynopLock;

        drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, s);
        this.showCustomModal(title, text);
    }

    completeSuccess() {
        const s = Store.state;
        const t = this.getTranslations();

        this.tracker.clearAll();
        playSuccess(s.isMuted);

        s.synopTargetX = 0;
        s.synopTargetY = 0;
        Store.updateState('synopState', 'align');
        this.btnStart.innerText = t.btnSynopLock;

        drawSynoptophoreTargets(this.overlayCanvas, this.overlayCtx, s);
        this.showCustomModal(t.synopSuccessTitle, t.synopSuccessText);
    }
}