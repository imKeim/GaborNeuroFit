/**
 * @file hint.ts
 * @description Controller for the HUD hinting system.
 * Manages debounced hover tooltips with a perpetual upward "calendar-roll" animation.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import { updateStatusBar } from './screen';

export class HudHintController {
    private hintTimeout: number | null = null;
    private leaveTimeout: number | null = null;
    private swapTimeout: number | null = null;
    private tempTimeout: number | null = null;
    // Session memory set to throttle repetitive gameplay hints
    private triggeredSessionHints: Set<string> = new Set();

    private statusBar: HTMLElement | null;
    private hintEl: HTMLElement | null;
    private topControls: HTMLElement | null;

    constructor(private getTranslations: () => Record<string, string>) {
        this.statusBar = document.getElementById('mode-status-bar');
        this.hintEl = document.getElementById('status-hint');
        this.topControls = document.getElementById('top-controls');
    }

    /**
     * Initializes event listeners for the hinting system
     */
    public init(): void {
        if (!this.topControls || !this.statusBar || !this.hintEl) return;

        this.topControls.addEventListener('mouseover', (e) => {
            const btn = (e.target as HTMLElement).closest('[data-hint]') as HTMLElement;
            if (!btn) return;

            if (this.leaveTimeout) { window.clearTimeout(this.leaveTimeout); this.leaveTimeout = null; }

            if (this.statusBar?.classList.contains('hint-mode')) {
                this.showHint(btn);
            } else {
                if (this.hintTimeout) window.clearTimeout(this.hintTimeout);
                this.hintTimeout = window.setTimeout(() => this.showHint(btn), 120);
            }
        });

        this.topControls.addEventListener('mouseout', () => {
            if (this.hintTimeout) { window.clearTimeout(this.hintTimeout); this.hintTimeout = null; }
            if (this.swapTimeout) { window.clearTimeout(this.swapTimeout); this.swapTimeout = null; }
            
            this.leaveTimeout = window.setTimeout(() => {
                if (this.statusBar) {
                    this.statusBar.classList.remove('hint-mode', 'hint-swap-out', 'hint-swap-in');
                    window.setTimeout(() => {
                        if (!this.statusBar?.classList.contains('hint-mode')) {
                            updateStatusBar(Store.state, this.getTranslations());
                        }
                    }, 300);
                }
                this.leaveTimeout = null;
            }, 50);
        });

        // Global listeners for dynamic state updates (Keyboard/Click)
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'з') {
                const btnPause = document.getElementById('btn-pause');
                if (btnPause && btnPause.matches(':hover')) {
                    window.setTimeout(() => this.showHint(btnPause), 10);
                }
            }
        });

        document.getElementById('btn-pause')?.addEventListener('click', () => {
            const btn = document.getElementById('btn-pause');
            if (btn) window.setTimeout(() => this.showHint(btn), 10);
        });
    }

    /**
     * Triggers a temporary visual "calendar roll" hint upon hardware keypress.
     */
    public triggerTemporaryHint(hintKey: string): void {
        if (!this.statusBar || !this.hintEl) return;

        const t = this.getTranslations();
        const key = hintKey;

        // Throttle high-frequency gameplay keys to once-per-browser-session (warm-up onboarding)
        const isSystemic = key.includes('Pause') || key.includes('Resume') || key.includes('Mute') || key.includes('Reset');
        if (!isSystemic) {
            if (this.triggeredSessionHints.has(key)) {
                return; // Suppress to protect patient foveal fixation during high-speed trials
            }
            this.triggeredSessionHints.add(key);
        }

        if (t[key]) {
            // Cancel any pending animations or leave timeouts
            if (this.tempTimeout) { window.clearTimeout(this.tempTimeout); this.tempTimeout = null; }
            if (this.hintTimeout) { window.clearTimeout(this.hintTimeout); this.hintTimeout = null; }
            if (this.leaveTimeout) { window.clearTimeout(this.leaveTimeout); this.leaveTimeout = null; }

            const newText = t[key];
            this.hintEl.innerText = newText;
            this.statusBar.classList.add('hint-mode');

            // Set up auto-dismiss timer to roll back to clinical stats after 1200ms
            this.tempTimeout = window.setTimeout(() => {
                const isMouseStillHovering = this.topControls?.matches(':hover') || 
                                            document.getElementById('bottom-dock')?.matches(':hover');
                
                if (this.statusBar && !isMouseStillHovering) {
                    this.statusBar.classList.remove('hint-mode', 'hint-swap-out', 'hint-swap-in');
                    window.setTimeout(() => {
                        if (this.statusBar && !this.statusBar.classList.contains('hint-mode')) {
                            updateStatusBar(Store.state, this.getTranslations());
                        }
                    }, 300);
                }
                this.tempTimeout = null;
            }, 1200);
        }
    }

    /**
     * Logic for showing/swapping hint with animation
     */
    private showHint(btn: HTMLElement): void {
        const t = this.getTranslations();
        let hintKey = btn.getAttribute('data-hint');
        
        if (btn.id === 'btn-pause' && Store.state.isPaused) hintKey = 'hintBtnResume';

        if (hintKey && t[hintKey] && this.hintEl && this.statusBar) {
            const newText = t[hintKey];

            if (this.hintEl.innerText === newText && this.statusBar.classList.contains('hint-mode')) return;

            if (this.statusBar.classList.contains('hint-mode')) {
                this.statusBar.classList.add('hint-swap-out');
                
                if (this.swapTimeout) window.clearTimeout(this.swapTimeout);
                this.swapTimeout = window.setTimeout(() => {
                    if (this.hintEl) this.hintEl.innerText = newText;
                    this.statusBar?.classList.remove('hint-swap-out');
                    this.statusBar?.classList.add('hint-swap-in');
                    
                    void this.statusBar?.offsetWidth; // Force Reflow
                    
                    this.statusBar?.classList.remove('hint-swap-in');
                    this.swapTimeout = null;
                }, 200);
                return;
            }

            this.hintEl.innerText = newText;
            this.statusBar.classList.add('hint-mode');
        }
    }
}