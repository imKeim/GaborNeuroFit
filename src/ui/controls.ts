/**
 * @file controls.ts
 * @description Input Driver module orchestrating hardware and gestural interactions.
 * Abstracts physical input events (Mouse, Touch, Keyboard) into a normalized clinical 
 * switchboard, providing high-performance virtual loops for smooth vergence tracking.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

/**
 * @description Standardized interface for application-wide input callbacks.
 * Decouples physical event listeners from the clinical state machine.
 */
export interface InputHandlers {
    onActionLeft?: () => void;
    onActionRight?: () => void;
    onActionReset?: () => void;
    onActionPrimary?: () => void;
    onActionMuteToggle?: () => void;
    onActionPauseToggle?: () => void;
    onActionCanvasClick?: () => void;
    onEscape?: () => void;
    /** @param {Event} event - Raw input event used to determine spatial origin. */
    onDragStart?: (event: Event) => void;
    /** @param {number} deltaX - Normalized horizontal offset in virtual pixels. */
    onDragUpdate?: (deltaX: number, deltaY: number) => void;
    onDragEnd?: (deltaTime: number, deltaXTotal: number, deltaYTotal: number, clientX: number, clientY: number) => void;
    onDragMovePreventDefault?: () => boolean;
    isDirectionalHoldActive?: () => boolean;
    onDirectionalShift?: (dx: number, dy: number) => void;
}

/**
 * @description Binds hardware and gestural input controls to the visual workspace.
 * 
 * @architecture
 * - Normalization: Translates varying physical screen resolutions into a fixed 256x256 virtual coordinate system.
 * - Virtual Game Loop: Implements high-frequency (20Hz) polling for held keys to bypass OS-native repeat delays.
 * - Event Delegation: Intercepts canvas clicks while preserving UI button accessibility.
 *
 * @param {InputHandlers} handlers - Dictionary of normalized action callbacks.
 */
export function bindInputControls(handlers: InputHandlers): void {
    const btnLeft = document.getElementById('btn-left') as HTMLButtonElement | null;
    const btnRight = document.getElementById('btn-right') as HTMLButtonElement | null;
    const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;
    const btnMute = document.getElementById('btn-mute') as HTMLButtonElement | null;
    const container = document.getElementById('container') as HTMLElement | null;
    const workspace = document.getElementById('workspace') as HTMLElement | null;

    // Forcibly block browser-native context menus on active clinical elements during mobile long-presses
    window.addEventListener('contextmenu', (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.closest('#container, .control-btn, .action-btn, #btn-start')) {
            event.preventDefault();
        }
    });

    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;

    let isMouseDragging = false;

    // High-performance key hold tracking (Virtual Game Loop Pattern)
    const pressedKeys = new Set<string>();
    let keyIntervalId: number | null = null;
    let keyDelayId: number | null = null;

    /**
     * @description Polls the active key set and emits directional shifts at 20Hz.
     * @clinical Essential for smooth extraocular muscle exercise during vergence alignment.
     */
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

    /** @description Starts the 20Hz polling interval for held movement keys. */
    function startKeyLoop(): void {
        handleHeldKeys();

        if (!keyIntervalId && !keyDelayId) {
            keyDelayId = window.setTimeout(() => {
                keyIntervalId = window.setInterval(handleHeldKeys, 50);
            }, 250);
        }
    }

    /** @description Terminates the key polling loop and clears active timers. */
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
        // Clinical: 2D coordinate normalization pipeline

        workspace.addEventListener('mousedown', (event: MouseEvent) => {
            if (typeof handlers.onDragStart === 'function') handlers.onDragStart(event);
            isMouseDragging = true;
            swipeStartX = event.clientX;
            swipeStartY = event.clientY;
            swipeStartTime = Date.now();
        });

        window.addEventListener('mousemove', (event: MouseEvent) => {
            if (isMouseDragging && container) {
                const diffX = event.clientX - swipeStartX;
                const diffY = event.clientY - swipeStartY;
                // Mathematical normalization to virtual 256px grid
                const ratio = 256.0 / container.clientWidth;
                const logicalDeltaX = Math.round(diffX * ratio);
                const logicalDeltaY = Math.round(diffY * ratio);

                if (typeof handlers.onDragUpdate === 'function') {
                    handlers.onDragUpdate(logicalDeltaX, logicalDeltaY);
                }
            }
        });

        window.addEventListener('mouseup', (event: MouseEvent) => {
            if (isMouseDragging) {
                isMouseDragging = false;
                const deltaXTotal = event.clientX - swipeStartX;
                const deltaYTotal = event.clientY - swipeStartY;
                const deltaTime = Date.now() - swipeStartTime;

                if (typeof handlers.onDragEnd === 'function') {
                    handlers.onDragEnd(deltaTime, deltaXTotal, deltaYTotal, event.clientX, event.clientY);
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

            if (typeof handlers.onDragStart === 'function') handlers.onDragStart(event);
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

        workspace.addEventListener('touchcancel', () => {
            if (typeof handlers.onDragEnd === 'function') {
                handlers.onDragEnd(0, 0, 0, 0, 0); 
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

    /**
     * @description Master keyboard event dispatcher.
     * 
     * @a11y
     * - Modal Guard: Standardizes ESC to close modals.
     * - Clinical Bypass: Permits W/S/Arrow keys to pass through to the calibration panel.
     * - Text Guard: Disables hotkeys while typing in patient registry fields.
     * - Focus Guard: Space/Enter only trigger trials if focus is not on a specific UI button.
     */
    window.addEventListener('keydown', (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        const isTuningKey = ['arrowup', 'arrowdown', 'w', 's', 'ц', 'ы'].includes(key);

        if (event.repeat && !isTuningKey) return;

        const activeModal = document.querySelector('.modal.modal-open') as HTMLElement | null;
        if (activeModal) {
            const isSystemFKey = key.startsWith('f') && key.length > 1 && !isNaN(Number(key.slice(1)));
            if (isSystemFKey || event.ctrlKey || event.metaKey || event.altKey) {
                return; 
            }

            if (key === 'escape' || key === 'esc') {
                event.preventDefault();
                if (typeof handlers.onEscape === 'function') handlers.onEscape();
                return;
            }
                
            const isCalibrationMode = activeModal.classList.contains('calibration-mode');
            const isCalibrationKey = isCalibrationMode && ['w', 's', 'arrowup', 'arrowdown', 'ц', 'ы'].includes(key);

            if (!isCalibrationKey) {
                return;
            }
        }

        const isGlobalTextInput = document.activeElement && (
            (document.activeElement instanceof HTMLInputElement && (document.activeElement.type === 'text' || document.activeElement.type === 'search')) ||
            document.activeElement.tagName === 'TEXTAREA'
        );
        if (isGlobalTextInput) return;

        if (key === 'escape' || key === 'esc') {
            if (typeof handlers.onEscape === 'function') handlers.onEscape();
                return;
        }

        if (key === 'p' || key === 'з') {
            event.preventDefault();
            if (typeof handlers.onActionPauseToggle === 'function') handlers.onActionPauseToggle();
                return;
        }

        if (key === 'm' || key === 'ь') {
            event.preventDefault();
            if (typeof handlers.onActionMuteToggle === 'function') handlers.onActionMuteToggle();
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
            const focusedEl = document.activeElement;
            const isFocusedOnButton = focusedEl && 
                                       focusedEl instanceof HTMLButtonElement && 
                                       focusedEl.id !== 'btn-start';
            if (isFocusedOnButton) return;

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
}