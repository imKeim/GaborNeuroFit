/**
 * @file modal.ts
 * @description Dialog management module implementing the WAI-ARIA Modal pattern.
 * Manages the lifecycle of clinical configuration panels and notification alerts, 
 * ensuring focus integrity, accessibility (a11y) compliance, and semantic color coding.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

/**
 * @description Internal helper to resolve semantic brand colors based on severity keywords.
 * 
 * @clinical
 * Implements a strict medical color-coding hierarchy to reduce cognitive load:
 * - Danger (Red): IRREVERSIBLE / CRITICAL actions.
 * - Warning (Gold): CLINICAL BREAKS / TIMERS / ERRORS.
 * - Success (Green): MILESTONES / ACHIEVEMENTS.
 * - Info (Blue): SYSTEM INFORMATION.
 *
 * @param {string} title - Header text containing semantic icons or keywords.
 * @returns {string} HEX color code.
 */
function resolveHeaderColor(title: string): string {
    const tLower = title.toLowerCase();
    if (title.includes('❌') || tLower.includes('danger') || tLower.includes('опасно')) return '#ef4444';
    if (title.includes('🥇') || title.includes('🎯') || title.includes('🏆')) return '#22c55e';
    if (title.includes('⚠️') || tLower.includes('warning') || title.includes('предупреждение')) return '#eab308';
    return '#3b90ff';
}

/** @description Query selector string for standard focusable HTML elements. */
const FOCUSABLE_SELECTORS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** @description Reference holder to restore focus back to the trigger element upon modal dismissal. */
let previousActiveElement: HTMLElement | null = null;

/**
 * @description Activates a modal dialog with full W3C A11y orchestration.
 * 
 * @a11y
 * - Focus Restoration: Memorizes the currently focused element.
 * - ARIA Muting: Applies aria-hidden="true" to the background wrapper.
 * - Focus Trap: Initiates Tab-cycling within the modal boundaries.
 * - Auto-focus: Shifts focus to the first interactive element.
 *
 * @param {HTMLElement | null} modal - The target modal container.
 */
export function openModal(modal: HTMLElement | null): void {
    if (!modal) return;
    
    previousActiveElement = document.activeElement as HTMLElement;

    // Instantly and synchronously remove focus from the background button to satisfy WAI-ARIA before setting aria-hidden
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }

    modal.classList.add('modal-open');
    document.body.classList.add('modal-is-open');

    const appWrapper = document.getElementById('app-wrapper');
    if (appWrapper) appWrapper.setAttribute('aria-hidden', 'true');

    setupFocusTrap(modal);

    // Instantly shift focus to the modal container to prevent active element leaks
    modal.focus();

    // Symmetrically attempt to focus the first inner interactive element with a minor 50ms transition lookahead
    setTimeout(() => {
        const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
            .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        if (focusable.length > 0) {
            focusable[0].focus();
        }
    }, 50);
}

/**
 * @description Dismisses a modal dialog and restores background accessibility.
 * @param {HTMLElement | null} modal - The target modal container.
 */
export function closeModal(modal: HTMLElement | null): void {
    if (!modal) return;

    modal.classList.remove('modal-open');
    document.body.classList.remove('modal-is-open');

    const appWrapper = document.getElementById('app-wrapper');
    if (appWrapper) appWrapper.removeAttribute('aria-hidden');

    destroyFocusTrap(modal);

    if (previousActiveElement) {
        const statusBar = document.getElementById('mode-status-bar');
        if (statusBar) {
            statusBar.classList.add('no-transition');
        }

        previousActiveElement.focus();
        previousActiveElement = null;

        if (statusBar) {
            requestAnimationFrame(() => {
                statusBar.classList.remove('no-transition');
            });
        }
    }
}

/**
 * @description Sets up a cyclic Tab-navigation loop (Focus Trap).
 * @param {HTMLElement} modal - Container element to trap focus in.
 */
function setupFocusTrap(modal: HTMLElement): void {
    destroyFocusTrap(modal);

    const handler = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') return;

        const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
            .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === first) {
                last.focus();
                event.preventDefault();
            }
        } else {
            if (document.activeElement === last) {
                first.focus();
                event.preventDefault();
            }
        }
    };

    const focusinHandler = (event: FocusEvent) => {
        if (event.target && !modal.contains(event.target as Node)) {
            event.stopImmediatePropagation();
            const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
                .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
            if (focusable.length > 0) {
                focusable[0].focus();
            }
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (modal as any)._focusTrapHandler = handler;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (modal as any)._focusinHandler = focusinHandler;

    modal.addEventListener('keydown', handler);
    document.addEventListener('focusin', focusinHandler, true);
}

function destroyFocusTrap(modal: HTMLElement): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (modal as any)._focusTrapHandler;
    if (handler) {
        modal.removeEventListener('keydown', handler);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (modal as any)._focusTrapHandler;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const focusinHandler = (modal as any)._focusinHandler;
    if (focusinHandler) {
        document.removeEventListener('focusin', focusinHandler, true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (modal as any)._focusinHandler;
    }
}

/**
 * @description Renders a non-blocking clinical alert dialog.
 * @param {string} title - Semantic header text.
 * @param {string} text - Localized body message (supports HTML).
 */
export function showCustomAlert(title: string, text: string): void {
    const modal = document.getElementById('custom-alert-modal');
    const titleEl = document.getElementById('custom-alert-title');
    const textEl = document.getElementById('custom-alert-text');

    if (!modal || !titleEl || !textEl) return;

    titleEl.innerHTML = title;
    textEl.innerHTML = text;
    titleEl.style.color = resolveHeaderColor(title);

    openModal(modal);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof window !== 'undefined' && window.twemoji) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.twemoji.parse(modal);
    }
}

