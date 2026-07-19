/**
 * @file view-controller.ts
 * @description Manages all DOM manipulations and UI state synchronization.
 * Implements the "Passive View" pattern to decouple app logic from HTML structure.
 */

import { AppState, AppMode } from '../types/clinical';

export class ViewController {
    private elements: {
        container: HTMLElement;
        btnStart: HTMLButtonElement;
        cross: HTMLElement;
        curtain: HTMLElement;
        topBar: HTMLElement;
        btnSettings: HTMLButtonElement;
        btnStats: HTMLButtonElement;
        btnInfo: HTMLButtonElement;
        btnMute: HTMLButtonElement;
        btnPause: HTMLButtonElement;
        btnLeft: HTMLButtonElement;
        btnRight: HTMLButtonElement;
        btnReset: HTMLButtonElement;
    };

    constructor() {
        this.elements = {
            container: document.getElementById('container')!,
            btnStart: document.getElementById('btn-start') as HTMLButtonElement,
            cross: document.getElementById('cross')!,
            curtain: document.getElementById('calibration-curtain')!,
            topBar: document.getElementById('top-bar')!,
            btnSettings: document.getElementById('btn-settings') as HTMLButtonElement,
            btnStats: document.getElementById('btn-stats') as HTMLButtonElement,
            btnInfo: document.getElementById('btn-info') as HTMLButtonElement,
            btnMute: document.getElementById('btn-mute') as HTMLButtonElement,
            btnPause: document.getElementById('btn-pause') as HTMLButtonElement,
            btnLeft: document.getElementById('btn-left') as HTMLButtonElement,
            btnRight: document.getElementById('btn-right') as HTMLButtonElement,
            btnReset: document.getElementById('btn-reset') as HTMLButtonElement,
        };
    }

    /**
     * Master synchronization method.
     * Maps the reactive AppState to DOM attributes and properties.
     */
    public sync(state: AppState, translations: Record<string, string>, rdsState?: string, gaborState?: string): void {
        const { elements: el } = this;
        const isCompleted = state.isSessionCompleted;
        const canPause = this.isPausable(state, rdsState, gaborState);

        // Sync Data Attributes for CSS-driven styling
        el.container.dataset.appMode = state.appMode;
        el.container.dataset.paused = String(state.isPaused);
        el.container.dataset.curtainActive = String(state.isCurtainActive);

        el.container.dataset.level = String(state.appMode === 'rds' ? state.rdsLevel : state.currentLevel);
        el.container.dataset.synopState = state.synopState;
        el.container.dataset.sessionCompleted = String(isCompleted);
        el.container.dataset.startDisabled = String(el.btnStart.disabled);
        el.container.dataset.crossState = this.resolveCrossState(state, rdsState, gaborState);

        // Sync Curtain
        el.curtain.classList.toggle('active', state.isCurtainActive);

        // Sync Start Button (Text and Visuals)
        el.btnStart.innerText = this.resolveStartButtonText(state, translations);
        el.btnStart.disabled = this.isStartDisabled(state, rdsState, gaborState);
        el.btnStart.classList.toggle('victory-pulse', isCompleted);
        el.btnStart.classList.toggle('start-pulse', this.isInitialState(state) && !isCompleted && !state.isPaused);

        // Sync HUD Controls Accessibility
        el.topBar.classList.toggle('locked-state', isCompleted);
        el.btnSettings.disabled = !canPause || isCompleted;
        el.btnStats.disabled = !canPause || isCompleted;
        el.btnInfo.disabled = !canPause || isCompleted;
        el.btnMute.disabled = isCompleted;
        el.btnPause.disabled = !canPause || isCompleted;

        // Sync Action Buttons
        el.btnLeft.disabled = state.isPaused;
        el.btnRight.disabled = state.isPaused;
        el.btnReset.disabled = state.appMode === 'synoptophore' ? (state.synopState !== 'align') : false;

        // Handle Twemoji parsing
        // @ts-ignore
        if (typeof window !== 'undefined' && window.twemoji) {
            window.twemoji.parse(el.btnStart);
            window.twemoji.parse(el.btnPause);
        }
    }

