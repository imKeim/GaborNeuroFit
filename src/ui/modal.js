/*
 * GaborNeuroFit - Modal Dialogs Management Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module manages the presentational state (visibility) of the Handbook
 * and Configuration modals and invokes callback hooks for settings synchronization.
 */

/**
 * Internal helper to resolve semantic brand colors based on title icons/keywords.
 * Implements strict medical severity levels: Danger (Red), Warning (Gold), Success (Green), Info (Blue).
 */
function resolveHeaderColor(title) {
    if (title.includes('❌') || title.toLowerCase().includes('danger') || title.toLowerCase().includes('опасно')) return '#ef4444';
    if (title.includes('🥇') || title.includes('🎯') || title.includes('🏆')) return '#22c55e';
    if (title.includes('⚠️') || title.toLowerCase().includes('warning') || title.includes('Предупреждение')) return '#eab308';
    return '#3b90ff'; // Standard Clinical Blue fallback
}

export function openModal(modal) {
    if (modal) modal.classList.add('modal-open');
}

export function closeModal(modal) {
    if (modal) modal.classList.remove('modal-open');
}

/**
 * Renders a beautiful non-blocking custom modal window in sRGB space.
 */
export function showCustomAlert(title, text) {
    const modal = document.getElementById('custom-alert-modal');
    const titleEl = document.getElementById('custom-alert-title');
    const textEl = document.getElementById('custom-alert-text');
    
    if (!modal || !titleEl || !textEl) return;
    
    titleEl.innerHTML = title;
    textEl.innerHTML = text;
    titleEl.style.color = resolveHeaderColor(title);
    
    openModal(modal);
    if (window.twemoji) window.twemoji.parse(modal);
}

/**
 * Dismisses the custom alert modal non-blockingly
 */
export function closeCustomAlert() {
    const modal = document.getElementById('custom-alert-modal');
    closeModal(modal);
}

/**
 * Renders a beautiful non-blocking custom confirmation dialog with Yes/No actions.
 */
export function showCustomConfirm(title, text, yesLabel, noLabel, callback) {
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
    if (window.twemoji) window.twemoji.parse(modal);
    
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
            
    const handleKeyDown = (event) => {
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

// Initialize click listeners for settings and manual popup modals
export function initModals(onSettingsOpen, onSettingsSave, onStatsOpen) {
    // Select Handbook modal DOM nodes
    const infoModal = document.getElementById('info-modal');
    const btnInfo = document.getElementById('btn-info');
    const btnCloseModal = document.getElementById('btn-close-modal');

    // Select Configuration modal DOM nodes
    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');

    // Select Statistics modal DOM nodes
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

    // Bind manual modal triggers
    if (btnInfo && infoModal) {
        btnInfo.addEventListener('click', () => {
            openModal(infoModal);
            if (window.twemoji) window.twemoji.parse(infoModal); // Lazy-parse handbook on demand
        });
    }
    if (btnCloseModal && infoModal) {
        btnCloseModal.addEventListener('click', () => {
            closeModal(infoModal);
        });
    }

    // Bind settings modal triggers with state sync hooks
    if (btnSettings && settingsModal) {
        btnSettings.addEventListener('click', () => {
            // Trigger pre-open hook to sync UI selectors with actual store parameters
            if (typeof onSettingsOpen === 'function') {
                onSettingsOpen();
            }
            openModal(settingsModal);
            if (window.twemoji) window.twemoji.parse(settingsModal); // Lazy-parse settings on demand
        });
    }
    
    if (btnCloseSettings && settingsModal) {
        btnCloseSettings.addEventListener('click', () => {
            // Trigger close hook to commit modified UI selectors to store and localStorage
            if (typeof onSettingsSave === 'function') {
                onSettingsSave();
            }
            closeModal(settingsModal);
        });
    }

    // Bind statistics modal triggers
    if (btnStats && statsModal) {
        btnStats.addEventListener('click', () => {
            if (typeof onStatsOpen === 'function') {
                onStatsOpen();
            }
            openModal(statsModal);
            if (window.twemoji) window.twemoji.parse(statsModal); // Lazy-parse statistics on demand
        });
    }

    if (btnCloseStats && statsModal) {
        btnCloseStats.addEventListener('click', () => {
            closeModal(statsModal);
        });
    }
}