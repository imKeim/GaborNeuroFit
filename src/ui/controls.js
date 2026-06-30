/*
 * GaborNeuroFit - User Input Controls & Keybindings Handler Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module manages physical keyboard bindings, action click events,
 * and handles mobile-specific touch adaptations to block unwanted gestures and latency.
 */

/**
 * Binds interactive action triggers, keyboard shortcuts, and mobile touch optimizations
 * @param {Object} handlers - Event callbacks routed back to the main App orchestrator
 */
export function bindInputControls(handlers) {
    // Select primary interactive DOM elements
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnMute = document.getElementById('btn-mute');
    const container = document.getElementById('container');
    const workspace = document.getElementById('workspace');

    // Gesture tracking variables for high-fidelity swipe detection
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;

    // Bind interactive swipe gestures on the main workspace container
    if (workspace) {
        workspace.addEventListener('touchstart', (event) => {
            const touch = event.changedTouches[0];
            swipeStartX = touch.clientX;
            swipeStartY = touch.clientY;
            swipeStartTime = Date.now();
        }, { passive: true });

        workspace.addEventListener('touchmove', (event) => {
            const touch = event.changedTouches[0];
            const deltaX = Math.abs(touch.clientX - swipeStartX);
            const deltaY = Math.abs(touch.clientY - swipeStartY);

            // Lock viewport elastic scroll only if movement is primarily horizontal
            if (deltaX > deltaY) {
                event.preventDefault();
            }
        }, { passive: false });

        workspace.addEventListener('touchend', (event) => {
            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - swipeStartX;
            const deltaY = touch.clientY - swipeStartY;
            const deltaTime = Date.now() - swipeStartTime;

            const minSwipeDistance = 45; // Pixels
            const maxVerticalDeviation = 45; // Prevents diagonal scrolling interference
            const maxSwipeTime = 300; // Milliseconds

            if (deltaTime <= maxSwipeTime && Math.abs(deltaX) >= minSwipeDistance && Math.abs(deltaY) <= maxVerticalDeviation) {
                const direction = deltaX < 0 ? 'left' : 'right';
                if (typeof handlers.onAnswer === 'function') {
                    handlers.onAnswer(direction);
                }
            }
        }, { passive: true });
    }

    // Bind left-hand directional choice action button
    if (btnLeft) {
        btnLeft.addEventListener('click', () => {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('left');
            }
        });
    }

    // Bind right-hand directional choice action button
    if (btnRight) {
        btnRight.addEventListener('click', () => {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('right');
            }
        });
    }

    // Bind acoustic feedback mute control button
    if (btnMute) {
        btnMute.addEventListener('click', () => {
            if (typeof handlers.onMuteToggle === 'function') {
                handlers.onMuteToggle();
            }
        });
    }

    // Bind central canvas workspace container as a visual exposure trigger (Tap-to-Flash)
    if (container) {
        container.addEventListener('click', (event) => {
            // Guard against nested interactive items triggers
            if (event.target.closest('.action-btn') || event.target.closest('.control-btn')) {
                return;
            }
            if (typeof handlers.onStartFlash === 'function') {
                handlers.onStartFlash();
            }
        });
    }

    // Intercept physical keyboard strokes globally
    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        
        // Handle physical Escape keys first (routes universally to modal close handlers)
        if (event.key === 'Escape' || event.key === 'Esc') {
            if (typeof handlers.onEscape === 'function') {
                handlers.onEscape();
            }
            return;
        }
        
        // Block action shortcuts if any modal sheet is currently overlaying the viewport
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');
        const statsModal = document.getElementById('stats-modal');
        
        const isSettingsOpen = settingsModal && settingsModal.style.display !== 'none' && settingsModal.style.display !== '';
        const isInfoOpen = infoModal && infoModal.style.display !== 'none' && infoModal.style.display !== '';
        const isStatsOpen = statsModal && statsModal.style.display !== 'none' && statsModal.style.display !== '';
        
        if (isSettingsOpen || isInfoOpen || isStatsOpen) {
            return;
        }

        // Map directional inputs (Arrow keys, WASD keys, and Cyrillic character fallbacks)
        if (key === 'arrowleft' || key === 'a' || key === 'ф') {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('left');
            }
        } else if (key === 'arrowright' || key === 'd' || key === 'в') {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('right');
            }
        } else if (key === ' ' || key === 'enter') {
            event.preventDefault(); // Prevent native browser page scrolling on Spacebar hit
            if (typeof handlers.onStartFlash === 'function') {
                handlers.onStartFlash();
            }
        }
    });

    /* Mobile Webview Touch Optimizations: Eliminating double-tap delay and scaling issues */
    document.addEventListener('touchstart', (event) => {
        // Enforce single-point foveation touch only inside the training container space
        if (event.touches.length > 1 && event.target.closest('#container')) {
            event.preventDefault();
        }
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = (new Date()).getTime();
        // Zero out click latencies on action buttons, bypass mobile Safari 300ms click delays
        if (event.target.closest('.action-btn') || event.target.closest('#btn-start')) {
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
        }
        lastTouchEnd = now;
    }, false);
}