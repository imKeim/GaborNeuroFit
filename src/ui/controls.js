/*
 * GaborNeuroFit - User Input Controls & Keybindings Handler Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module manages physical keyboard bindings, action click events,
 * and handles mobile-specific touch adaptations to block unwanted gestures and latency.
 */

// Bind action triggers, keyboard shortcuts, and enforce mobile touch optimizations
export function bindInputControls(handlers) {
    // Select primary interactive DOM elements
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnMute = document.getElementById('btn-mute');

    // Bind action button click handlers
    if (btnLeft) {
        btnLeft.addEventListener('click', () => {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('left');
            }
        });
    }

    if (btnRight) {
        btnRight.addEventListener('click', () => {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('right');
            }
        });
    }

    if (btnMute) {
        btnMute.addEventListener('click', () => {
            if (typeof handlers.onMuteToggle === 'function') {
                handlers.onMuteToggle();
            }
        });
    }

    // Intercept physical keyboard strokes globally
    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        
        // Handle physical Escape key first (always route to modal closer)
        if (event.key === 'Escape' || event.key === 'Esc') {
            if (typeof handlers.onEscape === 'function') {
                handlers.onEscape();
            }
            return;
        }
        
        // Stop routing keyboard shortcuts if either Handbook or Settings panel is currently visible
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');
        const isSettingsOpen = settingsModal && settingsModal.style.display === 'block';
        const isInfoOpen = infoModal && infoModal.style.display === 'block';
        
        if (isSettingsOpen || isInfoOpen) {
            return;
        }

        // Map unified visual answers keys (arrows, game WASD, and Cyrillic fallbacks)
        if (key === 'arrowleft' || key === 'a' || key === 'ф') {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('left');
            }
        } else if (key === 'arrowright' || key === 'd' || key === 'в') {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('right');
            }
        } else if (key === ' ' || key === 'enter') {
            event.preventDefault(); // Stop native page scrolling on Spacebar click
            if (typeof handlers.onStartFlash === 'function') {
                handlers.onStartFlash();
            }
        }
    });

    /* Mobile Safari Touch Optimization: Prevent double-tap zooming on action controls */
    document.addEventListener('touchstart', (event) => {
        // Enforce single touch only inside Gabor training canvas space
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = (new Date()).getTime();
        // Prevent default double-click event simulation on high-speed user answers
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}