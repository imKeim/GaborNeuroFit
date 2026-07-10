/*
 * GaborNeuroFit - Dashboard & Patient Registry Controller
 * Copyright (C) 2026 Pavel Korotkov
 */

import { Store } from '../store.js';
import { DataRepository } from '../store/repository.js';
import { renderProgressChart, renderSynopProgressChart, updateLeaderboard, updateSynopLeaderboard, getCompactPresetLabel, updateScoreboard } from '../ui/screen.js';
import { showCustomAlert, showCustomConfirm } from '../ui/modal.js';

export class DashboardController {
    constructor(getTranslationsCallback) {
        this.getTranslations = getTranslationsCallback;
        this.bindEvents();
    }

    // Refresh and render entire multi-user statistics dashboard synchronously (SSoT compliant)
    refreshStatsUI() {
        const activeUid = DataRepository.getActiveProfileId();
        const profiles = DataRepository.getProfiles();
        const t = this.getTranslations();

        const dropdown = document.getElementById('select-active-profile');
        if (dropdown) {
            dropdown.innerHTML = profiles.map(p =>
                `<option value="${p.id}" ${p.id === activeUid ? 'selected' : ''}>${p.name}</option>`
            ).join('');
        }

        // Parse the profile emoji span into a Twemoji SVG
        const profileEmojiEl = document.getElementById('active-profile-emoji');
        if (window.twemoji && profileEmojiEl) {
            profileEmojiEl.innerText = '👤';
            window.twemoji.parse(profileEmojiEl);
        }

        // Refresh Gabor Tab (Sensory database queries)
        const gaborSessions = DataRepository.getGaborSessionsForActiveUser();
        renderProgressChart(gaborSessions, t);
        updateLeaderboard(gaborSessions, t, Store.state.currentLang);

        // Refresh Synoptophore Tab (Motor database queries)
        const synopSessions = DataRepository.getSynopSessionsForActiveUser();
        renderSynopProgressChart(synopSessions, t);
        updateSynopLeaderboard(synopSessions, t, Store.state.currentLang);

        const statsModal = document.getElementById('stats-modal');
        if (window.twemoji && statsModal) {
            window.twemoji.parse(statsModal);
        }
    }