    /**
     * Toggles visibility of modal-specific buttons based on AppMode
     */
    public updateLayoutMode(mode: AppMode): void {
        const isSynop = (mode === 'synoptophore');
        this.elements.btnReset.style.display = isSynop ? 'flex' : 'none';
        this.elements.btnLeft.style.display = isSynop ? 'none' : 'flex';
        this.elements.btnRight.style.display = isSynop ? 'none' : 'flex';
    }

    private resolveStartButtonText(s: AppState, t: Record<string, string>): string {
        if (s.isSessionCompleted) return t.btnResetSession || "Reset Session";
        
        if (s.appMode === 'synoptophore') {
            if (s.synopState === 'idle') return t.synopStartBtn || "Start Alignment";
            if (s.synopState === 'align') return t.btnSynopLock || "Lock Fusion";
            return t.btnSynopBreak || "Slipped / Reset";
        }

        if (s.appMode === 'rds') {
            // Clinical UX: If the session has already started, use the "Next" template
            return s.rdsTotal > 0 ? (t.rdsNextBtn || "Next Stereogram") : (t.rdsStartBtn || "Start Stereogram");
        }

        // Default Gabor Mode
        if (s.isWaitingForAnswer) return t.reflashBtn || "Re-Flash";
        // If the session has already started, use the "Next" template
        return s.total > 0 ? (t.nextBtn || "Next Flash") : (t.startBtn || "Start Flash");
    }

    private resolveCrossState(s: AppState, rdsState?: string, gaborState?: string): string {
        if (s.isAnaglyphTestActive) return 'visible';
        if (s.isCurtainActive) return 'hidden';
        if (s.appMode === 'synoptophore') return 'hidden';

        if (s.appMode === 'rds') {
            if (!s.rdsIsPermanentCrossEnabled) return 'hidden';
            const isStimActive = (rdsState === 'STIMULUS_ACTIVE' || rdsState === 'AWAITING_INPUT') && !s.isPaused;
            return isStimActive ? 'white-halo' : 'hidden';
        }

        // Gabor
        if (s.isAnaglyphTestActive) return 'visible';
        if (s.isPaused) return 'dimmed';
        
        const isStimVisible = (gaborState === 'STIMULUS_ACTIVE') || (gaborState === 'AWAITING_INPUT' && s.isStaticEnabled);
        if (isStimVisible) return s.isPermanentCrossEnabled ? 'dimmed' : 'hidden';
        
        return 'visible';
    }

    private isPausable(s: AppState, rdsState?: string, gaborState?: string): boolean {
        if (s.isPaused) return true;
        if (s.appMode === 'synoptophore' && s.synopState === 'pulling') return false;
        if (s.appMode === 'gabor' && (gaborState === 'PRE_CUE' || gaborState === 'STIMULUS_ACTIVE' || gaborState === 'FEEDBACK')) return false;
        if (s.appMode === 'rds' && (rdsState === 'PRE_CUE' || rdsState === 'FEEDBACK')) return false;
        return true;
    }

    private isStartDisabled(s: AppState, rdsState?: string, gaborState?: string): boolean {
        if (s.isSessionCompleted) return false;
        if (s.isPaused) return true;
        if (s.appMode === 'synoptophore') return false;
        
        if (s.appMode === 'gabor') {
            if (gaborState === 'PRE_CUE' || gaborState === 'STIMULUS_ACTIVE' || gaborState === 'FEEDBACK') return true;
            if (s.isStaticEnabled && s.isWaitingForAnswer) return true;
            // Dim the button only if the auto-advance timer is actively running.
            // When you close settings, the timer is inactive, so the button is enabled and waits for your click.
            if (s.autoAdvance && s.isAutoAdvanceTimerActive) return true;
        }

        if (s.appMode === 'rds') {
            if (rdsState === 'PRE_CUE' || rdsState === 'STIMULUS_ACTIVE' || rdsState === 'AWAITING_INPUT' || rdsState === 'FEEDBACK') return true;
            if (s.rdsAutoAdvance && s.isAutoAdvanceTimerActive) return true;
        }

        return false;
    }

    private isInitialState(s: AppState): boolean {
        if (s.appMode === 'gabor') return s.total === 0;
        if (s.appMode === 'rds') return s.rdsTotal === 0;
        return s.synopState === 'idle';
    }
}