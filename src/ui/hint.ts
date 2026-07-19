/**
 * @file hint.ts
 * @description Master Controller for the HUD hinting system.
 * Zero-flicker, action-priority hint engine.
 * 
 * Logic Rules:
 * 1. Gameplay hints (Left/Right/Start) -> Shown once per session on action, SILENT on hover.
 * 2. Systemic hints (Pause/Mute/etc) -> Always shown on hover and action.
 * 3. Atomic Locking -> Action-triggered hints ignore all mouseout events.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import { updateStatusBar } from './screen';

export class HudHintController {
    private displayTimer: number | null = null;
    private animTimer: number | null = null;
    private debounceTimer: number | null = null;
    private hideDelayTimer: number | null = null;
    
    // Hard-lock to prevent any UI flickering during physical interactions
    private isActionLocked: boolean = false;
    
    // Memory to ensure gameplay onboarding hints are shown exactly ONCE
    private triggeredSessionHints: Set<string> = new Set();

    private statusBar: HTMLElement | null;
    private hintEl: HTMLElement | null;
    private topControls: HTMLElement | null;
    private bottomDock: HTMLElement | null;

    constructor(private getTranslations: () => Record<string, string>) {
        this.statusBar = document.getElementById('mode-status-bar');
        this.hintEl = document.getElementById('status-hint');
        this.topControls = document.getElementById('top-controls');
        this.bottomDock = document.getElementById('bottom-dock');
    }

    public init(): void {
        if (!this.topControls || !this.statusBar || !this.hintEl) return;

        const handleMouseOver = (e: MouseEvent) => {
            if (this.isActionLocked) return; // Action hint has absolute priority

            // Cancel any pending hide to ensure "sticky" transition between buttons
            if (this.hideDelayTimer) {
                window.clearTimeout(this.hideDelayTimer);
                this.hideDelayTimer = null;
            }

            const btn = (e.target as HTMLElement).closest('[data-hint]') as HTMLElement;
            if (!btn) return;
            let key = btn.getAttribute('data-hint');
            if (!key) return;

            if (this.isGameplayKey(key)) return;

            // Contextual swap ONLY for hover states: show what WILL happen on click
            if (key === 'hintBtnPause' && Store.state.isPaused) {
                key = 'hintBtnResume';
            }

            this.clearDebounce();

            if (this.statusBar?.classList.contains('hint-mode')) {
                this.executeRender(key, 2500);
            } else {
                this.debounceTimer = window.setTimeout(() => {
                    this.executeRender(key!, 2500);
                }, 120);
            }
        };

        const handleMouseOut = () => {
            if (this.isActionLocked) return; // Ignore jitter during clicks
            this.clearDebounce();
            
            // Add stickiness: wait 150ms before reverting to stats 
            // to allow smooth movement between HUD elements.
            if (this.hideDelayTimer) window.clearTimeout(this.hideDelayTimer);
            this.hideDelayTimer = window.setTimeout(() => {
                this.hideHint();
                this.hideDelayTimer = null;
            }, 150);
        };

        // Standard Mouse/Touch Hover events
        this.topControls.addEventListener('mouseover', handleMouseOver);
        this.topControls.addEventListener('mouseout', handleMouseOut);

        // Accessibility Keyboard Focus events (Tab / Shift+Tab)
        this.topControls.addEventListener('focusin', handleMouseOver as any);
        this.topControls.addEventListener('focusout', handleMouseOut);

        if (this.bottomDock) {
            this.bottomDock.addEventListener('mouseover', handleMouseOver);
            this.bottomDock.addEventListener('mouseout', handleMouseOut);
            
            this.bottomDock.addEventListener('focusin', handleMouseOver as any);
            this.bottomDock.addEventListener('focusout', handleMouseOut);
        }
    }

    public triggerTemporaryHint(hintKey: string): void {
        const key = hintKey;
        if (this.isGameplayKey(key)) {
            if (this.triggeredSessionHints.has(key)) return;
            this.triggeredSessionHints.add(key);
        }

        // Cancel hide timer if an action is performed during the grace period
        if (this.hideDelayTimer) {
            window.clearTimeout(this.hideDelayTimer);
            this.hideDelayTimer = null;
        }

        this.clearDebounce();
        this.isActionLocked = true; // Engage flicker protection

        const duration = this.isGameplayKey(key) ? 1200 : 2000;
        this.executeRender(key, duration);
    }

    private isGameplayKey(key: string): boolean {
        return key === 'hintBtnStart' || key === 'hintBtnLeft' || key === 'hintBtnRight' || key === 'hintBtnReset';
    }

    private executeRender(key: string, durationMs: number): void {
        if (!this.statusBar || !this.hintEl) return;
        const text = this.getTranslations()[key];
        if (!text) return;

        this.clearRenderTimers();

        // Scene: Update existing hint
        if (this.statusBar.classList.contains('hint-mode')) {
            if (this.hintEl.innerText === text) {
                this.startDisplayTimer(durationMs);
                return;
            }
            this.statusBar.classList.add('hint-swap-out');
            this.animTimer = window.setTimeout(() => {
                if (this.hintEl) this.hintEl.innerText = text;
                this.statusBar?.classList.remove('hint-swap-out');
                this.statusBar?.classList.add('hint-swap-in');
                void this.statusBar?.offsetWidth;
                this.statusBar?.classList.remove('hint-swap-in');
                this.startDisplayTimer(durationMs);
            }, 350);
        } else {
            // Scene: Fresh entrance
            this.hintEl.innerText = text;
            this.statusBar.classList.add('hint-mode');
            this.startDisplayTimer(durationMs);
        }
    }

    private startDisplayTimer(durationMs: number): void {
        if (this.displayTimer) window.clearTimeout(this.displayTimer);
        this.displayTimer = window.setTimeout(() => {
            this.isActionLocked = false; // Release lock
            this.hideHint();
        }, durationMs);
    }

    private hideHint(): void {
        this.clearRenderTimers();
        if (this.statusBar?.classList.contains('hint-mode')) {
            this.statusBar.classList.remove('hint-mode', 'hint-swap-out', 'hint-swap-in');
            this.animTimer = window.setTimeout(() => {
                if (this.statusBar && !this.statusBar.classList.contains('hint-mode')) {
                    updateStatusBar(Store.state, this.getTranslations());
                }
            }, 450);
        }
    }

    private clearDebounce(): void {
        if (this.debounceTimer) { window.clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    }

    private clearRenderTimers(): void {
        if (this.displayTimer) { window.clearTimeout(this.displayTimer); this.displayTimer = null; }
        if (this.animTimer) { window.clearTimeout(this.animTimer); this.animTimer = null; }
        if (this.hideDelayTimer) { window.clearTimeout(this.hideDelayTimer); this.hideDelayTimer = null; }
    }
}