    bindEvents() {
        // Segmented Tabs Click Listeners for Statistics
        const tabGabor = document.getElementById('tab-gabor');
        const tabSynop = document.getElementById('tab-synop');
        const contentGabor = document.getElementById('tab-gabor-content');
        const contentSynop = document.getElementById('tab-tab-synop-content');

        if (tabGabor && tabSynop && contentGabor && contentSynop) {
            tabGabor.addEventListener('click', () => {
                tabGabor.classList.add('active');
                tabSynop.classList.remove('active');
                tabGabor.style.background = '#2b354a';
                tabGabor.style.color = '#3b90ff';
                tabSynop.style.background = 'transparent';
                tabSynop.style.color = '#8e8e93';
                contentGabor.style.display = 'block';
                contentSynop.style.display = 'none';
            });

            tabSynop.addEventListener('click', () => {
                tabSynop.classList.add('active');
                tabGabor.classList.remove('active');
                tabSynop.style.background = '#2b354a';
                tabSynop.style.color = '#3b90ff';
                tabGabor.style.background = 'transparent';
                tabGabor.style.color = '#8e8e93';
                contentSynop.style.display = 'block';
                contentGabor.style.display = 'none';
            });
        }

        // Bind Relational Multi-Patient Interactive Events
        const selectActiveProfile = document.getElementById('select-active-profile');
        if (selectActiveProfile) {
            selectActiveProfile.addEventListener('change', () => {
                DataRepository.setActiveProfileId(selectActiveProfile.value);
                Store.state.score = 0;
                Store.state.total = 0;
                Store.resetSessionProgress();
                updateScoreboard(Store.state, this.getTranslations());
                this.refreshStatsUI();
            });
        }

        const btnAddProfile = document.getElementById('btn-add-profile');
        const inputNewProfile = document.getElementById('input-new-profile');
        if (btnAddProfile && inputNewProfile) {
            btnAddProfile.addEventListener('click', () => {
                const t = this.getTranslations();
                const name = inputNewProfile.value.trim();
                if (!name) {
                    showCustomAlert(t.titleWarning || "Warning", t.msgEmptyName);
                    return;
                }
                const newProf = DataRepository.createProfile(name);
                if (newProf) {
                    DataRepository.setActiveProfileId(newProf.id);
                    inputNewProfile.value = '';
                    Store.state.score = 0;
                    Store.state.total = 0;
                    Store.resetSessionProgress();
                    updateScoreboard(Store.state, t);
                    this.refreshStatsUI();
                }
            });
        }

        const btnDeleteProfile = document.getElementById('btn-delete-profile');
        if (btnDeleteProfile) {
            btnDeleteProfile.addEventListener('click', () => {
                const activeUid = DataRepository.getActiveProfileId();
                const profiles = DataRepository.getProfiles();
                const activeProf = profiles.find(p => p.id === activeUid);
                const t = this.getTranslations();
                if (!activeProf) return;

                if (profiles.length <= 1) {
                    showCustomAlert(t.titleWarning || "Warning", t.msgCannotDeleteLast);
                    return;
                }

                const rawConfirm = t.msgConfirmDelete || "Delete profile \"{name}\"?";
                const confirmText = rawConfirm.replace('{name}', activeProf.name);

                showCustomConfirm(
                    t.titleDanger || "Danger",
                    confirmText,
                    t.confirmYes || "Yes",
                    t.confirmNo || "Cancel",
                    (isConfirmed) => {
                        if (isConfirmed) {
                            DataRepository.deleteProfile(activeUid);
                            Store.state.score = 0;
                            Store.state.total = 0;
                            Store.resetSessionProgress();
                            updateScoreboard(Store.state, t);
                            this.refreshStatsUI();
                        }
                    }
                );
            });
        }

        const btnClearHistory = document.getElementById('btn-clear-history');
        if (btnClearHistory) {
            btnClearHistory.addEventListener('click', () => {
                const t = this.getTranslations();
                const confirmText = t.msgConfirmClear || "Are you sure you want to clear history?";
                showCustomConfirm(
                    t.titleDanger || "Danger",
                    confirmText,
                    t.confirmYes || "Yes",
                    t.confirmNo || "Cancel",
                    (isConfirmed) => {
                        if (isConfirmed) {
                            DataRepository.clearActiveUserHistory();
                            Store.state.score = 0;
                            Store.state.total = 0;
                            Store.resetSessionProgress();
                            updateScoreboard(Store.state, t);
                            this.refreshStatsUI();
                        }
                    }
                );
            });
        }

        const btnExportCsv = document.getElementById('btn-export-csv');
        if (btnExportCsv) {
            btnExportCsv.addEventListener('click', () => {
                const sessions = DataRepository.getSessionsForActiveUser();
                if (sessions.length === 0) return;

                const headers = ["Date", "Mode", "Lazy Eye Side", "Score/Total", "Accuracy %", "Gabor Stage", "Contrast Threshold %", "Contrast Balancer %", "10Hz Flicker", "Visual Crowding", "Peripheral Shift", "Permanent Cross", "Synop Deviation X (px)", "Synop Deviation Y (px)", "Synop Start Distance (px)", "Outcome"];
                        
                const rows = sessions.map(s => {
                    const dateStr = new Date(s.timestamp).toISOString().replace(/T/, ' ').replace(/\..+/, '');
                    const accuracy = s.total > 0 ? ((s.score / s.total) * 100).toFixed(1) : '0';
                            
                    const isSynop = s.protocol === 'synoptophore';
                    const modeLabel = isSynop ? "Synoptophore" : getCompactPresetLabel(s.protocol, Store.state.currentLang);
                    
                    const eyeSide = s.lazyEyeSide ? s.lazyEyeSide.toUpperCase() : 'LEFT';
                    const isFlickerOn = isSynop ? (s.synopFlickerActive ? "ON" : "OFF") : (s.isFlickerEnabled ? "ON" : "OFF");
                    const isCrowdingOn = isSynop ? "OFF" : (s.isCrowdingEnabled ? "ON" : "OFF");
                    const isPeripheralOn = isSynop ? "OFF" : (s.isPeripheralEnabled ? "ON" : "OFF");
                    const isCrossOn = isSynop ? "OFF" : (s.isPermanentCrossEnabled ? "ON" : "OFF");

                    return [
                        `"${dateStr}"`, `"${modeLabel}"`, `"${eyeSide}"`,
                        isSynop ? `""` : `"${s.score}/${s.total}"`,
                        isSynop ? `""` : `"${accuracy}%"`,
                        isSynop ? `""` : s.level,
                        isSynop ? `""` : `"${s.contrast}%"`,
                        `"${s.balance}%"`, `"${isFlickerOn}"`, `"${isCrowdingOn}"`,
                        `"${isPeripheralOn}"`, `"${isCrossOn}"`,
                        isSynop ? (s.synopTargetX || 0) : `""`,
                        isSynop ? (s.synopTargetY || 0) : `""`,
                        isSynop ? (s.synopStartDistance || 0).toFixed(0) : `""`,
                        isSynop ? `"${(s.synopOutcome || 'slip').toUpperCase()}"` : `""`
                    ].join(',');
                });

                const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows].join('\n');
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                
                const activeUid = DataRepository.getActiveProfileId();
                const activeProf = DataRepository.getProfiles().find(p => p.id === activeUid);
                const nameSafe = activeProf ? activeProf.name.replace(/[^a-z0-9]/gi, '_') : 'Patient';
                
                link.setAttribute("download", `gabor_progress_${nameSafe}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    }
}