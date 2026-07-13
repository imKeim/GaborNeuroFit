/*
 * GaborNeuroFit - User Input Controls & Keybindings Handler Module
 * Copyright (C) 2026 Pavel Korotkov
 */

import { closeCustomAlert } from './modal.js';

/**
 * @description Binds hardware and gestural input controls to the visual workspace.
 * Transcribed strictly into an abstract, mockable "Switchboard" controller.
 * It contains zero dependencies on global state stores or specific clinical modes.
 * @param {Object} handlers - Standardized key-value dictionary of physical action callbacks.
 * @returns {void}
 */
export function bindInputControls(handlers) {
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnReset = document.getElementById('btn-reset');
    const btnMute = document.getElementById('btn-mute');
    const container = document.getElementById('container');
    const workspace = document.getElementById('workspace');

    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;

    let isMouseDragging = false; // PC Mouse Drag gesture lock state

    // High-performance key hold tracking (Virtual Game Loop Pattern)
    const pressedKeys = new Set();
    let keyIntervalId = null;

    /**
     * @description High-frequency key tracking heartbeat callback.
     * Invoked when directional movement keys are held down.
     * Allows smooth, zero-lag diagonal motor alignments.
     */
    function handleHeldKeys() {
        // Switchboard Guard: If no directional dispatcher is bound, immediately halt key loop.
        if (typeof handlers.onDirectionalShift !== 'function') {
            stopKeyLoop();
            return;
        }

        // Resolve active physical keys
        const holdLeft = pressedKeys.has('arrowleft') || pressedKeys.has('a') || pressedKeys.has('ф');
        const holdRight = pressedKeys.has('arrowright') || pressedKeys.has('d') || pressedKeys.has('в');
        const holdUp = pressedKeys.has('arrowup') || pressedKeys.has('w') || pressedKeys.has('ц');
        const holdDown = pressedKeys.has('arrowdown') || pressedKeys.has('s') || pressedKeys.has('ы');

        let dx = 0;
        let dy = 0;

        // Symmetric diagonal execution
        if (holdLeft && !holdRight) dx = -1;
        if (holdRight && !holdLeft) dx = 1;
        if (holdUp && !holdDown) dy = -1;
        if (holdDown && !holdUp) dy = 1;

        if (dx !== 0 || dy !== 0) {
            // Dispatch abstract raw deltas directly. Validations happen strictly in the Store on target write.
            handlers.onDirectionalShift(dx, dy);
        }
    }

    let keyDelayId = null; // Typematic repeating threshold buffer

    function startKeyLoop() {
        // 1. Instantly execute exactly one 1-pixel step for the initial quick tap.
        handleHeldKeys();

        // 2. Schedule continuous sliding only if the user holds the key down (> 250ms).
        if (!keyIntervalId && !keyDelayId) {
            keyDelayId = setTimeout(() => {
                keyIntervalId = setInterval(handleHeldKeys, 40); // 25Hz continuous stepping frequency
            }, 250); // 250ms threshold discriminates single micro-taps from scrolling holds
        }
    }

    function stopKeyLoop() {
        if (keyDelayId) {
            clearTimeout(keyDelayId);
            keyDelayId = null;
        }
        if (keyIntervalId) {
            clearInterval(keyIntervalId);
            keyIntervalId = null;
        }
    }

    // Direct binding of action buttons to abstract Switchboard calls
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (typeof handlers.onActionReset === 'function') {
                handlers.onActionReset();
            }
        });
    }

    if (workspace) {
        // Feature: Mouse Dragging support for PC web browsers (Abstracted)
        workspace.addEventListener('mousedown', (event) => {
            if (typeof handlers.onDragStart === 'function') {
                handlers.onDragStart();
            }
            isMouseDragging = true;
            swipeStartX = event.clientX;
            swipeStartY = event.clientY;
        });

        window.addEventListener('mousemove', (event) => {
            if (isMouseDragging) {
                const diffX = event.clientX - swipeStartX;
                const diffY = event.clientY - swipeStartY;
                const ratio = 256.0 / container.clientWidth;
                const logicalDeltaX = Math.round(diffX * ratio);
                const logicalDeltaY = Math.round(diffY * ratio);

                if (typeof handlers.onDragUpdate === 'function') {
                    handlers.onDragUpdate(logicalDeltaX, logicalDeltaY);
                }
            }
        });

        window.addEventListener('mouseup', () => {
            isMouseDragging = false;
        });

        // KeyUp release tracking to safely stop vergence offsets sliding loop
        window.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase();
            pressedKeys.delete(key);
            if (pressedKeys.size === 0) {
                stopKeyLoop();
            }
        });

        // Window blur safe guard: prevents keys from getting stuck when user switches tabs
        window.addEventListener('blur', () => {
            pressedKeys.clear();
            stopKeyLoop();
        });

        // Touch gestures registration (Abstracted)
        workspace.addEventListener('touchstart', (event) => {
            const touch = event.changedTouches[0];
            swipeStartX = touch.clientX;
            swipeStartY = touch.clientY;
            swipeStartTime = Date.now();

            if (typeof handlers.onDragStart === 'function') {
                handlers.onDragStart();
            }
        }, { passive: true });

        workspace.addEventListener('touchmove', (event) => {
            const touch = event.changedTouches[0];
            const diffX = touch.clientX - swipeStartX;
            const diffY = touch.clientY - swipeStartY;
            const ratio = 256.0 / container.clientWidth;
            const logicalDeltaX = Math.round(diffX * ratio);
            const logicalDeltaY = Math.round(diffY * ratio);

            if (typeof handlers.onDragUpdate === 'function') {
                handlers.onDragUpdate(logicalDeltaX, logicalDeltaY);
            }

            // Centralized preventDefault router to stop mobile scrolling during target tracking
            if (typeof handlers.onDragMovePreventDefault === 'function' && handlers.onDragMovePreventDefault()) {
                event.preventDefault();
            } else {
                // Default Gabor logic: prevent scrolling strictly on horizontal swipes (answers)
                const deltaX = Math.abs(touch.clientX - swipeStartX);
                const deltaY = Math.abs(touch.clientY - swipeStartY);
                if (deltaX > deltaY) {
                    event.preventDefault();
                }
            }
        }, { passive: false });

        workspace.addEventListener('touchend', (event) => {
            const touch = event.changedTouches[0];
            const deltaXTotal = touch.clientX - swipeStartX;
            const deltaYTotal = touch.clientY - swipeStartY;
            const deltaTime = Date.now() - swipeStartTime;

            // Delegate gesture processing (is it a tap nudge or a swipe answer) to app.js Switchboard
            if (typeof handlers.onDragEnd === 'function') {
                handlers.onDragEnd(deltaTime, deltaXTotal, deltaYTotal, touch.clientX, touch.clientY);
            }
        }, { passive: true });
    }

    if (btnLeft) {
        btnLeft.addEventListener('click', () => {
            // Symmetrically delegate clicks to the abstract Switchboard dispatcher
            if (typeof handlers.onActionLeft === 'function') {
                handlers.onActionLeft();
            }
        });
    }

    if (btnRight) {
        btnRight.addEventListener('click', () => {
            // Symmetrically delegate clicks to the abstract Switchboard dispatcher
            if (typeof handlers.onActionRight === 'function') {
                handlers.onActionRight();
            }
        });
    }

    if (btnMute) {
        btnMute.addEventListener('click', () => {
            // Symmetrically maps the physical click to the Switchboard abstract action
            if (typeof handlers.onActionMuteToggle === 'function') {
                handlers.onActionMuteToggle();
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
            
            // Abstract click delegation through Switchboard to keep controls decoupled from active state checks
            if (typeof handlers.onActionCanvasClick === 'function') {
                handlers.onActionCanvasClick();
            }
        });
    }

    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        const isTuningKey = ['arrowup', 'arrowdown', 'w', 's', 'ц', 'ы'].includes(key);

        // Allow native key repeating for contrast adjustment to support smooth hold-to-tune functionality,
        // while guarding other discrete actions against typematic duplicates.
        if (event.repeat && !isTuningKey) return;
        
        // Modal State Detectors to verify spatial focus boundaries
        const confirmModal = document.getElementById('custom-confirm-modal');
        const alertModal = document.getElementById('custom-alert-modal');
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');
        const statsModal = document.getElementById('stats-modal');
        
        const isConfirmOpen = confirmModal && confirmModal.classList.contains('modal-open');
        const isAlertOpen = alertModal && alertModal.classList.contains('modal-open');
        const isSettingsOpen = settingsModal && settingsModal.classList.contains('modal-open');
        const isInfoOpen = infoModal && infoModal.classList.contains('modal-open');
        const isStatsOpen = statsModal && statsModal.classList.contains('modal-open');
            
        // PRIORITY 1: Custom Confirmation Dialog (Bypass and let the active modal handle itself)
        if (isConfirmOpen) {
            return; 
        }

        // PRIORITY 2: Custom Alert Dialog (OK Only)
        if (isAlertOpen) {
            if (key === ' ' || key === 'enter' || key === 'escape' || key === 'esc') {
                event.preventDefault();
                closeCustomAlert();
            }
            return; 
        }

        // PRIORITY 3: Global Escape for underlying modals (allows Esc to close calibration)
        if (key === 'escape' || key === 'esc') {
            if (typeof handlers.onEscape === 'function') {
                handlers.onEscape();
            }
            return;
        }
        
        // If the settings modal is open, check if we are in calibration sub-sheet mode.
        // If so, bypass keydown block to allow real-time W/S/Arrows threshold tuning.
        const isCalibrationMode = settingsModal && settingsModal.classList.contains('calibration-mode');
        
        if (isInfoOpen || isStatsOpen || (isSettingsOpen && !isCalibrationMode)) {
            return;
        }

        // Ergonomic Guard: Block game hotkeys if the user is currently typing in input text fields
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            return;
        }

        // Fast Pause Session Hotkey (Dual-layout mapping for English 'P' and Russian 'З')
        if (key === 'p' || key === 'з') {
            event.preventDefault();
            if (typeof handlers.onActionPauseToggle === 'function') {
                handlers.onActionPauseToggle();
            }
            return;
        }

        // Abstracted Keyboard Routing layer (Dynamic activation based on Switchboard state)
        if (typeof handlers.onDirectionalShift === 'function' && 
            typeof handlers.isDirectionalHoldActive === 'function' && 
            handlers.isDirectionalHoldActive()) {
            
            const movementKeys = [
                'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
                'a', 'd', 'w', 's',
                'ф', 'в', 'ц', 'ы'
            ];

            // If continuous directional holding is registered, block layout scrolls and spin key loop
            if (movementKeys.includes(key)) {
                event.preventDefault();
                if (!pressedKeys.has(key)) {
                    pressedKeys.add(key);
                    startKeyLoop();
                }
                return;
            }

            // Key R mapping for coordinates reset
            if (key === 'r' || key === 'к') {
                event.preventDefault();
                if (typeof handlers.onActionReset === 'function') {
                    handlers.onActionReset();
                }
                return;
            }
        }

        // Standard sensory trials inputs mapping
        if (key === 'arrowleft' || key === 'a' || key === 'ф') {
            if (typeof handlers.onActionLeft === 'function') {
                handlers.onActionLeft();
            }
        } else if (key === 'arrowright' || key === 'd' || key === 'в') {
            if (typeof handlers.onActionRight === 'function') {
                handlers.onActionRight();
            }
        } else if (key === ' ' || key === 'enter') {
            event.preventDefault();
            if (typeof handlers.onActionPrimary === 'function') {
                handlers.onActionPrimary();
            }
        }
    });

    document.addEventListener('touchstart', (event) => {
        if (event.touches.length > 1 && event.target.closest('#container')) {
            event.preventDefault();
        }
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = (new Date()).getTime();
        if (event.target.closest('.action-btn') || event.target.closest('#btn-start') || event.target.closest('#container')) {
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
        }
        lastTouchEnd = now;
    }, false);
}