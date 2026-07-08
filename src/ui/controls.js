/*
 * GaborNeuroFit - User Input Controls & Keybindings Handler Module
 * Copyright (C) 2026 Pavel Korotkov
 */

import { Store } from '../store.js';
import { closeCustomAlert } from './modal.js';

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

    let synopStartX = 0;
    let synopStartY = 0;
    let lastTapTime = 0; 
    let isMouseDragging = false; // Flag to map PC mouse dragging gestures

    // High-performance active key tracking (Game Loop Pattern)
    const pressedKeys = new Set();
    let keyIntervalId = null;

    function handleHeldKeys() {
        const s = Store.state;
        if (s.appMode !== 'synoptophore' || s.synopState !== 'align') {
            stopKeyLoop();
            return;
        }

        // Active key tracking inputs
        const holdLeft = pressedKeys.has('arrowleft') || pressedKeys.has('a') || pressedKeys.has('ф');
        const holdRight = pressedKeys.has('arrowright') || pressedKeys.has('d') || pressedKeys.has('в');
        const holdUp = pressedKeys.has('arrowup') || pressedKeys.has('w') || pressedKeys.has('ц');
        const holdDown = pressedKeys.has('arrowdown') || pressedKeys.has('s') || pressedKeys.has('ы');

        let dx = 0;
        let dy = 0;

        // Symmetric axes evaluation eliminates holding lags and allows true diagonal vergence movement
        if (holdLeft && !holdRight) dx = -1;
        if (holdRight && !holdLeft) dx = 1;
        if (holdUp && !holdDown) dy = -1;
        if (holdDown && !holdUp) dy = 1;

        if (dx !== 0 || dy !== 0) {
            Store.updateState('synopTargetX', s.synopTargetX + dx);
            Store.updateState('synopTargetY', s.synopTargetY + dy);
            if (typeof handlers.onSynopDrag === 'function') {
                handlers.onSynopDrag();
            }
        }
    }

    let keyDelayId = null; // Cache to handle typematic OS hold delay

    function startKeyLoop() {
        // 1. Instantly execute exactly one 1-pixel step for the initial quick tap
        handleHeldKeys();

        // 2. Schedule continuous sliding only if the user holds the key down (> 250ms)
        if (!keyIntervalId && !keyDelayId) {
            keyDelayId = setTimeout(() => {
                keyIntervalId = setInterval(handleHeldKeys, 40); // Standard smooth vergence slide rate
            }, 250); // 250ms initial delay ensures micro-tapping on 1px is responsive and easy
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

    // Bind physical screen reset button click handler
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            const s = Store.state;
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                Store.updateState('synopTargetX', 0);
                Store.updateState('synopTargetY', 0);
                if (typeof handlers.onSynopDrag === 'function') {
                    handlers.onSynopDrag();
                }
            }
        });
    }

    if (workspace) {
        // Feature: Mouse Dragging support for PC web browsers
        workspace.addEventListener('mousedown', (event) => {
            const s = Store.state;
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                isMouseDragging = true;
                swipeStartX = event.clientX;
                swipeStartY = event.clientY;
                synopStartX = s.synopTargetX;
                synopStartY = s.synopTargetY;
            }
        });

        window.addEventListener('mousemove', (event) => {
            const s = Store.state;
            if (isMouseDragging && s.appMode === 'synoptophore' && s.synopState === 'align') {
                const diffX = event.clientX - swipeStartX;
                const diffY = event.clientY - swipeStartY;
                const ratio = 256.0 / container.clientWidth;
                const logicalDeltaX = Math.round(diffX * ratio);
                const logicalDeltaY = Math.round(diffY * ratio);

                Store.updateState('synopTargetX', synopStartX + logicalDeltaX);
                Store.updateState('synopTargetY', synopStartY + logicalDeltaY);

                if (typeof handlers.onSynopDrag === 'function') {
                    handlers.onSynopDrag();
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

        workspace.addEventListener('touchstart', (event) => {
            const touch = event.changedTouches[0];
            swipeStartX = touch.clientX;
            swipeStartY = touch.clientY;
            swipeStartTime = Date.now();

            const s = Store.state;
            if (s.appMode === 'synoptophore' && s.synopState === 'align') {
                synopStartX = s.synopTargetX;
                synopStartY = s.synopTargetY;
            }
        }, { passive: true });

        workspace.addEventListener('touchmove', (event) => {
            const s = Store.state;
            if (s.appMode === 'synoptophore') {
                event.preventDefault(); 
                if (s.synopState === 'align') {
                    const touch = event.changedTouches[0];
                    const diffX = touch.clientX - swipeStartX;
                    const diffY = touch.clientY - swipeStartY;
                    const ratio = 256.0 / container.clientWidth;
                    const logicalDeltaX = Math.round(diffX * ratio);
                    const logicalDeltaY = Math.round(diffY * ratio);

                    Store.updateState('synopTargetX', synopStartX + logicalDeltaX);
                    Store.updateState('synopTargetY', synopStartY + logicalDeltaY);

                    if (typeof handlers.onSynopDrag === 'function') {
                        handlers.onSynopDrag();
                    }
                }
                return;
            }

            const touch = event.changedTouches[0];
            const deltaX = Math.abs(touch.clientX - swipeStartX);
            const deltaY = Math.abs(touch.clientY - swipeStartY);
            if (deltaX > deltaY) {
                event.preventDefault();
            }
        }, { passive: false });

        workspace.addEventListener('touchend', (event) => {
            const s = Store.state;
            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    const now = Date.now();
                    if (now - lastTapTime < 300) {
                        Store.updateState('synopTargetX', 0);
                        Store.updateState('synopTargetY', 0);
                        if (typeof handlers.onSynopDrag === 'function') {
                            handlers.onSynopDrag();
                        }
                    }
                    lastTapTime = now;
                }
                return; 
            }

            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - swipeStartX;
            const deltaY = touch.clientY - swipeStartY;
            const deltaTime = Date.now() - swipeStartTime;

            const minSwipeDistance = 45; 
            const maxVerticalDeviation = 45; 
            const maxSwipeTime = 300; 

            if (deltaTime <= maxSwipeTime && Math.abs(deltaX) >= minSwipeDistance && Math.abs(deltaY) <= maxVerticalDeviation) {
                const direction = deltaX < 0 ? 'left' : 'right';
                if (typeof handlers.onAnswer === 'function') {
                    handlers.onAnswer(direction);
                }
            }
        }, { passive: true });
    }

    if (btnLeft) {
        btnLeft.addEventListener('click', () => {
            const s = Store.state;
            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    Store.updateState('synopTargetX', s.synopTargetX - 1);
                    if (typeof handlers.onSynopDrag === 'function') handlers.onSynopDrag();
                }
            } else {
                if (typeof handlers.onAnswer === 'function') handlers.onAnswer('left');
            }
        });
    }

    if (btnRight) {
        btnRight.addEventListener('click', () => {
            const s = Store.state;
            if (s.appMode === 'synoptophore') {
                if (s.synopState === 'align') {
                    Store.updateState('synopTargetX', s.synopTargetX + 1);
                    if (typeof handlers.onSynopDrag === 'function') handlers.onSynopDrag();
                }
            } else {
                if (typeof handlers.onAnswer === 'function') handlers.onAnswer('right');
            }
        });
    }

    if (btnMute) {
        btnMute.addEventListener('click', () => {
            if (typeof handlers.onMuteToggle === 'function') handlers.onMuteToggle();
        });
    }

    // Bind central canvas workspace container as a visual exposure trigger (Tap-to-Flash)
    if (container) {
        container.addEventListener('click', (event) => {
            // Guard against nested interactive items triggers
            if (event.target.closest('.action-btn') || event.target.closest('.control-btn')) {
                return;
            }
            
            // Strictly disable container tapping/clicks in Synoptophore to prevent accidental locks/slips on release!
            if (Store.state.appMode === 'synoptophore') {
                return;
            }
            
            if (typeof handlers.onStartFlash === 'function') {
                handlers.onStartFlash();
            }
        });
    }

    window.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');
        const statsModal = document.getElementById('stats-modal');
        const customAlertModal = document.getElementById('custom-alert-modal');
        
        const isSettingsOpen = settingsModal && settingsModal.style.display !== 'none' && settingsModal.style.display !== '';
        const isInfoOpen = infoModal && infoModal.style.display !== 'none' && infoModal.style.display !== '';
        const isStatsOpen = statsModal && statsModal.style.display !== 'none' && statsModal.style.display !== '';
        const isAlertOpen = customAlertModal && customAlertModal.style.display !== 'none' && customAlertModal.style.display !== '';
        
        // Premium alert modal keyboard lock focus: OK button simulation via keyboard Space, Enter or Escape
        if (isAlertOpen) {
            if (key === ' ' || key === 'enter' || event.key === 'Escape' || event.key === 'Esc') {
                event.preventDefault();
                closeCustomAlert(); // Symmetrical presentation layer close (SoC compliant)
            }
            return; // Completely suppress Gabor inputs while alert modal is shown
        }

        // Global Escape routes mapping for other configurations modals
        if (event.key === 'Escape' || event.key === 'Esc') {
            if (typeof handlers.onEscape === 'function') {
                handlers.onEscape();
            }
            return;
        }
        
        if (isSettingsOpen || isInfoOpen || isStatsOpen) return;

        const s = Store.state;

        // Route Keyboard Inputs for Synoptophore (4-directional 2D adjustments)
        if (s.appMode === 'synoptophore') {
            if (s.synopState === 'align') {
                const movementKeys = [
                    'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
                    'a', 'd', 'w', 's',
                    'ф', 'в', 'ц', 'ы'
                ];

                // Symmetrically add held keys into tracking set and fire the vergence alignment loop
                if (movementKeys.includes(key)) {
                    event.preventDefault(); // Block system screen scrolling
                    
                    // Safeguard: Only trigger loop on the very first physical press, ignoring browser auto-repeats
                    if (!pressedKeys.has(key)) {
                        pressedKeys.add(key);
                        startKeyLoop();
                    }
                    return;
                }

                // Feature: Instant manual alignment reset key
                if (key === 'r' || key === 'к') {
                    event.preventDefault();
                    Store.updateState('synopTargetX', 0);
                    Store.updateState('synopTargetY', 0);
                    if (typeof handlers.onSynopDrag === 'function') {
                        handlers.onSynopDrag();
                    }
                    return;
                }
            }
            
            // Space or Enter acts as the calibration lock trigger
            if (key === ' ' || key === 'enter') {
                event.preventDefault();
                if (typeof handlers.onStartFlash === 'function') {
                    handlers.onStartFlash();
                }
            }
            return;
        }

        if (key === 'arrowleft' || key === 'a' || key === 'ф') {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('left');
            }
        } else if (key === 'arrowright' || key === 'd' || key === 'в') {
            if (typeof handlers.onAnswer === 'function') {
                handlers.onAnswer('right');
            }
        } else if (key === ' ' || key === 'enter') {
            event.preventDefault();
            if (typeof handlers.onStartFlash === 'function') {
                handlers.onStartFlash();
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