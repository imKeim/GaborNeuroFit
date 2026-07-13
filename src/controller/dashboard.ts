/*
 * GaborNeuroFit - Dashboard & Patient Registry Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs strict null-checks and safe parsing boundaries
 * to process imported/exported CSV arrays without data loss or exceptions.
 */

import { Store } from '../store';
import { DataRepository } from '../store/repository';
import { renderProgressChart, renderSynopProgressChart, renderRdsProgressChart, updateLeaderboard, updateSynopLeaderboard, updateRdsLeaderboard, getCompactPresetLabel, updateScoreboard } from '../ui/screen';
import { showCustomAlert, showCustomConfirm } from '../ui/modal';
import { parseCSV, serializeCSV } from '../utils/csv';
import type { EyeSide, RdsSession, GaborSession, SynoptophoreSession } from '../types/clinical';

export class DashboardController {
    constructor(private getTranslations: () => Record<string, string>) {
        this.bindEvents();
    }

    refreshStatsUI(): void {
        const activeUid = DataRepository.getActiveProfileId();
        const profiles = DataRepository.getProfiles();
        const t = this.getTranslations();

        const dropdown = document.getElementById('select-active-profile') as HTMLSelectElement | null;
        if (dropdown) {
            dropdown.innerHTML = profiles.map(p =>
                `<option value="${p.id}" ${p.id === activeUid ? 'selected' : ''}>${p.name}</option>`
            ).join('');
        }

        const gaborSessions = DataRepository.getGaborSessionsForActiveUser();
        renderProgressChart(gaborSessions, t);
        updateLeaderboard(gaborSessions, t, Store.state.currentLang);

        const synopSessions = DataRepository.getSynopSessionsForActiveUser();
        renderSynopProgressChart(synopSessions, t);
        updateSynopLeaderboard(synopSessions, t, Store.state.currentLang);

        const rdsSessions = DataRepository.getRdsSessionsForActiveUser();
        renderRdsProgressChart(rdsSessions, t);
        updateRdsLeaderboard(rdsSessions, t, Store.state.currentLang);

        const statsModal = document.getElementById('stats-modal');
        // @ts-ignore
        if (typeof window !== 'undefined' && window.twemoji && statsModal) {
            // @ts-ignore
            window.twemoji.parse(statsModal);
        }
    }

