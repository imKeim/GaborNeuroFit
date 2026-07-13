/*
 * GaborNeuroFit - User Input Controls & Keybindings Handler Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs an exact InputHandlers interface contract.
 * Strictly asserts Touch, Mouse, and Keyboard events to prevent event propagation crashes.
 */

import { closeCustomAlert } from './modal';

export interface InputHandlers {
    onActionLeft?: () => void;
    onActionRight?: () => void;
    onActionReset?: () => void;
    onActionPrimary?: () => void;
    onActionMuteToggle?: () => void;
    onActionPauseToggle?: () => void;
    onActionCanvasClick?: () => void;
    onEscape?: () => void;
    onDragStart?: () => void;
    onDragUpdate?: (deltaX: number, deltaY: number) => void;
    onDragEnd?: (deltaTime: number, deltaXTotal: number, deltaYTotal: number, clientX: number, clientY: number) => void;
    onDragMovePreventDefault?: () => boolean;
    isDirectionalHoldActive?: () => boolean;
    onDirectionalShift?: (dx: number, dy: number) => void;
}

/**
 * @description Binds hardware and gestural input controls to the visual workspace.
 * Transcribed strictly into an abstract, mockable "Switchboard" controller.
 * It contains zero dependencies on global state stores or specific clinical modes.
 *
 * @param {InputHandlers} handlers - Standardized dictionary of physical action callbacks.
 */
