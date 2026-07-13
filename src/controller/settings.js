/*
 * GaborNeuroFit - Declarative Settings Binder Controller
 * Copyright (C) 2026 Pavel Korotkov
 */

import { Store } from '../store.js';

const CONFIG_SCHEMA = [
    { id: 'chk-stage-advance', key: 'allowStageAdvance', type: 'checkbox' },
    { id: 'select-flash-duration', key: 'flashDurationMode', type: 'value' },
    { id: 'chk-peripheral', key: 'isPeripheralEnabled', type: 'checkbox' },
    { id: 'chk-crowding', key: 'isCrowdingEnabled', type: 'checkbox' },
    { id: 'select-crowding-mode', key: 'crowdingMode', type: 'value' },
    { id: 'select-flanker-distance', key: 'flankerDistanceCoeff', type: 'float' },
    { id: 'chk-orthogonal-flankers', key: 'isOrthogonalFlankersEnabled', type: 'checkbox' },
    { id: 'chk-dynamic-flankers', key: 'isDynamicFlankersEnabled', type: 'checkbox' },
    { id: 'chk-low-contrast', key: 'allowLowContrast', type: 'checkbox' },
    { id: 'chk-wide-variance', key: 'allowWideVariance', type: 'checkbox' },
    { id: 'chk-shape-variance', key: 'allowShapeVariance', type: 'checkbox' },
    { id: 'chk-static', key: 'isStaticEnabled', type: 'checkbox' },
    { id: 'chk-anaglyph', key: 'isAnaglyphEnabled', type: 'checkbox' },
    { id: 'chk-flicker', key: 'isFlickerEnabled', type: 'checkbox' },
    { id: 'chk-fusion-lock', key: 'isFusionLockEnabled', type: 'checkbox' },
    { id: 'select-red-side', key: 'redEyeSide', type: 'value' },
    { id: 'select-lazy-side', key: 'lazyEyeSide', type: 'value' },
    { id: 'range-strong-attenuation', key: 'strongEyeContrastFactor', type: 'percent' },
    { id: 'select-start-level', key: 'currentLevel', type: 'int' },
    { id: 'select-autonext', key: 'autoAdvance', type: 'boolean' },
    { id: 'select-session-limit', key: 'sessionLimit', type: 'int' },
    { id: 'select-timer-limit', key: 'timerLimitMinutes', type: 'int' },
    { id: 'slider-left-r', key: 'calibratorLeftR', type: 'int' },
    { id: 'slider-right-g', key: 'calibratorRightG', type: 'int' },
    { id: 'slider-right-b', key: 'calibratorRightB', type: 'int' },
    { id: 'select-pull-speed', key: 'synopPullSpeed', type: 'int' },
    { id: 'select-target-type', key: 'synopTargetType', type: 'value' },
    { id: 'chk-synop-lazy-grid', key: 'synopShowLazyGrid', type: 'checkbox' },
    { id: 'chk-synop-strong-grid', key: 'synopShowStrongGrid', type: 'checkbox' },
    { id: 'select-target-size', key: 'synopTargetSize', type: 'int' },
    { id: 'chk-synop-flicker', key: 'synopFlickerActive', type: 'checkbox' },
    { id: 'chk-synop-lock-y', key: 'synopLockVertical', type: 'checkbox' },
    { id: 'chk-synop-lock-x', key: 'synopLockHorizontal', type: 'checkbox' },
    { id: 'chk-permanent-cross', key: 'isPermanentCrossEnabled', type: 'checkbox' },
    { id: 'select-rds-dot-size', key: 'rdsDotSize', type: 'int' },
    { id: 'select-rds-density', key: 'rdsDensity', type: 'float' },
    { id: 'select-rds-start-disparity', key: 'rdsStartDisparity', type: 'int' },
    { id: 'select-rds-autonext', key: 'rdsAutoAdvance', type: 'boolean' },
    { id: 'chk-rds-dynamic', key: 'rdsIsDynamic', type: 'checkbox' },
    { id: 'chk-rds-randomize-vertical', key: 'rdsRandomizeVertical', type: 'checkbox' },
    { id: 'chk-rds-floating', key: 'rdsIsFloating', type: 'checkbox' },
    { id: 'select-rds-float-speed', key: 'rdsFloatSpeed', type: 'value' },
    { id: 'chk-rds-permanent-cross', key: 'rdsIsPermanentCrossEnabled', type: 'checkbox' }
];