    private bindEvents(): void {
        const tabGabor = document.getElementById('tab-gabor');
        const tabSynop = document.getElementById('tab-synop');
        const tabRds = document.getElementById('tab-rds');
        const contentGabor = document.getElementById('tab-gabor-content');
        const contentSynop = document.getElementById('tab-tab-synop-content');
        const contentRds = document.getElementById('tab-rds-content');

        if (tabGabor && tabSynop && tabRds && contentGabor && contentSynop && contentRds) {
            const resetTabs = () => {
                tabGabor.classList.remove('active');
                tabSynop.classList.remove('active');
                tabRds.classList.remove('active');
                contentGabor.style.display = 'none';
                contentSynop.style.display = 'none';
                contentRds.style.display = 'none';
            };

            tabGabor.addEventListener('click', () => {
                resetTabs();
                tabGabor.classList.add('active');
                contentGabor.style.display = 'block';
            });

            tabSynop.addEventListener('click', () => {
                resetTabs();
                tabSynop.classList.add('active');
                contentSynop.style.display = 'block';
            });

            tabRds.addEventListener('click', () => {
                resetTabs();
                tabRds.classList.add('active');
                contentRds.style.display = 'block';
            });
        }

        const selectActiveProfile = document.getElementById('select-active-profile') as HTMLSelectElement | null;
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
        const inputNewProfile = document.getElementById('input-new-profile') as HTMLInputElement | null;
        if (btnAddProfile && inputNewProfile) {
            btnAddProfile.addEventListener('click', () => {
                const t = this.getTranslations();
                const name = inputNewProfile.value.trim();
                if (!name) {
                    showCustomAlert(t.titleWarning || "Warning", t.msgEmptyName || "Profile name cannot be empty!");
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
                    showCustomAlert(t.titleWarning || "Warning", t.msgCannotDeleteLast || "Cannot delete last profile");
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
                        if (isConfirmed && activeUid) {
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
                const t = this.getTranslations();
                const sessions = DataRepository.getSessionsForActiveUser();
                if (sessions.length === 0) return;

                const headers = (t.csvHeaders || "Date,Mode,Lazy Eye Side,Score/Total,Accuracy %,Gabor Stage,Contrast Threshold %,Contrast Balancer %,10Hz Flicker,Visual Crowding,Peripheral Shift,Permanent Cross,Synop Deviation X (px),Synop Deviation Y (px),Synop Start Distance (px),Outcome,RDS Dot Size (px),RDS Dot Density %,RDS Disparity Threshold (px)").split(',');

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rawRows: any[][] = sessions.map(s => {
                    const dateStr = new Date(s.timestamp).toISOString().replace(/T/, ' ').replace(/\..+/, '');

                    const isSynop = s.protocol === 'synoptophore';
                    const isRds = s.protocol === 'rds';
                    const modeLabel = getCompactPresetLabel(s.protocol, t);

                    // --- Polymorphic Data Extraction depending on specific Casted Type ---

                    if (isSynop) {
                        const ss = s as SynoptophoreSession;
                        const eyeSide = ss.lazyEyeSide ? ss.lazyEyeSide.toUpperCase() : 'LEFT';
                        return [
                            dateStr, modeLabel, eyeSide,
                            "", "", "", "", "",
                            ss.synopFlickerActive ? "ON" : "OFF", "OFF", "OFF", "OFF",
                            ss.synopTargetX || 0,
                            ss.synopTargetY || 0,
                            (ss.synopStartDistance || 0).toFixed(0),
                            (ss.synopOutcome || 'slip').toUpperCase(),
                            "", "", ""
                        ];
                    } else if (isRds) {
                        const sr = s as RdsSession;
                        const eyeSide = sr.lazyEyeSide ? sr.lazyEyeSide.toUpperCase() : 'LEFT';
                        const accuracy = sr.total > 0 ? ((sr.score / sr.total) * 100).toFixed(1) : '0';
                        return [
                            dateStr, modeLabel, eyeSide,
                            `${sr.score}/${sr.total}`, `${accuracy}%`,
                            sr.level, "", "",
                            "OFF", "OFF", "OFF", "OFF",
                            "", "", "", "FUSED",
                            sr.rdsDotSize,
                            sr.rdsDensity ? Math.round(sr.rdsDensity * 100) + "%" : "",
                            sr.rdsDisparity
                        ];
                    } else {
                        const sg = s as GaborSession;
                        const eyeSide = sg.lazyEyeSide ? sg.lazyEyeSide.toUpperCase() : 'LEFT';
                        const accuracy = sg.total > 0 ? ((sg.score / sg.total) * 100).toFixed(1) : '0';
                        return [
                            dateStr, modeLabel, eyeSide,
                            `${sg.score}/${sg.total}`, `${accuracy}%`,
                            sg.level, `${sg.contrast}%`, `${sg.balance}%`,
                            sg.isFlickerEnabled ? "ON" : "OFF",
                            sg.isCrowdingEnabled ? (sg.flankerDistanceCoeff === 4.0 ? "ON (Far 4x)" : "ON (Close 2x)") : "OFF",
                            sg.isPeripheralEnabled ? "ON" : "OFF",
                            sg.isPermanentCrossEnabled ? "ON" : "OFF",
                            "", "", "", "", "", "", ""
                        ];
                    }
                });

                const csvContent = serializeCSV(headers, rawRows);
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.setAttribute("href", URL.createObjectURL(blob));

                const activeUid = DataRepository.getActiveProfileId();
                const activeProf = DataRepository.getProfiles().find(p => p.id === activeUid);
                const nameSafe = activeProf ? activeProf.name.replace(/[^a-z0-9]/gi, '_') : 'Patient';

                link.setAttribute("download", `gabor_progress_${nameSafe}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }

        const btnImportCsv = document.getElementById('btn-import-csv');
        const inputImportCsv = document.getElementById('input-import-csv') as HTMLInputElement | null;
        if (btnImportCsv && inputImportCsv) {
            btnImportCsv.addEventListener('click', () => {
                inputImportCsv.click();
            });

            inputImportCsv.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                if (!target.files || target.files.length === 0) return;
                const file = target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target && typeof e.target.result === 'string') {
                        this.parseAndImportCSV(e.target.result);
                    }
                    inputImportCsv.value = ''; // Reset file input
                };
                reader.readAsText(file, 'UTF-8');
            });
        }
    }

    private parseAndImportCSV(text: string): void {
        const t = this.getTranslations();
        try {
            const parsedLines = parseCSV(text);
            if (parsedLines.length < 2) {
                showCustomAlert(t.titleWarning || "Warning", t.msgImportError || "Format error");
                return;
            }

            const headers = parsedLines[0];
            const headerMap: Record<string, number> = {};
            headers.forEach((h, idx) => {
                headerMap[h] = idx;
            });

            const getCol = (row: string[], colName: string, defaultVal = '') => {
                const idx = headerMap[colName];
                if (idx === undefined || idx >= row.length) return defaultVal;
                return row[idx];
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsedSessions: any[] = [];

            for (let i = 1; i < parsedLines.length; i++) {
                const row = parsedLines[i];
                if (row.length < 3) continue;

                const dateStr = getCol(row, "Date");
                if (!dateStr) continue;

                let timestamp = Date.parse(dateStr);
                if (isNaN(timestamp)) {
                    timestamp = Date.now() - (parsedLines.length - i) * 60000;
                }

                const scoreTotalStr = getCol(row, "Score/Total");
                let score = 0;
                let total = 0;
                if (scoreTotalStr && scoreTotalStr.includes('/')) {
                    const parts = scoreTotalStr.split('/');
                    score = parseInt(parts[0], 10) || 0;
                    total = parseInt(parts[1], 10) || 0;
                }

                const isAnaglyph = getCol(row, "Contrast Balancer %") !== "Off" && getCol(row, "Contrast Balancer %") !== "";
                const balanceStr = getCol(row, "Contrast Balancer %").replace('%', '');
                const balance = isAnaglyph ? (parseInt(balanceStr, 10) || 30) / 100 : 0.3;

                const outcome = getCol(row, "Outcome").toLowerCase();

                let protocol = getCol(row, "Mode");
                if (protocol.includes('🩹')) protocol = 'occlusion';
                else if (protocol.includes('🕶️')) protocol = 'binocular';
                else if (protocol.includes('🎯')) protocol = 'peripheral';
                else if (protocol.includes('⚡')) protocol = 'blitz';
                else if (protocol.includes('🌀') || protocol.toLowerCase().includes('flicker')) protocol = 'flicker';
                else if (protocol.includes('🧊') || protocol.toLowerCase().includes('stereogram') || protocol.toLowerCase().includes('rds')) protocol = 'rds';
                else if (protocol.includes('🧲') || protocol.toLowerCase().includes('vergence') || protocol.toLowerCase().includes('synoptophore')) protocol = 'synoptophore';
                else protocol = 'custom';

                const crowdingRaw = getCol(row, "Visual Crowding");
                const isCrowdingEnabled = crowdingRaw.includes("ON");
                const flankerDistanceCoeff = crowdingRaw.includes("Far") ? 4.0 : 2.0;

                const rdsDotSizeRaw = getCol(row, "RDS Dot Size (px)");
                const rdsDotSize = rdsDotSizeRaw ? parseInt(rdsDotSizeRaw, 10) || null : null;

                const rdsDensityRaw = getCol(row, "RDS Dot Density %");
                const rdsDensity = rdsDensityRaw ? parseFloat(rdsDensityRaw.replace('%', '')) / 100 : null;

                const rdsDisparityRaw = getCol(row, "RDS Disparity Threshold (px)");
                const rdsDisparity = rdsDisparityRaw ? parseInt(rdsDisparityRaw, 10) || null : null;

                parsedSessions.push({
                    id: 'imported_session_' + timestamp + '_' + Math.random().toString(36).substr(2, 5),
                    timestamp: timestamp,
                    score: score,
                    total: total,
                    level: parseInt(getCol(row, "Gabor Stage"), 10) || 1,
                    contrast: (parseInt(getCol(row, "Contrast Threshold %").replace('%', ''), 10) || 50) / 100,
                    protocol: protocol,
                    speed: 'adaptive',
                    isAnaglyph: isAnaglyph,
                    balance: balance,
                    lazyEyeSide: getCol(row, "Lazy Eye Side").toLowerCase() || 'left',
                    isFlicker: getCol(row, "10Hz Flicker") === "ON",
                    isCrowding: isCrowdingEnabled,
                    flankerDistanceCoeff: flankerDistanceCoeff,
                    isPeripheral: getCol(row, "Peripheral Shift") === "ON",
                    isPermanentCross: getCol(row, "Permanent Cross") === "ON",
                    targetX: parseInt(getCol(row, "Synop Deviation X (px)"), 10) || null,
                    targetY: parseInt(getCol(row, "Synop Deviation Y (px)"), 10) || null,
                    startDistance: parseFloat(getCol(row, "Synop Start Distance (px)")) || null,
                    outcome: outcome || null,
                    rdsDotSize: rdsDotSize,
                    rdsDensity: rdsDensity,
                    rdsDisparity: rdsDisparity
                });
            }

            if (parsedSessions.length === 0) {
                showCustomAlert(t.titleWarning || "Warning", t.msgImportError || "Empty array");
                return;
            }

            const activeUid = DataRepository.getActiveProfileId();
            const activeProf = DataRepository.getProfiles().find(p => p.id === activeUid);
            const name = activeProf ? activeProf.name : "Patient";

            const confirmText = (t.msgImportConfirm || "Import {count} sessions?")
                .replace('{count}', parsedSessions.length.toString())
                .replace('{name}', name);

            showCustomConfirm(
                t.titleImportConfirm || "Import",
                confirmText,
                t.confirmYes || "Yes",
                t.confirmNo || "Cancel",
                (isConfirmed) => {
                    if (isConfirmed) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        parsedSessions.forEach((s: any) => {
                            DataRepository.saveSession({
                                sessionId: s.id,
                                score: s.score,
                                total: s.total,
                                level: s.level,
                                contrast: s.contrast,
                                protocol: s.protocol as any,
                                speed: s.speed,
                                isAnaglyph: s.isAnaglyph,
                                balance: s.balance,
                                lazyEyeSide: s.lazyEyeSide as EyeSide,
                                isFlicker: s.isFlicker,
                                isCrowding: s.isCrowding,
                                isPeripheral: s.isPeripheral,
                                isPermanentCross: s.isPermanentCross,
                                targetX: s.targetX,
                                targetY: s.targetY,
                                startDistance: s.startDistance,
                                outcome: s.outcome as any,
                                flankerDistanceCoeff: s.flankerDistanceCoeff,
                                rdsDotSize: s.rdsDotSize,
                                rdsDensity: s.rdsDensity,
                                rdsDisparity: s.rdsDisparity
                            });
                        });

                        updateScoreboard(Store.state, t);
                        this.refreshStatsUI();

                        const successText = (t.msgImportSuccess || "Imported {count} sessions!")
                            .replace('{count}', parsedSessions.length.toString());
                        showCustomAlert(t.titleImportConfirm || "Import", successText);
                    }
                }
            );
        } catch (e) {
            console.error("CSV Import Parser Error:", e);
            showCustomAlert(t.titleWarning || "Warning", t.msgImportError || "Parse crash");
        }
    }
}