export function bindInputControls(handlers: InputHandlers): void {
    const btnLeft = document.getElementById('btn-left') as HTMLButtonElement | null;
    const btnRight = document.getElementById('btn-right') as HTMLButtonElement | null;
    const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;
    const btnMute = document.getElementById('btn-mute') as HTMLButtonElement | null;
    const container = document.getElementById('container') as HTMLElement | null;
    const workspace = document.getElementById('workspace') as HTMLElement | null;

    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;

    let isMouseDragging = false;

    // High-performance key hold tracking (Virtual Game Loop Pattern)
    const pressedKeys = new Set<string>();
    let keyIntervalId: number | null = null;
    let keyDelayId: number | null = null;

    function handleHeldKeys(): void {
        if (typeof handlers.onDirectionalShift !== 'function') {
            stopKeyLoop();
            return;
        }

        const holdLeft = pressedKeys.has('arrowleft') || pressedKeys.has('a') || pressedKeys.has('ф');
        const holdRight = pressedKeys.has('arrowright') || pressedKeys.has('d') || pressedKeys.has('в');
        const holdUp = pressedKeys.has('arrowup') || pressedKeys.has('w') || pressedKeys.has('ц');
        const holdDown = pressedKeys.has('arrowdown') || pressedKeys.has('s') || pressedKeys.has('ы');

        let dx = 0;
        let dy = 0;

        if (holdLeft && !holdRight) dx = -1;
        if (holdRight && !holdLeft) dx = 1;
        if (holdUp && !holdDown) dy = -1;
        if (holdDown && !holdUp) dy = 1;

        if (dx !== 0 || dy !== 0) {
            handlers.onDirectionalShift(dx, dy);
        }
    }

    function startKeyLoop(): void {
        handleHeldKeys();

        if (!keyIntervalId && !keyDelayId) {
            keyDelayId = window.setTimeout(() => {
                keyIntervalId = window.setInterval(handleHeldKeys, 40);
            }, 250);
        }
    }

    function stopKeyLoop(): void {
        if (keyDelayId !== null) {
            window.clearTimeout(keyDelayId);
            keyDelayId = null;
        }
        if (keyIntervalId !== null) {
            window.clearInterval(keyIntervalId);
            keyIntervalId = null;
        }
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (typeof handlers.onActionReset === 'function') handlers.onActionReset();
        });
    }

    if (workspace) {
        workspace.addEventListener('mousedown', (event: MouseEvent) => {
            if (typeof handlers.onDragStart === 'function') handlers.onDragStart();
            isMouseDragging = true;
            swipeStartX = event.clientX;
            swipeStartY = event.clientY;
        });

        window.addEventListener('mousemove', (event: MouseEvent) => {
            if (isMouseDragging && container) {
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

        window.addEventListener('keyup', (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            pressedKeys.delete(key);
            if (pressedKeys.size === 0) {
                stopKeyLoop();
            }
        });

        window.addEventListener('blur', () => {
            pressedKeys.clear();
            stopKeyLoop();
        });

        workspace.addEventListener('touchstart', (event: TouchEvent) => {
            const touch = event.changedTouches[0];
            swipeStartX = touch.clientX;
            swipeStartY = touch.clientY;
            swipeStartTime = Date.now();

            if (typeof handlers.onDragStart === 'function') handlers.onDragStart();
        }, { passive: true });

        workspace.addEventListener('touchmove', (event: TouchEvent) => {
            const touch = event.changedTouches[0];
            const diffX = touch.clientX - swipeStartX;
            const diffY = touch.clientY - swipeStartY;

            if (container) {
                const ratio = 256.0 / container.clientWidth;
                const logicalDeltaX = Math.round(diffX * ratio);
                const logicalDeltaY = Math.round(diffY * ratio);

                if (typeof handlers.onDragUpdate === 'function') {
                    handlers.onDragUpdate(logicalDeltaX, logicalDeltaY);
                }
            }

            if (typeof handlers.onDragMovePreventDefault === 'function' && handlers.onDragMovePreventDefault()) {
                event.preventDefault();
            } else {
                const deltaX = Math.abs(touch.clientX - swipeStartX);
                const deltaY = Math.abs(touch.clientY - swipeStartY);
                if (deltaX > deltaY) {
                    event.preventDefault();
                }
            }
        }, { passive: false });

        workspace.addEventListener('touchend', (event: TouchEvent) => {
            const touch = event.changedTouches[0];
            const deltaXTotal = touch.clientX - swipeStartX;
            const deltaYTotal = touch.clientY - swipeStartY;
            const deltaTime = Date.now() - swipeStartTime;

            if (typeof handlers.onDragEnd === 'function') {
                handlers.onDragEnd(deltaTime, deltaXTotal, deltaYTotal, touch.clientX, touch.clientY);
            }
        }, { passive: true });
    }

    if (btnLeft) {
        btnLeft.addEventListener('click', () => {
            if (typeof handlers.onActionLeft === 'function') handlers.onActionLeft();
        });
    }

    if (btnRight) {
        btnRight.addEventListener('click', () => {
            if (typeof handlers.onActionRight === 'function') handlers.onActionRight();
        });
    }

    if (btnMute) {
        btnMute.addEventListener('click', () => {
            if (typeof handlers.onActionMuteToggle === 'function') handlers.onActionMuteToggle();
        });
    }

    if (container) {
        container.addEventListener('click', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('.action-btn') || target.closest('.control-btn')) return;

            if (typeof handlers.onActionCanvasClick === 'function') handlers.onActionCanvasClick();
        });
    }

    window.addEventListener('keydown', (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        const isTuningKey = ['arrowup', 'arrowdown', 'w', 's', 'ц', 'ы'].includes(key);

        if (event.repeat && !isTuningKey) return;

        const confirmModal = document.getElementById('custom-confirm-modal');
        const alertModal = document.getElementById('custom-alert-modal');
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');
        const statsModal = document.getElementById('stats-modal');

        const isConfirmOpen = confirmModal?.classList.contains('modal-open') ?? false;
        const isAlertOpen = alertModal?.classList.contains('modal-open') ?? false;
        const isSettingsOpen = settingsModal?.classList.contains('modal-open') ?? false;
        const isInfoOpen = infoModal?.classList.contains('modal-open') ?? false;
        const isStatsOpen = statsModal?.classList.contains('modal-open') ?? false;

        if (isConfirmOpen) return;

        if (isAlertOpen) {
            if (key === ' ' || key === 'enter' || key === 'escape' || key === 'esc') {
                event.preventDefault();
                closeCustomAlert();
            }
            return;
        }

        if (key === 'escape' || key === 'esc') {
            if (typeof handlers.onEscape === 'function') handlers.onEscape();
            return;
        }

        const isCalibrationMode = settingsModal?.classList.contains('calibration-mode') ?? false;

        if (isInfoOpen || isStatsOpen || (isSettingsOpen && !isCalibrationMode)) return;

        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

        if (key === 'p' || key === 'з') {
            event.preventDefault();
            if (typeof handlers.onActionPauseToggle === 'function') handlers.onActionPauseToggle();
            return;
        }

        if (typeof handlers.onDirectionalShift === 'function' &&
            typeof handlers.isDirectionalHoldActive === 'function' &&
            handlers.isDirectionalHoldActive()) {

            const movementKeys = [
                'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
                'a', 'd', 'w', 's',
                'ф', 'в', 'ц', 'ы'
            ];

            if (movementKeys.includes(key)) {
                event.preventDefault();
                if (!pressedKeys.has(key)) {
                    pressedKeys.add(key);
                    startKeyLoop();
                }
                return;
            }

            if (key === 'r' || key === 'к') {
                event.preventDefault();
                if (typeof handlers.onActionReset === 'function') handlers.onActionReset();
                return;
            }
        }

        if (key === 'arrowleft' || key === 'a' || key === 'ф') {
            if (typeof handlers.onActionLeft === 'function') handlers.onActionLeft();
        } else if (key === 'arrowright' || key === 'd' || key === 'в') {
            if (typeof handlers.onActionRight === 'function') handlers.onActionRight();
        } else if (key === ' ' || key === 'enter') {
            event.preventDefault();
            if (typeof handlers.onActionPrimary === 'function') handlers.onActionPrimary();
        }
    });

    document.addEventListener('touchstart', (event: TouchEvent) => {
        const target = event.target as HTMLElement;
        if (event.touches.length > 1 && target.closest('#container')) {
            event.preventDefault();
        }
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event: TouchEvent) => {
        const now = Date.now();
        const target = event.target as HTMLElement;
        if (target.closest('.action-btn') || target.closest('#btn-start') || target.closest('#container')) {
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
        }
        lastTouchEnd = now;
    }, false);
}