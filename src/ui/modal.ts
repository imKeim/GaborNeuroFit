/*
 * GaborNeuroFit - Modal Dialogs Management Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs strict null-checks for DOM overlays and
 * strictly typed functional callbacks to ensure execution safety inside
 * asynchronous confirmation dialogs.
 */

/**
 * @description Internal helper to resolve semantic brand colors based on title icons/keywords.
 * Implements strict medical severity levels: Danger (Red), Warning (Gold), Success (Green), Info (Blue).
 */
function resolveHeaderColor(title: string): string {
    const tLower = title.toLowerCase();
    if (title.includes('❌') || tLower.includes('danger') || tLower.includes('опасно')) return '#ef4444';
    if (title.includes('🥇') || title.includes('🎯') || title.includes('🏆')) return '#22c55e';
    if (title.includes('⚠️') || tLower.includes('warning') || title.includes('предупреждение')) return '#eab308';
    return '#3b90ff'; // Standard Clinical Blue fallback
}

const FOCUSABLE_SELECTORS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
let previousActiveElement: HTMLElement | null = null;

export function openModal(modal: HTMLElement | null): void {
    if (!modal) return;
    
    // 1. Memorize previously focused trigger element to preserve visual focus history
    previousActiveElement = document.activeElement as HTMLElement;

    modal.classList.add('modal-open');

    // 2. Hide background layout from screen readers and DOM tab order
    const appWrapper = document.getElementById('app-wrapper');
    if (appWrapper) appWrapper.setAttribute('aria-hidden', 'true');

    // 3. Setup and bind focus trap loop
    setupFocusTrap(modal);

    // 4. Focus first interactive element inside the modal to orient the user instantly
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
    if (focusable.length > 0) {
        focusable[0].focus();
    }
}

export function closeModal(modal: HTMLElement | null): void {
    if (!modal) return;

    modal.classList.remove('modal-open');

    // 1. Un-mute background layout
    const appWrapper = document.getElementById('app-wrapper');
    if (appWrapper) appWrapper.removeAttribute('aria-hidden');

    // 2. Remove focus trap listeners
    destroyFocusTrap(modal);

    // 3. Return focus precisely back to the parent trigger button
    if (previousActiveElement) {
        previousActiveElement.focus();
        previousActiveElement = null;
    }
}

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

    (modal as any)._focusTrapHandler = handler;
    modal.addEventListener('keydown', handler);
}

function destroyFocusTrap(modal: HTMLElement): void {
    const handler = (modal as any)._focusTrapHandler;
    if (handler) {
        modal.removeEventListener('keydown', handler);
        delete (modal as any)._focusTrapHandler;
    }
}

/**
 * @description Renders a precise, non-blocking custom modal window in sRGB space.
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

    // @ts-ignore - Ignore missing Twemoji global typings strictly for DOM injection
    if (typeof window !== 'undefined' && window.twemoji) {
        // @ts-ignore
        window.twemoji.parse(modal);
    }
}

/**
 * @description Dismisses the custom alert modal non-blockingly
 */
export function closeCustomAlert(): void {
    const modal = document.getElementById('custom-alert-modal');
    closeModal(modal);
}

/**
 * @description Renders a beautiful non-blocking custom confirmation dialog with Yes/No actions.
 * @param callback - Typed to explicitly return a boolean state resolving the user's intent.
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

    // @ts-ignore
    if (typeof window !== 'undefined' && window.twemoji) {
        // @ts-ignore
        window.twemoji.parse(modal);
    }

    // Core event handlers with standard lexical scopes for absolute teardown
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
 * @description Initializes click listeners for settings and manual popup modals
 * @param onSettingsOpen - Pre-open hook to sync UI selectors with actual store parameters
 * @param onSettingsSave - Close hook to commit modified UI selectors to store and localStorage
 * @param onStatsOpen - Hook to trigger relational data rendering just before dashboard appears
 */
export function initModals(
    onSettingsOpen: () => void,
    onSettingsSave: () => void,
    onStatsOpen: () => void
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

    // Bind custom alert close button cleanly inside initModals (SoC compliant)
    const btnCloseCustomAlert = document.getElementById('btn-close-custom-alert');
    if (btnCloseCustomAlert) {
        btnCloseCustomAlert.addEventListener('click', () => {
            closeCustomAlert();
        });
    }

    if (btnInfo && infoModal) {
        btnInfo.addEventListener('click', () => {
            openModal(infoModal);
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(infoModal);
        });
    }
    if (btnCloseModal && infoModal) {
        btnCloseModal.addEventListener('click', () => {
            closeModal(infoModal);
        });
    }

    if (btnSettings && settingsModal) {
        btnSettings.addEventListener('click', () => {
            if (typeof onSettingsOpen === 'function') onSettingsOpen();
            openModal(settingsModal);
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
            // @ts-ignore
            if (typeof window !== 'undefined' && window.twemoji) window.twemoji.parse(statsModal);
        });
    }

    if (btnCloseStats && statsModal) {
        btnCloseStats.addEventListener('click', () => {
            closeModal(statsModal);
        });
    }
}