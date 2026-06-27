/*
 * GaborNeuroFit - Modal Dialogs Management Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module manages the presentational state (visibility) of the Handbook
 * and Configuration modals and invokes callback hooks for settings synchronization.
 */

// Initialize click listeners for settings and manual popup modals
export function initModals(onSettingsOpen, onSettingsSave) {
    // Select Handbook modal DOM nodes
    const infoModal = document.getElementById('info-modal');
    const btnInfo = document.getElementById('btn-info');
    const btnCloseModal = document.getElementById('btn-close-modal');

    // Select Configuration modal DOM nodes
    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');

    // Bind manual modal triggers
    if (btnInfo && infoModal) {
        btnInfo.addEventListener('click', () => {
            infoModal.style.display = 'block';
        });
    }
    if (btnCloseModal && infoModal) {
        btnCloseModal.addEventListener('click', () => {
            infoModal.style.display = 'none';
        });
    }

    // Bind settings modal triggers with state sync hooks
    if (btnSettings && settingsModal) {
        btnSettings.addEventListener('click', () => {
            // Trigger pre-open hook to sync UI selectors with actual store parameters
            if (typeof onSettingsOpen === 'function') {
                onSettingsOpen();
            }
            settingsModal.style.display = 'block';
        });
    }
    
    if (btnCloseSettings && settingsModal) {
        btnCloseSettings.addEventListener('click', () => {
            // Trigger close hook to commit modified UI selectors to store and localStorage
            if (typeof onSettingsSave === 'function') {
                onSettingsSave();
            }
            settingsModal.style.display = 'none';
        });
    }
}