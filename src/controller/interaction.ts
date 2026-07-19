/**
 * @file interaction.ts
 * @description Controller managing user input gestures (touch, mouse, keyboard).
 * Encapsulates dragging, edge-nudging for Synoptophore, and swipe detection.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import { bindInputControls, InputHandlers } from '../ui/controls';

export interface InteractionActions {
    onAnswer: (dir: 'left' | 'right') => void;
    onReset: () => void;
    onPrimary: () => void;
    onMuteToggle: () => void;
    onPauseToggle: () => void;
    onEscape: () => void;
    onCanvasClick: () => void;
    triggerSynopDragEffects: () => void;
}

export class InteractionController {
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private dragStartStrongFactor: number = 0.3;
    
    private edgeTimeoutId: number | null = null;
    private edgeIntervalId: number | null = null;
    private isEdgeHoldingActive: boolean = false;
    private lastTouchTime: number = 0;

    constructor(
        private container: HTMLElement,
        public actions: InteractionActions
    ) {}

    /**
     * Initializes hardware listeners via the controls driver
     */
    public init(): void {
        const handlers: InputHandlers = {
            onActionLeft: () => this.handleDirectionalInput('left'),
            onActionRight: () => this.handleDirectionalInput('right'),
            onActionReset: () => this.actions.onReset(),
            onActionPrimary: () => this.actions.onPrimary(),
            onActionMuteToggle: () => this.actions.onMuteToggle(),
            onActionPauseToggle: () => this.actions.onPauseToggle(),
            onActionCanvasClick: () => this.actions.onCanvasClick(),
            onEscape: () => this.actions.onEscape(),
            
            onDragStart: (e) => this.handleDragStart(e),
            onDragUpdate: (dx, dy) => this.handleDragUpdate(dx, dy),
            onDragEnd: (dt, dx, dy) => this.handleDragEnd(dt, dx, dy),
            
            onDragMovePreventDefault: () => Store.state.appMode === 'synoptophore',
            isDirectionalHoldActive: () => Store.state.isAnaglyphTestActive || (Store.state.appMode === 'synoptophore' && Store.state.synopState === 'align'),
            onDirectionalShift: (dx, dy) => this.handleDirectionalShift(dx, dy)
        };

        bindInputControls(handlers);
    }

    /**
     * Resets internal gesture states and clears active timers during mode transitions
     */
    public reset(): void {
        this.clearEdgeTimers();
        this.isEdgeHoldingActive = false;
    }

    private clearEdgeTimers(): void {
        if (this.edgeTimeoutId !== null) window.clearTimeout(this.edgeTimeoutId);
        if (this.edgeIntervalId !== null) window.clearInterval(this.edgeIntervalId);
        this.edgeTimeoutId = null;
        this.edgeIntervalId = null;
    }

    private handleDirectionalInput(dir: 'left' | 'right'): void {
        const s = Store.state;
        if (s.isPaused || s.isSessionCompleted || s.isAnaglyphTestActive) return;

        if (s.appMode === 'synoptophore') {
            if (s.synopState === 'align') {
                Store.updateState('synopTargetX', s.synopTargetX + (dir === 'left' ? -1 : 1));
                this.actions.triggerSynopDragEffects();
            }
        } else {
            this.actions.onAnswer(dir);
        }
    }

    private handleDragStart(event?: Event): void {
        const s = Store.state;
        if (s.isPaused || s.isCurtainActive) return;

        if (event) {
            if (event.type === 'touchstart') this.lastTouchTime = Date.now();
            else if (event.type === 'mousedown' && Date.now() - this.lastTouchTime < 500) return;
            
            if (s.appMode === 'synoptophore' && !(event.target as HTMLElement).closest('#container')) return;
        }

        Store.startTimerIfNeeded();
        if (this.container && s.appMode === 'synoptophore') this.container.classList.add('dragging');

        this.dragStartX = s.synopTargetX;
        this.dragStartY = s.synopTargetY;
        this.dragStartStrongFactor = s.appMode === 'synoptophore' ? s.synopStrongEyeContrastFactor : s.strongEyeContrastFactor;

        this.clearEdgeTimers();

        if (s.appMode === 'synoptophore' && s.synopState === 'align' && event) {
            let clientX = 0, clientY = 0;
            if (event instanceof MouseEvent) { clientX = event.clientX; clientY = event.clientY; }
            else if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent && event.touches.length > 0) {
                clientX = event.touches[0].clientX; clientY = event.touches[0].clientY;
            }

            if (clientX > 0 && clientY > 0) {
                const rect = this.container.getBoundingClientRect();
                const nx = (clientX - rect.left) / rect.width;
                const ny = (clientY - rect.top) / rect.height;
                const edgeZone = 0.25;

                if (nx < edgeZone || nx > 1 - edgeZone || ny < edgeZone || ny > 1 - edgeZone) {
                    let dx = 0, dy = 0;
                    if (nx < edgeZone) dx = -1; else if (nx > 1 - edgeZone) dx = 1;
                    if (ny < edgeZone) dy = -1; else if (ny > 1 - edgeZone) dy = 1;

                    this.isEdgeHoldingActive = true;
                    const nudge = () => {
                        if (Store.state.isPaused) return;
                        if (dx !== 0) Store.updateState('synopTargetX', Store.state.synopTargetX + dx);
                        if (dy !== 0) Store.updateState('synopTargetY', Store.state.synopTargetY + dy);
                        this.actions.triggerSynopDragEffects();
                    };
                    nudge();
                    this.edgeTimeoutId = window.setTimeout(() => {
                        this.edgeIntervalId = window.setInterval(nudge, 50);
                    }, 250);
                }
            }
        }
    }

    private handleDragUpdate(deltaX: number, deltaY: number): void {
        const s = Store.state;
        if (s.isPaused) return;

        if (s.isAnaglyphTestActive) {
            const slider = document.getElementById('range-strong-attenuation') as HTMLInputElement | null;
            if (slider) {
                const delta = -deltaY * 0.4;
                slider.value = Math.max(10, Math.min(100, Math.round(this.dragStartStrongFactor * 100 + delta))).toString();
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }

        if (s.appMode === 'synoptophore' && s.synopState === 'align') {
            if (this.isEdgeHoldingActive) {
                if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 8) {
                    this.clearEdgeTimers();
                    this.isEdgeHoldingActive = false;
                } else return;
            }
            Store.updateState('synopTargetX', this.dragStartX + deltaX);
            Store.updateState('synopTargetY', this.dragStartY + deltaY);
            this.actions.triggerSynopDragEffects();
        }
    }

    private handleDragEnd(deltaTime: number, deltaXTotal: number, deltaYTotal: number): void {
        const s = Store.state;
        if (this.container) this.container.classList.remove('dragging');
        this.clearEdgeTimers();
        this.isEdgeHoldingActive = false;

        if (s.appMode === 'synoptophore') return;

        if (deltaTime <= 300 && Math.abs(deltaXTotal) >= 45 && Math.abs(deltaYTotal) <= 45) {
            this.actions.onAnswer(deltaXTotal < 0 ? 'left' : 'right');
        }
    }

    private handleDirectionalShift(dx: number, dy: number): void {
        const s = Store.state;
        if (s.isAnaglyphTestActive) {
            if (dy !== 0) {
                const slider = document.getElementById('range-strong-attenuation') as HTMLInputElement | null;
                if (slider) {
                    const step = parseInt(slider.step, 10) || 5;
                    slider.value = Math.max(10, Math.min(100, parseInt(slider.value, 10) + (-dy * step))).toString();
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            return;
        }
        if (s.appMode === 'synoptophore' && s.synopState === 'align') {
            Store.updateState('synopTargetX', s.synopTargetX + dx);
            Store.updateState('synopTargetY', s.synopTargetY + dy);
            this.actions.triggerSynopDragEffects();
        }
    }
}