/** @description Programmatically dismisses the active custom alert. */
export function closeCustomAlert(): void {
    const modal = document.getElementById('custom-alert-modal');
    closeModal(modal);
}

/**
 * @description Spawns a non-blocking confirmation dialog with success/cancel branches.
 * 
 * @architecture
 * Implements a strict cleanup pattern: removes all listeners and window bridges 
 * once the callback resolves to prevent memory leaks and event bubbling collisions.
 * 
 * @param {string} title - Semantic header text.
 * @param {string} text - Localized body text.
 * @param {string} yesLabel - Localized confirm button label.
 * @param {string} noLabel - Localized cancel button label.
 * @param {(isConfirmed: boolean) => void} callback - Typed resolution handler.
 */
export function showCustomConfirm(
    title: string,
    text: string,
    yesLabel: string,
    noLabel: string,
    callback: (isConfirmed: boolean) => void
): void {
    const modal = document.getElementById('custom-confirm-modal');
    const titleEl = document.getElementById('custom-confirm-title');
    const textEl = document.getElementById('custom-confirm-text');
    const btnYes = document.getElementById('btn-confirm-yes');
    const btnNo = document.getElementById('btn-confirm-no');

    if (!modal || !titleEl || !textEl || !btnYes || !btnNo) return;

    titleEl.innerHTML = title;
    textEl.innerHTML = text;
    titleEl.style.color = resolveHeaderColor(title);
    btnYes.textContent = yesLabel;
    btnNo.textContent = noLabel;

    openModal(modal);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof window !== 'undefined' && window.twemoji) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.twemoji.parse(modal);
    }

    const onYes = () => {
        closeModal(modal);
        cleanup();
        callback(true);
    };

    const onNo = () => {
        closeModal(modal);
        cleanup();
        callback(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key === 'enter' || key === ' ') {
            event.preventDefault();
            onYes();
        } else if (key === 'escape' || key === 'esc') {
            event.preventDefault();
            onNo();
        }
    };

    const cleanup = () => {
        btnYes.removeEventListener('click', onYes);
        btnNo.removeEventListener('click', onNo);
        window.removeEventListener('keydown', handleKeyDown);
    };

    btnYes.addEventListener('click', onYes);
    btnNo.addEventListener('click', onNo);
    window.addEventListener('keydown', handleKeyDown);
}

/**
 * @description Global modal initializer binding UI triggers to clinical panels.
 * 
 * @param {Function} onSettingsOpen - Pre-open hydration hook.
 * @param {Function} onSettingsSave - Post-close persistence hook.
 * @param {Function} onStatsOpen - Dashboard telemetry refresh hook.
 */
export function initModals(
    onSettingsOpen: () => void,
    onSettingsSave: () => void,
    onStatsOpen: () => void,
    onStatsClose: () => void,
    onInfoClose: () => void
): void {
    const infoModal = document.getElementById('info-modal');
    const btnInfo = document.getElementById('btn-info');
    const btnCloseModal = document.getElementById('btn-close-modal');

    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');

    const statsModal = document.getElementById('stats-modal');
    const btnStats = document.getElementById('btn-stats');
    const btnCloseStats = document.getElementById('btn-close-stats');

    const btnCloseCustomAlert = document.getElementById('btn-close-custom-alert');
    if (btnCloseCustomAlert) {
        btnCloseCustomAlert.addEventListener('click', () => {
            closeCustomAlert();
        });
    }

    if (btnInfo && infoModal) {
        btnInfo.addEventListener('click', () => {
            openModal(infoModal);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(infoModal);
        });
    }
    if (btnCloseModal && infoModal) {
        btnCloseModal.addEventListener('click', () => {
            closeModal(infoModal);
            if (typeof onInfoClose === 'function') onInfoClose();
        });
    }

    if (btnSettings && settingsModal) {
        btnSettings.addEventListener('click', () => {
            if (typeof onSettingsOpen === 'function') onSettingsOpen();
            openModal(settingsModal);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(settingsModal);
        });
    }

    if (btnCloseSettings && settingsModal) {
        btnCloseSettings.addEventListener('click', () => {
            if (typeof onSettingsSave === 'function') onSettingsSave();
            closeModal(settingsModal);
        });
    }

    if (btnStats && statsModal) {
        btnStats.addEventListener('click', () => {
            if (typeof onStatsOpen === 'function') onStatsOpen();
            openModal(statsModal);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(statsModal);
        });
    }

    if (btnCloseStats && statsModal) {
        btnCloseStats.addEventListener('click', () => {
            closeModal(statsModal);
            if (typeof onStatsClose === 'function') onStatsClose();
        });
    }
}