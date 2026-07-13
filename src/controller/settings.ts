/*
 * GaborNeuroFit - Declarative Settings Binder Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Employs strict "keyof AppState" generic constraint mapping.
 * This guarantees that DOM element bindings mathematically correspond to actual
 * physical application parameters, eliminating hidden mutation bugs.
 */

import { Store } from '../store';
import type { AppState } from '../types/clinical';

interface ConfigField {
    id: string;
    key: keyof AppState;
    type: 'checkbox' | 'value' | 'int' | 'float' | 'boolean' | 'percent';
}

const CONFIG_SCHEMA: ConfigField[] = [
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
    private anaglyphPanel: HTMLElement | null;
    private valStrongAttenuation: HTMLElement | null;
    private selectPresetMode: HTMLSelectElement | null;
    private rangeStrongAttenuation: HTMLInputElement | null;

    constructor(
        private onSyncCallback: () => void,
        private getTranslations: () => Record<string, string>
    ) {
        this.anaglyphPanel = document.getElementById('anaglyph-settings-panel');
        this.valStrongAttenuation = document.getElementById('val-strong-attenuation');
        this.selectPresetMode = document.getElementById('select-preset-mode') as HTMLSelectElement | null;
        this.rangeStrongAttenuation = document.getElementById('range-strong-attenuation') as HTMLInputElement | null;
    }

    updateSliderTrackGradient(slider: HTMLInputElement | null): void {
        if (!slider || slider.type !== 'range') return;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        slider.style.setProperty('--percent', percent + '%');
    }

    syncStateFromUI(): void {
        const s = Store.state;
        let lastActiveTrigger: string | null = null;

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let val: any;

            if (field.type === 'checkbox') {
                const inputEl = el as HTMLInputElement;
                val = inputEl.checked;
                if ((s[field.key] as boolean) !== val) {
                    if (field.key === 'isPeripheralEnabled') lastActiveTrigger = 'peripheral';
                    if (field.key === 'isCrowdingEnabled') lastActiveTrigger = 'crowding';
                    if (field.key === 'isStaticEnabled') lastActiveTrigger = 'static';
                    if (field.key === 'isFlickerEnabled') lastActiveTrigger = 'flicker';
                    if (field.key === 'rdsRandomizeVertical') lastActiveTrigger = 'rdsRandomizeVertical';
                    if (field.key === 'rdsIsFloating') lastActiveTrigger = 'rdsIsFloating';
                }
            } else {
                const inputEl = el as HTMLInputElement | HTMLSelectElement;
                if (field.type === 'value') {
                    val = inputEl.value;
                } else if (field.type === 'int') {
                    val = parseInt(inputEl.value, 10) || 0;
                } else if (field.type === 'float') {
                    val = parseFloat(inputEl.value) || 2.0;
                } else if (field.type === 'boolean') {
                    val = (inputEl.value === 'true');
                } else if (field.type === 'percent') {
                    val = parseFloat(inputEl.value) / 100;
                }
            }

            if (field.id === 'select-session-limit') {
                Store.updateState(s.appMode === 'rds' ? 'rdsSessionLimit' : 'sessionLimit', val);
            } else if (field.id === 'range-strong-attenuation') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopStrongEyeContrastFactor' : 'strongEyeContrastFactor', val);
                if (this.valStrongAttenuation) {
                    this.valStrongAttenuation.innerText = (el as HTMLInputElement).value + '%';
                }
            } else if (field.id === 'slider-left-r') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorLeftR' : 'calibratorLeftR', val);
            } else if (field.id === 'slider-right-g') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorRightG' : 'calibratorRightG', val);
            } else if (field.id === 'slider-right-b') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorRightB' : 'calibratorRightB', val);
            } else {
                // @ts-ignore - Dynamic key mapping is safe based on SCHEMA configuration
                Store.updateState(field.key, val);
            }

            this.updateSliderTrackGradient(el as HTMLInputElement);
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

    updatePresetUI(): void {
        const s = Store.state;
        const isSynop = s.appMode === 'synoptophore';
        const t = this.getTranslations ? this.getTranslations() : {};

        const selectLimit = document.getElementById('select-session-limit') as HTMLSelectElement | null;
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
            if (s.calibratorLeftR < 127) s.calibratorLeftR = 127;
            if (s.calibratorRightG < 127) s.calibratorRightG = 127;
            if (s.calibratorRightB < 127) s.calibratorRightB = 127;
        }

        const sliderR = document.getElementById('slider-left-r') as HTMLInputElement | null;
        const sliderG = document.getElementById('slider-right-g') as HTMLInputElement | null;
        const sliderB = document.getElementById('slider-right-b') as HTMLInputElement | null;
        if (sliderR) sliderR.min = isSynop ? "0" : "127";
        if (sliderG) sliderG.min = isSynop ? "0" : "127";
        if (sliderB) sliderB.min = isSynop ? "0" : "127";

        if (s.appMode === 'gabor' && s.presetMode !== 'custom') {
            Store.applyPresetTemplate(s.presetMode);
        }

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
                const selectEl = el as HTMLSelectElement;
                selectEl.value = (s.appMode === 'rds' ? s.rdsSessionLimit : s.sessionLimit).toString();
                this.updateSliderTrackGradient(selectEl as any);
                return;
            }

            if (field.id === 'range-strong-attenuation') {
                const inputEl = el as HTMLInputElement;
                const targetFactor = s.appMode === 'synoptophore' ? s.synopStrongEyeContrastFactor : s.strongEyeContrastFactor;
                inputEl.value = Math.round(targetFactor * 100).toString();
                if (this.valStrongAttenuation) this.valStrongAttenuation.innerText = inputEl.value + '%';
                this.updateSliderTrackGradient(inputEl);
                return;
            }

            if (field.type === 'checkbox') {
                const inputEl = el as HTMLInputElement;
                inputEl.checked = s[field.key] as boolean;
            } else {
                const inputEl = el as HTMLSelectElement | HTMLInputElement;
                if (field.type === 'value') inputEl.value = s[field.key] as string;
                else if (field.type === 'int') inputEl.value = (s[field.key] as number).toString();
                else if (field.type === 'float') inputEl.value = (s[field.key] as number).toString();
                else if (field.type === 'boolean') inputEl.value = s[field.key] ? 'true' : 'false';
            }

            if (field.id === 'slider-left-r') {
                (el as HTMLInputElement).value = (s.appMode === 'synoptophore' ? s.synopCalibratorLeftR : s.calibratorLeftR).toString();
            } else if (field.id === 'slider-right-g') {
                (el as HTMLInputElement).value = (s.appMode === 'synoptophore' ? s.synopCalibratorRightG : s.calibratorRightG).toString();
            } else if (field.id === 'slider-right-b') {
                (el as HTMLInputElement).value = (s.appMode === 'synoptophore' ? s.synopCalibratorRightB : s.calibratorRightB).toString();
            }

            if (field.type === 'checkbox' || el.tagName === 'SELECT') {
                // Do nothing for gradients
            } else {
                this.updateSliderTrackGradient(el as HTMLInputElement);
            }
        });

        if (sliderR) this.updateSliderTrackGradient(sliderR);
        if (sliderG) this.updateSliderTrackGradient(sliderG);
        if (sliderB) this.updateSliderTrackGradient(sliderB);

        if (this.selectPresetMode) this.selectPresetMode.value = s.presetMode;

        this.updateCalibrationLabels(s);
        this.updateVisibilityPanels();
    }

    updateCalibrationLabels(s: AppState): void {
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

    updateVisibilityPanels(): void {
        const s = Store.state;
        const isSynop = (s.appMode === 'synoptophore');
        const isRds = (s.appMode === 'rds');
        const currentMode = s.appMode;

        document.querySelectorAll<HTMLElement>('[data-visible-in]').forEach(el => {
            const allowedModes = (el.dataset.visibleIn || "").split(',');
            const isVisible = allowedModes.includes(currentMode);
            el.style.display = isVisible ? '' : 'none';
        });

        if (!isSynop) {
            const chkFlicker = document.getElementById('chk-flicker') as HTMLInputElement | null;
            const rowFlicker = document.getElementById('row-flicker');
            if (chkFlicker) chkFlicker.disabled = !s.isStaticEnabled;
            if (rowFlicker) {
                rowFlicker.style.opacity = s.isStaticEnabled ? '1' : '0.5';
            }

            const chkOrthogonal = document.getElementById('chk-orthogonal-flankers') as HTMLInputElement | null;
            const chkDynamic = document.getElementById('chk-dynamic-flankers') as HTMLInputElement | null;
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
            if (rowOrthogonal) rowOrthogonal.style.opacity = crowdingOpacity;
            if (rowDynamic) rowDynamic.style.opacity = crowdingOpacity;
        }

        const rowRdsFloatSpeed = document.getElementById('row-rds-floating-speed');
        if (rowRdsFloatSpeed) {
            rowRdsFloatSpeed.style.opacity = s.rdsIsFloating ? '1' : '0.5';
            const selectEl = rowRdsFloatSpeed.querySelector('select');
            if (selectEl) selectEl.disabled = !s.rdsIsFloating;
        }

        if (this.anaglyphPanel) {
            this.anaglyphPanel.style.display = 'block';
            this.anaglyphPanel.style.opacity = (s.isAnaglyphEnabled || isSynop || isRds) ? '1' : '0.4';
            this.anaglyphPanel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach(input => {
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

    bindSettingsInteractions(): void {
        const chkY = document.getElementById('chk-synop-lock-y') as HTMLInputElement | null;
        const chkX = document.getElementById('chk-synop-lock-x') as HTMLInputElement | null;
        if (chkY && chkX) {
            chkY.addEventListener('change', () => {
                if (chkY.checked) chkX.checked = false;
            });
            chkX.addEventListener('change', () => {
                if (chkX.checked) chkY.checked = false;
            });
        }

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
                if (!this.selectPresetMode) return;
                Store.updateState('presetMode', this.selectPresetMode.value as any);
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

        document.querySelectorAll('.nudge-btn').forEach(btn => {
            let nudgeIntervalId: number | null = null;
            let nudgeTimeoutId: number | null = null;

            const performNudge = () => {
                const buttonHtml = btn as HTMLButtonElement;
                const targetId = buttonHtml.dataset.nudgeTarget;
                const step = parseInt(buttonHtml.dataset.nudgeStep || '1', 10) || 1;
                const dir = parseInt(buttonHtml.dataset.nudgeDir || '1', 10) || 1;

                if (!targetId) return;
                const slider = document.getElementById(targetId) as HTMLInputElement | null;
                if (!slider) return;

                const min = parseInt(slider.min, 10) || 0;
                const max = parseInt(slider.max, 10) || 255;
                const current = parseInt(slider.value, 10) || 0;
                slider.value = Math.max(min, Math.min(max, current + dir * step)).toString();
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            };

            const clearNudgeTimers = () => {
                if (nudgeTimeoutId !== null) window.clearTimeout(nudgeTimeoutId);
                if (nudgeIntervalId !== null) window.clearInterval(nudgeIntervalId);
                nudgeTimeoutId = null;
                nudgeIntervalId = null;
            };

            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                clearNudgeTimers();
                performNudge();

                nudgeTimeoutId = window.setTimeout(() => {
                    nudgeIntervalId = window.setInterval(performNudge, 45);
                }, 350);
            });

            btn.addEventListener('pointerup', clearNudgeTimers);
            btn.addEventListener('pointerleave', clearNudgeTimers);
            btn.addEventListener('pointercancel', clearNudgeTimers);
        });
    }
}