export class SettingsController {
    constructor(onSyncCallback, translationsGetter) {
        this.onSyncCallback = onSyncCallback;
        this.getTranslations = translationsGetter;
        this.anaglyphPanel = document.getElementById('anaglyph-settings-panel');
        this.valStrongAttenuation = document.getElementById('val-strong-attenuation');
        this.selectPresetMode = document.getElementById('select-preset-mode');
        this.rangeStrongAttenuation = document.getElementById('range-strong-attenuation');
    }

    updateSliderTrackGradient(slider) {
        if (!slider || slider.type !== 'range') return;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        slider.style.setProperty('--percent', percent + '%');
    }

    syncStateFromUI() {
        const s = Store.state;
        let lastActiveTrigger = null;

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;
    
            let val;
            if (field.type === 'checkbox') {
                val = el.checked;
                if (s[field.key] !== val) {
                    if (field.key === 'isPeripheralEnabled') lastActiveTrigger = 'peripheral';
                    if (field.key === 'isCrowdingEnabled') lastActiveTrigger = 'crowding';
                    if (field.key === 'isStaticEnabled') lastActiveTrigger = 'static';
                    if (field.key === 'isFlickerEnabled') lastActiveTrigger = 'flicker';
                    if (field.key === 'rdsRandomizeVertical') lastActiveTrigger = 'rdsRandomizeVertical';
                    if (field.key === 'rdsIsFloating') lastActiveTrigger = 'rdsIsFloating';
                }
            } else if (field.type === 'value') {
                val = el.value;
            } else if (field.type === 'int') {
                val = parseInt(el.value) || 0;
            } else if (field.type === 'float') {
                val = parseFloat(el.value) || 2.0;
            } else if (field.type === 'boolean') {
                val = (el.value === 'true');
            } else if (field.type === 'percent') {
                val = parseFloat(el.value) / 100;
            }
            
            if (field.id === 'select-session-limit') {
                Store.updateState(s.appMode === 'rds' ? 'rdsSessionLimit' : 'sessionLimit', val);
            } else if (field.id === 'range-strong-attenuation') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopStrongEyeContrastFactor' : 'strongEyeContrastFactor', val);
                if (this.valStrongAttenuation) {
                    this.valStrongAttenuation.innerText = el.value + '%';
                }
            } else if (field.id === 'slider-left-r') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorLeftR' : 'calibratorLeftR', val);
            } else if (field.id === 'slider-right-g') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorRightG' : 'calibratorRightG', val);
            } else if (field.id === 'slider-right-b') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorRightB' : 'calibratorRightB', val);
            } else {
                Store.updateState(field.key, val);
            }

            // Real-time track gradient coloring
            this.updateSliderTrackGradient(el);
        });

        Store.resolveConflicts(lastActiveTrigger);
    
        if (s.appMode === 'gabor') {
            const detectedPreset = Store.detectMatchingPreset();
            Store.updateState('presetMode', detectedPreset);
            if (this.selectPresetMode) {
                this.selectPresetMode.value = detectedPreset;
            }
        }

        this.updateCalibrationLabels(s);

        if (typeof this.onSyncCallback === 'function') {
            this.onSyncCallback();
        }
    }

    updatePresetUI() {
        const s = Store.state;
        const isSynop = s.appMode === 'synoptophore';
        const t = this.getTranslations ? this.getTranslations() : {};

        // Dynamically rebuild Session Limit options depending on active mode (FOUC & clinical safety)
        const selectLimit = document.getElementById('select-session-limit');
        if (selectLimit) {
            const curVal = s.sessionLimit;
            const noLimitTxt = t.optLimitNo || "No Limit";
            if (s.appMode === 'rds') {
                const labelSprint = t.optLimitRdsSprint || "Sprint";
                const labelStandard = t.optLimitRdsStandard || "Standard";
                const labelMax = t.optLimitRdsMax || "Max";
                selectLimit.innerHTML = `
                    <option value="0" ${curVal === 0 ? 'selected' : ''}>${noLimitTxt}</option>
                    <option value="15" ${curVal === 15 ? 'selected' : ''}>15 (${labelSprint})</option>
                    <option value="25" ${curVal === 25 ? 'selected' : ''}>25 (${labelStandard})</option>
                    <option value="40" ${curVal === 40 ? 'selected' : ''}>40 (${labelMax})</option>
                `;
            } else {
                const labelBlitz = t.optLimitGaborBlitz || "Blitz";
                const labelStandard = t.optLimitGaborStandard || "Standard";
                const labelIntense = t.optLimitGaborIntense || "Intense";
                const labelMax = t.optLimitGaborMax || "Max";
                selectLimit.innerHTML = `
                    <option value="0" ${curVal === 0 ? 'selected' : ''}>${noLimitTxt}</option>
                    <option value="40" ${curVal === 40 ? 'selected' : ''}>40 (${labelBlitz})</option>
                    <option value="80" ${curVal === 80 ? 'selected' : ''}>80 (${labelStandard})</option>
                    <option value="120" ${curVal === 120 ? 'selected' : ''}>120 (${labelIntense})</option>
                    <option value="160" ${curVal === 160 ? 'selected' : ''}>160 (${labelMax})</option>
                `;
            }
        }

        if (!isSynop) {
            // Safeguard: Automatically clamp Gabor subpixel calibrations to prevent negative phase underflow.
            // Clinically, negative phases are useless for Gabor crosstalk cancellation.
            if (s.calibratorLeftR < 127) s.calibratorLeftR = 127;
            if (s.calibratorRightG < 127) s.calibratorRightG = 127;
            if (s.calibratorRightB < 127) s.calibratorRightB = 127;
        }

        // Set the dynamic slider ranges immediately so they are respected during schema iteration
        const sliderR = document.getElementById('slider-left-r');
        const sliderG = document.getElementById('slider-right-g');
        const sliderB = document.getElementById('slider-right-b');
        if (sliderR) sliderR.min = isSynop ? "0" : "127";
        if (sliderG) sliderG.min = isSynop ? "0" : "127";
        if (sliderB) sliderB.min = isSynop ? "0" : "127";

        // Enforce presets ONLY in Gabor mode
        if (s.appMode === 'gabor' && s.presetMode !== 'custom') {
            Store.applyPresetTemplate(s.presetMode);
        }

        // Synchronize active highlights of settings segmented tab controller (3-Tab config)
        const btnTabGabor = document.getElementById('settings-tab-gabor');
        const btnTabSynop = document.getElementById('settings-tab-synop');
        const btnTabRds = document.getElementById('settings-tab-rds');
        
        if (btnTabGabor && btnTabSynop && btnTabRds) {
            btnTabGabor.classList.remove('active');
            btnTabSynop.classList.remove('active');
            btnTabRds.classList.remove('active');

            if (s.appMode === 'synoptophore') {
                btnTabSynop.classList.add('active');
            } else if (s.appMode === 'rds') {
                btnTabRds.classList.add('active');
            } else {
                btnTabGabor.classList.add('active');
            }
        }

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            if (field.id === 'select-session-limit') {
                el.value = (s.appMode === 'rds' ? s.rdsSessionLimit : s.sessionLimit).toString();
                this.updateSliderTrackGradient(el);
                return;
            }

            if (field.id === 'range-strong-attenuation') {
                const targetFactor = s.appMode === 'synoptophore' ? s.synopStrongEyeContrastFactor : s.strongEyeContrastFactor;
                el.value = Math.round(targetFactor * 100).toString();
                if (this.valStrongAttenuation) this.valStrongAttenuation.innerText = el.value + '%';
                this.updateSliderTrackGradient(el);
                return;
            }

            if (field.type === 'checkbox') el.checked = s[field.key];
            else if (field.type === 'value') el.value = s[field.key];
            else if (field.type === 'int') el.value = s[field.key].toString();
            else if (field.type === 'float') el.value = s[field.key].toString();
            else if (field.type === 'boolean') el.value = s[field.key] ? 'true' : 'false';

            if (field.id === 'slider-left-r') {
                el.value = (s.appMode === 'synoptophore' ? s.synopCalibratorLeftR : s.calibratorLeftR).toString();
            } else if (field.id === 'slider-right-g') {
                el.value = (s.appMode === 'synoptophore' ? s.synopCalibratorRightG : s.calibratorRightG).toString();
            } else if (field.id === 'slider-right-b') {
                el.value = (s.appMode === 'synoptophore' ? s.synopCalibratorRightB : s.calibratorRightB).toString();
            }

            this.updateSliderTrackGradient(el);
        });

        const sLeftR = document.getElementById('slider-left-r');
        if (sLeftR) sLeftR.value = s.appMode === 'synoptophore' ? s.synopCalibratorLeftR : s.calibratorLeftR;
        const sRightG = document.getElementById('slider-right-g');
        const sRightB = document.getElementById('slider-right-b');
        if (sRightG) sRightG.value = s.appMode === 'synoptophore' ? s.synopCalibratorRightG : s.calibratorRightG;
        if (sRightB) sRightB.value = s.appMode === 'synoptophore' ? s.synopCalibratorRightB : s.calibratorRightB;

        if (sLeftR) this.updateSliderTrackGradient(sLeftR);
        if (sRightG) this.updateSliderTrackGradient(sRightG);
        if (sRightB) this.updateSliderTrackGradient(sRightB);

        if (this.selectPresetMode) this.selectPresetMode.value = s.presetMode;

        this.updateCalibrationLabels(s);
        this.updateVisibilityPanels();
    }

    // Formatter to project physical subpixel deltas (+/- from 127 neutral gray)
    updateCalibrationLabels(s) {
        const valR = document.getElementById('val-calib-r');
        const valG = document.getElementById('val-calib-g');
        const valB = document.getElementById('val-calib-b');
        
        const r = s.appMode === 'synoptophore' ? s.synopCalibratorLeftR : s.calibratorLeftR;
        const g = s.appMode === 'synoptophore' ? s.synopCalibratorRightG : s.calibratorRightG;
        const b = s.appMode === 'synoptophore' ? s.synopCalibratorRightB : s.calibratorRightB;

        if (valR) valR.innerText = (r - 127 > 0 ? '+' : '') + (r - 127);
        if (valG) valG.innerText = (g - 127 > 0 ? '+' : '') + (g - 127);
        if (valB) valB.innerText = (b - 127 > 0 ? '+' : '') + (b - 127);
    }

    toggleAccordionGroupState(groupNumber, isEnabled) {
        const header = document.getElementById(`accordion-header-${groupNumber}`);
        const content = document.getElementById(`accordion-content-${groupNumber}`);
        if (!header || !content) return;

        if (isEnabled) {
            header.style.opacity = '1';
            header.style.pointerEvents = 'auto';
            content.style.opacity = '1';
            content.querySelectorAll('input, select, button').forEach(el => {
                el.disabled = false;
            });
        } else {
            header.style.opacity = '0.15';
            header.style.pointerEvents = 'none';
            content.style.opacity = '0.15';
            content.classList.remove('open');
            const arrow = header.querySelector('.accordion-arrow');
            if (arrow) arrow.classList.remove('active');
            content.querySelectorAll('input, select, button').forEach(el => {
                el.disabled = true;
            });
        }
    }

    updateVisibilityPanels() {
        const s = Store.state;
        const isGabor = (s.appMode === 'gabor');
        const isSynop = (s.appMode === 'synoptophore');
        const isRds = (s.appMode === 'rds');

        // 1. Declaratively toggle visibility of all elements tagged with data-visible-in
        const currentMode = s.appMode;
        document.querySelectorAll('[data-visible-in]').forEach(el => {
            const allowedModes = el.dataset.visibleIn.split(',');
            const isVisible = allowedModes.includes(currentMode);
            el.style.display = isVisible ? '' : 'none';
        });

        // 2. Manage sub-dependencies inside active modalities (Enabling/dimming sub-options)
        if (!isSynop) {
            const chkFlicker = document.getElementById('chk-flicker');
            const rowFlicker = document.getElementById('row-flicker');
            if (chkFlicker) chkFlicker.disabled = !s.isStaticEnabled;
            if (rowFlicker) {
                rowFlicker.style.opacity = s.isStaticEnabled ? '1' : '0.5';
            }

            const chkOrthogonal = document.getElementById('chk-orthogonal-flankers');
            const chkDynamic = document.getElementById('chk-dynamic-flankers');
            const rowOrthogonal = document.getElementById('row-orthogonal');
            const rowDynamic = document.getElementById('row-dynamic');
            const rowCrowdingMode = document.getElementById('row-crowding-mode');
            const rowFlankerDistance = document.getElementById('row-flanker-distance');

            if (chkOrthogonal) chkOrthogonal.disabled = !s.isCrowdingEnabled;
            if (chkDynamic) chkDynamic.disabled = !s.isCrowdingEnabled;
            const crowdingOpacity = s.isCrowdingEnabled ? '1' : '0.5';

            if (rowCrowdingMode) {
                rowCrowdingMode.style.opacity = crowdingOpacity;
                const selectElement = rowCrowdingMode.querySelector('select');
                if (selectElement) selectElement.disabled = !s.isCrowdingEnabled;
            }
            if (rowFlankerDistance) {
                rowFlankerDistance.style.opacity = crowdingOpacity;
                const selectElement = rowFlankerDistance.querySelector('select');
                if (selectElement) selectElement.disabled = !s.isCrowdingEnabled;
            }
            if (rowOrthogonal) {
                rowOrthogonal.style.opacity = crowdingOpacity;
            }
            if (rowDynamic) {
                rowDynamic.style.opacity = crowdingOpacity;
            }
        }

        // Sync dynamic float speed input lock inside RDS Group 6
        const rowRdsFloatSpeed = document.getElementById('row-rds-floating-speed');
        if (rowRdsFloatSpeed) {
            rowRdsFloatSpeed.style.opacity = s.rdsIsFloating ? '1' : '0.5';
            const selectEl = rowRdsFloatSpeed.querySelector('select');
            if (selectEl) selectEl.disabled = !s.rdsIsFloating;
        }

        if (this.anaglyphPanel) {
            this.anaglyphPanel.style.display = 'block';
            this.anaglyphPanel.style.opacity = (s.isAnaglyphEnabled || isSynop || isRds) ? '1' : '0.4';
            this.anaglyphPanel.querySelectorAll('input, select, button').forEach(input => {
                if (input.id !== 'chk-fusion-lock' && input.id !== 'chk-anaglyph') {
                    if (input.id === 'slider-left-r' || input.id === 'slider-right-g' || input.id === 'slider-right-b' || input.id === 'range-strong-attenuation') {
                        input.disabled = false;
                    } else {
                        input.disabled = (isSynop || isRds) ? false : !s.isAnaglyphEnabled;
                    }
                }
            });
        }

        const headerAnaglyph = document.getElementById('accordion-header-4');
        const contentAnaglyph = document.getElementById('accordion-content-4');
        if (headerAnaglyph) {
            const isMonocularPreset = (s.presetMode === 'occlusion' || s.presetMode === 'blitz');
            const shouldDisable3D = !s.isAnaglyphEnabled && isMonocularPreset;
            if (shouldDisable3D && !isSynop && !isRds) {
                headerAnaglyph.style.opacity = '0.35';
                headerAnaglyph.style.pointerEvents = 'none';
                if (contentAnaglyph) contentAnaglyph.classList.remove('open');
                const arrow = headerAnaglyph.querySelector('.accordion-arrow');
                if (arrow) arrow.classList.remove('active');
            } else {
                headerAnaglyph.style.opacity = '1';
                headerAnaglyph.style.pointerEvents = 'auto';
            }
        }
    }

    bindSettingsInteractions() {
        // Enforce horizontal and vertical locks mutual exclusivity FIRST (registers first in browser event queue)
        const chkY = document.getElementById('chk-synop-lock-y');
        const chkX = document.getElementById('chk-synop-lock-x');
        if (chkY && chkX) {
            chkY.addEventListener('change', () => {
                if (chkY.checked) {
                    chkX.checked = false; // Instantly uncheck opposing DOM node before schema loop runs
                }
            });
            chkX.addEventListener('change', () => {
                if (chkX.checked) {
                    chkY.checked = false; // Instantly uncheck opposing DOM node before schema loop runs
                }
            });
        }

        // Segmented settings mode switcher click hooks (3-Tab config)
        const btnTabGabor = document.getElementById('settings-tab-gabor');
        const btnTabSynop = document.getElementById('settings-tab-synop');
        const btnTabRds = document.getElementById('settings-tab-rds');
        
        if (btnTabGabor && btnTabSynop && btnTabRds) {
            btnTabGabor.addEventListener('click', () => {
                Store.updateState('appMode', 'gabor');
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });

            btnTabSynop.addEventListener('click', () => {
                Store.updateState('appMode', 'synoptophore');
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });

            btnTabRds.addEventListener('click', () => {
                Store.updateState('appMode', 'rds');
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        }

        if (this.selectPresetMode) {
            this.selectPresetMode.addEventListener('change', () => {
                Store.updateState('presetMode', this.selectPresetMode.value);
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        }

        const headers = document.querySelectorAll('.accordion-header');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const contentId = header.id.replace('header', 'content');
                const content = document.getElementById(contentId);
                if (!content) return;

                const isOpen = content.classList.contains('open');

                document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('open'));
                document.querySelectorAll('.accordion-arrow').forEach(a => a.classList.remove('active'));

                if (!isOpen) {
                    content.classList.add('open');
                    const arrow = header.querySelector('.accordion-arrow');
                    if (arrow) arrow.classList.add('active');
                }
            });
        });

        const activeSliders = ['slider-left-r', 'slider-right-g', 'slider-right-b'];
        activeSliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.syncStateFromUI());
        });

        if (this.rangeStrongAttenuation) {
            this.rangeStrongAttenuation.addEventListener('input', () => {
                this.syncStateFromUI();
            });
        }

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;
            const skipIds = ['select-preset-mode', 'range-strong-attenuation', 'slider-left-r', 'slider-right-g', 'slider-right-b'];
            if (skipIds.includes(field.id)) return;

            el.addEventListener('change', () => {
                this.syncStateFromUI();
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        });

        // Bind nudge (−/+) micro-buttons for precision calibration on touchscreens
        document.querySelectorAll('.nudge-btn').forEach(btn => {
            let nudgeIntervalId = null;
            let nudgeTimeoutId = null;

            const performNudge = () => {
                const targetId = btn.dataset.nudgeTarget;
                const step = parseInt(btn.dataset.nudgeStep) || 1;
                const dir = parseInt(btn.dataset.nudgeDir) || 1;
                const slider = document.getElementById(targetId);
                if (!slider) return;
                const min = parseInt(slider.min) || 0;
                const max = parseInt(slider.max) || 255;
                const current = parseInt(slider.value) || 0;
                slider.value = Math.max(min, Math.min(max, current + dir * step));
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            };

            const clearNudgeTimers = () => {
                if (nudgeTimeoutId) clearTimeout(nudgeTimeoutId);
                if (nudgeIntervalId) clearInterval(nudgeIntervalId);
                nudgeTimeoutId = null;
                nudgeIntervalId = null;
            };

            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault(); // Prevent text selection
                clearNudgeTimers();
                performNudge(); // Instant single tap response
                
                nudgeTimeoutId = setTimeout(() => {
                    nudgeIntervalId = setInterval(performNudge, 45); // Smooth continuous scrolling rate
                }, 350); // Delay to distinguish tap from hold
            });

            btn.addEventListener('pointerup', clearNudgeTimers);
            btn.addEventListener('pointerleave', clearNudgeTimers);
            btn.addEventListener('pointercancel', clearNudgeTimers);
        });
    }
}